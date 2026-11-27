// api-examples.mjs — the copy-paste examples of the static API, in one place.
//
// The /api/ page (scripts/build.mjs) and docs/api.md (between AUTOGEN:api-examples markers, written by the
// build) both render from this list, so the two never drift apart. scripts/api-examples.test.mjs runs every
// JavaScript and Python snippet (and, where curl and jq exist, every curl one) against the built site/ files,
// with no network, and checks that the languages print the same thing. Edit a snippet here, never in the output.
//
// Rules for a snippet: no dependencies (fetch in JavaScript, urllib/json/csv in Python, curl plus jq in a
// shell), the full https://freellmapihub.com URL, a plain GET with no custom headers (the host answers the
// CORS preflight they trigger with 405), and output that does not depend on the language: one record per line,
// fields separated by a tab.

export const API_EXAMPLES_SITE = 'https://freellmapihub.com';

export const API_EXAMPLES = [
  {
    id: 'no-card',
    title: 'Ongoing free tiers that need no card',
    file: 'providers.json',
    intro: 'Free tiers that renew (`category` is `ongoing`) where the provider confirms no payment card is needed. `card_required` is `true`, `false` or `null`; `null` means not confirmed, so test for `false`, never for a falsy value.',
    sameOutput: true,
    curl: `curl -fsS https://freellmapihub.com/api/v1/providers.json \\
  | jq -r '.providers[] | select(.category == "ongoing" and .card_required == false) | "\\(.slug)\\t\\(.name)"'`,
    js: `const res = await fetch("https://freellmapihub.com/api/v1/providers.json");
const { providers } = await res.json();
for (const p of providers) {
  if (p.category === "ongoing" && p.card_required === false) console.log(\`\${p.slug}\\t\${p.name}\`);
}`,
    python: `import json, urllib.request

with urllib.request.urlopen("https://freellmapihub.com/api/v1/providers.json") as res:
    providers = json.load(res)["providers"]
for p in providers:
    if p["category"] == "ongoing" and p["card_required"] is False:
        print(f"{p['slug']}\\t{p['name']}")`,
  },
  {
    id: 'fresh-free-now',
    title: 'Providers whose data is fresh and free now',
    file: 'status.json',
    intro: 'The small file to poll. `freshness` is graded against the SLA at `generated_at`; `free_now` is `true` only for a verified entry whose last probe did not report the free tier gone. It is not a live check of the provider.',
    sameOutput: true,
    curl: `curl -fsS https://freellmapihub.com/api/v1/status.json \\
  | jq -r '.providers | to_entries[] | select(.value.freshness == "fresh" and .value.free_now == true) | "\\(.key)\\t\\(.value.last_verified)"'`,
    js: `const res = await fetch("https://freellmapihub.com/api/v1/status.json");
const status = await res.json();
for (const [slug, s] of Object.entries(status.providers)) {
  if (s.freshness === "fresh" && s.free_now === true) console.log(\`\${slug}\\t\${s.last_verified}\`);
}`,
    python: `import json, urllib.request

with urllib.request.urlopen("https://freellmapihub.com/api/v1/status.json") as res:
    status = json.load(res)
for slug, s in status["providers"].items():
    if s["freshness"] == "fresh" and s["free_now"] is True:
        print(f"{slug}\\t{s['last_verified']}")`,
  },
  {
    id: 'openai-base-urls',
    title: 'OpenAI-compatible base URLs',
    file: 'providers.json',
    intro: 'Every provider confirmed OpenAI-compatible with a recorded base URL: pass it as `base_url` to any OpenAI SDK. For the key variable name too, read `openai-clients.json` (verified providers only).',
    sameOutput: true,
    curl: `curl -fsS https://freellmapihub.com/api/v1/providers.json \\
  | jq -r '.providers[] | select(.openai_compatible == true and .openai_base_url != null) | "\\(.slug)\\t\\(.openai_base_url)"'`,
    js: `const res = await fetch("https://freellmapihub.com/api/v1/providers.json");
const { providers } = await res.json();
for (const p of providers) {
  if (p.openai_compatible === true && p.openai_base_url) console.log(\`\${p.slug}\\t\${p.openai_base_url}\`);
}`,
    python: `import json, urllib.request

with urllib.request.urlopen("https://freellmapihub.com/api/v1/providers.json") as res:
    providers = json.load(res)["providers"]
for p in providers:
    if p["openai_compatible"] is True and p.get("openai_base_url"):
        print(f"{p['slug']}\\t{p['openai_base_url']}")`,
  },
  {
    id: 'highest-rpd',
    title: 'The provider with the highest daily request limit for a model',
    file: 'providers.json',
    intro: '`free_limits` holds the numeric limits the provider publishes, never converted between units; an omitted unit means no value is recorded. Model ids in `models_free` are a sample and may carry a vendor prefix (`openai/gpt-oss-120b`), so the match accepts one.',
    sameOutput: true,
    curl: `curl -fsS https://freellmapihub.com/api/v1/providers.json \\
  | jq -r --arg m gpt-oss-120b '[.providers[]
      | select(.free_limits.requests_per_day != null and any(.models_free[]?; . == $m or endswith("/" + $m)))]
    | max_by(.free_limits.requests_per_day)
    | if . == null then "no provider publishes a daily request limit for \\($m)"
      else "\\(.slug)\\t\\(.free_limits.requests_per_day)" end'`,
    js: `const MODEL = "gpt-oss-120b";
const res = await fetch("https://freellmapihub.com/api/v1/providers.json");
const { providers } = await res.json();
let best = null;
for (const p of providers) {
  const rpd = p.free_limits?.requests_per_day;
  const serves = (p.models_free ?? []).some((m) => m === MODEL || m.endsWith("/" + MODEL));
  if (rpd != null && serves && (!best || rpd > best.free_limits.requests_per_day)) best = p;
}
console.log(best ? \`\${best.slug}\\t\${best.free_limits.requests_per_day}\` : \`no provider publishes a daily request limit for \${MODEL}\`);`,
    python: `import json, urllib.request

MODEL = "gpt-oss-120b"
with urllib.request.urlopen("https://freellmapihub.com/api/v1/providers.json") as res:
    providers = json.load(res)["providers"]
best = None
for p in providers:
    rpd = (p.get("free_limits") or {}).get("requests_per_day")
    serves = any(m == MODEL or m.endswith("/" + MODEL) for m in p.get("models_free") or [])
    if rpd is not None and serves and (best is None or rpd > best["free_limits"]["requests_per_day"]):
        best = p
print(f"{best['slug']}\\t{best['free_limits']['requests_per_day']}" if best else f"no provider publishes a daily request limit for {MODEL}")`,
  },
  {
    id: 'csv-commercial-no-card',
    title: 'No card and commercial use allowed, from the CSV',
    file: 'providers.csv',
    intro: 'The CSV keeps `true`, `false` and `conditional` as words; an empty cell means unknown, never `false`. Text cells can hold commas, quotes and line breaks, so use a real CSV parser (JavaScript has none built in; the eight-line one below handles quoted cells). With curl, download the file and open it in a spreadsheet.',
    sameOutput: false,
    curl: `curl -fsS -o providers.csv https://freellmapihub.com/providers.csv
head -n 1 providers.csv | tr ',' '\\n'`,
    js: `const res = await fetch("https://freellmapihub.com/providers.csv");
const text = await res.text();
const rows = [];
let row = [], cell = "", quoted = false;
for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
  else if (c === '"') quoted = true;
  else if (c === ",") { row.push(cell); cell = ""; }
  else if (c === "\\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
  else if (c !== "\\r") cell += c;
}
if (cell || row.length) { row.push(cell); rows.push(row); }
const [header, ...data] = rows;
for (const values of data) {
  const r = Object.fromEntries(header.map((h, i) => [h, values[i]]));
  if (r.card_required === "false" && r.commercial_ok === "true") console.log(\`\${r.slug}\\t\${r.name}\`);
}`,
    python: `import csv, io, urllib.request

with urllib.request.urlopen("https://freellmapihub.com/providers.csv") as res:
    rows = list(csv.DictReader(io.TextIOWrapper(res, encoding="utf-8", newline="")))
for r in rows:
    if r["card_required"] == "false" and r["commercial_ok"] == "true":
        print(f"{r['slug']}\\t{r['name']}")`,
  },
  {
    id: 'llms-markdown-pages',
    title: 'Every provider’s Markdown page, from llms.txt',
    file: 'llms.txt',
    intro: '`llms.txt` is the index for agents: under `## Providers` each line links the provider page and its Markdown twin (`/p/<slug>.md`), which is the cheapest thing to put in a model’s context.',
    sameOutput: true,
    curl: `curl -fsS https://freellmapihub.com/llms.txt \\
  | awk '/^## /{p = ($0 == "## Providers")} p' \\
  | grep -oE '\\(https://[^)]+\\.md\\)' | tr -d '()'`,
    js: `const res = await fetch("https://freellmapihub.com/llms.txt");
let section = "";
for (const line of (await res.text()).split("\\n")) {
  if (line.startsWith("## ")) section = line;
  const md = line.match(/\\((https:\\/\\/[^)]+\\.md)\\)/);
  if (section === "## Providers" && md) console.log(md[1]);
}`,
    python: `import re, urllib.request

with urllib.request.urlopen("https://freellmapihub.com/llms.txt") as res:
    text = res.read().decode("utf-8")
section = ""
for line in text.split("\\n"):
    if line.startswith("## "):
        section = line
    md = re.search(r"\\((https://[^)]+\\.md)\\)", line)
    if section == "## Providers" and md:
        print(md.group(1))`,
  },
];

export const API_EXAMPLE_LANGS = [['curl', 'curl', 'bash'], ['js', 'JavaScript (fetch, no dependencies)', 'js'], ['python', 'Python (standard library only)', 'python']];

const MCP_COMMANDS = `git clone https://github.com/pacocartones/free-llm-api-hub
cd free-llm-api-hub/packages/mcp
npm ci --ignore-scripts
node src/index.js`;

const MCP_TEXT = 'The same data is available to an MCP client (Claude Desktop, an IDE agent) through the server in `packages/mcp` of the repository: search providers, read one entry, check freshness, ask whether a provider is free, and get an OpenAI-client config. It is not published on npm; run it from a checkout:';

// `code` in prose → <code>, with the rest escaped.
const inlineHtml = (text, escapeText) => escapeText(text).replace(/`([^`]+)`/g, '<code>$1</code>');

/** The examples section of the /api/ page. `escapeText` is the HTML escaper of the build. */
export function apiExamplesHtml(escapeText, { repo }) {
  return `<h2 id="examples">Examples</h2>` +
    `<p>Short, dependency-free recipes for the four files most clients start from. Each one is run against the built files by the test suite, and every language prints the same lines, one record per line with tab-separated fields. The JavaScript uses top-level <code>await</code>: save it as an ES module and run <code>node example.mjs</code> (Node 18 or later), or paste it into a browser console.</p>` +
    API_EXAMPLES.map((ex) =>
      `<h3 id="example-${ex.id}">${escapeText(ex.title)} <small>(<a href="${ex.file === 'providers.json' || ex.file === 'status.json' ? `v1/${ex.file}` : `../${ex.file}`}"><code>${escapeText(ex.file)}</code></a>)</small></h3>` +
      `<p>${inlineHtml(ex.intro, escapeText)}</p>` +
      API_EXAMPLE_LANGS.map(([key, label]) => `<p class="muted">${escapeText(label)}</p><pre><code>${escapeText(ex[key])}</code></pre>`).join('')
    ).join('') +
    `<h3 id="mcp">MCP server</h3>` +
    `<p>${inlineHtml(MCP_TEXT, escapeText)}</p><pre><code>${escapeText(MCP_COMMANDS)}</code></pre>` +
    `<p>Options, the files it reads and client configuration are in <a href="${repo}/tree/main/packages/mcp">packages/mcp</a>.</p>`;
}

/** The examples section of docs/api.md, between the AUTOGEN:api-examples markers. */
export function apiExamplesMarkdown() {
  const url = (file) => file === 'providers.json' || file === 'status.json' ? `${API_EXAMPLES_SITE}/api/v1/${file}` : `${API_EXAMPLES_SITE}/${file}`;
  return [
    '<!-- Generated from scripts/lib/api-examples.mjs by scripts/build.mjs; edit the snippets there. -->',
    '',
    'Short, dependency-free recipes for the four files most clients start from. The same snippets are on the [API page](https://freellmapihub.com/api/#examples). `scripts/api-examples.test.mjs` runs every one against the built files, with no network, and checks that every language prints the same lines (one record per line, tab-separated fields). The JavaScript uses top-level `await`: save it as an ES module and run `node example.mjs` (Node 18 or later), or paste it into a browser console.',
    '',
    ...API_EXAMPLES.flatMap((ex) => [
      `### ${ex.title} ([\`${ex.file}\`](${url(ex.file)}))`,
      '',
      ex.intro,
      '',
      ...API_EXAMPLE_LANGS.flatMap(([key, label, fence]) => [`${label}:`, '', '```' + fence, ex[key], '```', '']),
    ]),
    '### MCP server',
    '',
    MCP_TEXT,
    '',
    '```bash',
    MCP_COMMANDS,
    '```',
    '',
    'Options, the files it reads and client configuration are in [`packages/mcp`](../packages/mcp/README.md).',
  ].join('\n');
}
