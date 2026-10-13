# CO2Trace database and user experience (design, 2026-10-13)

Goal: model as rigorously as SimaPro (ISO 14040/44, ISO 14067, GHG Protocol) but with far less manual work. Read with `docs/simapro-model.md` (SimaPro concepts) and `docs/ghg-protocol-tools.md` (methodology).

## 1. What we keep from SimaPro and what we change

| SimaPro | CO2Trace |
|---|---|
| Generic multi-impact engine; every calculation solves the full process matrix | **Carbon only.** Library processes are solved once at import into a cradle-to-gate **per-gas vector** (kg CO2 fossil, CO2 biogenic, CH4 fossil/biogenic, N2O, SF6, HFCs…). A result is a sum of `qty × vector`, then a dot product with the method's GWPs. This takes milliseconds in the browser, so switching method (AR6/AR5/ISO 14067) is instant. |
| User browses the library tree and picks processes by hand | **Auto-matching**: each activity line (invoice text, ERP row, BOM item) gets a suggested process ranked by text match, unit compatibility, country and year, with a confidence score. Accepted matches are remembered per company. |
| Assembly → life cycle → disposal scenario built by hand | **BOM import** creates the assembly; **end-of-life is generated** from each material's waste type and the country's default disposal scenario (editable). |
| Calculation setup + Analyze button | **Live results**: no calculate step. Saved scenarios replace calculation setups. |
| Monte Carlo is an explicit, slow run on unit processes | **Automatic uncertainty**: a pedigree score per line, with temporal and geographic scores computed from factor year/region against inventory year/site. Lognormal Monte Carlo (10k runs) runs in a Web Worker on every change. |
| Checks tab (unlinked flows, missing waste types) | Checks run continuously: missing evidence, unit mismatch, factor older than the inventory by more than 3 years, material without waste type, spend-based line that has a physical alternative, RENE/GHG Protocol rules. |
| Single-user desktop, no evidence trail | Multi-user companies with roles, evidence files per line and an audit log (already in the backend schema). |
| Library updates replace data silently | **Versioned libraries**: when a new version lands, recompute and show a diff (which lines changed and why) before the user accepts. |

What we give up on purpose: non-climate impact categories, and the full process network for every result. To keep drill-down, each library process stores its **top contributors** (precomputed at import), so the Sankey can go one or two levels into the background.

## 2. Data libraries: where the data really comes from

The SimaPro marketplace **resells or repackages** other publishers' databases; it is not a download source for us. Each library has to come from its publisher under a licence that allows use in a commercial web app.

| Library | Use in CO2Trace | Licence status | Action |
|---|---|---|---|
| EPA Supply Chain GHG Emission Factors v1.3 (USEEIO, 1,016 NAICS-6 commodities, kg CO2e and per gas per 2022 USD, AR5) | Spend-based fallback, Scope 3 screening (US) | US Government work | Import CSV from data.gov / pasteur.epa.gov |
| EPA GHG Emission Factors Hub, eGRID2023 | Scope 1/2 (US) | US Government work | Already in `FACTORS`; move to the DB |
| RENE / FESEN / Mexican fuel factors | Scope 1/2 (MX) | Public (SEMARNAT) | Already in `FACTORS`; move to the DB |
| USLCI (Federal LCA Commons, NREL) | Process-based materials, energy, transport (US) | Not confirmed: the repo shows MIT but data licence not stated | Confirm, then import openLCA JSON-LD |
| DESNZ (UK) conversion factors | Wider fuel/transport/material coverage | Open Government Licence | Import yearly Excel |
| AGRIBALYSE 3.2 (ADEME) | Food and agriculture | ecoinvent-free "core" version exists; licence not confirmed | Confirm with ADEME, then JSON-LD |
| BAFU:2025 (Swiss FOEN) | Disaggregated, reviewed background data | Free in SimaPro; terms for third-party software not confirmed | Ask FOEN |
| EXIOBASE 3.9 | Multi-regional spend-based (incl. Mexico) | **Non-commercial** (v3.9); v3.8 is CC-licensed | Use v3.8 or skip |
| **ecoinvent 3.12** | The reference background database, what SimaPro users expect | **Developer licence** (annual, has an API add-on); end users get **LCIA scores only** | Quote from ecoinvent sales, or get it through Climatiq's API |
| Agri-footprint, Carbon Minds, DATASMART, ESU, IDEA | Niche | Paid, separate licences | Later, on customer demand |

The ecoinvent sub-licence (end users see LCIA only) fits this design. For licensed libraries we store a **pre-characterised CO2e per method** (pseudo-gas `CO2e`, as `FACTORS` already does) and never expose the unit-process inventory. Licensed processes are only shown to companies with an entitlement (`company_libraries`), and the API never allows bulk export.

**Import pipeline** (offline Python job, not in the web app): read EcoSpold2 / openLCA JSON-LD / CSV → map units and substances to our master lists → for unit-process databases solve the technosphere matrix (sparse solver; Brightway or openLCA can do this) → write per-gas vectors, top contributors, uncertainty and crosswalk codes → publish as a new `library_version`. Also accept **SimaPro CSV export** so consultants can bring their own project processes.

## 3. Database schema (Postgres, extends the Oct-7 backend schema)

The existing tables (`companies`, `memberships`, `invitations`, `inventories`, `lines`, `evidence_files`, `audit_log`, with row-level security by role) stay. Library tables are global and read-only for users. Project tables carry `company_id` and the same RLS policies.

```sql
-- ===== Reference data (global) =====
create table quantities (id text primary key);                 -- mass, energy, volume, distance, transport, money, area, time
create table units (
  id text primary key,                                         -- kg, t, L, gal, m3, kWh, MJ, therm, km, mi, tkm, USD2022, MXN…
  quantity text not null references quantities,
  to_ref double precision not null                             -- factor to the quantity's reference unit
);
create table substances (
  id text primary key,                                         -- co2_fossil, co2_bio, ch4_fossil, ch4_bio, n2o, sf6, hfc134a, co2e…
  name text not null, cas text, gas_group text not null        -- CO2, CH4, N2O, HFC, PFC, SF6, NF3, CO2e
);
create table methods (id text primary key, name text, year int);  -- AR6, AR5, AR4, ISO14067_AR6
create table characterisation (
  method_id text references methods, substance_id text references substances,
  cf double precision not null, primary key (method_id, substance_id)
);

-- ===== Libraries (global, versioned) =====
create table libraries (
  id text primary key,                                         -- epa-sc, epa-hub, egrid, rene, uslci, desnz, agribalyse, ecoinvent-cutoff…
  name text not null, publisher text not null,
  licence text not null, restricted boolean not null default false,  -- restricted = entitlement needed
  lcia_only boolean not null default false                     -- store CO2e per method only (ecoinvent)
);
create table library_versions (
  id uuid primary key default gen_random_uuid(),
  library_id text not null references libraries,
  version text not null, system_model text,                    -- cut-off, APOS, consequential, EN15804
  released_on date, imported_at timestamptz default now(),
  status text not null default 'staged' check (status in ('staged','current','retired')),
  unique (library_id, version)
);
create table processes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references library_versions,
  external_id text,                                            -- dataset UUID in the source
  name text not null, name_es text,
  category text not null check (category in
    ('material','energy','transport','processing','use','waste_scenario','waste_treatment','spend')),
  kind text not null check (kind in ('unit','system','market','eeio','factor')),
  ref_unit text not null references units,
  geography text, ref_year int,
  waste_type text,                                             -- for end-of-life routing (materials)
  technology text, comment text, source_url text,
  pedigree smallint[5],                                        -- reliability, completeness, temporal, geo, tech (1–5)
  gsd2 double precision,                                       -- squared geometric SD for Monte Carlo
  search tsvector,                                             -- name, synonyms, codes (EN + ES)
  unique (version_id, external_id)
);
create index processes_search on processes using gin (search);
create table process_gases (                                   -- cradle-to-gate per ref unit
  process_id uuid references processes on delete cascade,
  substance_id text references substances,
  method_id text references methods,                           -- null for physical gases; set for lcia_only CO2e
  amount double precision not null
);
create unique index process_gases_key on process_gases (process_id, substance_id, coalesce(method_id, ''));
create table process_contributors (                            -- precomputed drill-down, top N
  process_id uuid references processes on delete cascade,
  contributor_id uuid references processes, share real not null,
  primary key (process_id, contributor_id)
);
create table crosswalks (                                      -- NAICS, SCIAN, UNSPSC, HS → process
  scheme text, code text, process_id uuid references processes,
  primary key (scheme, code, process_id)
);
create table company_libraries (                               -- entitlements for restricted libraries
  company_id uuid references companies on delete cascade,
  library_id text references libraries, licence_ref text, valid_until date,
  primary key (company_id, library_id)
);

-- ===== Project data (per company, RLS) =====
create table project_processes (                               -- library process copied and edited, or user-made
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  copied_from uuid references processes,
  name text not null, category text not null, ref_unit text references units,
  gases jsonb not null,                                        -- {substance_id: amount}
  source text not null, status text not null default 'draft'
    check (status in ('draft','to_review','finished'))
);
create table parameters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  inventory_id uuid references inventories on delete cascade,  -- null = company level
  name text not null, value double precision, formula text,    -- formula may use other parameters and if()
  distribution jsonb,                                          -- {type:'lognormal', gsd2:…}
  unique (company_id, inventory_id, name)
);
create table scenarios (                                       -- parameter sets + library switches
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventories on delete cascade,
  name text not null, overrides jsonb not null default '{}'
);
create table product_nodes (                                   -- assembly tree (product footprint mode)
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references inventories on delete cascade,
  parent_id uuid references product_nodes on delete cascade,
  kind text not null check (kind in ('assembly','material','process','use','disposal')),
  name text not null,
  process_id uuid references processes, project_process_id uuid references project_processes,
  qty_formula text not null default '1', unit text references units,
  disposal jsonb                                               -- {recycled:%, landfill:%, incineration:%} override
);
create table match_memory (                                    -- learned auto-matching
  company_id uuid not null references companies on delete cascade,
  source_key text not null,                                    -- normalised text + unit, e.g. 'diesel|l'
  process_id uuid not null references processes,
  confirmed_by text not null, confirmed_at timestamptz default now(),
  primary key (company_id, source_key)
);
create table imports (                                         -- uploaded CSV/ERP/bill/BOM jobs
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  inventory_id uuid references inventories, kind text not null,
  status text not null, rows int, matched int, s3_key text, created_at timestamptz default now()
);
create table results (                                         -- server-side authoritative cache
  inventory_id uuid references inventories on delete cascade,
  scenario_id uuid, method_id text references methods,
  libraries_hash text not null,                                -- library versions used
  totals jsonb not null, computed_at timestamptz default now()
);
create unique index results_key on results (inventory_id, coalesce(scenario_id::text, ''), method_id);
```

Each `lines.data` row gains `process_id` (or `project_process_id`), `qty_formula`, `unit`, `match {confidence, by, at}` and `pedigree`; the current `key` maps onto `process_id` during migration. `V1_EF` and the v2 localStorage ledgers upgrade the same way.

**Calculation:** the browser fetches only the processes the inventory uses (`GET /processes?ids=…`) and computes live. On save the API recomputes with the same code (one shared TypeScript module) and writes `results`. Reports and exports read `results`, so a published number always matches a known set of library versions.

## 4. User experience

Two modes on the same engine, chosen in Project setup:
- **Corporate inventory** (GHG Protocol / RENE): what the app does today, by scope and category.
- **Product footprint** (ISO 14067 / LCA): functional unit, assembly tree, use stage, end of life.

Flow:

1. **Setup (2 minutes).** Country, year, mode, and a short goal-and-scope form. Defaults are filled from the country: RENE → AR5, US → AR6 GWP100, cut-off 1%, cut-off allocation. ISO fields are kept but collapsed.
2. **Bring data.** Drop files: utility bills (PDF), fuel cards and ERP/purchase exports (CSV/XLSX), a BOM (XLSX), or a SimaPro CSV. Or type lines as today. Each file becomes an `imports` job.
3. **Review matches.** A table with: source text → suggested process, confidence, unit converted, alternatives, and spend vs physical. Accept in bulk above a confidence threshold and fix the rest. Every fix trains `match_memory`, so next year's import is almost fully automatic.
4. **Model** (product mode). A collapsible BOM tree. Each material shows its waste type and the end of life it generated. Parameters can be used in any quantity (e.g. `distance_km * mass_t`).
5. **Results, always on.** KPIs, scope/stage/category charts, a Sankey (stage → category → line → background contributor, with a cut-off %), hotspots, a 95% uncertainty range, and scenario comparison side by side.
6. **Checks and report.** A continuous checks panel with fix-it buttons. Export: GHG Protocol inventory, ISO 14067 report outline, RENE COA, and an Excel export of every line with factor, source, library version and evidence.

Efficiency targets against a typical SimaPro workflow: no library browsing for at least 80% of lines after the first year; zero manual end-of-life lines; zero "calculate" clicks; every number traceable to a library version and an evidence file.

## 5. Build order

1. Move `FACTORS` into the library tables (EPA Hub, eGRID, RENE/FESEN) and the client engine onto per-gas vectors from the API. Behaviour stays identical, verified by matching totals for both examples.
2. EPA Supply Chain factors + NAICS/SCIAN crosswalk → spend-based lines and CSV import with auto-matching.
3. Review-matches screen and `match_memory`.
4. Pedigree, Monte Carlo and the continuous checks.
5. USLCI and DESNZ import pipeline (after licences are confirmed) → product mode, assembly tree and generated end of life.
6. ecoinvent once a licence route is chosen.

## Open decisions

- Which mode comes first: corporate inventory (closest to today) or product footprint (closest to SimaPro)?
- ecoinvent route: direct developer licence, Climatiq API, or postpone until there are paying customers.
- The backend source (`api/`, `infra/`) is not on disk: only `node_modules` and the `cdk.out` build output remain. Find the source or rebuild it before adding these tables.
