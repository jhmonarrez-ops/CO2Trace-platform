# CO2Trace (repo: lca-carbon-ledger) — notes for Claude

- Single static page: `index.html` (inline CSS + JS, no build). Fonts from Google Fonts only.
- Data model: `state = { company, year, fuName, fuQty, boundary, isExample, rows[] }`; each row `{ id, stage, key, supplier, note, qty, unit, ef (kg CO2e/unit), scope, m0, m1 (activity months 0–11, inclusive; emissions spread evenly for the Gantt), evidence: { doc, ref, period, verified, files[{fid,name,size,type,added}] } }`. Evidence file blobs live in IndexedDB db `lca-evidence`, store `files`, keyed by fid. Chart view choices (catView radial|treemap, catScope, ganttScope) live in localStorage `lca-ui-v1`.
- `STAGES`, `FACTORS`, `CATS` (emission categories = factor kind) and `DOCS` (evidence document types) are defined at the top of the script. Defaults: `defaultScope()`, `defaultDoc()`.
- Persisted in localStorage key `lca-ledger-v1`.
- Published copy (claude.ai artifact): https://claude.ai/artifact/84bMVNrhpBWEaeDiyyib1K
- Theme tokens on `:root` with dark-mode overrides; keep colors as tokens.
- GHG Protocol methodology, tool catalogue, GWPs, reporting requirements and the current gap list: `docs/ghg-protocol-tools.md`. Check calculation changes against it.

- Hosting: GitHub Pages from `main` (repo public since 2026-10-07), custom domain co2trace.io via `CNAME`; DNS at GoDaddy. Pushing to main deploys the live site.
