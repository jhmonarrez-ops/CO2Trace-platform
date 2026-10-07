# Mexico: GHG reporting under the RENE (reference for CO2Trace)

Gathered 2026-10-07 from primary sources linked on gob.mx/semarnat/acciones-y-programas/registro-nacional-de-emisiones-rene. Copies of the PDFs and of the official calculator are in the session scratchpad, not the repo.

## Legal basis

| Instrument | Date (DOF) | What it sets |
|---|---|---|
| Ley General de Cambio Climático (LGCC), art. 7 fr. XXXIV, art. 87 | 6 Jun 2012 | Creates the Registro Nacional de Emisiones (RENE) |
| Reglamento de la LGCC en materia del RENE | 28 Oct 2014 | Who reports, threshold, gases, methods, COA, verification |
| Acuerdo de gases que se agrupan y sus potenciales de calentamiento | 14 Aug 2015 | Official gas list and **GWP values** |
| Acuerdo de particularidades técnicas y fórmulas (metodologías de cálculo) | 3 Sep 2015 | Calculation formulas and factors per activity |
| Acuerdo de metodología para la medición directa de CO2 | — | CEMS / direct measurement |
| Acuerdo del instructivo y formato de la Cédula de Operación Anual (COA) | — | The reporting form |
| Annual notices: factor de emisión del Sistema Eléctrico Nacional (FESEN), lista de combustibles y poderes caloríficos (CONUEE) | yearly | Grid factor and fuel heating values for each report year |

## Who must report (Reglamento arts. 3–6, 10)

- **Establecimiento Sujeto a Reporte (ESR):** the set of fixed and mobile sources used for a productive, commercial or service activity, in one of these sectors:
  - Energy: power; hydrocarbons
  - Transport: air, rail, sea, road
  - Industry: chemical, steel, metallurgy, metal-mechanical, mining, automotive, pulp and paper, printing, petrochemical, cement and lime, glass, electronics, electrical, food and beverage, wood, textile
  - Agriculture and livestock
  - Waste: wastewater; MSW and special-handling waste
  - Commerce and services: construction, retail, education, recreation, tourism, medical, government, financial
- **Threshold:** the annual sum of **direct + indirect** emissions from all fixed and mobile sources is **≥ 25,000 t CO2e**. Establishments below the threshold do not report to RENE but may have to report to state registries (art. 24).

## Boundary: direct and indirect only (no Scope 3)

- **Direct emissions** (art. 2 IV): from the ESR's processes, its fixed sources, and the mobile sources it **owns or leases**. Third-party transport providers are excluded. This is roughly GHG Protocol Scope 1.
- **Indirect emissions** (art. 2 V): generated off-site because of the ESR's **electricity and thermal energy** consumption. This is roughly Scope 2 (location-based only).
- Value-chain emissions (Scope 3) are **not** part of RENE.

## Gases (art. 5)

CO2, CH4, N2O, **black carbon**, CFCs, HCFCs, HFCs, PFCs, SF6, NF3, halogenated ethers, halocarbons, blends, and any further gases the IPCC adds once SEMARNAT publishes them. Note that RENE includes CFCs, HCFCs and black carbon, which the GHG Protocol keeps outside the scopes.

## Official GWPs (Acuerdo 14 Aug 2015) = IPCC AR5, 100-year

| Gas | RENE GWP |
|---|---|
| CO2 | 1 |
| CH4 | **28** |
| N2O | **265** |
| Black carbon | 900 |
| HFC-32 | 677 |
| HFC-125 | 3,170 |
| HFC-134a | **1,300** |
| HFC-23 | 12,400 |
| HCFC-22 (R-22) | 1,760 |
| SF6 | 23,500 |
| NF3 | 16,100 |
| CF4 | 6,630 |
| C2F6 | 11,100 |

Blends are taken by mass fraction. For example, R-410A (50% HFC-32 / 50% HFC-125) = **1,923.5** under RENE, against 2,256 under AR6. The GHG Protocol recommends AR6, so **a Mexican compliance report and a GHG Protocol report give different CO2e for the same activity data.**

## Calculation methods (art. 7–8, Acuerdo de metodologías)

1. **Emission factors** (most activities): fuel combustion, cement, lime, glass, ammonia, nitric and adipic acid, iron and steel, aluminium, mobile combustion, manure, open burning, wastewater, and **electricity consumption**.
2. **Mass balance**: fluorinated gases in electronics, refrigeration, and similar uses.
3. **Direct measurement**: where factors cannot be applied or the carbon content of a fuel is unknown.
- SEMARNAT's own factors come first. **IPCC defaults are used only when no SEMARNAT factor exists** (art. 8).

### Combustion formula (Calculadora RENE v9.0, Mar 2025)
`emissions_gas (t) = volume × heating value (MJ/unit) × EF_gas (t/MJ)` and `t CO2e = CO2 + CH4×28 + N2O×265`.
Heating values come from the yearly CONUEE fuel list (e.g. diesel 6,065 MJ/bbl, gasoline 5,613 MJ/bbl, natural gas 33,543 kJ/m³ in the calculator's general rows). The CO2 factors are IPCC 2006 defaults (diesel 7.41e-5 t/MJ, gasoline 6.93e-5, natural gas 5.61e-5, LPG 6.31e-5).

| Fuel | Stationary (kg CO2e/unit) | Mobile, road (kg CO2e/unit) | CO2Trace today |
|---|---|---|---|
| Diesel | **2.836 /L** | **2.870 /L** | 2.70 (US EPA) |
| Gasoline | 2.455 /L | 2.546 /L | 2.32 (US EPA) |
| Natural gas | 1.884 /m³ | 1.995 /m³ | 2.02 (DESNZ) |
| LPG | 1.695 /L | 1.695 /L | 1.51 (US EPA) |

Mexican fuels have higher heating values per litre than the US EPA basis, so for Mexican sites the RENE factors should be used.

### Electricity
- **FESEN 2024 = 0.444 t CO2e/MWh** (CRE notice, 28 Feb 2025).
- SEMARNAT notice of **29 May 2026**: the 2025 factor (now estimated by SENER) was not yet published, so the **COA 2026 cycle used 0.444**.
- Only the national grid factor is used. RENE has no market-based method for certificates or PPAs.

### Refrigerants (calculator, equipment manufacturers and users)
Emissions = refrigerant mass × stage factor (charge / recharge / disposal) × GWP. Example defaults: self-contained A/C charge 1% / recharge 10% / disposal 90%; vehicle A/C 1% / 35% / 75%; supermarket central systems 5% / 25% / 90%; R-134a chillers 1% / 10% / 90%.

## Reporting and verification

- **Form:** Cédula de Operación Anual (COA), filed electronically (COA Web).
- **Window:** **1 Mar – 30 Jun** each year, covering 1 Jan – 31 Dec of the previous year. A partial first year runs from the start of operations.
- **Content (arts. 13–14):** company name, RFC, **NAICS (SCIAN) code**, legal representative, period. For fixed sources: emissions **per gas** grouped by activity type, **annual volume per fuel**, and site location. For mobile sources: emissions per gas, **number and type of units**, and fuel volume per fuel type. All values in **t of each gas and t CO2e**.
- **Verification:** every **3 years** a Dictamen de Verificación from an EMA-accredited and SEMARNAT-approved body (OC-VV-GEI), filed **1 Jul – 30 Nov**. It covers the prior year's emissions. Verifiers check methods, factors and the truthfulness of the data.
- **Record keeping:** keep all data and documents used for **5 years** after the COA is received (art. 9 VII).
- **Corrections:** voluntary correction notice before any PROFEPA inspection (art. 11). PROFEPA can request information with 15 working days to respond.

## 2026 context (secondary sources, check before relying on them)

- Press reports (Expansión ESG, Dec 2025) say a RENE platform relaunch from January 2026 covers Scopes 1–3 using the GHG Protocol and ISO 14064, and that the formal Emissions Trading System (SCE) starts in 2026 after the 2020–2022 pilot. The Programa Especial de Cambio Climático 2026–2030 was approved in June 2026 and mentions a pending LGCC reform. **None of this has been confirmed in the DOF yet.** The 2014 Reglamento is still the binding text.
- CINIF **NIS** (Normas de Información Sostenible): companies reporting under Mexican financial standards (incl. BMV-listed companies) disclose 30 basic sustainability indicators (IBSO), including GHG emissions, alongside their financial statements, starting with periods ending 31 Dec 2025.

## What this means for CO2Trace

1. **Reporting framework switch:** "GHG Protocol" (AR6, Scopes 1–3, dual Scope 2) or "RENE México" (AR5 GWPs, direct and indirect only, FESEN factor, Mexican fuel factors).
2. **Per-gas storage:** RENE requires t CO2, t CH4, t N2O (and t of each HFC). Each line should carry per-gas factors, with CO2e computed from the selected GWP set.
3. **Threshold check:** show whether direct + indirect ≥ 25,000 t CO2e, which means the company must report to RENE.
4. **COA-ready export:** emissions per gas by activity, fuel volume by type, vehicle count and type for mobile sources, site location, SCIAN code.
5. **Evidence retention:** the evidence panel already matches the 5-year record-keeping and 3-year verification needs. Add a retention date and a verification-cycle flag.
6. **Mexican factor set:** add the RENE fuel factors above and keep FESEN by year (0.444 for 2024 and the 2026 COA cycle).
