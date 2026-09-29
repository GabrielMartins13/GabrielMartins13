'use strict';

const STORAGE_KEY = 'controle-financeiro:v1';
const SETTINGS_KEY = 'controle-financeiro:aparencia';
const DEFAULT_NAME = 'Controle Financeiro';
const TABS = ['inicio', 'despesas', 'receitas', 'personalizar'];
const TYPE_TAB = { expense: 'despesas', income: 'receitas' };

const CATEGORIES = {
  expense: ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Contas', 'Outros'],
  income: ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Outros'],
};

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
  };
}

let state = normalize(readJSON(STORAGE_KEY) || {});
const storedSettings = readJSON(SETTINGS_KEY) || {};
// Até a versão 2 a barra ficava no topo por padrão; quem não escolheu passa a ter a barra embaixo
if (storedSettings.version !== 2) delete storedSettings.nav;
let settings = { ...DEFAULT_SETTINGS, ...storedSettings, version: 2 };

function save() {
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
      });
      changed = true;
    }
  }
  if (changed) save();
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

function barRow(label, value, max, detail, cls = '') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(label)}</span><span>${detail}</span></div>
    <div class="bar"><div class="${cls}" style="width:${pct}%"></div></div>
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
    <div class="tx-info"><strong>${escapeHtml(t.desc)}</strong><small>${d}/${m}/${y} · ${escapeHtml(t.category)}${tag}</small></div>
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
  const ofType = list.filter((t) => t.type === type);
  const items = ofType
    .filter((t) => !q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    .sort(byNewest);
  $(`${type}-list`).innerHTML = items.map((t) => txItem(t, true)).join('');
  $(`${type}-empty`).hidden = items.length > 0;
  $(`${type}-empty`).textContent = q && ofType.length
    ? 'Nada encontrado para essa busca.'
    : `Nenhuma ${type === 'expense' ? 'despesa' : 'receita'} neste mês.`;
  $(`${type}-total`).textContent = brl.format(sum(ofType, type));
}

function renderRecurring(type) {
  const rules = state.recurring.filter((r) => r.type === type);
  $(`${type}-recurring`).innerHTML = rules.length
    ? rules.map((r) => `<li>
        <div><strong>${escapeHtml(r.desc)}</strong>
          <small>${brl.format(r.amount)} · todo dia ${r.day} · desde ${formatMonth(r.start)}</small></div>
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
    <label class="repeat-wrap">Repetição<select id="${type}-repeat" name="repeat">${repeatOptions}</select></label>
    <label class="installments-wrap" hidden>Número de parcelas<input id="${type}-installments" name="installments" type="number" min="2" max="60" value="2"></label>
    <p class="hint repeat-hint" hidden></p>
    <div class="form-actions">
      <button type="submit" class="primary">Adicionar</button>
      <button type="button" class="cancel" hidden>Cancelar edição</button>
    </div>`;
  forms[type] = form;
  form.elements.repeat.addEventListener('change', () => updateRepeatFields(type));
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
      day: Number(tx.date.slice(8, 10)), start: tx.date.slice(0, 7), skipped: [],
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
    writeJSON(SETTINGS_KEY, settings);
    applySettings();
    if (t.id === 'set-color') syncSettingsForm();
  });

  document.querySelectorAll('input[name="period"]').forEach((r) => r.addEventListener('change', () => {
    settings.period = Number(r.value);
    writeJSON(SETTINGS_KEY, settings);
    renderCharts();
  }));

  $('reset-settings').addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS, period: settings.period };
    writeJSON(SETTINGS_KEY, settings);
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
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
    rows.push([t.date, t.type === 'income' ? 'Receita' : 'Despesa', t.desc, t.category, t.amount.toFixed(2).replace('.', ',')]));
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
  if (!valid) return notify(`${source} não contém dados válidos do Controle Financeiro.`);
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
  if (!(await confirmAction('Apagar todas as transações, lançamentos fixos e orçamentos? Isso não pode ser desfeito.', 'Apagar tudo'))) return;
  state = normalize({});
  save();
  resetForm('expense');
  resetForm('income');
  render();
});

// ---------- Eventos gerais ----------

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-edit], button[data-del], button[data-stop]');
  if (!btn) return;
  const { edit, del, stop } = btn.dataset;
  if (edit) startEdit(edit);
  else if (del) deleteTx(del);
  else if (stop) stopRecurring(stop);
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
$('income-search').addEventListener('input', () => renderTxList('income'));
window.addEventListener('hashchange', () => showTab());

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderCharts, 150);
});

// ---------- Início ----------

buildForm('expense');
buildForm('income');
buildSettings();
applySettings();
syncSettingsForm();
materializeRecurring();
$('month').value = today().slice(0, 7);
resetForm('expense');
resetForm('income');
showTab();
render();
