# Factor libraries (+ From database)

`build.py` turns each publisher's original download into `data/libraries/<id>.json`: kg of each greenhouse gas per unit of activity, in the gas keys of `GWP` in `index.html`, so the impact method (AR6/AR5/AR4) still applies. `data/libraries/index.json` lists them for the app. Raw downloads are not committed; put them in `data/raw/<id>/` (ignored by git) or anywhere else, and pass the folder:

```
python3 -I tools/libraries/build.py <id> <raw-folder>
python3 -I tools/libraries/build.py manifest      # rebuild index.json only
```

Needs Python 3 with numpy, scipy and pandas.

| id | Database | Where the raw files come from | Licence | Items |
|---|---|---|---|---|
| `epa-sc` | US EPA Supply Chain GHG Emission Factors v1.3 (USEEIO), per 2022 USD by NAICS-6 | `SupplyChainGHGEmissionFactors_v1.3.0_NAICS_byGHG_USD2022.csv` from https://catalog.data.gov/dataset/supply-chain-greenhouse-gas-emission-factors-v1-3-by-naics-6 | US public domain | 1,016 |
| `exiobase` | EXIOBASE 3.8.2, product by product, 2019, per EUR, 49 regions | `IOT_2019_pxp.zip` from https://zenodo.org/records/5589597 | CC BY-SA 4.0. **v3.9 and later are non-commercial: do not use them.** Derived factors are shared under CC BY-SA 4.0 | 9,800 |
| `uslci` | USLCI FY25 Q2 + US electricity baseline 2025-06 (grid mixes by balancing authority) | `uslci_fy25_q2_01_olca2_4_1_elci_lib_json_ld.zip` (unzip to `jl/`) and `U.S._electricity_baseline_v1.2025-06.0.zip` (unzip to `elci/`, then `elci/meta.zip` to `elci/meta/`) from https://github.com/FLCAC-admin/uslci-content/tree/dev/downloads | MIT repository, US federal content | 1,726 |
| `agribalyse` | AGRIBALYSE 3.2 (ADEME), food per kg, farm to retail shelf | `agribalyse-31-synthese.csv` and `agribalyse-31-detail-par-etape.csv` from https://data.ademe.fr (data-fair API `/datasets/<id>/raw`) | Licence Ouverte / Etalab 2.0 (attribution) | 2,451 |
| `weee` | ecosystem WEEE LCI + recycled plastics from WEEE (end of life of electrical equipment) | Both data stocks as ILCD zips from `https://weee-lci.ecosystem.eco/resource/datastocks/<uuid>/export` | ecosystem GTU: free use and integration; modified data only redistributed **free of charge** with the origin documented (done in the JSON) | 957 |

## How each one is calculated

- **EPA supply chain:** factors *with margins* (purchaser price), by gas. "HFCs and PFCs, unspecified" is already CO2e (AR5) and kept as `CO2e`. All 1,016 sectors match EPA's own CO2e file within its rounding.
- **USLCI:** cradle-to-gate solved like openLCA: one column per (process, product), with multi-output processes split by their allocation factors; inputs linked to their default provider (otherwise to the only producer of that flow); unit and flow-property conversions applied. The electricity baseline ships as a pre-solved openLCA library (`M.npy` + protobuf indexes, read by `pb.py`), so its processes enter as solved columns. About 3,200 inputs have no provider in USLCI (mostly "Transformation" land flows and CUTOFF flows) and are cut off, as in openLCA. The federal flow list does not separate biogenic CO2, so wood and biomass processes include it in CO2.
  Spot checks (AR5): US average grid 0.45 kg/kWh including upstream; diesel combination truck 0.090 kg/t·km; HDPE 2.1, hot-rolled steel 1.57, primary aluminium 8.9, Portland cement 1.33 kg/kg.
- **AGRIBALYSE:** pre-characterised (EF 3.1 climate change, IPCC 2021) so the GWP method does not change it. CO2e = farm + processing + packaging + transport + retail (consumer stage left out). Stage split kept in `stages`.
- **WEEE LCI:** aggregated LCI results; greenhouse-gas emissions to air only, summed over air sub-compartments. Biogenic CO2 is kept in `bio`, outside the totals.
- **EXIOBASE:** total multipliers from `satellite/M.txt` (kg per million EUR → per EUR): CO2 (non-biogenic air rows), CH4, N2O, SF6; HFC and PFC rows are already CO2e.

## Not added yet

- **BAFU:2025 (Swiss FOEN, ~11,000 datasets):** downloaded only from openLCA Nexus (https://nexus.openlca.org/database/BAFU) after logging in and accepting the BAFU terms of use. Terms: free; credit "Life cycle inventory database of the Swiss Federal Administration, BAFU:20XY"; in fee-paying tools the data must stay in the background (users must not be able to access the datasets directly). Download the ecoSpold1 version to `data/raw/bafu/` and a builder can be added.
- **ecoinvent, Agri-footprint, Carbon Minds, DATASMART, ESU, IDEA:** paid licences.
- **Industry data 2.0:** only distributed inside SimaPro.
