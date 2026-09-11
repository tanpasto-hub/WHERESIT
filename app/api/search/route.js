import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request) {
  // Verify the caller is signed in.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { query, items } = await request.json();
  if (!query || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Missing query or items' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      found: false,
      matches: [],
      message: 'AI search is not configured. Add GEMINI_API_KEY to your environment.',
    });
  }

  const prompt = `A person is trying to find something they've stored somewhere in their house. Their question: "${query}"

Here is their saved list of items (JSON):
${JSON.stringify(items)}

Match against the item names using common sense: handle synonyms ("specs"->"glasses", "billfold"->"wallet"), misspellings, plurals, and partial matches. Return up to 3 best matches. If nothing matches, say so plainly.

Respond with ONLY valid JSON, no other text and no markdown fences:
{"found": true|false, "matches": [{"id": "...", "name": "...", "location": "...", "confidence": "high"|"medium"|"low"}], "message": "one short helpful sentence"}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
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
            temperature: 0.3,
          },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Gemini API error:', response.status, text);
      return NextResponse.json({
        found: false,
        matches: [],
        message: 'AI search failed. Try again in a moment.',
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({
      found: false,
      matches: [],
      message: 'Something went wrong. Try again.',
    });
  }
}
