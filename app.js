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
    if (data && Array.isArray(data.transactions)) {
      return { transactions: data.transactions, budgets: data.budgets || {} };
    }
  } catch { /* storage indisponível ou corrompido */ }
  return { transactions: [], budgets: {} };
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
    return `<li>
      <div class="tx-info"><strong>${escapeHtml(t.desc)}</strong><small>${d}/${m}/${y} · ${escapeHtml(t.category)}</small></div>
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

function resetForm() {
  $('tx-form').reset();
  $('tx-id').value = '';
  $('date').value = currentMonth() === today().slice(0, 7) ? today() : currentMonth() + '-01';
  fillCategories('expense');
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
  $('form-title').textContent = 'Editar transação';
  $('submit-btn').textContent = 'Salvar';
  $('cancel-edit').hidden = false;
  $('desc').focus();
}

function shiftMonth(delta) {
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  $('month').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const tx = {
    id: $('tx-id').value || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: selectedType(),
    desc: $('desc').value.trim(),
    amount,
    category: $('category').value,
    date: $('date').value,
  };
  const idx = state.transactions.findIndex((t) => t.id === tx.id);
  if (idx >= 0) state.transactions[idx] = tx;
  else state.transactions.push(tx);
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
    state.transactions = state.transactions.filter((t) => t.id !== del);
    save();
    if ($('tx-id').value === del) resetForm();
    render();
  }
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
    state = { transactions: data.transactions, budgets: data.budgets || {} };
    save();
    render();
  } catch {
    alert('Arquivo de backup inválido.');
  }
});

// Início
$('month').value = today().slice(0, 7);
resetForm();
render();
