# LCA Carbon Ledger

A single-page life cycle assessment (LCA) carbon calculator. Enter a year of activity data per life-cycle stage and the page multiplies each line by an emission factor to report tonnes of CO₂e by stage, by GHG Protocol scope, and per functional unit.

## Stages
1. Raw material acquisition (Scope 3, Cat 1)
2. Manufacturing & operations (Scopes 1, 2 and 3 Cat 5)
3. Transport & distribution (Scope 3, Cat 4, 6, 9)
4. Use of sold products (Scope 3, Cat 11)
5. End of life (Scope 3, Cat 12)

Toggle cradle-to-gate (stages 1–3) or cradle-to-grave (1–5).

## Method
Emissions (t CO₂e) = quantity × factor (kg CO₂e/unit) ÷ 1000.

Library factors are typical screening values (US EPA GHG Emission Factors Hub, UK DESNZ/DEFRA, worldsteel/IAI averages, SEMARNAT/CRE Mexico grid factor, IPCC AR6 GWP100). Replace them with your own sources, supplier EPDs or a licensed LCI database for a verified inventory. Edited factors are outlined in the table.

## Run
Open `index.html` in a browser. No build step, no dependencies. Data is saved in the browser's localStorage; "Copy results as CSV" exports the ledger.
