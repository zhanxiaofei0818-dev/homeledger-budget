// HomeLedger — router + state. All user changes persist in localStorage
// (key homeledger-v1) and are merged onto the demo data on load.
import { DATA } from './data.js';
import { viewDashboard, viewTransactions, viewBudget, viewBills, viewGoals, viewReports, viewHousehold } from './views.js';

const KEY = 'homeledger-v1';
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
    bills: DATA.bills.map((b) => ({ ...b })),
    goals: DATA.goals.map((g) => ({ ...g })),
    budgets: Object.fromEntries(DATA.categories.map((c) => [c.id, c.budget])),
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.transactions)) base.transactions = saved.transactions;
    if (Array.isArray(saved.bills)) base.bills = saved.bills;
    if (Array.isArray(saved.goals)) base.goals = saved.goals;
    if (saved.budgets) base.budgets = { ...base.budgets, ...saved.budgets };
    return base;
  } catch {
    return base;
  }
}

function saveState(S) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      transactions: S.transactions,
      bills: S.bills,
      goals: S.goals,
      budgets: S.budgets,
    }));
  } catch { /* private mode: changes still work for this visit */ }
}

// Apply saved budget overrides onto the shared category list for this render.
function categoriesWithBudgets(S) {
  return DATA.categories.map((c) => ({ ...c, budget: S.budgets[c.id] ?? c.budget }));
}

const S = loadState();
const ui = { filter: 'all', q: '' };

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('/')[0] || '';
}

function render() {
  const route = currentRoute();
  const view = ROUTES[route] || viewDashboard;
  // Views read DATA.categories for budgets; swap in saved budgets first.
  const savedCats = DATA.categories;
  DATA.categories = categoriesWithBudgets(S);
  try {
    document.getElementById('app').innerHTML = view(S, ui);
  } finally {
    DATA.categories = savedCats;
  }
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', (a.dataset.route || '') === route);
  });
  wire(route);
  window.scrollTo(0, 0);
}

function buildCSV() {
  const head = '日期,商家,分类,备注,金额\n';
  const catName = (id) => DATA.categories.find((c) => c.id === id).name;
  const lines = [...S.transactions].sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((t) => `${t.date},${t.merchant},${catName(t.category)},${t.note},${t.amount}`).join('\n');
  return head + lines;
}

function wire(route) {
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
      S.transactions.push({
        id: 'u' + Date.now(),
        date: fd.get('date'),
        merchant: String(fd.get('merchant')).trim(),
        category: fd.get('category'),
        amount,
        note: '手动记账',
      });
      saveState(S);
      ui.filter = 'all'; ui.q = '';
      render();
      document.getElementById('add-msg').textContent = '已记下 ✓ 总览、预算和报表都已更新。';
    });
    document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      S.transactions = S.transactions.filter((t) => t.id !== b.dataset.del);
      saveState(S);
      render();
    }));
  }
  if (route === 'budget') {
    document.querySelectorAll('[data-save-budget]').forEach((b) => b.addEventListener('click', () => {
      const input = document.querySelector(`[data-budget="${b.dataset.saveBudget}"]`);
      const v = Math.round(Number(input.value));
      if (Number.isFinite(v) && v >= 0) {
        S.budgets[b.dataset.saveBudget] = v;
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
    document.getElementById('btn-csv')?.addEventListener('click', () => {
      const blob = new Blob(['\ufeff' + buildCSV()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'homeledger-2026-11-transactions.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  }
  if (route === 'household') {
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      localStorage.removeItem(KEY);
      const fresh = loadState();
      S.transactions = fresh.transactions;
      S.bills = fresh.bills;
      S.goals = fresh.goals;
      S.budgets = fresh.budgets;
      render();
      document.getElementById('reset-msg').textContent = '已恢复最初的 11 月演示数据。';
    });
  }
}

window.addEventListener('hashchange', render);
render();
