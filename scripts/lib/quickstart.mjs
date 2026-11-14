// quickstart.mjs — context-aware encoders for copy-ready Python and shell examples.
//
// Provider fields are community-editable. HTML escaping is only the outermost
// layer for site code blocks; values must first be encoded for the interpreter
// that receives the copied text. Keep snippet construction here so collection
// and per-provider quickstarts cannot drift onto different escaping rules.

const POSIX_SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/** A double-quoted Python string literal. JSON string escapes are a Python-compatible subset. */
export function pythonStringLiteral(value) {
  return JSON.stringify(String(value))
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** One POSIX-shell word, left readable when its complete character set is inert. */
export function posixShellQuote(value) {
  const text = String(value);
  if (text && POSIX_SAFE_WORD.test(text)) return text;
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

/** Escape a complete code block for an HTML text node after language encoding. */
export const codeHtmlEsc = (source) => String(source)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

function chatRequestJson(model, spaced) {
  const encodedModel = JSON.stringify(String(model));
  return spaced
    ? `{"model": ${encodedModel}, "messages": [{"role": "user", "content": "Hello!"}]}`
    : `{"model":${encodedModel},"messages":[{"role":"user","content":"Hello!"}]}`;
}

export function pythonChatQuickstart(baseUrl, model) {
  return `from openai import OpenAI

client = OpenAI(base_url=${pythonStringLiteral(baseUrl)}, api_key="<YOUR_FREE_API_KEY>")
resp = client.chat.completions.create(
    model=${pythonStringLiteral(model)},
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)`;
}

export function pythonEmbeddingsQuickstart(baseUrl, model) {
  return `from openai import OpenAI

client = OpenAI(base_url=${pythonStringLiteral(baseUrl)}, api_key="<YOUR_FREE_API_KEY>")
resp = client.embeddings.create(model=${pythonStringLiteral(model)}, input="Hello world")
print(len(resp.data[0].embedding))`;
}

export function curlChatQuickstart(baseUrl, model, { apiKeyVariable = 'API_KEY', spacedJson = false } = {}) {
  if (!ENV_NAME.test(apiKeyVariable)) throw new TypeError('apiKeyVariable must be an uppercase environment variable name');
  const endpoint = posixShellQuote(`${String(baseUrl)}/chat/completions`);
  const requestBody = posixShellQuote(chatRequestJson(model, spacedJson));
  return `curl ${endpoint} \\
  -H "Authorization: Bearer $${apiKeyVariable}" \\
  -H "Content-Type: application/json" \\
  -d ${requestBody}`;
}
