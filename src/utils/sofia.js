import fetch from 'node-fetch';

export async function generateMetadataDraft(userPrompt) {
  const res = await fetch(process.env.SOFIA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SOFIA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama3.2:latest',
      messages: [
        {
          role: 'system',
          content: `You are a metadata assistant. Always respond with _only_ a single JSON object (no markdown, no explanation), containing these keys:
- name: string
- symbol: string
- description: string
- external_url: string
- website: string
- twitter: string
- telegram: string
- attributes: array of { trait_type: string, value: string }
- imagePrompt: string`
        },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    throw new Error(`Sofia error ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Sofia returned no content');
  }

  // Try to parse JSON strictly, stripping any leading/trailing garbage
  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;
    const jsonString = content.slice(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Invalid JSON from Sofia: ${e.message}\nResponse was:\n${content}`);
  }
}
