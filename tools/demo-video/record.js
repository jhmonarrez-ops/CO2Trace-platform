// Records the CO2Trace walkthrough: node record.js es|en <baseUrl> <outDir>
// Frames come from the DevTools screencast (sharp text), then ffmpeg encodes an H.264 MP4.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FFMPEG = require('ffmpeg-static');
const { writeSoundtrack } = require('./audio');

const LANG = process.argv[2] || 'es';
const BASE = process.argv[3] || 'http://127.0.0.1:8731/index.html';
const OUT = process.argv[4] || __dirname;
const W = 1440, H = 900;
const ES = LANG === 'es';
const T = (en, es) => (ES ? es : en);

const TXT = {
  title: [T('How to use CO2Trace', 'Cómo usar CO2Trace'), T('Example: Blue Mesa Sparkling Water, a sparkling-water bottler in San Antonio, Texas', 'Ejemplo: Agua Mineral Cerro Alto, embotelladora de agua mineral en Monterrey, Nuevo León')],
  s0b: T('Your own data: create a company account, or continue in this browser', 'Tus propios datos: crea la cuenta de tu empresa o continúa en este navegador'),
  s0: T('Start here: open an example of any size and industry, or use your own data', 'Empieza aquí: abre un ejemplo de cualquier tamaño e industria, o usa tus propios datos'),
  s1: T('1 · Set up the project: company, year, functional unit, country and boundary', '1 · Configura el proyecto: empresa, año, unidad funcional, país y límite'),
  s1b: T('Goal and scope: why the study is done and what it leaves out (ISO 14044)', 'Objetivo y alcance: por qué se hace el estudio y qué deja fuera (ISO 14044)'),
  s2: T('2 · Record a year of activity: pick the activity and type the quantity', '2 · Registra un año de actividad: elige la actividad y escribe la cantidad'),
  s2b: T('The factor and the scope fill in on their own', 'El factor y el alcance se llenan solos'),
  s2c: T('The rest of the year’s data goes in the same way…', 'El resto de los datos del año se captura igual…'),
  s3: T('3 · Attach the evidence: the bill behind each number', '3 · Adjunta la evidencia: el recibo que respalda cada cifra'),
  s3b: T('A reviewer marks it verified', 'Un revisor la marca como verificada'),
  s4: T('4 · Read the dashboard: the three scopes are close to a third each', '4 · Lee el tablero: los tres alcances pesan casi un tercio cada uno'),
  s4b: T('Emissions by category, stage, supplier and month', 'Emisiones por categoría, etapa, proveedor y mes'),
  s5: T('5 · Check and export: what a verifier would ask, then copy the results', '5 · Revisa y exporta: lo que preguntaría un verificador, y copia los resultados'),
  end: ['co2trace.io', T('Carbon footprints, stage by stage', 'Huella de carbono, etapa por etapa')],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
// sound-effect cues, in wall-clock seconds; matched to the screencast timestamps when the soundtrack is written
const events = [];
const cue = type => events.push({ type, wall: Date.now() / 1000 });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: ES ? 'es-MX' : 'en-US', colorScheme: 'light', reducedMotion: 'no-preference' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);

  // overlay: captions, title cards and a visible cursor, re-injected after every navigation
  await page.addInitScript(() => {
    const css = `
      #rec-cap{position:fixed;left:50%;bottom:34px;transform:translate(-50%,20px);max-width:1100px;padding:16px 26px;border-radius:14px;background:rgba(10,14,40,.88);color:#fff;font:500 22px/1.35 "Hanken Grotesk",system-ui,sans-serif;letter-spacing:-.01em;text-align:center;z-index:99999;opacity:0;transition:opacity .45s,transform .45s;pointer-events:none;box-shadow:0 20px 50px -20px rgba(0,0,0,.6)}
      #rec-cap.on{opacity:1;transform:translate(-50%,0)}
      #rec-card{position:fixed;inset:0;display:grid;place-content:center;gap:14px;text-align:center;background:#072AC8;color:#fff;z-index:100000;opacity:0;transition:opacity .6s;pointer-events:none;font-family:"Hanken Grotesk",system-ui,sans-serif}
      #rec-card.on{opacity:1}
      #rec-card b{font-size:64px;font-weight:500;letter-spacing:-.035em}
      #rec-card span{font-size:24px;opacity:.8}
      #rec-cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:100001;pointer-events:none;transition:transform .08s linear}
      #rec-cap,#rec-card,#rec-cur{inset:auto;margin:0;border:0;overflow:visible}
      #rec-cap{left:50%;bottom:34px}
      #rec-card{inset:0;width:100%;height:100%;padding:0}
      #rec-cur{left:0;top:0;padding:0;background:transparent}
      #rec-cur svg{width:22px;height:22px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
      .rec-ring{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #072AC8;z-index:100000;pointer-events:none;animation:recring .6s ease-out forwards}
      @keyframes recring{from{transform:scale(.3);opacity:.9}to{transform:scale(1.4);opacity:0}}`;
    const add = () => {
      if (document.getElementById('rec-cap')) return;
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      document.body.insertAdjacentHTML('beforeend', '<div id="rec-cap"></div><div id="rec-card"><b></b><span></span></div><div id="rec-cur"><svg viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>');
      // top-layer popovers, so a modal dialog opened later can be covered again by raising them (window.recRaise)
      window.recRaise = () => ['rec-card', 'rec-cap', 'rec-cur'].forEach(id => { const e = document.getElementById(id); if (!e.showPopover) return; e.setAttribute('popover', 'manual'); try { e.hidePopover(); } catch (x) {} e.showPopover(); });
      window.recRaise();
      addEventListener('mousemove', e => { document.getElementById('rec-cur').style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
      addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = 'rec-ring'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  });

  // screencast frames with timestamps
  const frames = [];
  const dir = path.join(OUT, `frames-${LANG}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  cdp.on('Page.screencastFrame', async f => {
    const file = path.join(dir, String(frames.length).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
  });
  const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  const cap = async (txt, hold = 0) => { if (txt) cue('pop'); await page.evaluate(t => { const c = document.getElementById('rec-cap'); if (!t) { c.classList.remove('on'); return; } c.textContent = t; c.classList.add('on'); }, txt); if (hold) await sleep(hold); };
  const card = async (on, a, b) => { if (on) cue('whoosh'); return page.evaluate(([on, a, b]) => { const c = document.getElementById('rec-card'); if (a) { c.querySelector('b').textContent = a; c.querySelector('span').textContent = b; } c.classList.toggle('on', on); }, [on, a, b]); };
  let mx = W / 2, my = H / 2;
  const moveTo = async (sel, dx = 0.5, dy = 0.5) => {
    const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox(); if (!b) return;
    const x = b.x + b.width * dx, y = b.y + b.height * dy;
    await page.mouse.move(x, y, { steps: 18 }); mx = x; my = y; await sleep(150);
  };
  const click = async sel => { await moveTo(sel); cue('click'); await page.mouse.down(); await page.mouse.up(); await sleep(250); };
  const type = async (sel, text) => { await click(sel); await page.locator(sel).first().fill(''); for (const ch of text) { cue('key'); await page.keyboard.type(ch); await sleep(45); } await sleep(250); };
  const glide = async (sel, offset = -110, dur = 1.6) => { await page.evaluate(([s, o, d]) => window.lenis ? window.lenis.scrollTo(document.querySelector(s), { offset: o, duration: d }) : document.querySelector(s).scrollIntoView({ behavior: 'smooth' }), [sel, offset, dur]); await sleep(dur * 1000 + 300); };
  const rowIn = (stage, n = 0) => `section[data-stage="${stage}"] tr.main >> nth=${n}`;
  const rowSel = async (stage, n) => {
    const id = await page.locator(`section[data-stage="${stage}"] tr.main`).nth(n).getAttribute('data-id');
    return `#${id}`;
  };

  // fresh page in the right country
  await page.goto(BASE);
  await page.evaluate(lang => { localStorage.clear(); localStorage.setItem('co2trace-theme', 'light'); }, LANG);
  await page.goto(BASE);
  await page.click(`[data-region="${ES ? 'mx' : 'us'}"]`);
  await page.evaluate(() => document.fonts.ready);
  await sleep(600);
  await page.mouse.move(mx, my);

  await card(true, ...TXT.title);
  await startCast();
  await sleep(2800);
  await card(false);
  await sleep(1200);

  // 0 · The example gallery: hover the companies, then start your own project
  await glide('#examples', -90, 2.2);
  await cap(TXT.s0);
  for (const id of ['agua', 'autopartes', 'citricos', 'imprenta']) { await moveTo(`[data-ex="${id}"]`, 0.5, 0.4); await sleep(650); }
  await click('[data-ex="own"]');
  await page.evaluate(() => window.recRaise());
  await sleep(900);
  await cap(TXT.s0b);
  await type('#acCompany', T('Blue Mesa Sparkling Water', 'Agua Mineral Cerro Alto'));
  await moveTo('.acct-step .acct-go'); await sleep(700);
  await click('.acct-step [data-acct-skip]');
  await sleep(1600);

  // 1 · Project setup (the company came from the account box)
  await cap(TXT.s1);
  await moveTo('#company'); await sleep(500);
  await type('#year', '2025');
  await type('#fuName', T('one case of 24 glass bottles', 'una caja de 24 botellas de vidrio'));
  await type('#fuQty', '7500000');
  await click('#bGate');
  await sleep(700);
  await click('#setup > summary');
  await sleep(600);
  await glide('#setup', -90, 1.2);
  await cap(TXT.s1b);
  await type('#g-reason', T('A national retailer asked for the footprint of a case', 'Una cadena de autoservicio pidió la huella de una caja'));
  await type('#g-refFlow', T('1 case: 24 × 355 mL in glass bottles, 80% returnable', '1 caja: 24 × 355 mL en botellas de vidrio, 80% retornables'));
  await sleep(900);
  await click('#setup > summary');
  await sleep(500);

  // 2 · Ledger
  await glide('#ledgerTitle', -100, 1.8);
  await cap(TXT.s2);
  let r = await rowSel('materials', 0);
  await moveTo(`${r}-key`); cue('click'); await page.selectOption(`${r}-key`, 'glass'); await sleep(500);
  await type(`${r}-supplier`, T('Lone Star Glass Works', 'Vidriera del Norte'));
  await type(`${r}-qty`, '4800000');
  await cap(TXT.s2b);
  await click('[data-add="materials"]'); await sleep(400);
  r = await rowSel('materials', 1);
  await moveTo(`${r}-key`); cue('click'); await page.selectOption(`${r}-key`, 'cardboard'); await sleep(400);
  await type(`${r}-qty`, '1500000');
  await glide('section[data-stage="manufacturing"]', -110, 1.2);
  r = await rowSel('manufacturing', 0);
  await moveTo(`${r}-key`); cue('click'); await page.selectOption(`${r}-key`, T('egrid_ERCT', 'elec_mx')); await sleep(400);
  await type(`${r}-supplier`, T('Electric utility', 'CFE'));
  await type(`${r}-qty`, T('24000000', '18000000'));
  await click('[data-add="manufacturing"]'); await sleep(400);
  r = await rowSel('manufacturing', 1);
  await moveTo(`${r}-key`); cue('click'); await page.selectOption(`${r}-key`, 'natgas'); await sleep(400);
  await type(`${r}-qty`, '3500000');
  await sleep(800);
  await cap(TXT.s2c, 1600);

  // the rest of the year: load the full example (it opens in view mode, ledger folded away)
  const full = [T('Blue Mesa Sparkling Water', 'Agua Mineral Cerro Alto'), T('15 lines · January to December 2025', '15 líneas · enero a diciembre de 2025')];
  await card(true, ...full);
  await sleep(900);
  await page.goto(BASE + '?demo=agua');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.lenis && window.lenis.scrollTo(document.getElementById('exampleBanner'), { immediate: true, offset: -100 }));
  await page.mouse.move(mx, my);
  await card(true, ...full);
  await sleep(1400);
  await card(false);
  await sleep(1000);

  // 3 · Evidence on the electricity line: open the activity data first
  await cap(TXT.s3);
  await click('#ledgerToggle');
  await sleep(900);
  await glide('section[data-stage="manufacturing"]', -110, 1.4);
  const elecId = await page.evaluate(k => [...document.querySelectorAll('tr.main')].find(tr => tr.querySelector('[data-field=key]').value === k).dataset.id, T('egrid_ERCT', 'elec_mx'));
  await click(`tr.main[data-id="${elecId}"] [data-toggle-ev]`);
  await sleep(700);
  const pdf = path.join(OUT, T('Electric_bill_2025.pdf', 'Recibo_CFE_2025.pdf'));
  fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  await moveTo(`#${elecId}-ev`, 0.2, 0.4);
  cue('click');
  await page.setInputFiles(`#${elecId}-upload`, pdf);
  await sleep(1200);
  await cap(TXT.s3b);
  await click(`#${elecId}-verified`);
  await sleep(1600);

  // 4 · Dashboard
  await glide('#kpis', -100, 1.8);
  await cap(TXT.s4);
  await moveTo('#kpis .kpi:nth-child(2)'); await sleep(900);
  await moveTo('#kpis .kpi:nth-child(3)'); await sleep(900);
  await moveTo('#kpis .kpi:nth-child(4)'); await sleep(1400);
  await glide('#dashTitle', -100, 1.2);
  await cap(TXT.s4b);
  for (const id of ['c-scope', 'c-gantt', 'c-sup', 'c-hot']) {
    await page.evaluate(id => { const side = document.querySelector('.side'), el = document.getElementById(id); if (side && el) side.scrollTo({ top: el.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop - 10, behavior: 'smooth' }); }, id);
    cue('whoosh');
    await sleep(2200);
  }

  // 5 · Checks and export
  await page.evaluate(() => { const side = document.querySelector('.side'), el = document.getElementById('c-checks'); if (side && el) side.scrollTo({ top: el.getBoundingClientRect().top - side.getBoundingClientRect().top + side.scrollTop - 10, behavior: 'smooth' }); });
  await sleep(1200);
  await cap(TXT.s5);
  await moveTo('#c-checks', 0.4, 0.3); await sleep(2200);
  await glide('#projectSetup', -90, 1.8);
  await click('#copyCsv');
  await sleep(2200);
  await cap('');
  await card(true, ...TXT.end);
  cue('chime');
  await sleep(3200);

  await cdp.send('Page.stopScreencast');
  await sleep(300);
  await browser.close();

  // encode: each frame shown until the next one arrives
  const list = path.join(OUT, `frames-${LANG}.txt`);
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1] ? frames[i + 1].t : f.t + 2;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(list, lines.join('\n'));
  const mp4 = path.join(OUT, `co2trace-demo-${LANG}.mp4`);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', mp4]);
  // soundtrack: music for the whole clip plus the logged cues, muxed into the MP4 as AAC
  const secs0 = frames[frames.length - 1].t - frames[0].t + 2;
  const wav = path.join(OUT, `soundtrack-${LANG}.wav`);
  writeSoundtrack(events.map(e => ({ type: e.type, t: e.wall - frames[0].t })).filter(e => e.t >= 0), secs0, wav);
  const silent = mp4.replace(/\.mp4$/, '-silent.mp4');
  fs.renameSync(mp4, silent);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', mp4]);
  fs.rmSync(silent);
  const poster = path.join(OUT, `co2trace-demo-${LANG}.jpg`);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1.5', '-i', mp4, '-frames:v', '1', '-q:v', '4', poster]);
  const secs = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  console.log(JSON.stringify({ lang: LANG, frames: frames.length, seconds: Math.round(secs), mp4, sizeMB: +(fs.statSync(mp4).size / 1e6).toFixed(2) }));
})().catch(e => { console.error(e); process.exit(1); });
