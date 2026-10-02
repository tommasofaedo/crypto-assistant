'use strict';

const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

const eur = (n, d = 2) => n == null ? '—' : '€' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = n => n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
const num = (n, d = 2) => n == null ? '—' : Number(n).toFixed(d);
const cls = n => n == null ? '' : n >= 0 ? 'pos' : 'neg';

// ---------- HOME ----------
async function showHome() {
  $('#detail').hidden = true;
  $('#home').hidden = false;
  const box = $('#profiles');
  box.textContent = '';
  const { profiles } = await api('/api/profiles');
  $('#home-empty').hidden = profiles.length > 0;
  for (const p of profiles) {
    const card = el('div', { className: 'card', onclick: () => showDetail(p.name) },
      el('h3', {}, p.name),
      row('asset', String(p.assets)),
      row('valore (ultima istantanea)', eur(p.snapshotValue)),
      row('ultima run', p.lastRun ? new Date(p.lastRun).toLocaleDateString('it-IT') : '—'),
    );
    box.append(card);
  }
}
const row = (k, v) => el('div', { className: 'row' }, el('span', {}, k), el('span', { className: 'val' }, v));

// ---------- DETTAGLIO ----------
let current = null;

async function showDetail(name) {
  current = name;
  $('#home').hidden = true;
  $('#detail').hidden = false;
  $('#report-box').hidden = true;
  $('#csv-box').hidden = true;
  $('#csvfile').value = '';
  $('#d-error').hidden = true;
  $('#d-name').textContent = name;
  $('#d-meta').textContent = 'caricamento…';
  const { portfolio, history } = await api('/api/profiles/' + name);
  $('#d-meta').textContent = portfolio
    ? `${portfolio.holdings.length} asset · aggiornato ${portfolio.updatedAt || '—'} · fonte ${portfolio.source || '—'}`
    : 'portfolio.json non leggibile';
  renderPortfolioTable(portfolio);
  renderHistory(history);
}

function renderPortfolioTable(pf) {
  const t = $('#pf-table');
  t.textContent = '';
  $('#pf-note').textContent = '(quantità sovrane)';
  if (!pf || !pf.holdings?.length) { t.append(el('caption', {}, 'nessun holding')); return; }
  t.append(headRow(['Asset', 'Quantità', 'Disponibile', 'Avg €', 'Valore istantanea']));
  const tb = el('tbody');
  for (const h of pf.holdings) {
    tb.append(el('tr', {},
      td(h.symbol, 'l'), td(num(h.quantity, 8)), td(num(h.availableForTrading ?? h.quantity, 8)),
      td(h.avgBuyPrice != null ? num(h.avgBuyPrice, 2) : '—'), td(eur(h.valueAtSnapshot)),
    ));
  }
  t.append(tb);
}

function renderAnalysis(data) {
  $('#report-box').hidden = false;
  $('#an-meta').textContent = `F&G ${data.fearGreed?.value ?? '—'} · totale ${eur(data.totalValueEur)} · ${new Date(data.generatedAt).toLocaleString('it-IT')}`;
  const t = $('#an-table');
  t.textContent = '';
  t.append(headRow(['Asset', 'Prezzo', '24h', 'Valore', 'Alloc', 'P&L', 'Segnale', 'Score', 'RSI']));
  const tb = el('tbody');
  for (const h of data.holdings) {
    tb.append(el('tr', {},
      td(h.symbol, 'l'), td(eur(h.priceEur, h.priceEur < 1 ? 4 : 2)),
      tdCls(pct(h.change24hPct), cls(h.change24hPct)), td(eur(h.valueEur)),
      td(num(h.allocationPct, 1) + '%'),
      tdCls(h.pnlPct != null ? pct(h.pnlPct) : '—', cls(h.pnlPct)),
      td(h.signal || '—'), tdCls(h.score != null ? (h.score > 0 ? '+' : '') + h.score : '—', cls(h.score)),
      td(num(h.rsi, 1)),
    ));
  }
  t.append(tb);
  $('#report').textContent = data.report || '(nota Marco Ferretti disattivata)';
}

function renderHistory(hist) {
  const t = $('#hist-table');
  t.textContent = '';
  if (!hist?.length) { t.append(el('caption', {}, 'nessuno snapshot')); return; }
  t.append(headRow(['Data', 'Asset', 'Segnale', 'Score', 'RSI', 'Prezzo €']));
  const tb = el('tbody');
  for (const e of hist) {
    tb.append(el('tr', {},
      td(new Date(e.date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), 'l'),
      td(e.symbol, 'l'), td(e.signal || '—'),
      tdCls(e.score != null ? (e.score > 0 ? '+' : '') + e.score : '—', cls(e.score)),
      td(num(e.rsi, 1)), td(e.priceEur != null ? num(e.priceEur, e.priceEur < 1 ? 4 : 2) : '—'),
    ));
  }
  t.append(tb);
}

function renderReconcile(data) {
  $('#csv-box').hidden = false;
  const s = data.summary;
  $('#csv-summary').textContent =
    `${data.uploadedFile || 'master'} · ${s.uploadedRows} righe caricate · ${s.newRows} nuove · ${s.duplicatesSkipped} duplicati ignorati · master ${s.masterRows} righe`;

  const addCell = a => a && a.total > EPS ? `+${num(a.total, 8)}` : '—';
  const t = $('#csv-table');
  t.textContent = '';
  t.append(headRow(['Asset', 'Sovrano', 'CSV totale', 'Δ', '+Acquisti', '+Premi', 'Proposta', '']));
  const tb = el('tbody');
  for (const a of data.assets) {
    const raise = a.direction === 'raise';
    const badge = raise ? el('span', { className: 'badge pos' }, 'alza')
                        : el('span', { className: 'badge' }, 'tieni');
    const prop = el('td', {}, num(a.suggested, 8));
    if (raise) prop.className = 'pos';
    tb.append(el('tr', {},
      td(a.symbol, 'l'), td(num(a.sovereign, 8)), td(num(a.csvSum, 8)),
      tdCls((a.delta >= 0 ? '+' : '') + num(a.delta, 8), cls(a.delta)),
      td(addCell(a.added?.purchases)), td(addCell(a.added?.rewards)),
      prop, tdWrap(badge),
    ));
  }
  t.append(tb);

  const ph = $('#csv-phantom');
  ph.textContent = '';
  if (data.phantom?.length) {
    ph.append(el('p', { className: 'muted', style: 'margin-top:12px' },
      `Asset nel CSV ma non nel portafoglio (${data.phantom.length}) — dust/airdrop/nuovi: ` +
      data.phantom.map(p => `${p.symbol} ${num(p.csvSum, 4)}`).join(' · ')));
  }
}
const EPS = 1e-8;

// helpers tabella
const headRow = cols => { const tr = el('tr'); for (const c of cols) tr.append(el('th', {}, c)); return el('thead', {}, tr); };
const tdWrap = node => { const d = el('td'); d.append(node); return d; };
const td = (v, align) => el('td', align === 'l' ? { style: 'text-align:left' } : {}, String(v));
const tdCls = (v, c) => { const d = el('td', {}, String(v)); if (c) d.className = c; return d; };

// ---------- azioni ----------
function busy(on) {
  $('#busy').hidden = !on;
  $('#btn-analyze').disabled = on;
  $('#btn-sync').disabled = on;
  $('#btn-csv').disabled = on;
}
async function doAnalyze() {
  $('#d-error').hidden = true;
  busy(true);
  try {
    const budget = Number($('#budget').value) || 0;
    const ai = $('#useai').checked;
    const data = await api(`/api/profiles/${current}/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget, ai }),
    });
    renderAnalysis(data);
  } catch (e) { showErr(e.message); } finally { busy(false); }
}
async function doSync() {
  $('#d-error').hidden = true;
  busy(true);
  try {
    const r = await api(`/api/profiles/${current}/sync`, { method: 'POST' });
    renderPortfolioTable(r.portfolio);
    if (!r.ok) showErr('Sync completato con avvisi:\n' + r.log.slice(-400));
  } catch (e) { showErr(e.message); } finally { busy(false); }
}
async function doCsv() {
  const f = $('#csvfile').files[0];
  if (!f) { showErr('Seleziona un file CSV da riconciliare.'); return; }
  $('#d-error').hidden = true;
  busy(true);
  try {
    const fd = new FormData();
    fd.append('csv', f);
    const r = await fetch(`/api/profiles/${current}/csv`, { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    renderReconcile(data);
  } catch (e) { showErr(e.message); } finally { busy(false); }
}
function showErr(msg) { const n = $('#d-error'); n.textContent = msg; n.hidden = false; }

// ---------- init ----------
$('#back').onclick = showHome;
$('#title').onclick = showHome;
$('#btn-analyze').onclick = doAnalyze;
$('#btn-sync').onclick = doSync;
$('#btn-csv').onclick = doCsv;
showHome().catch(e => { $('#home-empty').hidden = false; $('#home-empty').textContent = 'Errore: ' + e.message; });
