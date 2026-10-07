# How SimaPro works (reference for modelling CO2Trace on it)

Sources: SimaPro Tutorial v6.0 (PRé/SimaPro, Apr 2023, ecoinvent 3.9.1) and "SimaPro desktop 10.4 – What's new" (Mar 2026). SimaPro is now part of the One Click LCA group. Desktop 10.4 (formerly "SimaPro Craft") ships ecoinvent 3.12.

## 1. Building blocks

A SimaPro database has three layers:

| Layer | Contents | CO2Trace equivalent |
|---|---|---|
| **General data** | Literature references, substances (one master list), units, quantities (mass, energy, volume…) with conversions | Units, references (missing) |
| **Libraries** | Read-only background LCI databases (ecoinvent, Agri-footprint, USLCI, Industry data 2.0, EU & DK input-output, BAFU:2025) plus the **Methods** library. Library data must be *copied into the project* before editing. | `FACTORS` (library factors; edited factors are outlined) |
| **Projects** | The user's model: goal & scope, own processes, product stages, parameters, calculation setups, interpretation | One ledger (`state`) |

**Foreground vs background.** The amounts (kg of aluminium, km of truck, kWh) are foreground data that the user collects. The processes that turn them into emissions (aluminium production, truck transport, grid electricity) are background library processes.

**Library types.** *Process* libraries hold impacts per physical unit (per kg, per kWh). *Input-output* libraries hold impacts per money spent in a sector, which suits screening and services.

**ecoinvent system models:** allocation cut-off by classification (default in the tutorial), APOS, consequential (substitution), and cut-off EN15804. *Unit* processes are transparent (they keep the full supply-chain tree and carry uncertainty data, so Monte Carlo works) but slow. *System* processes are aggregated black boxes: fast, with no uncertainty data, and they give the same totals. A **library switch** swaps one library for another in a calculation setup when the process names match. *Market* processes include transport plus a production mix and are used when the supplier is unknown; *transformation* processes are a single production step.

## 2. Goal and scope (ISO 14040/44 fields)

Name, date, author, LCA type, commissioner, practitioner. **Goal:** intended application, reason, audience, comparative assertion disclosed to the public (yes/no). **Scope:** product system, function, **functional unit** (what, how much, how long, how well), **reference flows**, system boundary, allocation procedures, impact categories and method, data requirements, assumptions, limitations, data-quality requirements, critical review, report format. Plus **alternative scenarios**, the selected **libraries**, and how multi-output processes are allocated (by mass, economic value, area or volume, or by substitution).

## 3. Inventory: two kinds of objects

### Processes (cradle-to-gate, these carry environmental data)
Seven categories: **Material, Energy, Transport, Processing, Use, Waste scenario, Waste treatment.** Each process has four tabs:
- **Input/output:**
  - outputs to technosphere: products and co-products, with amount, unit, allocation % and **waste type**
  - avoided products
  - inputs from nature (resources)
  - inputs from technosphere: materials/fuels, and electricity/heat
  - emissions to air, water and soil
  - final waste flows
  - non-material emissions
  - outputs to technosphere: waste treatment
- **Documentation:** name, unit or system process type, status (temporary / draft / to be reviewed / to be revised / finished), comment (boundary, geography, period), collection method, data-entry and generator, literature, links.
- **Parameters:** process-level parameters.
- **System description.**

Material processes assign a **waste type** to their product (glass, ferrous metal, PE…) so end-of-life routing works automatically. Processing processes don't.

### Product stages (life-cycle structure, no direct emissions)
| Stage | Purpose |
|---|---|
| **Assembly** | Materials, sub-assemblies and production processes for one product (cradle-to-gate). Sub-assemblies are nested so each can be disposed of differently. |
| **Life cycle** | One assembly × amount, plus **use-stage processes**, plus a link to a **disposal scenario**, plus **additional life cycles** (e.g. a towel dispenser for paper towels). This is the cradle-to-grave object. |
| **Disposal scenario** | For one assembly: % to waste scenarios, % disassembled, % reused, and sorting and transport processes. |
| **Disassembly** | Splits an assembly into components, each with its own disposal scenario. |
| **Reuse** | Product reused whole, with the processes that requires. |

### End-of-life routing
**Waste type** (label on material) → **waste scenario** (splits the stream by waste type or material: e.g. 90% of glass separated; the rest 40% incinerated / 60% landfilled) → **waste treatment** (the actual landfill, incineration or recycling process with its emissions). With the cut-off model, recycling processes are empty: burden-free in, no credit out.

### Parameters
Three levels: **database → project → process**. A lower level overrides a higher one with the same name. There are input parameters (value, optionally with a distribution) and **calculated parameters** (formulas, including `if` logic, e.g. switching transport mode by distance). **Parameter sets** let you compare scenarios (e.g. baseline 450 km against alternatives). Uncertainty distributions feed **Monte Carlo**. Since 10.4, a parameter value of 0 with a lognormal distribution is blocked.

## 4. Impact assessment (LCIA)

Five steps, in order:
1. **Characterisation:** each substance × characterisation factor → impact category score. **This is the only mandatory step and the only one a carbon footprint needs.**
2. **Damage assessment** (optional): midpoint → endpoint.
3. **Normalisation** (optional): divide by a reference (e.g. per person per year).
4. **Weighting** (optional): normalised × weighting factor.
5. **Single score** (optional): sum of weighted results.

Climate methods: **IPCC 2021 GWP100** (incl. and excl. CO2 uptake) and, new in 10.4, **IPCC 2021 – ISO 14067**. The ISO 14067 method reports aircraft emissions (stratosphere and troposphere) separately from other fossil emissions, as ISO 14067:2018 requires. Multi-impact methods include EF 3.1, ReCiPe 2016, IMPACT World+, Ecological Scarcity 2021 and AWARE 2.0. Methods cannot be edited in the library; copy one into the project first. The **"Exclude long-term emissions"** option drops emissions after 100 years (e.g. landfill leachate).

## 5. Calculation and results

A **calculation setup** saves the product or life cycle, amount, method, normalisation/weighting set, and library switches.

| Tool | What it shows |
|---|---|
| **Analyze** | Tabs: Impact assessment (characterisation, damage, normalisation, weighting, single score), **Inventory** (every substance), **Process contribution**, Setup, **Checks** (missing waste types, unlinked flows). Results export to Excel. |
| **Compare** | Several products or life cycles side by side, same method |
| **Network** | Sankey-style process network. Node **cut-off %** hides small contributors (default ~12 nodes shown). Line thickness = contribution. **Cumulative indicator (Σ)** on by default since 10.4. |
| **Tree** | The same as a hierarchical tree |
| **Uncertainty analysis** | Monte Carlo: one product, or a comparison of two (A–B with % of runs where A > B) |
| **Analysis groups** | Group processes (e.g. "transport", "packaging") to report results by group |
| Results can be grouped | **By process, by product stage, or by function** |

## 6. Interpretation
Checklist text fields (conclusions, sensitivity, consistency, completeness…) and document links.

---

## How to map CO2Trace onto SimaPro's model

| SimaPro concept | CO2Trace today | Suggested change |
|---|---|---|
| General data: units and quantities | Free-text unit per factor | Unit table with conversions (L↔gal↔m³, kWh↔MJ, t·km), so activity data can be entered in any unit |
| Library vs project data | `FACTORS` + per-line edited EF | Keep factor **libraries** read-only and versioned: *GHG Protocol / US EPA*, *DESNZ*, *RENE México (AR5, FESEN)*. Editing a factor copies it into a **project factor** with a source reference. |
| Substances and characterisation | One CO2e number per factor | Factors hold **per-gas** amounts (CO2 fossil, CO2 biogenic, CH4 fossil and non-fossil, N2O, HFCs…). A **method** (IPCC AR6 GWP100, AR5 for RENE, IPCC 2021 ISO 14067) turns them into CO2e. Switching method recomputes everything. |
| Process (cradle-to-gate) | Ledger line | Ledger line = foreground input of a process: amount × library process |
| Product stages: assembly → life cycle → disposal scenario | 5 fixed stages, cradle-to-gate or cradle-to-grave toggle | Keep the stages but add a **product model**: an assembly (bill of materials per functional unit), a life cycle (units, use profile), and a **disposal scenario** (% recycled / landfilled / incinerated by waste type) instead of manual end-of-life lines |
| Waste type → waste scenario → treatment | Manual waste lines | Give each material factor a waste type; end-of-life is generated from the disposal-scenario splits |
| Allocation | Not handled | Allocation setting per multi-output process (mass, economic, physical), recorded in the methodology |
| Parameters and parameter sets | None | Named inputs (e.g. `units_produced`, `distance_km`, `grid_factor`) used in quantity formulas; scenarios (baseline / alternative) compared side by side |
| Documentation and status | Evidence panel (doc type, ref, period, verified, files) | Add SimaPro-style **status** (draft → to be reviewed → finished), **data-quality pedigree** (reliability, completeness, temporal, geographic, technological), and literature or source for every factor |
| Analyze: process contribution, inventory, checks | Hotspots, category and supplier charts | Add an **inventory table per gas**, and a **checks** panel (missing waste type, missing evidence, factor older than 3 years, unit mismatch) |
| Network / tree | Gantt, treemap, radial | A **Sankey** from stage → category → line with a cut-off % |
| Monte Carlo | None | Uncertainty per line from the pedigree scores (the GHG Protocol Scope 3 uncertainty tool uses the same pedigree approach), then a 95% range on the totals |
| Compare | None | Compare two ledgers or scenarios (e.g. aluminium vs steel frame, Mexican vs US grid) |
| Goal and scope (ISO 14040/44) | Company, year, functional unit, boundary | Add intended application, audience, comparative assertion, allocation, cut-off criteria, assumptions, limitations, LCIA method, data-quality requirements |
