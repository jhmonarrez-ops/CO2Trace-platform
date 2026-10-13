"""Build CO2Trace factor libraries from the publishers' original downloads.

Usage:  python3 -I tools/libraries/build.py <library> <raw-dir>
        library: epa-sc | uslci | agribalyse | weee | exiobase

Raw downloads stay out of git (see tools/libraries/README.md for where each one comes from).
Each run writes data/libraries/<library>.json: kg of each greenhouse gas per unit of activity
(cradle-to-gate unless the library says otherwise), in the gas keys used by GWP in index.html.
"""
import csv
import glob
import json
import math
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pb  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'libraries')

# Elementary-flow names (any source) -> CO2Trace gas key. Air emissions only.
GAS_BY_NAME = {
    'carbon dioxide': 'CO2', 'carbon dioxide, fossil': 'CO2', 'carbon dioxide, land transformation': 'CO2',
    'methane': 'CH4', 'methane, fossil': 'CH4', 'methane, biogenic': 'CH4', 'methane, non-fossil': 'CH4',
    'nitrous oxide': 'N2O', 'dinitrogen monoxide': 'N2O',
    'sulfur hexafluoride': 'SF6', 'nitrogen trifluoride': 'NF3',
    'hfc-23': 'HFC-23', 'hfc-32': 'HFC-32', 'hfc-125': 'HFC-125', 'hfc-134a': 'HFC-134a',
    'hfc-143a': 'HFC-143a', 'hfc-152a': 'HFC-152a', 'hfc-236fa': 'HFC-236fa',
    'methane, trifluoro-': 'HFC-23', 'methane, difluoro-': 'HFC-32', 'ethane, pentafluoro-': 'HFC-125',
    'ethane, 1,1,1,2-tetrafluoro-': 'HFC-134a', 'ethane, 1,1,1-trifluoro-': 'HFC-143a',
    'ethane, 1,1-difluoro-': 'HFC-152a',
    'carbon tetrafluoride': 'CF4', 'tetrafluoromethane': 'CF4', 'methane, tetrafluoro-': 'CF4',
    'hexafluoroethane': 'C2F6', 'ethane, hexafluoro-': 'C2F6',
    'perfluoropropane': 'C3F8', 'perfluorocyclobutane': 'c-C4F8', 'perfluorobutane': 'C4F10',
    'perfluorohexane': 'C6F14',
    'chlorodifluoromethane': 'HCFC-22', 'methane, chlorodifluoro-, hcfc-22': 'HCFC-22', 'hcfc-22': 'HCFC-22',
}
BIOGENIC_CO2 = {'carbon dioxide, biogenic', 'carbon dioxide, non-fossil', 'carbon dioxide (biogenic)'}


def gas_key(name):
    """Map an elementary-flow name to a gas key, 'CO2bio' for biogenic CO2, or None.
    Handles ILCD/EF forms such as 'methane (fossil)' and 'carbon dioxide, land transformation (low. pop.)'."""
    n = name.lower().strip()
    if n in BIOGENIC_CO2 or n.startswith('carbon dioxide (biogenic') or n.startswith('carbon dioxide, biogenic'):
        return 'CO2bio'
    if n in GAS_BY_NAME:
        return GAS_BY_NAME[n]
    base = re.sub(r'\s*\([^)]*\)', '', n).strip()
    if base.startswith('carbon dioxide, land transformation') or base == 'carbon dioxide, from soil or biomass stock':
        return 'CO2'
    if base.startswith('methane, land transformation'):
        return 'CH4'
    return GAS_BY_NAME.get(base)

UNIT_NAMES = {'t*km': 't·km', 'tkm': 't·km', 'p*km': 'p·km', 'pkm': 'p·km', 'm3': 'm³', 'm2': 'm²',
              'Item(s)': 'item', 'Items': 'item', 'item(s)': 'item', 'l': 'L', 'kWh': 'kWh', 'MJ': 'MJ', 'kg': 'kg'}


def sig(x, n=4):
    if x == 0 or not math.isfinite(x):
        return 0
    return float('%.*g' % (n, x))


def clean_gas(d):
    """Round and drop zeros; biogenic CO2 is kept apart (reported outside the scopes, not characterised)."""
    return {g: sig(v) for g, v in d.items() if g != 'CO2bio' and v and abs(v) > 1e-15}


def bio(d):
    v = d.get('CO2bio', 0)
    return {'bio': sig(v)} if v and abs(v) > 1e-15 else {}


def write(lib, items):
    os.makedirs(OUT, exist_ok=True)
    lib['count'] = len(items)
    lib['items'] = items
    path = os.path.join(OUT, lib['id'] + '.json')
    with open(path, 'w') as f:
        json.dump(lib, f, ensure_ascii=False, separators=(',', ':'))
    print('%s: %d items, %.0f kB -> %s' % (lib['id'], len(items), os.path.getsize(path) / 1024, os.path.normpath(path)))
    manifest()


def manifest():
    """data/libraries/index.json: the libraries the app can search, without their items."""
    libs = []
    for path in sorted(glob.glob(os.path.join(OUT, '*.json'))):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path))
        d.pop('items', None)
        d['file'] = os.path.basename(path)
        d['kB'] = round(os.path.getsize(path) / 1024)
        libs.append(d)
    order = ['epa-sc', 'exiobase', 'uslci', 'agribalyse', 'weee']
    libs.sort(key=lambda d: order.index(d['id']) if d['id'] in order else 99)
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'built': __import__('datetime').date.today().isoformat(), 'libraries': libs}, f, ensure_ascii=False, indent=1)


# ---------------------------------------------------------------- EPA supply chain factors (USEEIO)
def epa_sc(raw):
    """EPA Supply Chain GHG Emission Factors v1.3, by gas, with margins (purchaser price), per 2022 USD."""
    path = glob.glob(os.path.join(raw, '*byGHG_USD2022.csv'))[0]
    name_map = {'Carbon dioxide': 'CO2', 'Methane': 'CH4', 'Nitrous oxide': 'N2O', 'Sulfur hexafluoride': 'SF6',
                'Nitrogen trifluoride': 'NF3', 'HFC-23': 'HFC-23', 'HFC-32': 'HFC-32', 'HFC-125': 'HFC-125',
                'HFC-134a': 'HFC-134a', 'HFC-143a': 'HFC-143a', 'HFC-236fa': 'HFC-236fa',
                'Carbon tetrafluoride': 'CF4', 'Hexafluoroethane': 'C2F6', 'Perfluoropropane': 'C3F8',
                'Perfluorocyclobutane': 'c-C4F8', 'Perfluorobutane': 'C4F10', 'Perfluorohexane': 'C6F14'}
    rows = {}
    with open(path, newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            g = name_map.get(r['GHG'])
            if not g:  # 'HFCs and PFCs, unspecified' is already CO2e-weighted: keep it as CO2e
                if r['GHG'].startswith('HFCs and PFCs'):
                    g = 'CO2e'
                else:
                    continue
            code = r['2017 NAICS Code']
            it = rows.setdefault(code, {'k': 'epa:' + code, 'n': r['2017 NAICS Title'], 'u': 'USD2022',
                                        'geo': 'US', 'code': code, 'gas': {}})
            it['gas'][g] = it['gas'].get(g, 0) + float(r['Supply Chain Emission Factors with Margins'])
    sectors = {'11': 'Agriculture, forestry, fishing', '21': 'Mining, oil and gas', '22': 'Utilities',
               '23': 'Construction', '31': 'Manufacturing', '32': 'Manufacturing', '33': 'Manufacturing',
               '42': 'Wholesale trade', '44': 'Retail trade', '45': 'Retail trade', '48': 'Transportation and warehousing',
               '49': 'Transportation and warehousing', '51': 'Information', '52': 'Finance and insurance',
               '53': 'Real estate and rental', '54': 'Professional, scientific and technical services',
               '55': 'Management of companies', '56': 'Administrative and waste services', '61': 'Educational services',
               '62': 'Health care and social assistance', '71': 'Arts, entertainment, recreation',
               '72': 'Accommodation and food services', '81': 'Other services', '92': 'Public administration'}
    items = []
    for code, it in sorted(rows.items()):
        it['gas'] = clean_gas(it['gas'])
        it['g'] = sectors.get(code[:2], 'Other')
        items.append(it)
    write({
        'id': 'epa-sc', 'name': 'US EPA Supply Chain GHG Emission Factors', 'version': 'v1.3.0 (USEEIO 2017 benchmark, 2022 GHG data)',
        'publisher': 'US Environmental Protection Agency', 'kind': 'spend', 'geo': 'US',
        'basis': 'Cradle-to-gate supply-chain emissions per 2022 USD at purchaser price (with margins), by gas',
        'licence': 'US public domain (17 U.S.C. 105)', 'licenceUrl': 'https://pasteur.epa.gov/license/sciencehub-license.html',
        'source': 'https://catalog.data.gov/dataset/supply-chain-greenhouse-gas-emission-factors-v1-3-by-naics-6',
        'citation': 'US EPA (2024). Supply Chain Greenhouse Gas Emission Factors v1.3 by NAICS-6. doi:10.23719/1531143',
        'note': 'Adjust spend to 2022 USD for inflation. "HFCs and PFCs, unspecified" is pre-characterised (AR5) and kept as CO2e.',
    }, items)


# ---------------------------------------------------------------- USLCI (openLCA JSON-LD + electricity library)
def _ghg_key(flow):
    """Return gas key for an elementary flow reference, air emissions only."""
    cat = (flow.get('category') or '').lower()
    if 'emission/air' not in cat:
        return None
    return gas_key(flow['name'])


def _load_elci(lib_dir):
    """openLCA library: M.npy holds cumulative elementary flows per unit of each library process."""
    import numpy as np
    M = np.load(os.path.join(lib_dir, 'M.npy'))
    procs = []
    for f, t, v in pb.fields(open(os.path.join(lib_dir, 'index_A.bin'), 'rb').read()):
        e = dict((ff, vv) for ff, _, vv in pb.fields(v))
        proc = dict((ff, vv.decode()) for ff, _, vv in pb.fields(e[2]))
        flow = dict((ff, vv.decode()) for ff, _, vv in pb.fields(e[3]))
        procs.append((e.get(1, 0), proc, flow))
    rows = {}
    for f, t, v in pb.fields(open(os.path.join(lib_dir, 'index_B.bin'), 'rb').read()):
        e = dict((ff, vv) for ff, _, vv in pb.fields(v))
        flow = dict((ff, vv.decode()) for ff, _, vv in pb.fields(e[2]))
        g = _ghg_key({'name': flow.get(2, ''), 'category': flow.get(3, '')})
        if g:
            rows.setdefault(g, []).append(e.get(1, 0))
    out = {}
    for idx, proc, flow in procs:
        out[(proc[1], flow[1])] = {g: float(M[ix, idx].sum()) for g, ix in rows.items()}
        out[proc[1]] = out[(proc[1], flow[1])]
    return out, {p[1]: (p, fl) for _, p, fl in procs}


def uslci(raw):
    import numpy as np
    import scipy.sparse as sp
    import scipy.sparse.linalg as spl

    jl = os.path.join(raw, 'jl')
    elci_vec, elci_meta = _load_elci(os.path.join(raw, 'elci'))

    # Unit and flow-property conversions, so every amount is in the reference unit of the flow's
    # reference property (exchanges may be in btu while the provider is per MJ, gal vs L, etc.).
    unit_f, fp_f = {}, {}
    for d in (jl, os.path.join(raw, 'elci', 'meta')):
        for f in glob.glob(os.path.join(d, 'unit_groups', '*.json')):
            for u in json.load(open(f))['units']:
                unit_f[u['@id']] = u['conversionFactor']
        for f in glob.glob(os.path.join(d, 'flows', '*.json')):
            fl = json.load(open(f))
            fp_f[fl['@id']] = {x['flowProperty']['@id']: x['conversionFactor'] for x in fl.get('flowProperties', [])}
    stats_units = {'missing': 0}

    def amount(e):
        uf = unit_f.get(e.get('unit', {}).get('@id'))
        cf = fp_f.get(e['flow']['@id'], {}).get(e.get('flowProperty', {}).get('@id'))
        if uf is None or cf is None:
            stats_units['missing'] += 1
            return e['amount']
        return e['amount'] * uf / cf

    def ref_unit(e):
        for x in json.load(open(os.path.join(jl, 'flows', e['flow']['@id'] + '.json'))).get('flowProperties', []) if os.path.exists(os.path.join(jl, 'flows', e['flow']['@id'] + '.json')) else []:
            if x.get('isRefFlowProperty'):
                return x['flowProperty'].get('refUnit', '')
        return e['flow'].get('refUnit', '')

    procs = {}
    for f in os.listdir(os.path.join(jl, 'processes')):
        p = json.load(open(os.path.join(jl, 'processes', f)))
        procs[p['@id']] = p

    # One column per (process, product): multi-output processes are split with their allocation
    # factors, as openLCA does. Waste-treatment processes are keyed by the waste they take in.
    def products(p):
        return [e for e in p['exchanges'] if not e.get('isAvoidedProduct') and (
            (not e.get('isInput') and e['flow'].get('flowType') == 'PRODUCT_FLOW') or
            (e.get('isInput') and e['flow'].get('flowType') == 'WASTE_FLOW'))]

    cols, colinfo, ref, producers = {}, {}, {}, {}
    stats = {'multi_output': 0, 'avoided': 0, 'alloc_fallback': 0}
    unlinked = set()
    for pid, p in procs.items():
        r = next((e for e in p['exchanges'] if e.get('isQuantitativeReference')), None)
        if r is None:
            continue
        ref[pid] = r
        prods = products(p) or [r]
        if len(prods) > 1:
            stats['multi_output'] += 1
        for e in prods:
            key = (pid, e['flow']['@id'])
            if key in cols:
                continue
            cols[key] = len(cols)
            colinfo[key] = (p, e)
            producers.setdefault(e['flow']['@id'], []).append(key)
    for pid, (proc, flow) in elci_meta.items():
        key = (pid, flow[1])
        if pid not in procs and key not in cols:
            cols[key] = len(cols)
            producers.setdefault(flow[1], []).append(key)
    ref_key = {pid: (pid, r['flow']['@id']) for pid, r in ref.items()}
    for pid, (proc, flow) in elci_meta.items():
        ref_key.setdefault(pid, (pid, flow[1]))
    n = len(cols)

    def alloc(p, prods, prod):
        if len(prods) < 2:
            return 1.0
        meth = p.get('defaultAllocationMethod')
        for a in p.get('allocationFactors', []):
            if a.get('allocationType') == meth and a.get('product', {}).get('@id') == prod['flow']['@id'] and not a.get('exchange'):
                return a['value']
        for a in p.get('allocationFactors', []):  # any non-causal factor for this product
            if a.get('allocationType') in ('PHYSICAL_ALLOCATION', 'ECONOMIC_ALLOCATION') and a.get('product', {}).get('@id') == prod['flow']['@id']:
                return a['value']
        stats['alloc_fallback'] += 1  # share by amount among co-products
        tot = sum(abs(amount(e)) for e in prods)
        return abs(amount(prod)) / tot if tot else 1.0 / len(prods)

    gases = sorted(set(GAS_BY_NAME.values()) | {'CO2bio'})
    gi = {g: i for i, g in enumerate(gases)}
    A_r, A_c, A_v = [], [], []
    B = np.zeros((len(gases), n))
    for key, (p, prod) in colinfo.items():
        j = cols[key]
        prods = products(p) or [prod]
        af = alloc(p, prods, prod)
        A_r.append(j); A_c.append(j); A_v.append(abs(amount(prod)))
        for e in p['exchanges']:
            if e is prod or (e in prods):
                continue
            fl = e['flow']
            ft = fl.get('flowType')
            amt = amount(e) * af
            if ft == 'ELEMENTARY_FLOW':
                g = _ghg_key(fl)
                if g and not e.get('isInput'):
                    B[gi[g], j] += amt
                continue
            if e.get('isAvoidedProduct'):
                stats['avoided'] += 1
            prov = (e.get('defaultProvider') or {}).get('@id')
            k = None
            if prov is not None:
                k = cols.get((prov, fl['@id'])) or cols.get(ref_key.get(prov))
            if k is None:
                cand = producers.get(fl['@id'], [])
                k = cols[cand[0]] if cand else None
            if k is None:
                unlinked.add((p['@id'], e.get('internalId')))
                continue
            # Product inputs and waste outputs consume the provider's product; avoided products credit it.
            consume = ((ft == 'PRODUCT_FLOW' and e.get('isInput')) or (ft == 'WASTE_FLOW' and not e.get('isInput'))) and not e.get('isAvoidedProduct')
            A_r.append(k); A_c.append(j); A_v.append(-amt if consume else amt)
    for pid, vec in ((k, v) for k, v in elci_vec.items() if isinstance(k, str)):
        if pid in procs:
            continue
        j = cols[ref_key[pid]]
        A_r.append(j); A_c.append(j); A_v.append(1.0)
        for g, v in vec.items():
            B[gi[g], j] = v
    A = sp.csc_matrix((A_v, (A_r, A_c)), shape=(n, n))
    # M = B A^-1, one gas at a time: solve A^T m_g = b_g.
    lu = spl.splu(A.T.tocsc())
    Mg = np.vstack([lu.solve(B[i]) for i in range(len(gases))])
    if os.environ.get('USLCI_DEBUG'):  # print the supply chain of one process: scaling x direct CO2
        names = {cols[k]: (procs[k[0]]['name'] if k[0] in procs else elci_meta[k[0]][0][2]) for k in cols}
        target = next(k for k in procs if procs[k]['name'] == os.environ['USLCI_DEBUG'])
        f = np.zeros(n); f[cols[ref_key[target]]] = 1
        x = spl.splu(A.tocsc()).solve(f)
        w = np.array([1, 28, 265] + [0] * (len(gases) - 3))
        order = [gases.index('CO2'), gases.index('CH4'), gases.index('N2O')]
        direct = 1 * B[order[0]] + 28 * B[order[1]] + 265 * B[order[2]]
        contrib = x * direct
        for j in np.argsort(-np.abs(contrib))[:15]:
            print('%10.4f  scale %10.4g  %s' % (contrib[j], x[j], names[j][:90]))
        sys.exit()

    items = []
    for key, (p, prod) in colinfo.items():
        pid, fid = key
        j = cols[key]
        is_ref = fid == ref[pid]['flow']['@id']
        unit = ref_unit(prod)
        per = {g: float(Mg[gi[g], j]) for g in gases}
        gas = clean_gas(per)
        if not gas:
            continue
        cat = (p.get('category') or '').split('/')
        items.append({
            'k': 'uslci:' + pid[:8] + ('' if is_ref else ':' + fid[:6]), 'id': pid,
            'n': p['name'] if is_ref else p['name'] + ' — ' + prod['flow']['name'], 'u': UNIT_NAMES.get(unit, unit),
            'geo': (p.get('location') or {}).get('name', 'US'), 'g': cat[0].split(': ', 1)[-1] if cat[0] else 'Other',
            'cat': p.get('category', ''), 'waste': prod['flow'].get('flowType') == 'WASTE_FLOW', 'gas': gas, **bio(per),
        })
    for pid, (proc, flow) in elci_meta.items():  # US electricity baseline: grid mixes by balancing authority
        if pid in procs:
            continue
        gas = clean_gas(elci_vec[pid])
        if not gas:
            continue
        unit = flow.get(5, 'MJ')
        items.append({'k': 'elci:' + pid[:8], 'id': pid, 'n': proc[2], 'u': UNIT_NAMES.get(unit, unit), 'geo': 'US',
                      'g': 'Electricity (US baseline 2022)', 'cat': proc.get(3, ''), 'gas': gas})
    items.sort(key=lambda x: (x['g'], x['n']))
    stats['unlinked'] = len(unlinked)
    stats.update(stats_units)
    print('uslci stats:', stats)
    write({
        'id': 'uslci', 'name': 'US Life Cycle Inventory (USLCI)', 'version': 'FY25 Q2 with US electricity baseline v1.2025-06.0',
        'publisher': 'NREL / Federal LCA Commons', 'kind': 'process', 'geo': 'US',
        'basis': 'Cradle-to-gate per reference unit, solved from unit processes with default providers (cut-off for unlinked inputs), by gas',
        'licence': 'Repository under MIT licence; data is US federal content (confirm data terms before resale)',
        'licenceUrl': 'https://github.com/FLCAC-admin/uslci-content',
        'source': 'https://github.com/FLCAC-admin/uslci-content/tree/dev/downloads',
        'citation': 'Federal LCA Commons. U.S. Life Cycle Inventory Database (USLCI), FY25 Q2. National Renewable Energy Laboratory.',
        'note': 'Carbon dioxide is not split into fossil and biogenic in the federal flow list; CO2 uptake (resource flows) is excluded. %d unlinked inputs were cut off.' % len(unlinked),
    }, items)


# ---------------------------------------------------------------- AGRIBALYSE 3.2 (ADEME)
def agribalyse(raw):
    """AGRIBALYSE 3.2 synthesis: EF 3.1 climate change (kg CO2e per kg of food, field to plate) plus stages."""
    def num(s):
        try:
            return float(s.replace(',', '.'))
        except (ValueError, AttributeError):
            return None
    stages = {}
    with open(os.path.join(raw, 'agribalyse-31-detail-par-etape.csv'), newline='', encoding='utf-8-sig') as f:
        rd = csv.reader(f)
        head = next(rd)
        cc = [i for i, h in enumerate(head) if h.startswith('Changement climatique')]
        for row in rd:
            stages[row[0]] = {head[i].split(' - ', 1)[-1].strip(): num(row[i]) for i in cc}
    items = []
    with open(os.path.join(raw, 'agribalyse-31-synthese.csv'), newline='', encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            total = num(r['Changement climatique'])
            if total is None:
                continue
            st = stages.get(r['Code AGB'], {})
            short = {'Agriculture': 'farm', 'Transformation': 'processing', 'Emballage': 'packaging', 'Transport': 'transport',
                     'Supermarché et distribution': 'retail', 'Consommation': 'consumer'}
            st = {short[k]: v for k, v in st.items() if k in short and v is not None}
            # Cradle to retail shelf: everything except the consumer stage (home cooking, storage)
            shelf = sum(v for k, v in st.items() if k != 'consumer') if st else total
            items.append({
                'k': 'agb:' + r['Code AGB'], 'n': r['LCI Name'], 'n_fr': r['Nom du Produit en Français'], 'u': 'kg', 'geo': 'FR',
                'g': r["Groupe d'aliment"].capitalize(),
                'gas': {'CO2e': sig(shelf)},
                'stages': {k: sig(v) for k, v in st.items()},
                'dqr': num(r['DQR']),
            })
    items.sort(key=lambda x: (x['g'], x['n']))
    write({
        'id': 'agribalyse', 'name': 'AGRIBALYSE', 'version': '3.2', 'publisher': 'ADEME (France)', 'kind': 'process', 'geo': 'FR',
        'basis': 'Pre-characterised climate change (EF 3.1, IPCC 2021 GWP100) per kg of food sold in France, farm to retail shelf (consumer stage excluded); stage split included',
        'licence': 'Licence Ouverte / Open Licence (Etalab 2.0), attribution required',
        'licenceUrl': 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
        'source': 'https://data.ademe.fr/datasets/agribalyse-31-synthese',
        'citation': 'ADEME, AGRIBALYSE v3.2 (Synthèse and Détail par étape), data.ademe.fr',
        'note': 'CO2e = farm + processing + packaging + transport + retail; the consumer stage (storage, cooking) is left out. Values are already characterised, so the GWP method does not change them.',
    }, items)


# ---------------------------------------------------------------- WEEE LCI (ecosystem, ILCD)
def weee(raw):
    """ecosystem WEEE LCI (end of life of electrical equipment) + recycled plastics from WEEE, ILCD zips."""
    ns = {'c': 'http://lca.jrc.it/ILCD/Common', 'p': 'http://lca.jrc.it/ILCD/Process', 'f': 'http://lca.jrc.it/ILCD/Flow'}
    items = []
    zips = [zipfile.ZipFile(z) for z in sorted(glob.glob(os.path.join(raw, '*.zip')))]
    flows = {}  # shared: the recycled-plastics stock refers to elementary flows defined in the main stock
    for z in zips:
        for nm in z.namelist():
            if '/flows/' in nm and nm.endswith('.xml'):
                x = ET.fromstring(z.read(nm))
                uid = x.find('.//c:UUID', ns).text
                base = x.find('.//f:baseName', ns)
                cats = [c.text or '' for c in x.findall('.//c:elementaryFlowCategorization/c:category', ns)]
                ftype = x.find('.//f:typeOfDataSet', ns)
                flows[uid] = ((base.text or '') if base is not None else '', '/'.join(cats).lower(),
                              ftype.text if ftype is not None else '')
    for z in zips:
        names = z.namelist()
        for nm in names:
            if '/processes/' not in nm or not nm.endswith('.xml'):
                continue
            x = ET.fromstring(z.read(nm))
            uid = x.find('.//c:UUID', ns).text
            name = ' · '.join(t.text for t in x.find('.//p:name', ns) if t.text and t.tag.endswith(('baseName', 'treatmentStandardsRoutes', 'mixAndLocationTypes')))
            loc = x.find('.//p:locationOfOperationSupplyTerminal', ns)
            refid = x.find('.//p:referenceToReferenceFlow', ns).text
            cats = [c.text for c in x.findall('.//p:classificationInformation//c:class', ns)]
            ver = x.find('.//c:dataSetVersion', ns)
            gas, ref_amt, ref_name = {}, 1.0, ''
            for ex in x.findall('.//p:exchanges/p:exchange', ns):
                fid = ex.find('p:referenceToFlowDataSet', ns).get('refObjectId')
                amt = float(ex.find('p:resultingAmount', ns).text or ex.find('p:meanAmount', ns).text)
                direction = ex.find('p:exchangeDirection', ns).text
                fname, fcat, ftype = flows.get(fid, ('', '', ''))
                if ex.get('dataSetInternalID') == refid:
                    ref_amt, ref_name = amt, fname
                    continue
                if direction == 'Output' and 'emissions to air' in fcat:
                    g = gas_key(fname)
                    if g:
                        gas[g] = gas.get(g, 0) + amt
            per = {g: v / ref_amt for g, v in gas.items()} if ref_amt else {}
            gas = clean_gas(per)
            if not gas:
                continue
            items.append({'k': 'weee:' + uid[:8], 'id': uid, 'n': name, 'u': 'kg', 'geo': loc.get('location') if loc is not None else 'FR',
                          'g': cats[0] if cats else 'WEEE', 'cat': '/'.join(c for c in cats if c), 'ref': ref_name, 'ver': ver.text if ver is not None else '', 'gas': gas, **bio(per)})
    items.sort(key=lambda x: (x['g'], x['n']))
    write({
        'id': 'weee', 'name': 'ecosystem WEEE LCI + recycled plastics from WEEE', 'version': 'current data stocks (downloaded 2026-10-13)',
        'publisher': 'ecosystem and ADEME (France)', 'kind': 'process', 'geo': 'FR',
        'basis': 'End-of-life treatment of electrical and electronic equipment (aggregated LCI), per reference unit, by gas',
        'licence': 'ecosystem General Terms of Use: free use, modification and integration in LCA software; cite the source; unmodified data may only be redistributed free of charge',
        'licenceUrl': 'https://weee-lci.ecosystem.eco/static/CGU.pdf', 'source': 'https://weee-lci.ecosystem.eco',
        'citation': 'ecosystem, WEEE LCI Database and Recycled plastics from WEEE LCI Database, weee-lci.ecosystem.eco',
        'note': 'Amounts are per unit of each dataset\'s reference flow. Substitution benefits are included only where the dataset name says so.',
        'modifications': 'Significantly modified under GTU V.c: only greenhouse-gas emissions to air are kept, summed over air sub-compartments and converted to CO2Trace gas keys; biogenic CO2 kept apart; ownership field removed; not in ILCD format.',
        'originalData': 'Original data set, modelling details and GTU conditions: https://weee-lci.ecosystem.eco (datasets commissioned by ecosystem; WEEE LCI co-owned with ADEME; Modelling Principles Report and GTU there). Redistributed free of charge.',
    }, items)


# ---------------------------------------------------------------- EXIOBASE 3.8.2 (CC BY-SA 4.0)
def exiobase(raw):
    """Multiplier matrix M (satellite) of EXIOBASE 3.8.2 pxp 2019: kg of each gas per EUR of product, by region."""
    import pandas as pd
    z = zipfile.ZipFile(glob.glob(os.path.join(raw, 'IOT_*_pxp.zip'))[0])
    root = z.namelist()[0].split('/')[0]
    with z.open(root + '/satellite/M.txt') as f:
        M = pd.read_csv(f, sep='\t', header=[0, 1], index_col=0)
    air = [r for r in M.index if str(r).endswith('- air')]
    def rows(prefix, skip_bio=False):
        sel = [r for r in air if r.startswith(prefix) and not (skip_bio and 'biogenic' in r)]
        return M.loc[sel].sum() if sel else None
    co2 = rows('CO2 - ', skip_bio=True)  # combustion, cement, lime, peat decay, fossil waste
    ch4, n2o, sf6 = rows('CH4 - '), rows('N2O - '), rows('SF6')
    hfc, pfc = rows('HFC'), rows('PFC')  # already kg CO2-eq in EXIOBASE
    names = {'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'CY': 'Cyprus', 'CZ': 'Czechia', 'DE': 'Germany', 'DK': 'Denmark',
             'EE': 'Estonia', 'ES': 'Spain', 'FI': 'Finland', 'FR': 'France', 'GR': 'Greece', 'HR': 'Croatia', 'HU': 'Hungary',
             'IE': 'Ireland', 'IT': 'Italy', 'LT': 'Lithuania', 'LU': 'Luxembourg', 'LV': 'Latvia', 'MT': 'Malta', 'NL': 'Netherlands',
             'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania', 'SE': 'Sweden', 'SI': 'Slovenia', 'SK': 'Slovakia', 'GB': 'United Kingdom',
             'US': 'United States', 'JP': 'Japan', 'CN': 'China', 'CA': 'Canada', 'KR': 'South Korea', 'BR': 'Brazil', 'IN': 'India',
             'MX': 'Mexico', 'RU': 'Russia', 'AU': 'Australia', 'CH': 'Switzerland', 'TR': 'Turkey', 'TW': 'Taiwan', 'NO': 'Norway',
             'ID': 'Indonesia', 'ZA': 'South Africa', 'WA': 'Rest of Asia and Pacific', 'WL': 'Rest of Latin America',
             'WE': 'Rest of Europe', 'WF': 'Rest of Africa', 'WM': 'Rest of Middle East'}
    items = []
    for col in M.columns:
        region, product = col
        gas = {'CO2': co2[col] / 1e6, 'CH4': ch4[col] / 1e6, 'N2O': n2o[col] / 1e6}  # kg per M EUR -> kg per EUR
        if sf6 is not None:
            gas['SF6'] = sf6[col] / 1e6
        # EXIOBASE reports HFC and PFC already as kg CO2e.
        extra = (hfc[col] if hfc is not None else 0) + (pfc[col] if pfc is not None else 0)
        if extra:
            gas['CO2e'] = extra / 1e6
        gas = clean_gas(gas)
        if not gas:
            continue
        items.append({'k': 'exio:%s:%d' % (region, list(M.columns.get_level_values(1).unique()).index(product)),
                      'n': product, 'u': 'EUR2019', 'geo': region, 'region': names.get(region, region), 'g': names.get(region, region), 'gas': gas})
    write({
        'id': 'exiobase', 'name': 'EXIOBASE 3', 'version': '3.8.2, product-by-product, reference year 2019',
        'publisher': 'EXIOBASE consortium', 'kind': 'spend', 'geo': '49 regions incl. MX and US',
        'basis': 'Cradle-to-gate (total multipliers) per EUR 2019 of product at basic prices, by gas and region',
        'licence': 'CC BY-SA 4.0 (v3.8.2). Note: v3.9 and later are non-commercial and are not used.',
        'licenceUrl': 'https://creativecommons.org/licenses/by-sa/4.0/', 'source': 'https://zenodo.org/records/5589597',
        'citation': 'Stadler, K. et al. (2021). EXIOBASE 3 (3.8.2). Zenodo. doi:10.5281/zenodo.5589597',
        'note': 'Convert spend to EUR 2019 at basic prices. HFC and PFC are reported by EXIOBASE as CO2e. Derived factors are shared under CC BY-SA 4.0.',
    }, items)


if __name__ == '__main__':
    if sys.argv[1] == 'manifest':
        manifest(); sys.exit()
    lib, raw = sys.argv[1], sys.argv[2]
    {'epa-sc': epa_sc, 'uslci': uslci, 'agribalyse': agribalyse, 'weee': weee, 'exiobase': exiobase}[lib](raw)
