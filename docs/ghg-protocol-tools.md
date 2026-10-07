# GHG Protocol tools and inventory rules: reference for CO2Trace

Gathered 2026-10-07 from ghgprotocol.org/tools-resources. The tools and FAQs now live in the GHG Protocol Support Hub (ghgptechassistance.zendesk.com), which sits behind a Cloudflare check. Its public API works: `https://ghgptechassistance.zendesk.com/api/v2/help_center/en-us/categories/{id}/articles.json`. The category IDs are 27448673565716 (Calculation Tools and Guidance), 47396110468372 (FAQs) and 47396171833108 (Life Cycle Databases). Download links point to `ghgprotocol.org/sites/default/files/...` and are fetched directly.

## 1. Tool catalogue (30 tools)

### Cross-sector (these apply to CO2Trace)
| Tool | Version | What it does | Files |
|---|---|---|---|
| Cross-sector Emission Factors | V2.0, Mar 2024 | Emission factors for CO2, CH4 and N2O from stationary combustion, mobile combustion (fuel and distance), electricity (US eGRID 2005–2022; CN, TW, BR, TH, UK), freight and public transport, plus unit conversions | `2024-05/Emission_Factors_for_Cross_Sector_Tools_V2.0_0.xlsx` |
| Stationary Combustion | v4.2, Aug 2024 | Fuel × LHV × EF per gas, by sector (Energy, Manufacturing, Construction, Commercial, Institutional, Residential, Agriculture/Forestry/Fisheries); handles LHV/HHV basis and density; reports **biomass CO2 separately** | `2024-10/Stationary_combustion_tool_Version4-2.xlsx`, guidance `2023-02/Stationary_Combustion_Guidance_final_1_0.pdf` |
| Transport / Mobile Sources | v2.7, Sep 2024 | Owned vehicles (Scope 1), public or outsourced transport (Scope 3) and mobile machinery; activity data by fuel, distance, weight-distance or passenger-distance; summary by scope and gas, with biofuel CO2 kept separate | `2024-10/Transport_Tool_v2_7.xlsx` |
| Refrigeration & A/C (HFC/PFC) | 2005 | Three methods: sales-based (mass balance), life-cycle-stage, and screening (IPCC default leak rates) | `hfc-pfc_1.xls`, `hfc-cfc_1.pdf` |
| Global Warming Potential Values | Aug 2024 | AR4, AR5 and AR6 100-year GWPs | `2024-08/Global-Warming-Potential-Values (August 2024).pdf` |
| CHP allocation | v1.0 | Splits CHP emissions between heat and power (efficiency method) | `2023-03/CHP_tool_v1.0.xls` |
| Measurement & Estimation Uncertainty | — | Quantitative uncertainty for Scope 1 and 2 | `tools/ghg-uncertainty.xlsx` |
| Scope 3 / Product Uncertainty | 2022 | Pedigree-matrix data quality (reliability, completeness, temporal, geographic, technological) → uncertainty per category | `2022-12/Uncertainty Calculation Tool.xlsx` |

### Sector-specific (process emissions, Scope 1)
Aluminum (CO2, PFC), Adipic acid (N2O), Ammonia (CO2), Cement (CSI clinker-based, EN/CN), Cement (US EPA, production-based), HCFC-22 (HFC-23), Iron & steel (two methods), Lime, Nitric acid (N2O), Pulp & paper (ICFPA), Wood products (English or SI units).

### Country-specific
China coal-fired power plants; China energy consumption; CSI cement (CN); US EPA cement tool customised for India; **Pulp & paper customised for Mexico (EN and ES)**; US EPA Simplified GHG Emissions Calculator (epa.gov/climateleadership/simplified-ghg-emissions-calculator).

### For countries and cities
Mitigation Goal Standard calculation tool; Policy and Action Standard calculation tool (under repair).

### Life Cycle Databases (23 listed)
AusLCI, Bath ICE, BEAT, CLCD (China), CEDA (EEIO), Defra/DESNZ, ecoinvent, Environdec (EPDs), ESU-services, European Copper Institute, GREET, worldsteel (IISI), ISSF, ITRI (tin), IZA (zinc), IDEA (Japan), IPCC EFDB, NREL US LCI, Nexus, Plastics Europe, ProBas, Sphera, US EPA Supply Chain GHG EFs (USEEIO, spend-based).

## 2. How inventory calculations work

- **Formula:** GHG (t CO2e) = activity data × emission factor (per gas) × GWP. The alternative is direct measurement (monitoring, mass balance, stoichiometry) × GWP.
- **Gases:** the seven UNFCCC/Kyoto gases are required: CO2, CH4, N2O, HFCs, PFCs, SF6 and NF3. Non-Kyoto gases (CFCs, NOx) are reported separately from the scopes.
- **GWP:** use 100-year values from a single IPCC Assessment Report for the whole inventory, and the same set for the base year. AR6 is recommended.

| Gas | AR4 | AR5 | AR6 |
|---|---|---|---|
| CO2 | 1 | 1 | 1 |
| CH4, non-fossil (use for all **combustion**) | 25 | 28 | **27.0** |
| CH4, fossil (fugitive and process only) | — | 30 | 29.8 |
| N2O | 298 | 265 | **273** |
| HFC-32 | 675 | 677 | 771 |
| HFC-125 | 3,500 | 3,170 | 3,740 |
| HFC-134a | 1,430 | 1,300 | 1,530 |
| SF6 | 22,800 | 23,500 | 24,300 |
| NF3 | 17,200 | 16,100 | 17,400 |

R-410A is 50/50 HFC-32 and HFC-125, so its AR6 GWP ≈ 2,256. The RAC workbook still ships SAR GWPs (HFC-134a = 1,300), so override them.

- **Combustion vs life-cycle factors:** Scope 1 fuels and Scope 2 electricity use **combustion-only (tank-to-wheel / generation-only)** factors. Upstream extraction, refining, transport and T&D losses go to **Scope 3 Category 3**. Material factors (cradle-to-gate) are life-cycle factors, which is right for Cat 1.
- **Biogenic CO2:** CO2 from biomass, biofuels and biogas is reported **outside the scopes**. Its CH4 and N2O stay in the scope.
- **Stationary combustion:** fuel → energy (LHV/NCV) → kg gas/TJ. CH4 and N2O factors depend on the sector. Volumes need density. For CO2, the IPCC 2006 defaults per TJ are diesel 74,100 kg, natural gas 56,100 kg and LPG 63,100 kg.
- **Mobile combustion:** fuel-based is best for CO2; distance-based is best for CH4 and N2O. Fuel can be estimated from spend (spend ÷ price) or from distance ÷ fuel economy. Freight factors (t·km, vehicle-mile) are **Scope 3 only**, not for owned fleets.
- **Scope 2 dual reporting:** report both a **location-based** total (grid average) and a **market-based** total (contractual instruments in order: EACs/RECs/I-RECs/GOs, PPAs, supplier-specific rate, residual mix, then grid average as a fallback). Renewables = 0 applies only in the market-based figure. Disclose the instrument types and that the Scope 2 Quality Criteria are met. Biogenic electricity: CH4 and N2O go in Scope 2; the CO2 goes outside the scopes.
- **T&D losses (Cat 3):** Scope 2 kWh × grid loss rate × factor. Use location-based factors unless EACs cover the losses. Not dual-reported.
- **Refrigerants (sales-based, users):** emissions = decrease in stored inventory + purchases/acquisitions − sales/disbursements − increase in full charge of equipment. Screening method: units × charge × leak rate. IPCC default annual leak rates are commercial refrigeration 10–30%, chillers 2–15%, residential and commercial A/C 1–5%, and mobile A/C 10–20%.
- **Data quality (Scope 3 Std Table 7.6 / Box 7.2):** score technology, time (<3 / <6 / <10 years), geography, completeness and reliability as Very good / Good / Fair / Poor. The uncertainty tool turns these pedigree scores into an uncertainty range.

## 3. Reporting format (what an inventory must disclose)

Scope 1 and 2 (Corporate Standard): organisational boundary (equity share or financial/operational control), operational boundary, period, totals **per scope and per gas** (t and t CO2e), location- and market-based Scope 2, biogenic CO2 separately, base year and recalculation policy, methods and factor sources, GWP set.

Scope 3 (Scope 3 Standard §11.1, required): total per category in t CO2e (excluding biogenic CO2 and any offsets); included categories, and excluded categories with justification; biogenic CO2 per category, separately; data types and sources, factors and GWPs per category, with data quality; methods, allocation and assumptions per category; **% of each category calculated with supplier or value-chain primary data**; base year details once set.

Scope 3 minimum boundaries: Cat 1 and Cat 2 cover all cradle-to-gate emissions. Cat 3 covers upstream emissions of purchased fuels and electricity plus T&D losses.

## 4. CO2Trace against the GHG Protocol (gap list, as of 2026-10-07)

| Area | Current state | Gap |
|---|---|---|
| Diesel 2.70, gasoline 2.32, LPG 1.51 kg/L | Match US EPA combustion factors | OK |
| Natural gas 2.02 kg/m³ | Close to DESNZ gross CV (~2.04) | IPCC/EPA give ~1.89–1.93. Label the source. |
| US grid 0.371 kg/kWh | Close to eGRID 2022 (~0.37) | OK. eGRID subregions are available if the site location is known. |
| Refrigerants (134a 1,530, 410A 2,256, 32 771) | AR6 | OK |
| Freight (truck 0.107, rail 0.028, sea 0.016, air 0.60 kg/t·km) | In DESNZ/EPA range | OK for Scope 3; owned trucks need fuel-based Scope 1 lines |
| Single CO2e factor per line | — | No per-gas split (CO2/CH4/N2O/HFC) as the Corporate Standard requires |
| Scope 2 | One figure; "renewable with certificates = 0" mixed in | Needs **location- and market-based** totals |
| Scope 3 Cat 3 | Missing | Add WTT for fuels and electricity, plus T&D losses |
| Biogenic CO2 | No field | Report outside the scopes |
| Data quality | Evidence status only | Add a DQI score per line; % primary data per category |
| Disclosure | — | GWP set, consolidation approach, base year, excluded categories with reasons |
