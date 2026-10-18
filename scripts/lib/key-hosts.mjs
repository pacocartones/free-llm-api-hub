// The only host each provider key may be sent to. A key travels in an Authorization header, so the host it goes to must not come from
// data/providers.json alone: a data change (a new entry reusing an env_key, or an edited openai_base_url) would otherwise send a real key
// to any host. Adding or moving a provider's API host is a code change to this list, reviewed as such. Matching is exact on the hostname.
export const KEY_HOSTS = Object.freeze({
  AI21_API_KEY: 'api.ai21.com',
  ARLI_API_KEY: 'api.arliai.com',
  ASSEMBLYAI_API_KEY: 'llm-gateway.assemblyai.com',
  BASETEN_API_KEY: 'inference.baseten.co',
  CEREBRAS_API_KEY: 'api.cerebras.ai',
  CLARIFAI_PAT: 'api.clarifai.com',
  CLOUDFLARE_API_TOKEN: 'api.cloudflare.com',
  COHERE_API_KEY: 'api.cohere.ai',
  DASHSCOPE_API_KEY: 'dashscope-intl.aliyuncs.com',
  FIREWORKS_API_KEY: 'api.fireworks.ai',
  GEMINI_API_KEY: 'generativelanguage.googleapis.com',
  GROQ_API_KEY: 'api.groq.com',
  HF_TOKEN: 'router.huggingface.co',
  HUNYUAN_API_KEY: 'tokenhub.tencentmaas.com',
  ITERACOMPUTE_API_KEY: 'api.iteracompute.com',
  JINA_API_KEY: 'api.jina.ai',
  MISTRAL_API_KEY: 'api.mistral.ai',
  MODELSCOPE_API_KEY: 'api-inference.modelscope.cn',
  MOONDREAM_API_KEY: 'api.moondream.ai',
  NEBIUS_API_KEY: 'api.tokenfactory.nebius.com',
  NOVITA_API_KEY: 'api.novita.ai',
  NVIDIA_API_KEY: 'integrate.api.nvidia.com',
  OLLAMA_API_KEY: 'ollama.com',
  OPENROUTER_API_KEY: 'openrouter.ai',
  OVHCLOUD_API_KEY: 'oai.endpoints.kepler.ai.cloud.ovh.net',
  POOLSIDE_API_KEY: 'inference.poolside.ai',
  SAMBANOVA_API_KEY: 'api.sambanova.ai',
  SARVAM_API_KEY: 'api.sarvam.ai',
  SCALEWAY_API_KEY: 'api.scaleway.ai',
  SILICONFLOW_API_KEY: 'api.siliconflow.cn',
  TYPHOON_API_KEY: 'api.opentyphoon.ai',
  UPSTAGE_API_KEY: 'api.upstage.ai',
  VERCEL_AI_GATEWAY_KEY: 'ai-gateway.vercel.sh',
  WANDB_API_KEY: 'api.inference.wandb.ai',
  WATSONX_API_KEY: 'us-south.ml.cloud.ibm.com',
  ZAI_API_KEY: 'api.z.ai',
});

// Why a provider's key must not be sent to its openai_base_url, or null when it may.
export function keyHostError(provider) {
  const { env_key: key, openai_base_url: base } = provider || {};
  if (!key || !base) return 'no env_key or openai_base_url';
  if (!Object.prototype.hasOwnProperty.call(KEY_HOSTS, key)) return `${key} is not pinned to a host in scripts/lib/key-hosts.mjs`;
  let url;
  try { url = new URL(base); } catch { return `openai_base_url is not a URL`; }
  if (url.protocol !== 'https:') return `openai_base_url is not https`;
  if (url.username || url.password) return `openai_base_url carries credentials`;
  if (url.hostname !== KEY_HOSTS[key]) return `${key} may only be sent to ${KEY_HOSTS[key]}, not ${url.hostname}`;
  return null;
}

// The dataset gate (validate.mjs): every provider that names both an env_key and an openai_base_url must point at the host pinned for that
// key. The published client configs (api/v1/openai-clients.json, api/v1/litellm.yaml) tell users which base URL to send THEIR key to, so a
// data change that moves a base URL to another host must fail the required check, not only be skipped by the probe.
export function keyHostErrors(providers) {
  return (providers ?? [])
    .filter((p) => p && p.env_key && p.openai_base_url)
    .map((p) => [p.slug ?? '?', keyHostError(p)])
    .filter(([, error]) => error)
    .map(([slug, error]) => `${slug}: ${error}`);
}
