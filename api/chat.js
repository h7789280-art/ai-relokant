// Vercel serverless function: proxies chat requests to the Anthropic Messages API.
// The API key stays server-side (process.env.ANTHROPIC_API_KEY) and is never shipped to the browser.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: 'Server misconfigured: ANTHROPIC_API_KEY is not set.' });
  }

  // Vercel parses JSON bodies automatically, but guard against a raw string body.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
  }

  const { messages, system, model, max_tokens } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1024,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await anthropicRes.json();

    // Pass through Anthropic's response (and status) unchanged so the client
    // keeps reading it exactly as before (data.content[0].text).
    return res.status(anthropicRes.status).json(data);
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Upstream request failed: ${err.message}` });
  }
}
