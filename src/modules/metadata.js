// src/modules/metadata.js
import { redisClient } from '../conectis.js'; // your already‐connected Redis client
import { generateImage } from '../utils/genelia.js'; // see next step

/**
 * GET /api/metadata/:mint
 * Returns an on‐chain + off‐chain metadata JSON for this mint.
 */
export async function handler(req, res) {
  try {
    const mint = req.params.mint;
    if (!mint) {
      return res.status(400).json({ error: 'Missing mint parameter' });
    }

    // 1) Try to fetch existing metadata from Redis cache:
    const cacheKey = `metadata:${mint}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // 2) Otherwise, build a fresh metadata object:
    //    In a real app you’d lookup on‐chain name/symbol/uri, etc. For now we
    //    mock them or pull from your on‐chain account via @project-serum/anchor.
    const metadata = {
      name:        `Token #${mint.slice(-4)}`,
      symbol:      `NXZ`,
      description: `A Nexus Erebus Trade Zone token.`,
      image:       null,
      attributes:  [],
    };

    // 3) Generate/fetch image URL if missing:
    //    You might want to allow overriding via query param ?prompt=…
    const prompt = req.query.prompt
      || `abstract art for token ${mint}`;
    const imgUrl = await generateImage({ prompt });
    metadata.image = imgUrl;

    // 4) Cache it for e.g. 1h
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(metadata));

    return res.json(metadata);
  } catch (err) {
    console.error('Metadata handler error:', err);
    return res.status(500).json({ error: err.toString() });
  }
}
