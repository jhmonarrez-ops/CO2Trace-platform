# CO2Trace proposals

Major changes waiting for or holding Jorge's decision. Format: `## P-YYYYMMDD-n: title`.

## P-20261117-1: Show the plans and prices again
- What: remove the `no-plans` switch so the Plans section, its links and the help-chat prices are visible again, with the same prices as before (Small $2,490 MXN / $149 USD, Medium $7,490 / $449, Large from $19,900 / $1,190, yearly = 2 months free).
- Why: Jorge asked to "add again the different plans as before".
- Decision: approved by Jorge on 2026-11-17 (request to OpenClaw).

## P-20261117-2: Set the site up for phone use
- What: responsive pass over the public pages and the app (no sideways scroll, usable menu, stacked layout, scrollable tables, full-screen dialogs, resizing charts, 44 px tap targets, add-to-home-screen manifest).
- Why: Jorge wants it set up for phone use on day 1. Layout change across the page, so major.
- Decision: approved by Jorge on 2026-11-17 (request to OpenClaw).

## P-20261117-3: Add the missing pages
- What: FAQ, Contact/Support, 404 page; Privacy and Terms as unlinked, noindex drafts.
- Why: Jorge asked to develop the pages that need to be added. Legal wording stays draft until Jorge approves it separately.
- Decision: approved by Jorge on 2026-11-17 (request to OpenClaw); legal text still needs his OK before linking.
- Status 2026-11-17: part 1 done (FAQ, Support, 404). Part 2 drafts verified (`privacy.html`, `terms.html`, unlinked, noindex). Linking stayed AWAITING until Jorge OKs wording.
- Decision (legal wording) 2026-11-17 11:18: Jorge approved `privacy.html` / `terms.html` wording — link from footer, drop draft banner + `noindex` (`approve P-20261117-3 legal wording` in `.dev/approvals.txt`).
- Status 2026-11-19: legal wording published — footer Company links, no draft banner / `noindex`, live EN+ES titles; verified.

## P-20261117-4: User ideas list and the first two small ones
- What: `docs/user-ideas.md` with ideas per user type; build the top two page-only minor ideas; propose the major ones.
- Why: Jorge asked for "different user ideas they might want to use".
- Decision: approved by Jorge on 2026-11-17 (request to OpenClaw).
- Status 2026-11-19: done — `docs/user-ideas.md` (15 ideas / 5 groups); shipped checklist + monthly `.ics`; remaining ideas under backlog Later; two majors proposed below.

## P-20261119-1: Multi-client workspace for consultants
- What: under one signed-in account, switch between several client ledgers (list + create/rename/archive), each with its own company, year, rows and evidence; keep the current single-ledger UX when only one client exists.
- Why: consultants managing several clients (user-ideas #8) need this before any comparison dashboard; it changes the saved data shape and needs the cloud account backend.
- What Jorge will see: a client switcher near Project setup; switching reloads that client’s dashboard and reports; public site unchanged.
- Risk: medium–high — new persistence keys / cloud company model; must not break `lca-ledger-v1` for single-company users.
- Size: large (~several sessions; depends on Cognito/API).
- Alternatives: export/import JSON per client only (minor, weaker); wait until accounts ship, then add switcher.
- Decision 2026-11-20: still AWAITING (no approve/reject line in `.dev/approvals.txt`).

## P-20261119-2: Evidence completeness trail for auditors
- What: an export (HTML/CSV) listing every evidence attach, verify and period check in chronological order for the ledger in view, with line id, document type, reference and cumulative coverage — for an engagement file.
- Why: auditors/verifiers (user-ideas #13) need a trail beyond the evidence pack annex; full change history (#14) is larger and needs storage.
- What Jorge will see: a new button under Reports / Evidence pack that opens or downloads the trail; examples stay read-only.
- Risk: medium — may need IndexedDB file metadata timestamps; wording must stay non-assurance.
- Size: medium (about one focused session if limited to current evidence fields; larger if true history).
- Alternatives: strengthen the existing Evidence pack annex only (minor); defer until cloud change-log exists.
- Decision 2026-11-20: still AWAITING (no approve/reject line in `.dev/approvals.txt`).
