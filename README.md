# CO2Trace

Live at **https://co2trace.io** (GitHub Pages, deployed from `main`).

A single-page life cycle assessment (LCA) carbon calculator. Enter a year of activity data per life-cycle stage and the page multiplies each line by an emission factor to report tonnes of CO₂e by stage, by GHG Protocol scope, and per functional unit.

## Stages
1. Raw material acquisition (Scope 3, Cat 1)
2. Manufacturing & operations (Scopes 1, 2 and 3 Cat 5)
3. Transport & distribution (Scope 3, Cat 4, 6, 9)
4. Use of sold products (Scope 3, Cat 11)
5. End of life (Scope 3, Cat 12)

Toggle cradle-to-gate (stages 1–3) or cradle-to-grave (1–5).

## Country and method
Choose **Operations in: United States or México**. The factor library, impact method and reporting rules follow the choice:
- **México:** RENE factors (Calculadora RENE v9.0) for fuels and own vehicles, FESEN 2024 grid factor (0.444 t CO₂e/MWh), IPCC AR5 GWPs, a 25,000 t CO₂e RENE threshold check and a COA summary export.
- **United States:** US EPA GHG Emission Factors Hub 2025 per gas, eGRID2023 average and subregions, IPCC AR6 by default, Scope 2 location- and market-based, and EPA GHGRP and California SB 253 notes.

As in SimaPro, each factor is an inventory of gases (kg CO₂, CH₄, N₂O, HFCs per unit) characterised by the selected impact method (IPCC AR6, AR5 or AR4 GWP100). The Project setup panel holds the ISO 14044 goal and scope and lists the libraries in use. The dashboard adds an inventory-by-substance table and a Checks list.

## Dashboard
- Key metrics: total t CO₂e, Scope 1, 2 and 3 with share of total, kg CO₂e per functional unit, evidence coverage.
- Layout: activity ledger on the left, dashboard pinned on the right (stacked above the ledger on screens under 1100px).
- Charts: scope donut, categories per scope as a radial histogram or a treemap (all scopes or one scope at a time), a monthly Gantt showing which months each line covers and the peak month and quarter, largest emission categories, categories within each scope (with a category × scope table), emissions by supplier, evidence status, life-cycle stage, hotspots.

## Evidence
Each ledger line has an evidence panel: document type (utility bills for electricity, gas and water, fuel invoices, purchase invoices, freight invoices, waste manifests, refrigerant service logs, supplier EPDs and more), reference number, period covered, attached files and a reviewer "verified" check. Lines are Missing, Attached or Verified, and coverage is weighted by emissions. Files are stored in the browser's IndexedDB on that device only.

## Method
Emissions (t CO₂e) = Σ over gases of quantity × kg of gas per unit × GWP ÷ 1000. Edited and custom factors are kg CO₂e per unit.

Library factors are typical screening values (US EPA GHG Emission Factors Hub, UK DESNZ/DEFRA, worldsteel/IAI averages, SEMARNAT/CRE Mexico grid factor, IPCC AR6 GWP100). Replace them with your own sources, supplier EPDs or a licensed LCI database for a verified inventory. Edited factors are outlined in the table.

## Run
The site is served by GitHub Pages: every push to `main` redeploys https://co2trace.io (the `CNAME` file sets the domain; DNS is at GoDaddy with A records to GitHub Pages and `www` → `jhmonarrez-ops.github.io`). Locally, open `index.html` in a browser. No build step, no dependencies. Data is saved in the browser's localStorage; "Copy results as CSV" exports the ledger.

## Brand

`brand/co2trace-logo.svg` is the CO2Trace logo traced to vector paths from the original artwork (background removed; `fill="currentColor"` so it takes the page's text color). `brand/co2trace-icon.svg` is the footprints mark used as the favicon. `brand/trace.py` regenerates both outlines from a source image (needs `potracer`, `pillow`, `numpy`).
