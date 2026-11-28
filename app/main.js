// HomeLedger — router + state. All user changes persist in localStorage
// (key homeledger-v2) and are merged onto the demo data on load.
// Month switching is part of the URL: #/budget?month=2026-10 opens October.
import { DATA } from './data.js';
import { viewDashboard, viewTransactions, viewBudget, viewBills, viewGoals, viewReports, viewHousehold, monthTotals, txnsFor, incomeFor } from './views.js';

const KEY = 'homeledger-v2';
const ROUTES = {
  '': viewDashboard,
  transactions: viewTransactions,
  budget: viewBudget,
  bills: viewBills,
  goals: viewGoals,
  reports: viewReports,
  household: viewHousehold,
};

function loadState() {
  const base = {
    transactions: DATA.transactions.map((t) => ({ ...t })),
    income: DATA.income.map((t) => ({ ...t })),
    txnsByMonth: Object.fromEntries(Object.entries(DATA.transactionsByMonth).map(([k, v]) => [k, v.map((t) => ({ ...t })) ])),
    incomeByMonth: Object.fromEntries(Object.entries(DATA.incomeByMonth).map(([k, v]) => [k, v.map((t) => ({ ...t })) ])),
    bills: DATA.bills.map((b) => ({ ...b })),
    goals: DATA.goals.map((g) => ({ ...g })),
    budgetsByMonth: {},
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (saved.txnsByMonth) for (const k of Object.keys(saved.txnsByMonth)) {
      if (Array.isArray(saved.txnsByMonth[k])) {
        if (k === '2026-11') base.transactions = saved.txnsByMonth[k];
        else base.txnsByMonth[k] = saved.txnsByMonth[k];
      }
    }
    if (Array.isArray(saved.transactions)) base.transactions = saved.transactions;
    if (Array.isArray(saved.bills)) base.bills = saved.bills;
    if (Array.isArray(saved.goals)) base.goals = saved.goals;
    if (saved.budgetsByMonth) base.budgetsByMonth = saved.budgetsByMonth;
    // v1 saved shape: budgets were one flat map for November.
    if (saved.budgets) base.budgetsByMonth['2026-11'] = { ...base.budgetsByMonth['2026-11'], ...saved.budgets };
    return base;
  } catch {
    return base;
  }
}

function saveState(S) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      txnsByMonth: { ...S.txnsByMonth, '2026-11': S.transactions },
      incomeByMonth: S.incomeByMonth,
      bills: S.bills,
      goals: S.goals,
      budgetsByMonth: S.budgetsByMonth,
    }));
  } catch { /* private mode: changes still work for this visit */ }
}

const S = loadState();
const ui = { filter: 'all', q: '', month: '2026-11' };

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const params = new URLSearchParams(query || '');
  const route = (path || '').split('/')[0] || '';
  const month = params.get('month');
  return { route, month: DATA.months.some((m) => m.key === month) ? month : '2026-11' };
}

function render() {
  const { route, month } = parseHash();
  ui.month = month;
  const view = ROUTES[route] || viewDashboard;
  document.getElementById('app').innerHTML = view(S, ui);
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', (a.dataset.route || '') === route);
  });
  wire(route, month);
  window.scrollTo(0, 0);
}

function buildCSV(month) {
  const head = '日期,商家,分类,备注,金额\n';
  const catName = (id) => DATA.categories.find((c) => c.id === id).name;
  const lines = [...txnsFor(S, month)].sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((t) => `${t.date},${t.merchant},${catName(t.category)},${t.note},${t.amount}`).join('\n');
  return head + lines;
}

function buildCSVAll() {
  const head = '月份,日期,商家,分类,备注,金额\n';
  const catName = (id) => DATA.categories.find((c) => c.id === id).name;
  const lines = [];
  for (const m of DATA.months) {
    for (const t of [...txnsFor(S, m.key)].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      lines.push(`${m.key},${t.date},${t.merchant},${catName(t.category)},${t.note},${t.amount}`);
    }
  }
  return head + lines.join('\n');
}

function downloadCSV(name, text) {
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function wire(route, month) {
  if (route === 'transactions') {
    const q = document.getElementById('q');
    const fcat = document.getElementById('fcat');
    if (q) q.addEventListener('input', () => { ui.q = q.value; render(); const nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    if (fcat) fcat.addEventListener('change', () => { ui.filter = fcat.value; render(); });
    document.getElementById('btn-clear')?.addEventListener('click', () => { ui.q = ''; ui.filter = 'all'; render(); });
    document.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { ui.filter = b.dataset.cat; render(); }));
    document.getElementById('add-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amount = Math.round(Number(fd.get('amount')));
      if (!amount || amount <= 0) return;
      const txn = {
        id: 'u' + Date.now(),
        date: fd.get('date'),
        merchant: String(fd.get('merchant')).trim(),
        category: fd.get('category'),
        amount,
        note: '手动记账',
      };
      if (month === '2026-11') S.transactions.push(txn);
      else S.txnsByMonth[month].push(txn);
      saveState(S);
      ui.filter = 'all'; ui.q = '';
      render();
      document.getElementById('add-msg').textContent = '已记下 ✓ 总览、预算和报表都已更新。';
    });
    document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.month || '2026-11';
      if (m === '2026-11') S.transactions = S.transactions.filter((t) => t.id !== b.dataset.del);
      else S.txnsByMonth[m] = S.txnsByMonth[m].filter((t) => t.id !== b.dataset.del);
      saveState(S);
      render();
    }));
  }
  if (route === 'budget') {
    document.querySelectorAll('[data-save-budget]').forEach((b) => b.addEventListener('click', () => {
      const input = document.querySelector(`[data-budget="${b.dataset.saveBudget}"]`);
      const v = Math.round(Number(input.value));
      if (Number.isFinite(v) && v >= 0) {
        if (!S.budgetsByMonth[month]) S.budgetsByMonth[month] = {};
        S.budgetsByMonth[month][b.dataset.saveBudget] = v;
        saveState(S);
        render();
      }
    }));
  }
  if (route === 'bills') {
    document.querySelectorAll('[data-bill]').forEach((b) => b.addEventListener('click', () => {
      const bill = S.bills.find((x) => x.id === b.dataset.bill);
      if (bill) { bill.paid = !bill.paid; saveState(S); render(); }
    }));
  }
  if (route === 'goals') {
    document.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
      const goal = S.goals.find((x) => x.id === b.dataset.goal);
      if (goal) {
        goal.saved = Math.min(goal.target, goal.saved + Number(b.dataset.amount));
        saveState(S);
        render();
      }
    }));
  }
  if (route === 'reports') {
    document.getElementById('btn-csv')?.addEventListener('click', () => downloadCSV('homeledger-2026-11-transactions.csv', buildCSV('2026-11')));
    document.getElementById('btn-csv-all')?.addEventListener('click', () => downloadCSV('homeledger-2026-09-11-transactions.csv', buildCSVAll()));
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  }
  if (route === 'household') {
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      localStorage.removeItem(KEY);
      const fresh = loadState();
      S.transactions = fresh.transactions;
      S.income = fresh.income;
      S.txnsByMonth = fresh.txnsByMonth;
      S.incomeByMonth = fresh.incomeByMonth;
      S.bills = fresh.bills;
      S.goals = fresh.goals;
      S.budgetsByMonth = fresh.budgetsByMonth;
      render();
      document.getElementById('reset-msg').textContent = '已恢复最初的 9–11 月演示数据。';
    });
  }
}

window.addEventListener('hashchange', render);
render();
