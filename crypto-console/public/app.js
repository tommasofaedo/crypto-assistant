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
let allProfiles = []; // ultimo elenco caricato; i filtri lavorano in locale su questo

async function showHome() {
  $('#detail').hidden = true;
  $('#home').hidden = false;
  const { profiles } = await api('/api/profiles');
  allProfiles = profiles;
  populateTagFilter(profiles);
  renderProfiles();
}

// Popola il menu "filtro tag" con l'unione dei tag presenti, preservando la selezione corrente.
function populateTagFilter(profiles) {
  const sel = $('#filter-tag');
  const prev = sel.value;
  const tags = [...new Set(profiles.flatMap(p => p.tags || []))].sort((a, b) => a.localeCompare(b, 'it'));
  sel.textContent = '';
  sel.append(el('option', { value: '' }, 'tutti i tag'));
  for (const t of tags) sel.append(el('option', { value: t }, t));
  sel.value = tags.includes(prev) ? prev : '';
}

// Applica ricerca + filtro tag + ordinamento + visibilità archiviati (tutto client-side).
function renderProfiles() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const tag = $('#filter-tag').value;
  const sort = $('#sort').value;
  const showArchived = $('#show-archived').checked;

  const list = allProfiles.filter(p => {
    if (!showArchived && p.archived) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    if (q) {
      const hay = [p.name, p.displayName || '', ...(p.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list.sort((a, b) => {
    if (sort === 'value') return (b.snapshotValue || 0) - (a.snapshotValue || 0);
    if (sort === 'lastRun') return new Date(b.lastRun || 0) - new Date(a.lastRun || 0);
    return (a.displayName || a.name).localeCompare(b.displayName || b.name, 'it');
  });

  const box = $('#profiles');
  box.textContent = '';
  for (const p of list) box.append(profileCard(p));
  $('#home-empty').hidden = allProfiles.length > 0;
  $('#home-count').textContent = allProfiles.length
    ? `${list.length} di ${allProfiles.length} profili${list.length < allProfiles.length ? ' (filtrati)' : ''}`
    : '';
}

function profileCard(p) {
  const card = el('div', { className: 'card' + (p.archived ? ' archived' : ''), onclick: () => showDetail(p.name) });
  const head = el('div', { className: 'card-head' }, el('h3', { title: p.displayName || p.name }, p.displayName || p.name));
  if (p.telegramConfigured) head.append(el('span', { className: 'badge-tg', title: 'chat Telegram configurata' }, '📨'));
  if (p.archived) head.append(el('span', { className: 'badge-arch', title: 'profilo archiviato' }, 'arch'));
  card.append(head);
  if (p.displayName) card.append(el('div', { className: 'sub' }, p.name)); // mostra lo slug tecnico sotto il nome
  card.append(
    row('asset', String(p.assets)),
    row('valore (ultima istantanea)', eur(p.snapshotValue)),
    row('ultima run', p.lastRun ? new Date(p.lastRun).toLocaleDateString('it-IT') : '—'),
  );
  if ((p.tags || []).length) {
    const chips = el('div', { className: 'chips' });
    for (const t of p.tags) chips.append(el('span', { className: 'chip' }, t));
    card.append(chips);
  }
  return card;
}
const row = (k, v) => el('div', { className: 'row' }, el('span', {}, k), el('span', { className: 'val' }, v));

// ---------- DETTAGLIO ----------
let current = null;
let currentPf = null;     // ultimo portafoglio caricato
let editingPf = false;    // modalità modifica portafoglio
let lastReconcile = null; // ultimo risultato di riconciliazione

async function showDetail(name) {
  current = name;
  editingPf = false;
  $('#home').hidden = true;
  $('#detail').hidden = false;
  $('#report-box').hidden = true;
  $('#csv-box').hidden = true;
  $('#csvfile').value = '';
  $('#d-error').hidden = true;
  $('#d-name').textContent = name;
  $('#d-meta').textContent = 'caricamento…';
  const { meta, portfolio, history } = await api('/api/profiles/' + name);
  currentPf = portfolio;
  $('#d-name').textContent = (meta && meta.displayName) || name;
  loadMetaForm(meta);
  $('#d-meta').textContent = portfolio
    ? `${portfolio.holdings.length} asset · aggiornato ${portfolio.updatedAt || '—'} · fonte ${portfolio.source || '—'}`
    : 'portfolio.json non leggibile';
  togglePfEdit(false);
  renderHistory(history);
  loadTelegram(name);
}

// Carica la scheda (meta.json) nel pannello: nome leggibile, tag (CSV), nota, archiviato.
function loadMetaForm(meta) {
  $('#m-name').value = meta?.displayName || '';
  $('#m-tags').value = (meta?.tags || []).join(', ');
  $('#m-note').value = meta?.note || '';
  $('#m-archived').checked = !!meta?.archived;
  $('#m-status').textContent = '';
}

async function doSaveMeta() {
  $('#d-error').hidden = true;
  const displayName = ($('#m-name').value || '').trim();
  const note = $('#m-note').value || '';
  const tags = ($('#m-tags').value || '').split(',').map(s => s.trim()).filter(Boolean);
  const archived = $('#m-archived').checked;
  busy(true);
  try {
    const m = await api(`/api/profiles/${current}/meta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, note, tags, archived }),
    });
    $('#d-name').textContent = m.displayName || current;
    $('#m-tags').value = (m.tags || []).join(', '); // riflette dedupe/trim lato motore
    $('#m-status').textContent = 'salvato';
  } catch (e) { showErr(e.message); } finally { busy(false); }
}

// Carica chat_id/budget Telegram del profilo nel pannello (fallo in background: un errore qui
// non deve impedire di vedere il resto del profilo).
async function loadTelegram(name) {
  $('#tg-chat').value = '';
  $('#tg-budget').value = 0;
  $('#tg-note').textContent = '…';
  try {
    const t = await api('/api/profiles/' + name + '/telegram');
    if (name !== current) return; // l'utente ha già cambiato profilo
    $('#tg-chat').value = t.chatId || '';
    $('#tg-budget').value = t.budget || 0;
    $('#tg-note').textContent = t.chatId ? 'chat configurata · riceve i report push' : 'nessuna chat: non riceve push';
  } catch (e) {
    if (name === current) $('#tg-note').textContent = 'impostazioni non leggibili: ' + e.message;
  }
}

async function doSaveTelegram() {
  $('#d-error').hidden = true;
  const chatId = ($('#tg-chat').value || '').trim();
  const budget = Number($('#tg-budget').value) || 0;
  busy(true);
  try {
    const t = await api(`/api/profiles/${current}/telegram`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, budget }),
    });
    $('#tg-chat').value = t.chatId || '';
    $('#tg-budget').value = t.budget || 0;
    $('#tg-note').textContent = t.chatId ? 'salvato · riceve i report push' : 'salvato · nessuna chat: non riceve push';
  } catch (e) { showErr(e.message); } finally { busy(false); }
}

function renderPortfolioTable(pf) {
  const t = $('#pf-table');
  t.textContent = '';
  $('#pf-note').textContent = editingPf ? '(modifica: quantità e avg sono scrivibili)' : '(quantità sovrane)';
  if (!editingPf && (!pf || !pf.holdings?.length)) { t.append(el('caption', {}, 'nessun holding')); return; }

  if (!editingPf) {
    t.append(headRow(['Asset', 'Quantità', 'Disponibile', 'Avg €', 'Valore istantanea']));
    const tb = el('tbody');
    for (const h of (pf.holdings || [])) {
      tb.append(el('tr', {},
        td(h.symbol, 'l'), td(num(h.quantity, 8)), td(num(h.availableForTrading ?? h.quantity, 8)),
        td(h.avgBuyPrice != null ? num(h.avgBuyPrice, 2) : '—'), td(eur(h.valueAtSnapshot)),
      ));
    }
    t.append(tb);
    return;
  }

  // modalità modifica: input per quantità e avg, + riga per aggiungere un asset
  t.append(headRow(['Asset', 'Quantità', 'Avg €', '']));
  const tb = el('tbody');
  for (const h of (pf.holdings || [])) {
    tb.append(el('tr', {},
      td(h.symbol, 'l'),
      tdWrap(numInput(`q-${h.symbol}`, h.quantity)),
      tdWrap(numInput(`a-${h.symbol}`, h.avgBuyPrice)),
      td(''),
    ));
  }
  // riga nuovo asset
  tb.append(el('tr', {},
    tdWrap(Object.assign(document.createElement('input'), { id: 'new-sym', className: 'sym', placeholder: 'SIMB' })),
    tdWrap(numInput('new-q', null, 'quantità')),
    tdWrap(numInput('new-a', null, 'avg €')),
    td('nuovo'),
  ));
  t.append(tb);
}

function numInput(id, val, ph) {
  return Object.assign(document.createElement('input'),
    { id, type: 'number', step: 'any', value: val != null ? val : '', placeholder: ph || '' });
}

function togglePfEdit(on) {
  editingPf = on;
  $('#btn-edit-pf').hidden = on;
  $('#btn-save-pf').hidden = !on;
  $('#btn-cancel-pf').hidden = !on;
  renderPortfolioTable(currentPf);
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
  $('#report').textContent = data.report || '(nota Hari Seldon disattivata)';
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
  lastReconcile = data;
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
    tb.append(el('tr', {},
      td(a.symbol, 'l'), td(num(a.sovereign, 8)), td(num(a.csvSum, 8)),
      tdCls((a.delta >= 0 ? '+' : '') + num(a.delta, 8), cls(a.delta)),
      td(addCell(a.added?.purchases)), td(addCell(a.added?.rewards)),
      tdWrap(numInput(`rec-${a.symbol}`, a.suggested)), tdWrap(badge),
    ));
  }
  t.append(tb);

  const ph = $('#csv-phantom');
  ph.textContent = '';
  if (data.phantom?.length) {
    ph.append(el('p', { className: 'muted', style: 'margin:12px 0 6px' },
      `Asset nel CSV ma non nel portafoglio (${data.phantom.length}) — dust/airdrop/nuovi. Metti una quantità per aggiungerli:`));
    const pt = el('table');
    pt.append(headRow(['Asset', 'CSV', 'Quantità da aggiungere']));
    const ptb = el('tbody');
    for (const p of data.phantom) {
      ptb.append(el('tr', {}, td(p.symbol, 'l'), td(num(p.csvSum, 6)), tdWrap(numInput(`recph-${p.symbol}`, null, '0 = ignora'))));
    }
    pt.append(ptb);
    ph.append(el('div', { className: 'table-wrap' }, pt));
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
  for (const id of ['#btn-analyze', '#btn-sync', '#btn-csv', '#btn-apply-csv', '#btn-new', '#btn-save-pf', '#btn-save-tg', '#btn-save-meta']) {
    const n = $(id); if (n) n.disabled = on;
  }
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
    if (r.portfolio) currentPf = r.portfolio;
    renderPortfolioTable(currentPf);
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

const val = id => { const n = $('#' + id); return n ? parseFloat(n.value) : NaN; };

// Scrittura centralizzata: conferma → POST /apply → ricarica. updates = { SYM: n | {quantity,avgBuyPrice} }.
async function applyUpdates(updates, title) {
  const keys = Object.keys(updates);
  if (!keys.length) { showErr('Nessuna modifica da applicare.'); return; }
  const lines = keys.map(s => {
    const u = updates[s];
    return typeof u === 'number' ? `  ${s} → quantità ${u}` :
      `  ${s} → ${['quantity' in u ? 'q ' + u.quantity : '', 'avgBuyPrice' in u ? 'avg ' + u.avgBuyPrice : ''].filter(Boolean).join(', ')}`;
  });
  if (!confirm(`${title}\n\n${lines.join('\n')}\n\nScrivo queste modifiche sul profilo ${current}?`)) return;
  $('#d-error').hidden = true;
  busy(true);
  try {
    const data = await api(`/api/profiles/${current}/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    const msg = [];
    if (data.created?.length) msg.push('creati: ' + data.created.map(c => c.symbol).join(', '));
    if (data.applied?.length) msg.push('aggiornati: ' + data.applied.map(a => a.symbol).join(', '));
    if (data.detectedSells?.length) msg.push('cali rilevati (cooldown armato): ' + data.detectedSells.map(s => s.symbol).join(', '));
    await showDetail(current);
    alert('Fatto.\n' + (msg.join('\n') || 'nessuna variazione effettiva'));
  } catch (e) { showErr(e.message); } finally { busy(false); }
}

// Applica le quantità proposte dalla riconciliazione (+ phantom con quantità > 0).
function doApplyCsv() {
  if (!lastReconcile) return;
  const updates = {};
  for (const a of lastReconcile.assets) {
    const v = val('rec-' + a.symbol);
    if (!isNaN(v) && Math.abs(v - a.sovereign) > EPS) updates[a.symbol] = v;
  }
  for (const p of (lastReconcile.phantom || [])) {
    const v = val('recph-' + p.symbol);
    if (!isNaN(v) && v > EPS) updates[p.symbol] = v;
  }
  applyUpdates(updates, 'Applica quantità dalla riconciliazione CSV');
}

// Salva le modifiche manuali al portafoglio (quantità/avg + eventuale nuovo asset).
function doSavePf() {
  const updates = {};
  for (const h of (currentPf.holdings || [])) {
    const u = {};
    const q = val('q-' + h.symbol);
    if (!isNaN(q) && Math.abs(q - h.quantity) > EPS) u.quantity = q;
    const aEl = $('#a-' + h.symbol);
    if (aEl && aEl.value !== '') {
      const a = parseFloat(aEl.value);
      if (!isNaN(a) && a !== h.avgBuyPrice) u.avgBuyPrice = a;
    }
    if (Object.keys(u).length) updates[h.symbol] = u;
  }
  const sym = ($('#new-sym').value || '').trim().toUpperCase();
  if (sym) {
    const q = val('new-q');
    if (isNaN(q) || q <= 0) { showErr('Per il nuovo asset serve una quantità > 0.'); return; }
    const u = { quantity: q };
    const a = val('new-a');
    if (!isNaN(a)) u.avgBuyPrice = a;
    updates[sym] = u;
  }
  applyUpdates(updates, 'Salva modifiche al portafoglio');
}

// ---------- nuovo profilo (modale) ----------
// Slug "stile" dei profili esistenti: minuscole, senza accenti né spazi (es. "Mario Rossi" → "mariorossi").
const slugify = s => (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().replace(/[^a-z0-9_-]+/g, '');
let nfSlugEdited = false; // true quando l'utente ha toccato lo slug a mano → stop all'auto-suggerimento

function openNewProfile() {
  nfSlugEdited = false;
  for (const id of ['nf-name', 'nf-slug', 'nf-tags', 'nf-chat']) $('#' + id).value = '';
  $('#nf-budget').value = 0;
  $('#nf-error').hidden = true;
  $('#modal').hidden = false;
  $('#nf-name').focus();
}
function closeModal() { $('#modal').hidden = true; }

async function doCreateProfile() {
  const displayName = ($('#nf-name').value || '').trim();
  const slug = ($('#nf-slug').value || '').trim();
  const tags = ($('#nf-tags').value || '').split(',').map(s => s.trim()).filter(Boolean);
  const chatId = ($('#nf-chat').value || '').trim();
  const budget = Number($('#nf-budget').value) || 0;

  const err = m => { const n = $('#nf-error'); n.textContent = m; n.hidden = false; };
  if (!slug) return err('Lo slug è obbligatorio.');
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) return err('Slug non valido: solo lettere, numeri, _ e -.');
  if (slug.startsWith('_')) return err('Lo slug non può iniziare con "_".');
  if (chatId && !/^-?\d+$/.test(chatId)) return err('Chat Telegram non valida: atteso un numero intero.');

  $('#nf-create').disabled = true;
  $('#nf-error').hidden = true;
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post('/api/profiles', { name: slug }); // la creazione deve riuscire, altrimenti resto nel modale
  } catch (e) {
    $('#nf-create').disabled = false;
    return err(e.message);
  }
  // Profilo creato: scheda e telegram sono best-effort (un errore qui non annulla la creazione).
  let warn = '';
  try { if (displayName || tags.length) await post(`/api/profiles/${slug}/meta`, { displayName, tags }); }
  catch (e) { warn += 'scheda non salvata (' + e.message + '). '; }
  try { if (chatId) await post(`/api/profiles/${slug}/telegram`, { chatId, budget }); }
  catch (e) { warn += 'Telegram non salvato (' + e.message + ').'; }

  $('#nf-create').disabled = false;
  closeModal();
  await showDetail(slug);
  if (warn) showErr('Profilo creato, ma: ' + warn + ' Correggi qui sotto e salva.');
}

// ---------- init ----------
$('#back').onclick = showHome;
$('#title').onclick = showHome;
$('#btn-analyze').onclick = doAnalyze;
$('#btn-sync').onclick = doSync;
$('#btn-csv').onclick = doCsv;
$('#btn-apply-csv').onclick = doApplyCsv;
$('#btn-new').onclick = openNewProfile;
$('#nf-cancel').onclick = closeModal;
$('#nf-create').onclick = doCreateProfile;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('#nf-name').addEventListener('input', () => { if (!nfSlugEdited) $('#nf-slug').value = slugify($('#nf-name').value); });
$('#nf-slug').addEventListener('input', () => { nfSlugEdited = $('#nf-slug').value.trim() !== ''; });
for (const id of ['nf-name', 'nf-slug', 'nf-tags', 'nf-chat', 'nf-budget']) {
  $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') doCreateProfile(); });
}
$('#btn-edit-pf').onclick = () => togglePfEdit(true);
$('#btn-cancel-pf').onclick = () => togglePfEdit(false);
$('#btn-save-pf').onclick = doSavePf;
$('#btn-save-tg').onclick = doSaveTelegram;
$('#btn-save-meta').onclick = doSaveMeta;
$('#q').addEventListener('input', renderProfiles);
$('#filter-tag').addEventListener('change', renderProfiles);
$('#sort').addEventListener('change', renderProfiles);
$('#show-archived').addEventListener('change', renderProfiles);
showHome().catch(e => { $('#home-empty').hidden = false; $('#home-empty').textContent = 'Errore: ' + e.message; });
