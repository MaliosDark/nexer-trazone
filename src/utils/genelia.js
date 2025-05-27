import fetch from 'node-fetch';
import FormData from 'form-data';

const API_ROOT = process.env.GENELIA_API_ROOT;

export async function generateImage({
  prompt,
  steps = 50,
  cfgScale = 7.0,
  sampler = "DPM++ 2M",
  width = 512,
  height = 512,
  seed = -1,
  negativePrompt = "",
  model = "CHEYENNE_v16.safetensors",
} = {}) {
  if (!API_ROOT || !API_ROOT.startsWith('http')) {
    throw new Error(
      `GENELIA_API_ROOT must be an absolute URL (got "${API_ROOT}")`
    );
  }

  const url = new URL('/obtener_imagen', API_ROOT).toString();
  const fd = new FormData();
  fd.append("texto", prompt);
  fd.append("steps", steps.toString());
  fd.append("cfgScale", cfgScale.toString());
  fd.append("sampler", sampler);
  fd.append("width", width.toString());
  fd.append("height", height.toString());
  fd.append("seed", seed.toString());
  fd.append("negativePrompt", negativePrompt);
  fd.append("model", model);

  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Genelia error ${res.status}: ${body}`);
  }

  const text = await res.text();
  const fileName = text.split("/").pop();
  return `${API_ROOT.replace(/\/+$/,'')}/images/${fileName}`;
}
