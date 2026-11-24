// security-txt.mjs — /.well-known/security.txt (RFC 9116), written by the build from SECURITY.md's contacts.
//
// `Expires` is one year after SECURITY_TXT_ISSUED, a date written here, never the build's clock: the file stays the
// same on every build (the drift gate compares it) and changes only when someone renews it. Renew it before it expires
// (RFC 9116 asks for less than a year): move SECURITY_TXT_ISSUED to the day of the change and rebuild.
export const SECURITY_TXT_ISSUED = '2026-11-24';

export const securityTxtExpires = (issued = SECURITY_TXT_ISSUED) => {
  const d = new Date(`${issued}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`SECURITY_TXT_ISSUED is not a date: ${issued}`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

export const securityTxt = ({ site, repo, issued = SECURITY_TXT_ISSUED }) => [
  '# Security contact for the Free LLM API Hub (website, dataset, scripts and MCP server).',
  '# Please report privately; see the policy for scope.',
  `Contact: ${repo}/security/advisories/new`,
  'Contact: mailto:admin@freellmapihub.com',
  `Expires: ${securityTxtExpires(issued)}`,
  'Preferred-Languages: en',
  `Canonical: ${site}/.well-known/security.txt`,
  `Policy: ${repo}/blob/main/SECURITY.md`,
  '',
].join('\n');
