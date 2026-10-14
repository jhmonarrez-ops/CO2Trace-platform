# Security

CO2Trace (co2trace.io) is a static page: there is no server, no account database and no upload endpoint yet. Everything a visitor enters, including attached evidence files, stays in their own browser (localStorage and IndexedDB) and is never sent anywhere.

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue. You will get an answer within a few days.

## What the page does to protect visitors

- A Content Security Policy (meta tag in `index.html`) only lets the page run its own inline scripts, pinned by SHA-256 hash, and Lenis from jsDelivr, which is also pinned with Subresource Integrity. Injected scripts, inline event handlers and scripts from other sites are refused.
- Everything a visitor types is escaped before it is drawn, and sample and report documents open in sandboxed frames or separate tabs.
- No analytics, trackers or third-party cookies.
