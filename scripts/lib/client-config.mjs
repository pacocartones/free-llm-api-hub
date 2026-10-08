// client-config.mjs — ready-to-use client configuration generated from the dataset.
//
// Two outputs, both under /api/v1/:
//   - litellm.yaml         a LiteLLM proxy `model_list`, one entry per (provider, model)
//   - openai-clients.json  base URL + env var name + sampled models per provider
//
// Only providers that are verified, OpenAI-compatible and carry both an
// `openai_base_url` and an `env_key` are included: a config that points at an
// unconfirmed endpoint would look more trustworthy than the data behind it.
//
// `env_key` is the NAME of the environment variable a user stores their own key
// in (e.g. GROQ_API_KEY), never a key value. The provider data feeds stay
// stripped of it; these two files exist precisely to publish that name.
//
// Pure functions of their input, so the output is byte-stable for a given
// dataset (the header uses data.generated, never the current date).

/** The providers that get a client config, in dataset order. */
export function clientConfigProviders(providers) {
  return (providers ?? []).filter(
    (p) =>
      p.verified === true &&
      p.openai_compatible === true &&
      typeof p.openai_base_url === 'string' &&
      p.openai_base_url !== '' &&
      typeof p.env_key === 'string' &&
      p.env_key !== '',
  );
}

/** One machine-readable record per eligible provider. */
export function openaiClients(providers) {
  return clientConfigProviders(providers).map((p) => ({
    slug: p.slug,
    name: p.name,
    base_url: p.openai_base_url,
    env_key: p.env_key,
    models_free: Array.isArray(p.models_free) ? p.models_free : null,
    docs_url: p.docs_url,
    last_verified: p.last_verified,
  }));
}

export const MODEL_PLACEHOLDER = '<model-id>';

// A JSON string is a valid YAML double-quoted scalar, so every value is
// emitted with JSON.stringify: no YAML escaping rules to get wrong.
const q = (s) => JSON.stringify(String(s));

/**
 * LiteLLM proxy config. Shape per the LiteLLM docs:
 *   https://docs.litellm.ai/docs/proxy/configs (model_list, `os.environ/` for keys)
 *   https://docs.litellm.ai/docs/providers/openai_compatible (`openai/` model prefix + api_base)
 */
export function litellmYaml({ version, generated, providers }) {
  const list = clientConfigProviders(providers);
  const out = [
    '# LiteLLM proxy config for the free tiers listed in free-llm-api-hub.',
    `# Dataset version ${version}, generated ${generated}.`,
    '#',
    '# Free-tier terms change without notice. Confirm each provider\'s current',
    '# limits in its own docs (linked above each block) before relying on them.',
    '#',
    '# Included: providers with verified: true, openai_compatible: true, an',
    '# openai_base_url and an env_key. Model ids are the dataset\'s sampled',
    '# models_free (not every one is a chat model); a provider without a sample',
    '# gets one entry with a placeholder model id you must replace.',
    '#',
    '# Usage: export the API keys you have under the env var names below, then',
    '#   litellm --config litellm.yaml',
    '# Delete the blocks for providers you have no key for.',
    '# Format: https://docs.litellm.ai/docs/proxy/configs',
    '',
    'model_list:',
  ];
  for (const p of list) {
    out.push('');
    out.push(`  # ${p.name} - docs: ${p.docs_url} - last verified ${p.last_verified}`);
    if (/[{}]/.test(p.openai_base_url)) {
      out.push('  # api_base contains a {placeholder}: replace it with your own value.');
    }
    const models = Array.isArray(p.models_free) && p.models_free.length ? p.models_free : null;
    const entries = models ? models.map((m) => ({ name: `${p.slug}/${m}`, model: m })) : [{ name: p.slug, model: null }];
    for (const e of entries) {
      out.push(`  - model_name: ${q(e.name)}`);
      out.push('    litellm_params:');
      out.push(
        e.model === null
          ? `      model: ${q(`openai/${MODEL_PLACEHOLDER}`)}  # set a model id`
          : `      model: ${q(`openai/${e.model}`)}`,
      );
      out.push(`      api_base: ${q(p.openai_base_url)}`);
      out.push(`      api_key: ${q(`os.environ/${p.env_key}`)}`);
    }
  }
  return out.join('\n') + '\n';
}
