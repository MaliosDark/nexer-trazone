// src/utils/genelia.js
import fetch from 'node-fetch';
import FormData from 'form-data';

const API_ROOT = process.env.GENELIA_API_ROOT;

export async function generateImage({
  prompt,
  steps          = 50,
  cfgScale       = 7.0,
  sampler        = "DPM++ 2M",
  width          = 512,
  height         = 512,
  seed           = -1,
  negativePrompt = "",
  model          = "CHEYENNE_v16.safetensors",
} = {}) {
  const fd = new FormData();
  fd.append("texto",           prompt);
  fd.append("steps",           steps);
  fd.append("cfgScale",        cfgScale);
  fd.append("sampler",         sampler);
  fd.append("width",           width);
  fd.append("height",          height);
  fd.append("seed",            seed);
  fd.append("negativePrompt",  negativePrompt);
  fd.append("model",           model);

  const res = await fetch(`${API_ROOT}/obtener_imagen`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  const fileName = (await res.text()).split("/").pop();
  return `${API_ROOT}/images/${fileName}`;
}
