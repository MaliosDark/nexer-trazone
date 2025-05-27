// src/modules/aiMetadata.js
import { redisClient } from '../conectis.js';
import { generateImage } from '../utils/genelia.js';
import { generateMetadataDraft } from '../utils/sofia.js';

/**
 * POST /api/ai/metadata
 * Body: { idea: string }
 *
 * Returns a draft metadata object:
 *   { name, symbol, description, external_url, properties:{website,twitter,telegram}, attributes:[], imagePrompt, imageUrl }
 */
export async function handler(req, res) {
  try {
    const { idea } = req.body;
    if (!idea) return res.status(400).json({ error: 'Missing idea' });

    // 1) Ask Sofia to draft full metadata JSON
    const draft = await generateMetadataDraft(idea);

    // 2) Generate the actual image
    const imgUrl = await generateImage({ prompt: draft.imagePrompt });
    draft.image = imgUrl;

    // 3) cache for 10m so user can revisit
    const cacheKey = `aiMeta:${Buffer.from(idea).toString('base64')}`;
    await redisClient.setEx(cacheKey, 600, JSON.stringify(draft));

    return res.json(draft);
  } catch (err) {
    console.error('AI metadata error:', err);
    res.status(500).json({ error: err.toString() });
  }
}
