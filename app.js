'use strict';

const STORAGE_KEY = 'controle-financeiro:v1';

const CATEGORIES = {
  expense: ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Contas', 'Outros'],
  income: ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Outros'],
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (id) => document.getElementById(id);

let state = load();

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.transactions)) return normalize(data);
  } catch { /* storage indisponível ou corrompido */ }
  return { transactions: [], budgets: {}, recurring: [] };
}

function normalize(data) {
  return {
    transactions: data.transactions,
    budgets: data.budgets || {},
    recurring: Array.isArray(data.recurring) ? data.recurring : [],
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    alert('Não foi possível salvar os dados neste navegador.');
  }
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const currentMonth = () => $('month').value;
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// "2026-09" + n meses
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Data no mês informado, ajustando o dia para meses mais curtos (ex.: 31 → 30)
function dateInMonth(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function formatMonth(ym, withYear = true) {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return withYear ? `${name}/${String(y).slice(2)}` : name;
}

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
const selectedType = () => document.querySelector('input[name="type"]:checked').value;

function fillCategories(type, selected) {
  $('category').innerHTML = CATEGORIES[type]
    .map((c) => `<option ${c === selected ? 'selected' : ''}>${c}</option>`)
    .join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function monthTransactions() {
  return state.transactions.filter((t) => t.date.startsWith(currentMonth()));
}

function sum(list, type) {
  return list.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
}

function setMoney(el, value, colorize) {
  el.textContent = brl.format(value);
  if (colorize) el.className = value < 0 ? 'neg' : 'pos';
}

function render() {
  const list = monthTransactions();
  const income = sum(list, 'income');
  const expense = sum(list, 'expense');
  const endOfMonth = currentMonth() + '-31';
  const upToMonth = state.transactions.filter((t) => t.date <= endOfMonth);

  setMoney($('total-income'), income);
  setMoney($('total-expense'), expense);
  setMoney($('balance'), income - expense, true);
  setMoney($('overall'), sum(upToMonth, 'income') - sum(upToMonth, 'expense'), true);

  renderList(list);
  renderCategories(list);
  renderBudgets(list);
  renderRecurring();
  renderChart();
}

function renderList(list) {
  const q = $('search').value.trim().toLowerCase();
  const type = $('filter-type').value;
  const items = list
    .filter((t) => (!type || t.type === type) && (!q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  $('tx-list').innerHTML = items.map((t) => {
    const [y, m, d] = t.date.split('-');
    const sign = t.type === 'income' ? '+' : '−';
    const tag = t.ruleId ? ' · fixo' : '';
    return `<li>
      <div class="tx-info"><strong>${escapeHtml(t.desc)}</strong><small>${d}/${m}/${y} · ${escapeHtml(t.category)}${tag}</small></div>
      <span class="tx-amount ${t.type === 'income' ? 'pos' : 'neg'}">${sign} ${brl.format(t.amount)}</span>
      <div class="tx-actions">
        <button data-edit="${t.id}">Editar</button>
        <button data-del="${t.id}">Excluir</button>
      </div>
    </li>`;
  }).join('');
  $('empty').hidden = items.length > 0;
}

function spentByCategory(list) {
  const totals = {};
  for (const t of list) {
    if (t.type === 'expense') totals[t.category] = (totals[t.category] || 0) + t.amount;
  }
  return totals;
}

function barRow(label, value, max, detail, cls = '') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-label"><span>${escapeHtml(label)}</span><span>${detail}</span></div>
    <div class="bar"><div class="${cls}" style="width:${pct}%"></div></div>
  </div>`;
}

function renderCategories(list) {
  const totals = Object.entries(spentByCategory(list)).sort((a, b) => b[1] - a[1]);
  const total = totals.reduce((acc, [, v]) => acc + v, 0);
  $('by-category').innerHTML = totals.length
    ? totals.map(([c, v]) => barRow(c, v, total, `${brl.format(v)} · ${Math.round((v / total) * 100)}%`)).join('')
    : '<p class="hint">Sem despesas neste mês.</p>';
}

function renderBudgets(list) {
  const spent = spentByCategory(list);
  const container = $('budgets');
  const focused = document.activeElement?.dataset?.budget;
  container.innerHTML = CATEGORIES.expense.map((c) => {
    const limit = state.budgets[c];
    const value = spent[c] || 0;
    let bar = '';
    if (limit > 0) {
      const ratio = value / limit;
      const cls = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
      bar = barRow('', value, limit, `${brl.format(value)} de ${brl.format(limit)}`, cls);
    }
    return `<div class="budget-row"><span>${c}</span>
      <input type="number" min="0" step="0.01" placeholder="Sem limite" data-budget="${c}" value="${limit || ''}" aria-label="Orçamento ${c}"></div>${bar}`;
  }).join('');
  if (focused) container.querySelector(`[data-budget="${focused}"]`)?.focus();
}

function renderRecurring() {
  $('recurring-list').innerHTML = state.recurring.length
    ? state.recurring.map((r) => `<li>
        <div><strong>${escapeHtml(r.desc)}</strong>
          <small>${r.type === 'income' ? 'Receita' : 'Despesa'} · ${brl.format(r.amount)} · todo dia ${r.day} · desde ${formatMonth(r.start)}</small></div>
        <button data-stop="${r.id}">Encerrar</button>
      </li>`).join('')
    : '<li class="hint">Nenhum lançamento fixo. Use “Todo mês” no formulário.</li>';
}

function renderChart() {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(currentMonth(), i - 5));
  const data = months.map((ym) => {
    const list = state.transactions.filter((t) => t.date.startsWith(ym));
    return { ym, income: sum(list, 'income'), expense: sum(list, 'expense') };
  });

  $('chart-table').innerHTML = data.map((d) =>
    `<tr><td>${formatMonth(d.ym)}</td><td>${brl.format(d.income)}</td><td>${brl.format(d.expense)}</td><td>${brl.format(d.income - d.expense)}</td></tr>`).join('');

  const chart = $('chart');
  // Desenha no tamanho real do container para o texto não escalar
  const W = Math.max(280, chart.clientWidth), H = 220, padL = 56, padB = 24, padT = 8;
  const plotW = W - padL, plotH = H - padB - padT;
  const rawMax = Math.max(...data.map((d) => Math.max(d.income, d.expense)));
  // Escala "redonda" para as linhas de grade: 1, 2 ou 5 × 10^n
  const step = rawMax > 0 ? (() => {
    const s = rawMax / 4, p = 10 ** Math.floor(Math.log10(s));
    return [1, 2, 5, 10].map((k) => k * p).find((v) => v >= s);
  })() : 250;
  const max = step * Math.ceil((rawMax || 1) / step);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

  let svg = '';
  for (let v = 0; v <= max + 1e-9; v += step) {
    svg += `<line class="${v === 0 ? 'baseline' : 'grid'}" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">R$ ${compact.format(v)}</text>`;
  }
  const groupW = plotW / data.length;
  const barW = Math.min(28, groupW * 0.3), gap = 2;
  // Barra com cantos superiores arredondados, apoiada na linha de base
  const bar = (x, v, cls) => {
    if (v <= 0) return '';
    const top = y(v), h = padT + plotH - top, r = Math.min(4, h, barW / 2);
    return `<path class="${cls}" d="M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${top + h}Z"/>`;
  };
  data.forEach((d, i) => {
    const cx = padL + groupW * i + groupW / 2;
    svg += `<rect class="hit" data-i="${i}" x="${padL + groupW * i}" y="${padT}" width="${groupW}" height="${plotH}" rx="6"/>`;
    svg += bar(cx - barW - gap / 2, d.income, 's1');
    svg += bar(cx + gap / 2, d.expense, 's2');
    svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${formatMonth(d.ym, false)}</text>`;
  });

  chart.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas dos últimos 6 meses">${svg}</svg><div class="tooltip" hidden></div>`;
  chart.querySelectorAll('path').forEach((p) => { p.style.pointerEvents = 'none'; });

  const tip = chart.querySelector('.tooltip');
  const show = (rect) => {
    const d = data[rect.dataset.i];
    chart.querySelectorAll('.hit.active').forEach((el) => el.classList.remove('active'));
    rect.classList.add('active');
    tip.innerHTML = `<b>${formatMonth(d.ym)}</b>
      <div><i class="swatch s1"></i>Receitas ${brl.format(d.income)}</div>
      <div><i class="swatch s2"></i>Despesas ${brl.format(d.expense)}</div>
      <div>Saldo ${brl.format(d.income - d.expense)}</div>`;
    tip.hidden = false;
    const box = rect.getBoundingClientRect(), host = chart.getBoundingClientRect();
    const left = box.left - host.left + box.width / 2 - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(left, host.width - tip.offsetWidth))}px`;
    tip.style.top = '0px';
  };
  chart.querySelectorAll('.hit').forEach((rect) => {
    rect.addEventListener('mouseenter', () => show(rect));
    rect.addEventListener('click', () => show(rect));
  });
  chart.querySelector('svg').addEventListener('mouseleave', () => {
    tip.hidden = true;
    chart.querySelectorAll('.hit.active').forEach((el) => el.classList.remove('active'));
  });
}

function updateRepeatFields() {
  const mode = $('repeat').value;
  $('installments-wrap').hidden = mode !== 'installments';
  const hint = $('repeat-hint');
  hint.hidden = mode === 'none';
  hint.textContent = mode === 'installments'
    ? 'Informe o valor total da compra: ele será dividido nas parcelas, uma por mês a partir da data escolhida.'
    : 'O valor será lançado automaticamente todo mês, a partir da data escolhida, até você encerrar.';
}

function resetForm() {
  $('tx-form').reset();
  $('tx-id').value = '';
  $('date').value = currentMonth() === today().slice(0, 7) ? today() : currentMonth() + '-01';
  fillCategories('expense');
  $('repeat-wrap').hidden = false;
  updateRepeatFields();
  $('form-title').textContent = 'Nova transação';
  $('submit-btn').textContent = 'Adicionar';
  $('cancel-edit').hidden = true;
}

function startEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;
  document.querySelector(`input[name="type"][value="${t.type}"]`).checked = true;
  fillCategories(t.type, t.category);
  $('tx-id').value = t.id;
  $('desc').value = t.desc;
  $('amount').value = t.amount;
  $('date').value = t.date;
  $('repeat-wrap').hidden = true;
  $('repeat').value = 'none';
  updateRepeatFields();
  $('form-title').textContent = 'Editar transação';
  $('submit-btn').textContent = 'Salvar';
  $('cancel-edit').hidden = false;
  $('desc').focus();
}

function shiftMonth(delta) {
  $('month').value = addMonths(currentMonth(), delta);
  resetForm();
  render();
}

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

// Eventos
$('tx-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = Math.round(parseFloat($('amount').value) * 100) / 100;
  if (!(amount > 0)) return;
  const editingId = $('tx-id').value;
  const tx = {
    id: editingId || newId(),
    type: selectedType(),
    desc: $('desc').value.trim(),
    amount,
    category: $('category').value,
    date: $('date').value,
  };
  const mode = editingId ? 'none' : $('repeat').value;

  if (editingId) {
    const idx = state.transactions.findIndex((t) => t.id === editingId);
    // Preserva o vínculo com parcelamento/lançamento fixo
    const { groupId, ruleId } = state.transactions[idx] || {};
    state.transactions[idx] = { ...tx, ...(groupId && { groupId }), ...(ruleId && { ruleId }) };
  } else if (mode === 'installments') {
    const n = Math.round(Number($('installments').value));
    if (!(n >= 2 && n <= 60)) { alert('Número de parcelas deve ser entre 2 e 60.'); return; }
    const cents = Math.round(amount * 100);
    const base = Math.floor(cents / n);
    if (base < 1) { alert('Valor muito baixo para esse número de parcelas.'); return; }
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
      id: tx.id, type: tx.type, desc: tx.desc, amount: tx.amount, category: tx.category,
      day: Number(tx.date.slice(8, 10)), start: tx.date.slice(0, 7), skipped: [],
    });
    materializeRecurring();
  } else {
    state.transactions.push(tx);
  }
  save();
  if (!tx.date.startsWith(currentMonth())) $('month').value = tx.date.slice(0, 7);
  resetForm();
  render();
});

document.querySelectorAll('input[name="type"]').forEach((r) =>
  r.addEventListener('change', () => fillCategories(selectedType())));

$('cancel-edit').addEventListener('click', resetForm);

$('tx-list').addEventListener('click', (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) startEdit(edit);
  if (del && confirm('Excluir esta transação?')) {
    const tx = state.transactions.find((t) => t.id === del);
    const siblings = tx?.groupId ? state.transactions.filter((t) => t.groupId === tx.groupId && t.id !== del) : [];
    const removeAll = siblings.length > 0 && confirm(`Excluir também as outras ${siblings.length} parcelas desta compra?`);
    state.transactions = state.transactions.filter((t) => t.id !== del && !(removeAll && t.groupId === tx.groupId));
    // Não recriar este mês de um lançamento fixo
    const rule = tx?.ruleId && state.recurring.find((r) => r.id === tx.ruleId);
    if (rule) rule.skipped = [...(rule.skipped || []), tx.date.slice(0, 7)];
    save();
    if ($('tx-id').value === del) resetForm();
    render();
  }
});

$('recurring-list').addEventListener('click', (e) => {
  const id = e.target.dataset.stop;
  if (!id) return;
  const rule = state.recurring.find((r) => r.id === id);
  if (!rule || !confirm(`Encerrar o lançamento fixo "${rule.desc}"? Os meses já lançados serão mantidos.`)) return;
  state.recurring = state.recurring.filter((r) => r.id !== id);
  save();
  render();
});

$('repeat').addEventListener('change', updateRepeatFields);

$('budgets').addEventListener('change', (e) => {
  const cat = e.target.dataset.budget;
  if (!cat) return;
  const v = parseFloat(e.target.value);
  if (v > 0) state.budgets[cat] = Math.round(v * 100) / 100;
  else delete state.budgets[cat];
  save();
  render();
});

$('month').addEventListener('change', () => { if (currentMonth()) { resetForm(); render(); } });
$('prev-month').addEventListener('click', () => shiftMonth(-1));
$('next-month').addEventListener('click', () => shiftMonth(1));
$('search').addEventListener('input', () => renderList(monthTransactions()));
$('filter-type').addEventListener('change', () => renderList(monthTransactions()));

$('export').addEventListener('click', () => {
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor']];
  [...state.transactions].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) =>
    rows.push([t.date, t.type === 'income' ? 'Receita' : 'Despesa', t.desc, t.category, t.amount.toFixed(2).replace('.', ',')]));
  // Separador ";" e BOM para abrir corretamente no Excel em português
  download('transacoes.csv', '﻿' + rows.map((r) => r.map(csvField).join(';')).join('\n'), 'text/csv;charset=utf-8');
});

$('backup').addEventListener('click', () =>
  download(`backup-financeiro-${today()}.json`, JSON.stringify(state, null, 2), 'application/json'));

$('restore').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const valid = Array.isArray(data.transactions) && data.transactions.every((t) =>
      t && typeof t.id === 'string' && ['income', 'expense'].includes(t.type) && typeof t.desc === 'string' &&
      typeof t.amount === 'number' && typeof t.category === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
    if (!valid) throw new Error('formato inválido');
    if (!confirm(`Substituir os dados atuais por ${data.transactions.length} transações do backup?`)) return;
    state = normalize(data);
    materializeRecurring();
    save();
    render();
  } catch {
    alert('Arquivo de backup inválido.');
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderChart, 150);
});

// Início
materializeRecurring();
$('month').value = today().slice(0, 7);
resetForm();
render();
