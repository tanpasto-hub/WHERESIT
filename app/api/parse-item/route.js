import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// Give this route some headroom in case Gemini is briefly slow, though
// gemini-flash-lite-latest normally responds in well under a second.
export const maxDuration = 30;

// Splits one spoken sentence like "chair, it's in the office room" into
// { name, location }. Used by the hands-free add flow so people can just
// say the whole thing in one breath instead of answering two separate
// questions — most people naturally say both parts together rather than
// pausing for a second prompt.
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No key configured — fall back to treating the whole thing as just
    // the item name; the caller will ask for the location separately.
    return NextResponse.json({ name: text.trim(), location: null });
  }

  const prompt = `A person is adding something to a list of their belongings and where they keep it. They spoke this sentence: "${text}"

Figure out two things from it:
1. "name" — the item itself (what it is).
2. "location" — where they put it, if they said that part too. If they only said the item name and didn't mention a location at all, use null for location.

Examples:
"chair it's in the office room" -> {"name": "chair", "location": "office room"}
"my passport is in the top desk drawer" -> {"name": "passport", "location": "top desk drawer"}
"binoculars" -> {"name": "binoculars", "location": null}
"the red umbrella by the front door" -> {"name": "red umbrella", "location": "by the front door"}

Respond with ONLY valid JSON, no other text and no markdown fences:
{"name": "...", "location": "..." or null}`;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const MAX_ATTEMPTS = 3;
  const RETRY_STATUSES = new Set([429, 503]);

  try {
    let response;
    let lastErrorText = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
            },
          }),
        }
      );

      if (response.ok) break;

      lastErrorText = await response.text();
      const shouldRetry = RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS;
      console.error(`Gemini API error (attempt ${attempt}/${MAX_ATTEMPTS}):`, response.status, lastErrorText);
      if (!shouldRetry) break;
      await sleep(attempt * 500);
    }

    if (!response.ok) {
      // Fall back gracefully rather than blocking the flow: treat the
      // whole utterance as the name and let the caller ask for location.
      return NextResponse.json({ name: text.trim(), location: null });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : text.trim();
    const location = typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null;
    return NextResponse.json({ name, location });
  } catch (err) {
    console.error('Parse-item error:', err);
    return NextResponse.json({ name: text.trim(), location: null });
  }
}
