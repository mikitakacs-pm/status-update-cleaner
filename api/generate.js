// api/generate.js
// Serverless function (Vercel). Holds the real Anthropic API key server-side,
// so it's never exposed in the browser. The frontend calls this endpoint
// instead of api.anthropic.com directly.

const SYSTEM_PROMPT = `You are a tool that turns a project manager's raw, messy status notes into a clean, structured status update for a stakeholder audience.

Respond ONLY with valid JSON, no markdown code fences, no commentary before or after, matching exactly this shape:
{
  "summary": string,          // 2-3 sentences, written to be skimmed in 15 seconds
  "progress": string[],       // short bullets of what's going well or complete; empty array if none
  "risks": [{ "text": string, "severity": "green" | "amber" | "red" }],  // green = worth noting but fine, amber = watch, red = needs attention now. Judge severity from context - do not default everything to amber.
  "next_steps": string[]      // concrete next actions, include timing if the notes mention it; empty array if none
}

Rules:
- Preserve every specific fact (dates, names, numbers) exactly as given. Never invent details.
- If the notes say something shouldn't be quoted or stated as fact, respect that and soften the phrasing (e.g. "impression from the call" rather than a stated figure).
- Surface anything that sounds like a risk or blocker even if the notes don't explicitly label it as one.
- Keep tone calm and factual - not alarmist, not overly positive.
- If a list section has nothing relevant in the notes, return an empty array. For summary, if there's truly nothing to summarize, write "No update."`;

// Naive in-memory rate limiter. Resets whenever the function cold-starts and
// isn't shared across concurrent instances, so it's a soft speed bump, not a
// real defense. Good enough to blunt casual abuse for an early, low-traffic
// launch. Swap in Upstash Redis or Vercel KV once there's real usage —
// happy to add that when you're ready.
const requestLog = new Map();
function isAllowed(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 5;
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) return false;
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return true;
}

module.exports = async function handler(req, res) {
  // Loosen this to your real domain once you have one, instead of '*'
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!isAllowed(ip)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute.' });
  }

  const { notes } = req.body || {};

  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    return res.status(400).json({ error: 'Notes are required.' });
  }
  if (notes.length > 4000) {
    return res.status(400).json({ error: 'That\u2019s a lot of notes — keep it under 4000 characters.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY environment variable.');
    return res.status(500).json({ error: 'Server is not configured correctly.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: notes.trim() }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error', response.status, errText);
      return res.status(502).json({ error: 'The model service returned an error.' });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) {
      return res.status(502).json({ error: 'No text in the model response.' });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse model output as JSON:', cleaned);
      return res.status(502).json({ error: 'Could not format the update — try again.' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
