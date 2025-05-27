// src/utils/sofia.js
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
        { role: 'system', content: 'You are a metadata assistant. Given a short idea, produce a JSON with name, symbol, description, external_url, website, twitter, telegram, attributes (array of {trait_type,value}), and an image prompt.' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    })
  });
  if (!res.ok) throw new Error(`Sofia error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
