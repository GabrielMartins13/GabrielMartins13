'use strict';

const STORAGE_KEY = 'controle-financeiro:v1';
const SETTINGS_KEY = 'controle-financeiro:aparencia';
const DEFAULT_NAME = 'FYNA';
const TABS = ['inicio', 'despesas', 'receitas', 'cartoes', 'personalizar'];
const TYPE_TAB = { expense: 'despesas', income: 'receitas' };

const CATEGORIES = {
  expense: ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Contas', 'Outros'],
  income: ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Outros'],
};

const METHODS = { credit: 'Crédito', debit: 'Débito', pix: 'Pix', cash: 'Dinheiro' };
const CARD_COLORS = [
  { name: 'Roxo', value: '#820ad1' },
  { name: 'Verde', value: '#11a650' },
  { name: 'Laranja', value: '#ec7000' },
  { name: 'Vermelho', value: '#cc092f' },
  { name: 'Azul', value: '#1a5fd6' },
  { name: 'Amarelo', value: '#d99a00' },
  { name: 'Rosa', value: '#d6246e' },
  { name: 'Preto', value: '#2b2b2b' },
];

// value vazio = cor padrão do tema (muda entre claro e escuro)
const ACCENTS = [
  { name: 'Azul', value: '' },
  { name: 'Verde', value: '#1f8a5b' },
  { name: 'Roxo', value: '#6a4fd8' },
  { name: 'Rosa', value: '#c2417a' },
  { name: 'Laranja', value: '#c4581b' },
  { name: 'Grafite', value: '#475569' },
];
const DEFAULT_SETTINGS = { name: '', accent: '', theme: 'auto', nav: 'bottom', fontSize: 'normal', period: 6, version: 2 };

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (id) => document.getElementById(id);

// ---------- Armazenamento ----------

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function normalize(data) {
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    budgets: data.budgets || {},
    recurring: Array.isArray(data.recurring) ? data.recurring : [],
    cards: Array.isArray(data.cards) ? data.cards : [],
  };
}

// Com login, as aparências ficam separadas por conta (settingsKey muda ao entrar)
let settingsKey = SETTINGS_KEY;
let state = normalize(readJSON(STORAGE_KEY) || {});

// Usa as primeiras aparências salvas entre as chaves indicadas
function loadSettings(...keys) {
  const stored = keys.map(readJSON).find(Boolean) || {};
  // Até a versão 2 a barra ficava no topo por padrão; quem não escolheu passa a ter a barra embaixo
  if (stored.version !== 2) delete stored.nav;
  return { ...DEFAULT_SETTINGS, ...stored, version: 2 };
}
let settings = loadSettings(SETTINGS_KEY);

function save() {
  if (cloud.user) return saveAccount();
  if (!writeJSON(STORAGE_KEY, state)) notify('Não foi possível salvar os dados neste navegador.');
}

// ---------- Diálogo ----------

// Diálogo próprio no lugar de confirm()/alert(), que nem todo ambiente exibe.
// buttons: [{ label, value, primary? }]; resolve com o value clicado ou null.
// Com field ({ value, readOnly, placeholder }) mostra uma caixa de texto e resolve com o texto dela.
function ask(message, buttons = [{ label: 'OK', value: true, primary: true }], field = null) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `<div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="modal-msg">
      <p id="modal-msg"></p><div class="modal-actions"></div></div>`;
    overlay.querySelector('p').textContent = message;
    const actions = overlay.querySelector('.modal-actions');
    let textarea = null;
    if (field) {
      textarea = document.createElement('textarea');
      textarea.value = field.value || '';
      textarea.readOnly = !!field.readOnly;
      textarea.placeholder = field.placeholder || '';
      textarea.setAttribute('aria-labelledby', 'modal-msg');
      actions.before(textarea);
    }
    const close = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(textarea && value != null ? textarea.value : value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.addEventListener('click', () => close(b.value));
      actions.append(btn);
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    if (textarea) {
      textarea.focus();
      if (textarea.readOnly) textarea.select();
    } else {
      actions.querySelector('button').focus(); // o primeiro botão é sempre o mais seguro (Cancelar/OK)
    }
  });
}

const notify = (message) => ask(message);
const confirmAction = async (message, label) =>
  (await ask(message, [{ label: 'Cancelar', value: false }, { label, value: true, primary: true }])) === true;

// ---------- Datas ----------

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const currentMonth = () => $('month').value;
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// "2026-09" + n meses
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// Data no mês informado, ajustando o dia para meses mais curtos (ex.: 31 → 30)
function dateInMonth(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`;
}

function formatMonth(ym, withYear = true) {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return withYear ? `${name}/${String(y).slice(2)}` : name;
}

function monthName(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- Dados ----------

// Gera as transações dos lançamentos fixos até o mês atual (real), sem duplicar
function materializeRecurring() {
  const limit = today().slice(0, 7);
  let changed = false;
  for (const r of state.recurring) {
    for (let ym = r.start; ym <= limit; ym = addMonths(ym, 1)) {
      if ((r.skipped || []).includes(ym)) continue;
      const id = `${r.id}-${ym}`;
      if (state.transactions.some((t) => t.id === id)) continue;
      state.transactions.push({
        id, ruleId: r.id, type: r.type, desc: r.desc, amount: r.amount, category: r.category, date: dateInMonth(ym, r.day),
        ...payment(r),
      });
      changed = true;
    }
  }
  if (changed) save();
}

// ---------- Cartões e formas de pagamento ----------

const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#6b7684');
const cardById = (id) => state.cards.find((c) => c.id === id);
const usesCard = (method) => method === 'credit' || method === 'debit';

// Só os campos de pagamento de uma despesa/regra (para copiar entre objetos)
function payment(src) {
  const out = {};
  if (src.method) out.method = src.method;
  if (src.cardId) out.cardId = src.cardId;
  return out;
}

// Rótulo e cor da forma de pagamento; null quando não informada
function payInfo(t) {
  if (t.type !== 'expense' || !METHODS[t.method]) return null;
  if (t.cardId) {
    const card = cardById(t.cardId);
    let text = `${card ? card.name : 'Cartão excluído'} · ${METHODS[t.method].toLowerCase()}`;
    if (card?.dueDay && t.method === 'credit' && t.date) text += ` · fatura ${fmtDM(invoiceDueDate(card, invoiceMonth(card, t.date)))}`;
    return { text, color: card ? safeColor(card.color) : null };
  }
  return { text: METHODS[t.method], color: null };
}

function payHtml(t) {
  const info = payInfo(t);
  if (!info) return '';
  const dot = info.color ? `<i class="card-dot" style="--c:${info.color}"></i>` : '';
  return ` · <span class="pay">${dot}${escapeHtml(info.text)}</span>`;
}

// ---------- Faturas do cartão de crédito ----------

const fmtDM = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dayNumber = (date) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Dia do fechamento: o informado ou 7 dias antes do vencimento (voltando para o mês anterior se precisar)
function closingDay(card) {
  if (card.closingDay) return card.closingDay;
  const c = card.dueDay - 7;
  return c >= 1 ? c : c + 30;
}

// Mês (YYYY-MM) do vencimento da fatura em que entra uma compra no crédito feita em `date`.
// Compra a partir do dia do fechamento vai para a fatura seguinte, como nos bancos.
function invoiceMonth(card, date) {
  const closing = closingDay(card);
  let closeYm = date.slice(0, 7);
  if (Number(date.slice(8, 10)) >= Math.min(closing, daysInMonth(closeYm))) closeYm = addMonths(closeYm, 1);
  return card.dueDay > closing ? closeYm : addMonths(closeYm, 1);
}

const invoiceDueDate = (card, ym) => dateInMonth(ym, card.dueDay);
function invoiceCloseDate(card, ym) {
  const closing = closingDay(card);
  return dateInMonth(card.dueDay > closing ? ym : addMonths(ym, -1), closing);
}

// Compras no crédito do cartão, mais a previsão das contas fixas dos próximos 2 meses (ainda não lançadas)
function creditCharges(card) {
  const charges = state.transactions.filter((t) => t.type === 'expense' && t.method === 'credit' && t.cardId === card.id);
  const nowYm = today().slice(0, 7);
  for (const r of state.recurring) {
    if (r.cardId !== card.id || r.method !== 'credit') continue;
    for (let ym = addMonths(nowYm, 1); ym <= addMonths(nowYm, 2); ym = addMonths(ym, 1)) {
      const id = `${r.id}-${ym}`;
      if (ym < r.start || (r.skipped || []).includes(ym) || charges.some((t) => t.id === id)) continue;
      charges.push({ id, desc: r.desc, amount: r.amount, date: dateInMonth(ym, r.day), projected: true });
    }
  }
  return charges;
}

// Faturas do cartão por mês de vencimento: { ym, total, items }
function invoicesOf(card) {
  const map = new Map();
  if (!card.dueDay) return map;
  for (const t of creditCharges(card)) {
    const ym = invoiceMonth(card, t.date);
    const inv = map.get(ym) || { ym, total: 0, items: [] };
    inv.total = Math.round((inv.total + t.amount) * 100) / 100;
    inv.items.push(t);
    map.set(ym, inv);
  }
  return map;
}

function invoiceStatus(card, ym) {
  if ((card.paid || []).includes(ym)) return { cls: 'pos', text: 'Paga', paid: true };
  const now = today();
  const days = dayNumber(invoiceDueDate(card, ym)) - dayNumber(now);
  const plural = (n) => `${n} dia${n > 1 ? 's' : ''}`;
  if (days < 0) return { cls: 'neg', text: `Vencida há ${plural(-days)}` };
  if (days === 0) return { cls: 'neg', text: 'Vence hoje' };
  if (days <= 3) return { cls: 'warn', text: `Vence em ${plural(days)}` };
  const close = invoiceCloseDate(card, ym);
  return { cls: '', text: now >= close ? `Fechada · vence em ${plural(days)}` : `Aberta · fecha ${fmtDM(close)}` };
}

// Faturas para mostrar: a anterior se ainda não foi paga, a atual e as próximas com valor
function upcomingInvoices(card) {
  const all = invoicesOf(card);
  const nowYm = today().slice(0, 7);
  const out = [];
  for (let ym = addMonths(nowYm, -2); ym <= addMonths(nowYm, 3); ym = addMonths(ym, 1)) {
    const inv = all.get(ym);
    if (!inv || inv.total <= 0) continue;
    const st = invoiceStatus(card, ym);
    if (ym < nowYm && st.paid) continue;
    out.push({ ...inv, card, status: st, due: invoiceDueDate(card, ym), projected: inv.items.some((t) => t.projected) });
  }
  return out;
}

function invoiceRow(inv, withCardName) {
  const { card, ym, status } = inv;
  const name = withCardName
    ? `<i class="card-dot" style="--c:${safeColor(card.color)}"></i>${escapeHtml(card.name)} · `
    : '';
  const action = status.paid
    ? `<button type="button" data-invoice-unpay="${card.id}|${ym}">Desfazer</button>`
    : `<button type="button" data-invoice-pay="${card.id}|${ym}">Marcar como paga</button>`;
  return `<li class="invoice-row">
    <div><strong>${name}${brl.format(inv.total)}</strong>
      <small>Fatura de ${formatMonth(ym)} · vence ${fmtDM(inv.due)} · <span class="status ${status.cls}">${status.text}</span>${inv.projected ? ' · inclui contas fixas previstas' : ''}</small></div>
    ${action}
  </li>`;
}

function setInvoicePaid(value, paid) {
  const [cardId, ym] = value.split('|');
  const card = cardById(cardId);
  if (!card) return;
  const set = new Set(card.paid || []);
  if (paid) set.add(ym);
  else set.delete(ym);
  card.paid = [...set].sort();
  save();
  render();
}

function renderHomeInvoices() {
  const el = $('home-invoices');
  const withDue = state.cards.filter((c) => c.dueDay);
  if (!withDue.length) {
    el.innerHTML = `<li class="hint">${state.cards.length
      ? 'Informe o dia do vencimento dos seus cartões na página <a href="#cartoes">Cartões</a> para ver as faturas aqui.'
      : 'Cadastre seus cartões de crédito na página <a href="#cartoes">Cartões</a> para acompanhar as faturas.'}</li>`;
    return;
  }
  // A primeira fatura não paga de cada cartão, da que vence antes para a que vence depois
  const rows = withDue.map((c) => upcomingInvoices(c).find((inv) => !inv.status.paid)).filter(Boolean)
    .sort((a, b) => a.due.localeCompare(b.due));
  el.innerHTML = rows.length ? rows.map((inv) => invoiceRow(inv, true)).join('') : '<li class="hint">Nenhuma fatura em aberto.</li>';
}

const monthTransactions = (ym = currentMonth()) => state.transactions.filter((t) => t.date.startsWith(ym));
const sum = (list, type) => list.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
const byNewest = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

function totalsByCategory(list, type) {
  const totals = {};
  for (const t of list) {
    if (t.type === type) totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return totals;
}

// ---------- Renderização ----------

function setMoney(el, value, colorize) {
  el.textContent = brl.format(value);
  if (colorize) el.className = value < 0 ? 'neg' : 'pos';
}

function barRow(label, value, max, detail, cls = '', color = null) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const bg = color ? `;background:${safeColor(color)}` : '';
  return `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(label)}</span><span>${detail}</span></div>
    <div class="bar"><div class="${cls}" style="width:${pct}%${bg}"></div></div>
  </div>`;
}

function renderShares(el, totals, emptyMessage) {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  el.innerHTML = entries.length
    ? entries.map(([c, v]) => barRow(c, v, total, `${brl.format(v)} · ${Math.round((v / total) * 100)}%`)).join('')
    : `<p class="hint">${emptyMessage}</p>`;
}

function budgetBar(spent, limit) {
  const ratio = spent / limit;
  const cls = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
  return { cls, detail: `${brl.format(spent)} de ${brl.format(limit)}` };
}

function txItem(t, withActions) {
  const [y, m, d] = t.date.split('-');
  const sign = t.type === 'income' ? '+' : '−';
  const tag = t.ruleId ? ' · fixa' : '';
  return `<li${withActions ? '' : ' class="readonly"'}>
    <div class="tx-info"><strong>${escapeHtml(t.desc)}</strong><small>${d}/${m}/${y} · ${escapeHtml(t.category)}${tag}${payHtml(t)}</small></div>
    <span class="tx-amount ${t.type === 'income' ? 'pos' : 'neg'}">${sign} ${brl.format(t.amount)}</span>
    ${withActions ? `<div class="tx-actions">
      <button type="button" data-edit="${t.id}">Editar</button>
      <button type="button" data-del="${t.id}">Excluir</button>
    </div>` : ''}
  </li>`;
}

// Variação percentual com seta; "goodWhenUp" define se subir é bom (verde) ou ruim (vermelho)
function deltaHtml(cur, prev, goodWhenUp, prevYm) {
  if (!prev) return cur ? 'sem dados do mês anterior' : '';
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return `igual a ${formatMonth(prevYm, false)}`;
  const up = pct > 0;
  const cls = up === goodWhenUp ? 'pos' : 'neg';
  return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span> vs ${formatMonth(prevYm, false)}`;
}

const balanceUpTo = (ym) => {
  const list = state.transactions.filter((t) => t.date <= `${ym}-31`);
  return sum(list, 'income') - sum(list, 'expense');
};

function renderSummary(list) {
  const ym = currentMonth();
  const prevYm = addMonths(ym, -1);
  const prev = monthTransactions(prevYm);
  const income = sum(list, 'income');
  const expense = sum(list, 'expense');
  const balance = income - expense;
  setMoney($('total-income'), income);
  setMoney($('total-expense'), expense);
  setMoney($('balance'), balance, true);
  setMoney($('overall'), balanceUpTo(ym), true);
  $('income-delta').innerHTML = deltaHtml(income, sum(prev, 'income'), true, prevYm);
  $('expense-delta').innerHTML = deltaHtml(expense, sum(prev, 'expense'), false, prevYm);
  $('balance-note').textContent = income > 0
    ? (balance >= 0 ? `${Math.round((balance / income) * 100)}% da receita guardada` : 'gastou mais do que recebeu')
    : '';
  $('overall-note').textContent = list.length ? `${balance >= 0 ? '+' : '−'} ${brl.format(Math.abs(balance))} neste mês` : '';
}

// ---------- Gráficos ----------

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const axisMoney = (v) => `${v < 0 ? '−' : ''}R$ ${compact.format(Math.abs(v))}`;

// Escala com passos "redondos" (1, 2, 2,5 ou 5 × 10^n) que sempre inclui o zero
function niceScale(values, ticks = 4) {
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values) || (lo < 0 ? 0 : 1000);
  const raw = (hi - lo || 1) / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= raw);
  return { min: Math.floor(lo / step) * step, max: Math.max(step, Math.ceil(hi / step) * step), step };
}

// Estrutura comum: grade, eixo Y, rótulos do eixo X e camada de hover com tooltip.
// Desenha no tamanho real do container para o texto não escalar; container oculto é ignorado.
function drawChart(el, { n, values, xLabel, showTick = () => true, body, tooltip, lines = false, height = 200, label }) {
  const W = el.clientWidth;
  if (!W) return;
  const H = height, padL = 60, padR = 10, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const scale = niceScale(values);
  const y = (v) => padT + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;
  const band = plotW / n;
  const x = (i) => padL + band * i + band / 2;

  let svg = '';
  for (let v = scale.min; v <= scale.max + scale.step / 2; v += scale.step) {
    svg += `<line class="${Math.abs(v) < scale.step / 2 ? 'baseline' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${axisMoney(v)}</text>`;
  }
  for (let i = 0; i < n; i++) {
    if (showTick(i, band)) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${xLabel(i)}</text>`;
  }
  svg += body({ x, y, band });
  if (lines) svg += `<line class="crosshair" y1="${padT}" y2="${padT + plotH}"/>`;
  for (let i = 0; i < n; i++) {
    svg += `<rect class="hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}" rx="6"/>`;
  }
  el.innerHTML = `<svg class="${lines ? 'lines' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${svg}</svg><div class="tooltip" hidden></div>`;

  const tip = el.querySelector('.tooltip');
  const cross = el.querySelector('.crosshair');
  const clear = () => el.querySelectorAll('.hit.active').forEach((r) => r.classList.remove('active'));
  const show = (rect) => {
    const i = Number(rect.dataset.i);
    clear();
    rect.classList.add('active');
    if (cross) {
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.classList.add('on');
    }
    tip.innerHTML = tooltip(i);
    tip.hidden = false;
    const left = x(i) - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(left, W - tip.offsetWidth))}px`;
    tip.style.top = '0px';
  };
  el.querySelectorAll('.hit').forEach((rect) => {
    rect.addEventListener('mouseenter', () => show(rect));
    rect.addEventListener('click', () => show(rect));
  });
  el.querySelector('svg').addEventListener('mouseleave', () => {
    tip.hidden = true;
    clear();
    cross?.classList.remove('on');
  });
}

function linePath(values, x, y) {
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d ? 'L' : 'M'}${x(i)},${y(v)}`;
  });
  return d;
}

const lastIndex = (values) => values.reduce((last, v, i) => (v == null ? last : i), -1);
const dot = (cx, cy, cls) => `<circle class="dot ${cls}" cx="${cx}" cy="${cy}" r="4.5"/>`;
// Rótulos do eixo X sem encavalar quando há muitos meses em pouco espaço
const everyOther = (n) => (i, band) => band >= 40 || (n - 1 - i) % 2 === 0;

function periodMonths() {
  const n = Number(settings.period) === 12 ? 12 : 6;
  return Array.from({ length: n }, (_, i) => addMonths(currentMonth(), i - (n - 1)));
}

function renderEvolution() {
  const months = periodMonths();
  const data = months.map((ym) => {
    const list = monthTransactions(ym);
    return { ym, income: sum(list, 'income'), expense: sum(list, 'expense'), total: balanceUpTo(ym) };
  });

  $('chart-table').innerHTML = data.map((d) => `<tr><td>${formatMonth(d.ym)}</td><td>${brl.format(d.income)}</td>
    <td>${brl.format(d.expense)}</td><td>${brl.format(d.income - d.expense)}</td><td>${brl.format(d.total)}</td></tr>`).join('');

  drawChart($('chart'), {
    n: data.length,
    values: data.flatMap((d) => [d.income, d.expense]),
    xLabel: (i) => formatMonth(data[i].ym, data.length > 6 && data[i].ym.endsWith('-01')),
    showTick: everyOther(data.length),
    label: `Receitas e despesas dos últimos ${data.length} meses`,
    body: ({ x, y, band }) => {
      const barW = Math.min(28, band * 0.32), gap = 2;
      // Barra com cantos superiores arredondados, apoiada na linha de base
      const bar = (bx, v, cls) => {
        if (v <= 0) return '';
        const top = y(v), h = y(0) - top, r = Math.min(4, h, barW / 2);
        return `<path class="${cls}" d="M${bx},${top + h}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + barW - r}Q${bx + barW},${top} ${bx + barW},${top + r}V${top + h}Z"/>`;
      };
      return data.map((d, i) => bar(x(i) - barW - gap / 2, d.income, 's1') + bar(x(i) + gap / 2, d.expense, 's2')).join('');
    },
    tooltip: (i) => {
      const d = data[i];
      return `<b>${formatMonth(d.ym)}</b>
        <div><i class="swatch s1"></i>Receitas ${brl.format(d.income)}</div>
        <div><i class="swatch s2"></i>Despesas ${brl.format(d.expense)}</div>
        <div>Saldo ${brl.format(d.income - d.expense)}</div>`;
    },
  });

  // Saldo acumulado ao fim de cada mês
  const totals = data.map((d) => d.total);
  const first = totals[0], last = totals[totals.length - 1];
  const diff = last - first;
  $('balance-summary').textContent = state.transactions.length
    ? `${diff >= 0 ? 'Cresceu' : 'Caiu'} ${brl.format(Math.abs(diff))} desde ${formatMonth(data[0].ym)}.`
    : 'Adicione receitas e despesas para ver a evolução.';
  drawChart($('balance-chart'), {
    n: data.length,
    values: totals,
    lines: true,
    xLabel: (i) => formatMonth(data[i].ym, false),
    showTick: everyOther(data.length),
    label: 'Evolução do saldo acumulado',
    body: ({ x, y }) => {
      const d = linePath(totals, x, y);
      const area = `${d}L${x(totals.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
      const li = totals.length - 1;
      return `<path class="area" d="${area}"/><path class="line s1" d="${d}"/>${dot(x(li), y(totals[li]), 's1')}`;
    },
    tooltip: (i) => `<b>Fim de ${formatMonth(data[i].ym)}</b><div>Saldo acumulado ${brl.format(totals[i])}</div>`,
  });
}

// Gasto acumulado dia a dia no mês selecionado, comparado ao mês anterior
function renderPace() {
  const ym = currentMonth();
  const prevYm = addMonths(ym, -1);
  const daysIn = (m) => { const [yy, mm] = m.split('-').map(Number); return new Date(yy, mm, 0).getDate(); };
  const cumulative = (m, len) => {
    const perDay = new Array(len).fill(0);
    for (const t of monthTransactions(m)) if (t.type === 'expense') perDay[Number(t.date.slice(8, 10)) - 1] += t.amount;
    let acc = 0;
    return perDay.map((v) => (acc += v));
  };
  const n = Math.max(daysIn(ym), daysIn(prevYm));
  const now = today();
  // No mês atual a linha para no dia de hoje; meses futuros ficam sem linha
  const lastDay = ym === now.slice(0, 7) ? Number(now.slice(8, 10)) : ym < now.slice(0, 7) ? daysIn(ym) : 0;
  const cur = cumulative(ym, daysIn(ym)).map((v, i) => (i < lastDay ? v : null));
  const prev = cumulative(prevYm, daysIn(prevYm));
  while (cur.length < n) cur.push(null);
  while (prev.length < n) prev.push(null);

  const li = lastIndex(cur);
  const summary = $('pace-summary');
  if (li < 0) {
    summary.textContent = 'Este mês ainda não começou.';
  } else {
    const spent = cur[li];
    const before = prev[Math.min(li, lastIndex(prev))] ?? 0;
    const day = li + 1;
    if (!before) summary.textContent = `Até o dia ${day}: ${brl.format(spent)} em despesas.`;
    else {
      const pct = Math.round(((spent - before) / before) * 100);
      summary.innerHTML = `Até o dia ${day}: ${brl.format(spent)}, <span class="${pct > 0 ? 'neg' : 'pos'}">${Math.abs(pct)}% ${pct > 0 ? 'a mais' : 'a menos'}</span> que no mesmo período de ${formatMonth(prevYm, false)}.`;
    }
  }

  drawChart($('pace-chart'), {
    n,
    values: [...cur, ...prev].filter((v) => v != null),
    lines: true,
    xLabel: (i) => String(i + 1),
    showTick: (i) => i === 0 || (i + 1) % 5 === 0,
    label: 'Gasto acumulado por dia neste mês e no anterior',
    body: ({ x, y }) => `<path class="line prev" d="${linePath(prev, x, y)}"/><path class="line s2" d="${linePath(cur, x, y)}"/>${li >= 0 ? dot(x(li), y(cur[li]), 's2') : ''}`,
    tooltip: (i) => `<b>Dia ${i + 1}</b>
      ${cur[i] != null ? `<div><i class="swatch s2"></i>Este mês ${brl.format(cur[i])}</div>` : ''}
      ${prev[i] != null ? `<div>Mês anterior ${brl.format(prev[i])}</div>` : ''}`,
  });
}

// Minigráfico de 6 meses por categoria de despesa
function renderTrends() {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth(), i - 5));
  const rows = CATEGORIES.expense.map((c) => ({
    c,
    values: months.map((ym) => monthTransactions(ym).filter((t) => t.type === 'expense' && t.category === c).reduce((a, t) => a + t.amount, 0)),
  })).filter((r) => r.values.some((v) => v > 0))
    .sort((a, b) => b.values[5] - a.values[5] || b.values[4] - a.values[4]);

  $('trends').innerHTML = rows.length ? rows.map(({ c, values }) => {
    const max = Math.max(...values) || 1;
    const px = (i) => 4 + (i * 88) / 5;
    const py = (v) => 24 - (v / max) * 20;
    const pts = values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
    const [prev, cur] = values.slice(-2);
    let delta = '—';
    if (prev > 0) {
      const pct = Math.round(((cur - prev) / prev) * 100);
      delta = pct === 0 ? '=' : `<span class="trend-delta ${pct > 0 ? 'neg' : 'pos'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
    } else if (cur > 0) delta = 'novo';
    const title = months.map((ym, i) => `${formatMonth(ym)}: ${brl.format(values[i])}`).join('\n');
    return `<li title="${title}">
      <span class="trend-name">${escapeHtml(c)}</span>
      <svg viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true"><polyline class="spark" points="${pts}"/><circle class="spark-dot" cx="${px(5)}" cy="${py(values[5])}" r="3"/></svg>
      <span class="trend-value">${brl.format(cur)}</span>
      <span class="trend-delta">${delta}</span>
    </li>`;
  }).join('') : '<li class="hint">Sem despesas nos últimos 6 meses.</li>';
}

function renderCharts() {
  renderEvolution();
  renderPace();
}

// Calendário do mês com a intensidade de gasto por dia (4 níveis, relativo ao dia de maior gasto)
function renderHeatmap(list) {
  const ym = currentMonth();
  const [y, m] = ym.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const offset = new Date(y, m - 1, 1).getDay();
  const perDay = Array.from({ length: days + 1 }, () => ({ total: 0, count: 0 }));
  for (const t of list) {
    if (t.type !== 'expense') continue;
    const d = perDay[Number(t.date.slice(8, 10))];
    d.total += t.amount;
    d.count += 1;
  }
  const max = Math.max(...perDay.map((d) => d.total));
  const now = today();

  let html = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w) => `<span class="wd" aria-hidden="true">${w}</span>`).join('');
  html += '<span aria-hidden="true"></span>'.repeat(offset);
  for (let d = 1; d <= days; d++) {
    const { total, count } = perDay[d];
    const level = total > 0 ? Math.max(1, Math.ceil((total / max) * 4)) : 0;
    const label = total > 0
      ? `${pad(d)}/${pad(m)}: ${brl.format(total)} em ${count} despesa${count > 1 ? 's' : ''}`
      : `${pad(d)}/${pad(m)}: sem despesas`;
    const isToday = `${ym}-${pad(d)}` === now ? ' today' : '';
    html += `<button type="button" class="day l${level}${isToday}" data-label="${label}" aria-label="${label}">${d}</button>`;
  }
  $('heatmap').innerHTML = html;

  let top = 0;
  for (let d = 1; d <= days; d++) if (perDay[d].total > (perDay[top]?.total || 0)) top = d;
  const detail = $('heat-detail');
  detail.dataset.default = top
    ? `Dia de maior gasto: ${pad(top)}/${pad(m)}, com ${brl.format(perDay[top].total)}.`
    : 'Nenhuma despesa neste mês ainda.';
  detail.textContent = detail.dataset.default;
}

function renderBudgetsHome(list) {
  const spent = totalsByCategory(list, 'expense');
  const rows = CATEGORIES.expense.filter((c) => state.budgets[c] > 0).map((c) => {
    const { cls, detail } = budgetBar(spent[c] || 0, state.budgets[c]);
    return barRow(c, spent[c] || 0, state.budgets[c], detail, cls);
  });
  $('home-budgets').innerHTML = rows.length
    ? rows.join('')
    : '<p class="hint">Nenhum orçamento definido. Crie limites por categoria na página <a href="#despesas">Despesas</a>.</p>';
}

function renderBudgetsEditor(list) {
  const spent = totalsByCategory(list, 'expense');
  const container = $('budgets');
  const focused = document.activeElement?.dataset?.budget;
  container.innerHTML = CATEGORIES.expense.map((c) => {
    const limit = state.budgets[c];
    let bar = '';
    if (limit > 0) {
      const { cls, detail } = budgetBar(spent[c] || 0, limit);
      bar = barRow('', spent[c] || 0, limit, detail, cls);
    }
    return `<div class="budget-row"><span>${c}</span>
      <input type="number" min="0" step="0.01" placeholder="Sem limite" data-budget="${c}" value="${limit || ''}" aria-label="Orçamento ${c}"></div>${bar}`;
  }).join('');
  if (focused) container.querySelector(`[data-budget="${focused}"]`)?.focus();
}

function renderRecent(list) {
  const items = [...list].sort(byNewest).slice(0, 6);
  $('home-recent').innerHTML = items.length
    ? items.map((t) => txItem(t, false)).join('')
    : '<li class="readonly hint">Nenhuma transação neste mês.</li>';
}

function renderTxList(type, list = monthTransactions()) {
  const q = $(`${type}-search`).value.trim().toLowerCase();
  const pf = type === 'expense' ? $('expense-pay-filter').value : '';
  const ofType = list.filter((t) => t.type === type);
  const items = ofType
    .filter((t) => !q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    .filter((t) => !pf || (pf.startsWith('card:') ? t.cardId === pf.slice(5) : t.method === pf))
    .sort(byNewest);
  $(`${type}-list`).innerHTML = items.map((t) => txItem(t, true)).join('');
  $(`${type}-empty`).hidden = items.length > 0;
  $(`${type}-empty`).textContent = (q || pf) && ofType.length
    ? 'Nada encontrado com esse filtro.'
    : `Nenhuma ${type === 'expense' ? 'despesa' : 'receita'} neste mês.`;
  $(`${type}-total`).textContent = brl.format(sum(items, type));
}

function renderRecurring(type) {
  const rules = state.recurring.filter((r) => r.type === type);
  $(`${type}-recurring`).innerHTML = rules.length
    ? rules.map((r) => `<li>
        <div><strong>${escapeHtml(r.desc)}</strong>
          <small>${brl.format(r.amount)} · todo dia ${r.day} · desde ${formatMonth(r.start)}${payHtml(r)}</small></div>
        <button type="button" data-stop="${r.id}">Encerrar</button>
      </li>`).join('')
    : `<li class="hint">Nenhuma. Escolha “Todo mês” no formulário para criar.</li>`;
}

function render() {
  const list = monthTransactions();
  const label = monthName(currentMonth());
  document.querySelectorAll('.month-label').forEach((el) => { el.textContent = label; });

  renderSummary(list);
  renderCharts();
  renderTrends();
  renderHeatmap(list);
  renderShares($('home-categories'), totalsByCategory(list, 'expense'), 'Sem despesas neste mês.');
  renderBudgetsHome(list);
  renderRecent(list);

  for (const type of ['expense', 'income']) {
    renderTxList(type, list);
    renderRecurring(type);
  }
  renderShares($('expense-categories'), totalsByCategory(list, 'expense'), 'Sem despesas neste mês.');
  renderShares($('income-sources'), totalsByCategory(list, 'income'), 'Sem receitas neste mês.');
  renderBudgetsEditor(list);
  fillCardOptions();
  renderPayments(list);
  renderCards(list);
  renderHomeInvoices();
}

function renderPayments(list) {
  const groups = new Map();
  for (const t of list) {
    if (t.type !== 'expense') continue;
    const card = t.cardId && cardById(t.cardId);
    const key = card ? `card:${card.id}` : METHODS[t.method] ? t.method : 'none';
    const label = card ? card.name : METHODS[t.method] || 'Não informado';
    const g = groups.get(key) || { label, total: 0, color: card ? card.color : null };
    g.total += t.amount;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = rows.reduce((a, g) => a + g.total, 0);
  $('home-payments').innerHTML = rows.length
    ? rows.map((g) => barRow(g.label, g.total, total, `${brl.format(g.total)} · ${Math.round((g.total / total) * 100)}%`, '', g.color)).join('')
      + (state.cards.length ? '' : '<p class="hint">Cadastre seus cartões na página <a href="#cartoes">Cartões</a>.</p>')
    : '<p class="hint">Sem despesas neste mês.</p>';
}

function renderCards(list) {
  const el = $('card-list');
  if (!state.cards.length) {
    el.innerHTML = '<section class="panel"><p class="hint">Nenhum cartão cadastrado ainda. Use o formulário para adicionar os cartões que você usa, como Nubank, PicPay, Itaú ou Bradesco.</p></section>';
    return;
  }
  const month = formatMonth(currentMonth());
  el.innerHTML = state.cards.map((c) => {
    const color = safeColor(c.color);
    const txs = list.filter((t) => t.type === 'expense' && t.cardId === c.id).sort(byNewest);
    const credit = txs.filter((t) => t.method === 'credit').reduce((a, t) => a + t.amount, 0);
    const debit = txs.filter((t) => t.method === 'debit').reduce((a, t) => a + t.amount, 0);
    const rules = state.recurring.filter((r) => r.cardId === c.id);
    let limit = '';
    if (c.limit > 0) {
      const { cls, detail } = budgetBar(credit, c.limit);
      limit = barRow('Crédito usado no mês', credit, c.limit, detail, cls);
    }
    return `<article class="panel cc">
      <div class="cc-face" style="--c:${color};--on:${textOn(color)}">
        <div><div class="cc-top"><strong>${escapeHtml(c.name)}</strong><span class="cc-chip" aria-hidden="true"></span></div>
          ${c.dueDay ? `<small class="cc-due">Vence dia ${c.dueDay} · fecha dia ${closingDay(c)}</small>` : ''}</div>
        <div><small>Gasto em ${month}</small><span class="cc-total">${brl.format(credit + debit)}</span></div>
      </div>
      <div class="cc-stats">
        <div><span>Crédito</span><strong>${brl.format(credit)}</strong></div>
        <div><span>Débito</span><strong>${brl.format(debit)}</strong></div>
      </div>
      ${limit}
      ${c.dueDay ? (() => {
        const invs = upcomingInvoices(c);
        return `<div><h4>Faturas</h4>${invs.length
          ? `<ul class="simple-list">${invs.map((inv) => invoiceRow(inv, false)).join('')}</ul>`
          : '<p class="hint">Nenhuma compra no crédito para as próximas faturas.</p>'}</div>`;
      })() : '<p class="hint">Toque em Editar e informe o dia do vencimento para ver as faturas deste cartão.</p>'}
      ${rules.length ? `<div><h4>Contas fixas neste cartão</h4><ul class="simple-list">${rules.map((r) => `<li><div><strong>${escapeHtml(r.desc)}</strong>
        <small>${brl.format(r.amount)} · todo dia ${r.day} · ${(METHODS[r.method] || '').toLowerCase()}</small></div></li>`).join('')}</ul></div>` : ''}
      ${txs.length ? `<details><summary>Ver lançamentos do mês (${txs.length})</summary><ul class="tx-list">${txs.map((t) => txItem(t, false)).join('')}</ul></details>` : ''}
      <div class="form-actions">
        <button type="button" data-card-edit="${c.id}">Editar</button>
        <button type="button" class="danger" data-card-del="${c.id}">Excluir</button>
      </div>
    </article>`;
  }).join('');
}

// Opções de cartão no formulário de despesa e no filtro da lista, preservando a seleção
function fillCardOptions() {
  const sel = forms.expense.elements.card;
  const prev = sel.value;
  sel.innerHTML = state.cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    + '<option value="">Outro / não informar</option>';
  if (cardById(prev) || prev === '') sel.value = prev;

  const filter = $('expense-pay-filter');
  const pf = filter.value;
  filter.innerHTML = '<option value="">Todos os pagamentos</option>'
    + state.cards.map((c) => `<option value="card:${c.id}">${escapeHtml(c.name)}</option>`).join('')
    + '<option value="pix">Pix</option><option value="cash">Dinheiro</option>';
  filter.value = [...filter.options].some((o) => o.value === pf) ? pf : '';
  updatePaymentFields();
}

function updatePaymentFields() {
  const form = forms.expense;
  const needsCard = usesCard(form.elements.method.value);
  form.querySelector('.card-wrap').hidden = !(needsCard && state.cards.length);
  form.querySelector('.card-hint').hidden = !(needsCard && !state.cards.length);

  // Em qual fatura a compra no crédito vai entrar
  const hint = form.querySelector('.invoice-hint');
  const card = cardById(form.elements.card.value);
  const date = form.elements.date.value;
  const show = form.elements.method.value === 'credit' && card?.dueDay && /^\d{4}-\d{2}-\d{2}$/.test(date);
  hint.hidden = !show;
  if (show) {
    const due = invoiceDueDate(card, invoiceMonth(card, date));
    const first = form.elements.repeat.value === 'installments' ? 'A 1ª parcela entra' : 'Entra';
    hint.textContent = `${first} na fatura do ${card.name} que vence em ${fmtDM(due)}/${due.slice(0, 4)}.`;
  }
}

// ---------- Formulário de cartão ----------

const cardForm = $('card-form');

function resetCardForm() {
  cardForm.reset();
  cardForm.elements.cardId.value = '';
  cardForm.querySelector('input[name="cardColor"]').checked = true;
  $('card-form-title').textContent = 'Novo cartão';
  cardForm.querySelector('[type="submit"]').textContent = 'Adicionar cartão';
  cardForm.querySelector('.cancel').hidden = true;
}

function buildCardForm() {
  $('card-colors').innerHTML = CARD_COLORS.map((c) => `<label class="swatch-opt">
      <input type="radio" name="cardColor" value="${c.value}">
      <span style="--c:${c.value}"></span>${c.name}
    </label>`).join('');
  cardForm.querySelector('.cancel').addEventListener('click', resetCardForm);
  cardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const el = cardForm.elements;
    const name = el.cardName.value.trim();
    if (!name) return;
    const limit = parseFloat(el.cardLimit.value);
    const dayOrNull = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 31 ? n : null; };
    const card = {
      id: el.cardId.value || newId(),
      name,
      color: safeColor(el.cardColor.value),
      limit: limit > 0 ? Math.round(limit * 100) / 100 : null,
      dueDay: dayOrNull(el.cardDue.value),
      closingDay: dayOrNull(el.cardClosing.value),
    };
    if (card.closingDay && !card.dueDay) return notify('Informe também o dia do vencimento.');
    const idx = state.cards.findIndex((c) => c.id === card.id);
    // Mantém as faturas já marcadas como pagas
    if (idx >= 0) state.cards[idx] = { ...state.cards[idx], ...card };
    else state.cards.push(card);
    save();
    resetCardForm();
    render();
  });
  resetCardForm();
}

function editCard(id) {
  const c = cardById(id);
  if (!c) return;
  const el = cardForm.elements;
  el.cardId.value = c.id;
  el.cardName.value = c.name;
  el.cardLimit.value = c.limit || '';
  el.cardDue.value = c.dueDay || '';
  el.cardClosing.value = c.closingDay || '';
  const radio = cardForm.querySelector(`input[name="cardColor"][value="${safeColor(c.color)}"]`);
  if (radio) radio.checked = true;
  $('card-form-title').textContent = 'Editar cartão';
  cardForm.querySelector('[type="submit"]').textContent = 'Salvar';
  cardForm.querySelector('.cancel').hidden = false;
  cardForm.scrollIntoView({ block: 'center' });
  el.cardName.focus({ preventScroll: true });
}

async function deleteCard(id) {
  const c = cardById(id);
  if (!c || !(await confirmAction(`Excluir o cartão "${c.name}"? As despesas continuam salvas, só deixam de apontar para ele.`, 'Excluir'))) return;
  state.cards = state.cards.filter((x) => x.id !== id);
  for (const item of [...state.transactions, ...state.recurring]) {
    if (item.cardId === id) delete item.cardId;
  }
  save();
  if (cardForm.elements.cardId.value === id) resetCardForm();
  render();
}

// ---------- Formulários de despesa e receita ----------

const forms = {};

function buildForm(type) {
  const form = $(`${type}-form`);
  const repeatOptions = [
    '<option value="none">Não repetir</option>',
    type === 'expense' ? '<option value="installments">Parcelado</option>' : '',
    '<option value="monthly">Todo mês (fixa)</option>',
  ].join('');
  form.innerHTML = `
    <input type="hidden" name="txid">
    <label>Descrição<input id="${type}-desc" name="desc" required maxlength="80" placeholder="${type === 'expense' ? 'Ex.: Mercado' : 'Ex.: Salário'}"></label>
    <div class="row2">
      <label>Valor (R$)<input id="${type}-amount" name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal" placeholder="0,00"></label>
      <label>Data<input id="${type}-date" name="date" type="date" required></label>
    </div>
    <label>Categoria<select id="${type}-category" name="category">${CATEGORIES[type].map((c) => `<option>${c}</option>`).join('')}</select></label>
    ${type === 'expense' ? `<div class="row2">
      <label>Pagamento<select id="expense-method" name="method">${Object.entries(METHODS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="card-wrap">Cartão<select id="expense-card" name="card"></select></label>
    </div>
    <p class="hint card-hint" hidden>Nenhum cartão cadastrado. <a href="#cartoes">Cadastre seus cartões</a> para escolher aqui.</p>
    <p class="hint invoice-hint" hidden></p>` : ''}
    <label class="repeat-wrap">Repetição<select id="${type}-repeat" name="repeat">${repeatOptions}</select></label>
    <label class="installments-wrap" hidden>Número de parcelas<input id="${type}-installments" name="installments" type="number" min="2" max="60" value="2"></label>
    <p class="hint repeat-hint" hidden></p>
    <div class="form-actions">
      <button type="submit" class="primary">Adicionar</button>
      <button type="button" class="cancel" hidden>Cancelar edição</button>
    </div>`;
  forms[type] = form;
  form.elements.repeat.addEventListener('change', () => updateRepeatFields(type));
  if (type === 'expense') {
    for (const name of ['method', 'card', 'date', 'repeat']) form.elements[name].addEventListener('change', updatePaymentFields);
  }
  form.querySelector('.cancel').addEventListener('click', () => resetForm(type));
  form.addEventListener('submit', (e) => { e.preventDefault(); submitForm(type); });
}

function updateRepeatFields(type) {
  const form = forms[type];
  const mode = form.elements.repeat.value;
  form.querySelector('.installments-wrap').hidden = mode !== 'installments';
  const hint = form.querySelector('.repeat-hint');
  hint.hidden = mode === 'none';
  hint.textContent = mode === 'installments'
    ? 'Informe o valor total da compra: ele será dividido nas parcelas, uma por mês a partir da data escolhida.'
    : 'O valor será lançado automaticamente todo mês, a partir da data escolhida, até você encerrar.';
}

function resetForm(type) {
  const form = forms[type];
  form.reset();
  form.elements.txid.value = '';
  form.elements.date.value = currentMonth() === today().slice(0, 7) ? today() : `${currentMonth()}-01`;
  form.querySelector('.repeat-wrap').hidden = false;
  updateRepeatFields(type);
  if (type === 'expense') {
    form.elements.method.value = state.cards.length ? 'credit' : 'pix';
    updatePaymentFields();
  }
  $(`${type}-form-title`).textContent = type === 'expense' ? 'Nova despesa' : 'Nova receita';
  form.querySelector('[type="submit"]').textContent = 'Adicionar';
  form.querySelector('.cancel').hidden = true;
}

function startEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  goTo(TYPE_TAB[t.type]);
  const form = forms[t.type];
  const el = form.elements;
  el.txid.value = t.id;
  el.desc.value = t.desc;
  el.amount.value = t.amount;
  el.date.value = t.date;
  el.category.value = t.category;
  el.repeat.value = 'none';
  form.querySelector('.repeat-wrap').hidden = true;
  updateRepeatFields(t.type);
  if (t.type === 'expense') {
    el.method.value = METHODS[t.method] ? t.method : 'pix';
    el.card.value = cardById(t.cardId) ? t.cardId : '';
    updatePaymentFields();
  }
  $(`${t.type}-form-title`).textContent = t.type === 'expense' ? 'Editar despesa' : 'Editar receita';
  form.querySelector('[type="submit"]').textContent = 'Salvar';
  form.querySelector('.cancel').hidden = false;
  form.scrollIntoView({ block: 'center' });
  el.desc.focus({ preventScroll: true });
}

async function submitForm(type) {
  const el = forms[type].elements;
  const amount = Math.round(parseFloat(el.amount.value) * 100) / 100;
  if (!(amount > 0)) return;
  const editingId = el.txid.value;
  const tx = {
    id: editingId || newId(),
    type,
    desc: el.desc.value.trim(),
    amount,
    category: el.category.value,
    date: el.date.value,
  };
  if (type === 'expense') {
    tx.method = el.method.value;
    if (usesCard(tx.method) && cardById(el.card.value)) tx.cardId = el.card.value;
  }
  const mode = editingId ? 'none' : el.repeat.value;

  if (editingId) {
    const idx = state.transactions.findIndex((t) => t.id === editingId);
    if (idx < 0) return resetForm(type);
    // Preserva o vínculo com parcelamento/lançamento fixo
    const { groupId, ruleId } = state.transactions[idx];
    state.transactions[idx] = { ...tx, ...(groupId && { groupId }), ...(ruleId && { ruleId }) };
  } else if (mode === 'installments') {
    const n = Math.round(Number(el.installments.value));
    if (!(n >= 2 && n <= 60)) return notify('O número de parcelas deve ser entre 2 e 60.');
    const cents = Math.round(amount * 100);
    const base = Math.floor(cents / n);
    if (base < 1) return notify('O valor é baixo demais para esse número de parcelas.');
    const groupId = newId();
    const day = Number(tx.date.slice(8, 10));
    for (let i = 0; i < n; i++) {
      state.transactions.push({
        ...tx,
        id: `${groupId}-${i + 1}`,
        groupId,
        desc: `${tx.desc} (${i + 1}/${n})`,
        // A última parcela absorve os centavos que sobram da divisão
        amount: (i === n - 1 ? cents - base * (n - 1) : base) / 100,
        date: dateInMonth(addMonths(tx.date.slice(0, 7), i), day),
      });
    }
  } else if (mode === 'monthly') {
    state.recurring.push({
      id: tx.id, type, desc: tx.desc, amount: tx.amount, category: tx.category,
      day: Number(tx.date.slice(8, 10)), start: tx.date.slice(0, 7), skipped: [], ...payment(tx),
    });
    materializeRecurring();
  } else {
    state.transactions.push(tx);
  }
  save();
  if (!tx.date.startsWith(currentMonth())) {
    $('month').value = tx.date.slice(0, 7);
    resetForm(type === 'expense' ? 'income' : 'expense');
  }
  resetForm(type);
  render();
}

async function deleteTx(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const siblings = tx.groupId ? state.transactions.filter((t) => t.groupId === tx.groupId && t.id !== id) : [];
  const choice = siblings.length
    ? await ask(`Excluir "${tx.desc}"? Esta compra tem mais ${siblings.length} parcela(s).`, [
      { label: 'Cancelar', value: null },
      { label: 'Só esta parcela', value: 'one' },
      { label: 'Todas as parcelas', value: 'all', primary: true },
    ])
    : (await confirmAction(`Excluir "${tx.desc}"?`, 'Excluir')) && 'one';
  if (!choice) return;
  const removed = new Set([id, ...(choice === 'all' ? siblings.map((t) => t.id) : [])]);
  state.transactions = state.transactions.filter((t) => !removed.has(t.id));
  // Não recriar este mês de um lançamento fixo
  const rule = tx.ruleId && state.recurring.find((r) => r.id === tx.ruleId);
  if (rule) rule.skipped = [...(rule.skipped || []), tx.date.slice(0, 7)];
  save();
  for (const type of ['expense', 'income']) {
    if (removed.has(forms[type].elements.txid.value)) resetForm(type);
  }
  render();
}

async function stopRecurring(id) {
  const rule = state.recurring.find((r) => r.id === id);
  if (!rule || !(await confirmAction(`Encerrar "${rule.desc}"? Os meses já lançados serão mantidos.`, 'Encerrar'))) return;
  state.recurring = state.recurring.filter((r) => r.id !== id);
  save();
  render();
}

// ---------- Páginas ----------

let activeTab = null;

function tabFromHash() {
  const t = location.hash.slice(1);
  return TABS.includes(t) ? t : 'inicio';
}

function showTab(tab = tabFromHash()) {
  const changed = tab !== activeTab;
  activeTab = tab;
  for (const t of TABS) $(`page-${t}`).hidden = t !== tab;
  document.querySelectorAll('#tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('month-nav').hidden = tab === 'personalizar';
  if (tab === 'inicio') renderCharts();
  if (changed) window.scrollTo(0, 0);
}

function goTo(tab) {
  showTab(tab);
  if (location.hash !== `#${tab}`) location.hash = tab;
}

// ---------- Personalização ----------

const hostTheme = document.documentElement.getAttribute('data-theme');

// Texto branco ou escuro, o que tiver mais contraste com a cor escolhida
function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}

function applySettings() {
  const root = document.documentElement;
  if (/^#[0-9a-f]{6}$/i.test(settings.accent)) {
    root.style.setProperty('--accent', settings.accent);
    root.style.setProperty('--on-accent', textOn(settings.accent));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--on-accent');
  }
  if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme);
  else if (hostTheme) root.setAttribute('data-theme', hostTheme);
  else root.removeAttribute('data-theme');
  document.body.classList.toggle('nav-bottom', settings.nav === 'bottom');
  root.style.fontSize = settings.fontSize === 'large' ? '112.5%' : '';
  const name = settings.name.trim() || DEFAULT_NAME;
  $('app-name').textContent = name;
  document.title = name;
  if (activeTab === 'inicio') renderCharts();
}

function syncSettingsForm() {
  $('set-name').value = settings.name;
  $('set-color').value = settings.accent || '#2f6fde';
  document.querySelectorAll('input[name="accent"]').forEach((r) => { r.checked = r.value === settings.accent; });
  for (const key of ['theme', 'nav', 'fontSize', 'period']) {
    document.querySelectorAll(`input[name="${key}"]`).forEach((r) => { r.checked = r.value === String(settings[key]); });
  }
}

function buildSettings() {
  $('swatches').innerHTML = ACCENTS.map((a) => `<label class="swatch-opt">
      <input type="radio" name="accent" value="${a.value}">
      <span style="--c:${a.value || 'var(--accent-default)'}"></span>${a.name}
    </label>`).join('');

  $('page-personalizar').addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'set-name') settings.name = t.value;
    else if (t.id === 'set-color') settings.accent = t.value;
    else if (['accent', 'theme', 'nav', 'fontSize'].includes(t.name)) settings[t.name] = t.value;
    else return;
    writeJSON(settingsKey, settings);
    applySettings();
    if (t.id === 'set-color') syncSettingsForm();
  });

  document.querySelectorAll('input[name="period"]').forEach((r) => r.addEventListener('change', () => {
    settings.period = Number(r.value);
    writeJSON(settingsKey, settings);
    renderCharts();
  }));

  $('reset-settings').addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS, period: settings.period };
    writeJSON(settingsKey, settings);
    applySettings();
    syncSettingsForm();
  });
}

// ---------- Exportação e backup ----------

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function csvField(v) {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Os botões de arquivo são opcionais (a versão publicada no Claude não os tem)
$('export')?.addEventListener('click', () => {
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Pagamento', 'Valor']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
    rows.push([t.date, t.type === 'income' ? 'Receita' : 'Despesa', t.desc, t.category, payInfo(t)?.text || '', t.amount.toFixed(2).replace('.', ',')]));
  // Separador ";" e BOM para abrir corretamente no Excel em português
  download('transacoes.csv', '﻿' + rows.map((r) => r.map(csvField).join(';')).join('\n'), 'text/csv;charset=utf-8');
});

$('backup')?.addEventListener('click', () =>
  download(`backup-financeiro-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'));

// Substitui os dados atuais pelos de um backup (arquivo ou texto colado), depois de confirmar
async function importData(text, source) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const valid = data && Array.isArray(data.transactions) && data.transactions.every((t) =>
    t && typeof t.id === 'string' && ['income', 'expense'].includes(t.type) && typeof t.desc === 'string' &&
    typeof t.amount === 'number' && typeof t.category === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
  if (!valid) return notify(`${source} não contém dados válidos do FYNA.`);
  if (!(await confirmAction(`Substituir os dados atuais por ${data.transactions.length} transações?`, 'Substituir'))) return;
  state = normalize(data);
  materializeRecurring();
  save();
  resetForm('expense');
  resetForm('income');
  render();
  notify(`${data.transactions.length} transações importadas.`);
}

$('restore')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importData(await file.text(), 'Este arquivo');
});

$('copy-data').addEventListener('click', async () => {
  const text = JSON.stringify(state);
  try {
    await navigator.clipboard.writeText(text);
    notify('Dados copiados. Na outra versão do app, abra Personalizar e toque em Colar dados.');
  } catch {
    // Sem acesso à área de transferência: mostra o texto já selecionado para copiar à mão
    ask('Copie todo o texto abaixo (toque e segure, Selecionar tudo, Copiar):', [{ label: 'Fechar', value: true, primary: true }],
      { value: text, readOnly: true });
  }
});

$('paste-data').addEventListener('click', async () => {
  const text = await ask('Cole abaixo os dados copiados do app:', [
    { label: 'Cancelar', value: null },
    { label: 'Importar', value: true, primary: true },
  ], { placeholder: 'Cole aqui…' });
  if (text?.trim()) importData(text.trim(), 'O texto colado');
});

$('wipe').addEventListener('click', async () => {
  if (!(await confirmAction('Apagar todas as transações, lançamentos fixos, orçamentos e cartões? Isso não pode ser desfeito.', 'Apagar tudo'))) return;
  state = normalize({});
  save();
  resetCardForm();
  resetForm('expense');
  resetForm('income');
  render();
});

// ---------- Eventos gerais ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit], button[data-del], button[data-stop], button[data-card-edit], button[data-card-del], button[data-invoice-pay], button[data-invoice-unpay]');
  if (!btn) return;
  const { edit, del, stop, cardEdit, cardDel, invoicePay, invoiceUnpay } = btn.dataset;
  if (invoicePay) return setInvoicePaid(invoicePay, true);
  if (invoiceUnpay) return setInvoicePaid(invoiceUnpay, false);
  if (edit) startEdit(edit);
  else if (del) deleteTx(del);
  else if (stop) stopRecurring(stop);
  else if (cardEdit) editCard(cardEdit);
  else if (cardDel) deleteCard(cardDel);
});

$('budgets').addEventListener('change', (e) => {
  const cat = e.target.dataset.budget;
  if (!cat) return;
  const v = parseFloat(e.target.value);
  if (v > 0) state.budgets[cat] = Math.round(v * 100) / 100;
  else delete state.budgets[cat];
  save();
  render();
});

// Detalhe do dia no mapa de gastos
const heatmap = $('heatmap');
const showDay = (e) => {
  const day = e.target.closest('.day');
  if (day) $('heat-detail').textContent = day.dataset.label;
};
heatmap.addEventListener('mouseover', showDay);
heatmap.addEventListener('focusin', showDay);
heatmap.addEventListener('click', showDay);
heatmap.addEventListener('mouseleave', () => { $('heat-detail').textContent = $('heat-detail').dataset.default; });

function changeMonth(ym) {
  $('month').value = ym;
  resetForm('expense');
  resetForm('income');
  render();
}

$('month').addEventListener('change', () => { if (currentMonth()) changeMonth(currentMonth()); });
$('prev-month').addEventListener('click', () => changeMonth(addMonths(currentMonth(), -1)));
$('next-month').addEventListener('click', () => changeMonth(addMonths(currentMonth(), 1)));
$('expense-search').addEventListener('input', () => renderTxList('expense'));
$('expense-pay-filter').addEventListener('change', () => renderTxList('expense'));
$('income-search').addEventListener('input', () => renderTxList('income'));
window.addEventListener('hashchange', () => showTab());

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderCharts, 150);
});

// ---------- Conta (login na nuvem com Firebase) ----------

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const cloud = {
  config: window.FYNA_FIREBASE?.apiKey ? window.FYNA_FIREBASE : null,
  user: null,
  doc: null, // users/{uid} no Firestore: { state: JSON, updatedAt: ms }
  cacheKey: null, // cópia local da conta, para abrir rápido e guardar o que ainda não subiu
  updatedAt: 0,
  dirty: false, // há alterações que ainda não chegaram à nuvem
  timer: null,
  unsubscribe: null,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.append(s);
  });
}

async function loadFirebase() {
  if (!window.firebase) {
    await loadScript(`${FIREBASE_SDK}firebase-app-compat.js`);
    await Promise.all(['auth', 'firestore'].map((m) => loadScript(`${FIREBASE_SDK}firebase-${m}-compat.js`)));
  }
  if (!firebase.apps.length) firebase.initializeApp(cloud.config);
  firebase.auth().languageCode = 'pt';
}

const writeCache = () => writeJSON(cloud.cacheKey, { state, updatedAt: cloud.updatedAt, dirty: cloud.dirty });

function setSync(status) {
  $('sync-status').textContent = {
    saved: 'Tudo salvo na nuvem.',
    saving: 'Salvando na nuvem…',
    offline: 'Sem conexão. As alterações ficam neste aparelho e são enviadas quando a internet voltar.',
  }[status];
}

function saveAccount() {
  cloud.updatedAt = Date.now();
  cloud.dirty = true;
  writeCache();
  setSync('saving');
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(pushAccount, 800);
}

async function pushAccount() {
  clearTimeout(cloud.timer);
  cloud.timer = null;
  if (!cloud.doc || !cloud.dirty) return;
  const stamp = cloud.updatedAt;
  try {
    await cloud.doc.set({ state: JSON.stringify(state), updatedAt: stamp });
    // Só marca como enviado se nada mudou enquanto subia
    if (cloud.updatedAt === stamp) {
      cloud.dirty = false;
      writeCache();
    }
    setSync(cloud.dirty ? 'saving' : 'saved');
  } catch {
    setSync('offline');
  }
}

function parseRemote(data) {
  try {
    return normalize(JSON.parse(data.state));
  } catch {
    return null;
  }
}

// Carrega os dados da conta: nuvem, ou a cópia local se ela tiver alterações mais novas que ainda não subiram
async function openAccount(user) {
  cloud.user = user;
  cloud.cacheKey = `controle-financeiro:conta:${user.uid}`;
  cloud.doc = firebase.firestore().collection('users').doc(user.uid);
  settingsKey = `${SETTINGS_KEY}:${user.uid}`;
  settings = loadSettings(settingsKey, SETTINGS_KEY);

  const cache = readJSON(cloud.cacheKey);
  let remote = null;
  let online = true;
  try {
    const snap = await cloud.doc.get();
    if (snap.exists) remote = snap.data();
  } catch {
    online = false;
  }

  let isNew = false;
  if (cache?.dirty && cache.updatedAt > (remote?.updatedAt || 0)) {
    state = normalize(cache.state);
    cloud.updatedAt = cache.updatedAt;
    cloud.dirty = true;
  } else if (remote && parseRemote(remote)) {
    state = parseRemote(remote);
    cloud.updatedAt = remote.updatedAt;
    cloud.dirty = false;
  } else if (cache) {
    state = normalize(cache.state);
    cloud.updatedAt = cache.updatedAt;
    cloud.dirty = !!cache.dirty || online;
  } else {
    state = normalize({});
    cloud.updatedAt = 0;
    cloud.dirty = false;
    isNew = online;
  }
  writeCache();

  // Alterações feitas em outro aparelho chegam aqui na hora
  cloud.unsubscribe = cloud.doc.onSnapshot((snap) => {
    if (!snap.exists || snap.metadata.hasPendingWrites || cloud.dirty) return;
    const data = snap.data();
    if (!(data.updatedAt > cloud.updatedAt)) return;
    const next = parseRemote(data);
    if (!next) return;
    state = next;
    cloud.updatedAt = data.updatedAt;
    writeCache();
    materializeRecurring();
    render();
  }, () => {});

  $('account').hidden = false;
  $('account-email').textContent = user.email;
  $('data-hint').textContent = 'Seus dados ficam salvos na sua conta e aparecem em qualquer aparelho em que você entrar.';
  if (cloud.dirty) pushAccount();
  else setSync(online ? 'saved' : 'offline');
  return isNew;
}

// Conta nova num aparelho que já tinha dados de antes do login: oferece levar para a conta
async function offerLegacyImport() {
  const legacy = normalize(readJSON(STORAGE_KEY) || {});
  if (!legacy.transactions.length) return save();
  const choice = await ask(
    `Encontramos ${legacy.transactions.length} lançamentos salvos neste aparelho de antes do login. Quer levá-los para a sua conta (${cloud.user.email})?`,
    [{ label: 'Não, começar do zero', value: 'no' }, { label: 'Sim, levar para a conta', value: 'yes', primary: true }],
  );
  if (choice === 'yes') {
    state = legacy;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* sem armazenamento */ }
    materializeRecurring();
    resetForm('expense');
    resetForm('income');
    render();
  }
  save();
}

async function logout() {
  if (cloud.dirty) {
    setSync('saving');
    await Promise.race([pushAccount(), new Promise((r) => setTimeout(r, 5000))]);
  }
  if (cloud.dirty && !(await confirmAction('Algumas alterações ainda não chegaram à nuvem porque o aparelho está sem internet. Se sair agora, elas serão perdidas. Sair mesmo assim?', 'Sair'))) return;
  cloud.unsubscribe?.();
  // Não deixa os dados da conta nem a trava de biometria guardados no aparelho depois de sair
  try {
    localStorage.removeItem(cloud.cacheKey);
    localStorage.removeItem(bio.key(cloud.user.uid));
  } catch { /* sem armazenamento */ }
  await firebase.auth().signOut();
  location.reload();
}

// ---------- Tela de login ----------

let authMode = 'login';

function showAuth(loading) {
  document.body.classList.add('locked');
  $('auth').hidden = false;
  $('auth-loading').hidden = !loading;
  $('auth-panel').hidden = loading;
  $('auth-lock').hidden = true;
}

function hideAuth() {
  document.body.classList.remove('locked');
  $('auth').hidden = true;
}

function authMessage(text, ok = false) {
  const el = $('auth-message');
  el.textContent = text;
  el.classList.toggle('ok', ok);
  el.hidden = !text;
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  $('auth-subtitle').textContent = signup ? 'Crie sua conta. Seus dados ficam separados dos de qualquer outra pessoa.' : 'Entre para ver o seu controle financeiro.';
  $('auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('auth-toggle').textContent = signup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
  $('auth-reset').hidden = signup;
  $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
  authMessage('');
}

function authErrorText(code) {
  return {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Não existe conta com esse e-mail. Toque em "Criar conta".',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Toque em "Entrar".',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'Digite um e-mail válido.',
    'auth/missing-password': 'Digite a senha.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet. Verifique e tente de novo.',
  }[code] || `Não foi possível continuar (${code || 'erro desconhecido'}).`;
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email) return authMessage('Digite seu e-mail.');
  if (password.length < 6) return authMessage('A senha precisa ter pelo menos 6 caracteres.');
  const btn = $('auth-submit');
  btn.disabled = true;
  authMessage('');
  // Acabou de digitar a senha: não pede biometria nesta entrada
  bio.skipNextLock = true;
  try {
    const auth = firebase.auth();
    if (authMode === 'signup') await auth.createUserWithEmailAndPassword(email, password);
    else await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    bio.skipNextLock = false;
    authMessage(authErrorText(err.code));
  } finally {
    btn.disabled = false;
  }
});

$('auth-toggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));

$('auth-reset').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  if (!email) return authMessage('Digite seu e-mail acima e toque de novo em "Esqueci minha senha".');
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    authMessage(`Se existir uma conta com ${email}, enviamos um link para criar uma nova senha. Confira também o spam.`, true);
  } catch (err) {
    authMessage(authErrorText(err.code));
  }
});

// ---------- Biometria (Face ID / digital) ----------
// Usa o autenticador do próprio aparelho (WebAuthn) como trava do app, igual aos apps de banco.
// A conta continua protegida pela senha; a biometria só libera a sessão já aberta neste aparelho.

const bio = {
  key: (uid) => `controle-financeiro:bio:${uid}`,
  lockAfterMs: 2 * 60 * 1000, // volta a bloquear se o app ficar mais que isso em segundo plano
  hiddenAt: 0,
  skipNextLock: false,
  resolveUnlock: null, // enquanto existe, o app está bloqueado
  busy: false,
};

const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32));
const bioCredential = (uid) => readJSON(bio.key(uid))?.id || null;

async function bioAvailable() {
  try {
    return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function enableBio(user) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'FYNA' },
      user: { id: new TextEncoder().encode(user.uid), name: user.email, displayName: user.email },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60000,
    },
  });
  writeJSON(bio.key(user.uid), { id: toB64url(cred.rawId) });
}

// Pede a biometria; só aceita se o aparelho confirmou a pessoa (flag UV dos dados do autenticador)
async function verifyBio(uid) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{ type: 'public-key', id: fromB64url(bioCredential(uid)), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  const flags = new Uint8Array(assertion.response.authenticatorData)[32];
  if (!(flags & 0x04)) throw Object.assign(new Error('sem verificação'), { name: 'NotVerified' });
}

function lockMessage(text) {
  $('lock-message').textContent = text;
  $('lock-message').hidden = !text;
}

// Mostra a tela de bloqueio; resolve quando a biometria confirmar
function lockApp(user) {
  if (bio.resolveUnlock) return Promise.resolve();
  return new Promise((resolve) => {
    bio.resolveUnlock = resolve;
    bio.lockUser = user;
    document.body.classList.add('locked');
    $('auth').hidden = false;
    $('auth-loading').hidden = true;
    $('auth-panel').hidden = true;
    $('auth-lock').hidden = false;
    $('auth-subtitle').textContent = 'O FYNA está bloqueado.';
    $('lock-email').textContent = user.email;
    lockMessage('');
    tryUnlock();
  });
}

async function tryUnlock() {
  if (bio.busy || !bio.resolveUnlock) return;
  bio.busy = true;
  lockMessage('');
  try {
    await verifyBio(bio.lockUser.uid);
    $('auth-lock').hidden = true;
    const resolve = bio.resolveUnlock;
    bio.resolveUnlock = null;
    resolve();
  } catch (err) {
    lockMessage(err.name === 'NotAllowedError' || err.name === 'NotVerified'
      ? 'Biometria não confirmada. Toque em "Desbloquear" para tentar de novo ou entre com a senha.'
      : 'Não foi possível usar a biometria neste aparelho. Entre com a senha.');
  } finally {
    bio.busy = false;
  }
}

$('lock-unlock').addEventListener('click', tryUnlock);

$('lock-password').addEventListener('click', async () => {
  const email = bio.lockUser?.email || '';
  bio.resolveUnlock = null;
  cloud.unsubscribe?.();
  cloud.user = null;
  await firebase.auth().signOut();
  setAuthMode('login');
  $('auth-email').value = email;
  showAuth(false);
  $('auth-password').focus();
});

// Volta a bloquear quando o app fica um tempo em segundo plano
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    bio.hiddenAt = Date.now();
    return;
  }
  const away = bio.hiddenAt && Date.now() - bio.hiddenAt > bio.lockAfterMs;
  bio.hiddenAt = 0;
  if (away && cloud.user && bioCredential(cloud.user.uid)) lockApp(cloud.user).then(hideAuth);
});

async function syncBioToggle() {
  const toggle = $('bio-toggle');
  const available = await bioAvailable();
  toggle.disabled = !available;
  toggle.checked = available && !!bioCredential(cloud.user.uid);
  if (!available) $('bio-hint').textContent = 'Este aparelho ou navegador não oferece Face ID ou digital para sites.';
}

$('bio-toggle').addEventListener('change', async (e) => {
  const toggle = e.target;
  const user = cloud.user;
  if (!user) return;
  if (!toggle.checked) {
    try { localStorage.removeItem(bio.key(user.uid)); } catch { /* sem armazenamento */ }
    return;
  }
  toggle.disabled = true;
  try {
    await enableBio(user);
    notify('Pronto! Ao abrir o FYNA neste aparelho, ele vai pedir Face ID ou digital.');
  } catch (err) {
    toggle.checked = false;
    if (err.name !== 'NotAllowedError') notify('Não foi possível ativar a biometria neste aparelho.');
  } finally {
    toggle.disabled = false;
  }
});

$('logout').addEventListener('click', logout);
window.addEventListener('online', () => { if (cloud.dirty) pushAccount(); });

// ---------- Início ----------

let uiStarted = false;

function startApp() {
  if (!uiStarted) {
    uiStarted = true;
    buildForm('expense');
    buildForm('income');
    buildCardForm();
    buildSettings();
    $('month').value = today().slice(0, 7);
  }
  applySettings();
  syncSettingsForm();
  materializeRecurring();
  fillCardOptions();
  resetForm('expense');
  resetForm('income');
  resetCardForm();
  showTab();
  render();
}

async function boot() {
  // Sem Firebase configurado: app sem login, dados só neste aparelho
  if (!cloud.config) return startApp();

  showAuth(true);
  try {
    await loadFirebase();
  } catch {
    $('auth-loading').textContent = 'Não foi possível carregar o login. Verifique a internet e abra o app de novo.';
    return;
  }
  setAuthMode('login');
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      showAuth(false);
      return;
    }
    if (bio.skipNextLock) bio.skipNextLock = false;
    else if (bioCredential(user.uid)) await lockApp(user);
    showAuth(true);
    const isNew = await openAccount(user);
    startApp();
    hideAuth();
    syncBioToggle();
    if (isNew) offerLegacyImport();
  });
}

boot();
