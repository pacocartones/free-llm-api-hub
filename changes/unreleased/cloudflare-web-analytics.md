### Changed and fixed

- Site: Cloudflare Web Analytics is now on for freellmapihub.com. Cloudflare
  injects its cookieless beacon at the edge, so the Content-Security-Policy of
  every page now allows `https://static.cloudflareinsights.com` (script) and
  `https://cloudflareinsights.com` (connect); without them the browser blocked
  it. The privacy page no longer says the site does not use Cloudflare's
  analytics: it describes what Cloudflare Web Analytics collects (aggregated
  page views, referring site, Core Web Vitals, country, browser and device
  type), and that it sets no cookies and stores nothing on the device (#806).
