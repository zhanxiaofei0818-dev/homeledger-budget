// HomeLedger views — every number is computed from DATA + saved state.
// Month switching is real: Sep and Oct have their own transaction rows,
// income rows and budgets, so the dashboard, budget and reports views all
// show a true comparison across the three months.
import { DATA } from './data.js';

const TODAY = '2026-11-26';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fmt(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }

export function monthInfo(key) {
  return DATA.months.find((m) => m.key === key) || DATA.months[2];
}

export function txnsFor(S, month) {
  return month === '2026-11' ? S.transactions : S.txnsByMonth[month];
}

export function incomeFor(S, month) {
  return month === '2026-11' ? S.income : S.incomeByMonth[month];
}

export function budgetsFor(S, month) {
  const base = DATA.monthBudgets[month];
  const saved = S.budgetsByMonth[month] || {};
  return { ...base, ...saved };
}

export function monthTotals(S, month) {
  const txns = txnsFor(S, month);
  const inc = incomeFor(S, month);
  const budgets = budgetsFor(S, month);
  const income = inc.reduce((a, b) => a + b.amount, 0);
  const spent = txns.reduce((a, b) => a + b.amount, 0);
  const catActual = {};
  for (const c of DATA.categories) catActual[c.id] = 0;
  for (const t of txns) catActual[t.category] = (catActual[t.category] || 0) + t.amount;
  const plannedSpend = Object.values(budgets).reduce((a, b) => a + b, 0);
  const over = DATA.categories
    .filter((c) => catActual[c.id] > budgets[c.id])
    .map((c) => ({ cat: c, actual: catActual[c.id], budget: budgets[c.id], by: catActual[c.id] - budgets[c.id] }));
  const info = monthInfo(month);
  return {
    month, info, income, spent, saved: income - spent,
    rate: (income - spent) / income, plannedSpend,
    remaining: plannedSpend - spent, catActual, budgets, over,
    days: info.days, cutoff: info.cutoff || info.days, count: txns.length,
  };
}

// Back-compat: totals(S) is the current (November) month.
export function totals(S) { return monthTotals(S, '2026-11'); }

function daysUntil(d) {
  const ms = new Date(d + 'T00:00:00') - new Date(TODAY + 'T00:00:00');
  return Math.round(ms / 86400000);
}

function monthSwitcher(route, ui) {
  return `<div class="chiprow" role="group" aria-label="切换月份">
    ${DATA.months.map((m) => `<a class="chip ${ui.month === m.key ? 'on' : ''}" href="#/${route}${route ? '?' : '?'}month=${m.key}">${m.label}${ui.month === m.key ? ' · 在看' : ''}</a>`).join('')}
    <span class="sub">9 月和 10 月也是真实记账，不是估算数。</span>
  </div>`;
}

function overBanner(T) {
  if (!T.over.length) {
    return `<div class="callout"><strong>${T.info.label}没有超支的分类 ✓</strong> 8 个分类都在预算内，计划支出 ${fmt(T.plannedSpend)}，还剩 ${fmt(T.remaining)}。</div>`;
  }
  return `<div class="callout warn"><strong>${T.info.label}有 ${T.over.length} 个分类超支：</strong>${T.over.map((o) => `${o.cat.name}超了 ${fmt(o.by)}（花了 ${fmt(o.actual)}，预算 ${fmt(o.budget)}）`).join('、')}。超的部分下个月从“其他”里扣，不动储蓄目标。</div>`;
}

function catBar(c, actual, budget) {
  const pct = Math.min(100, Math.round((actual / budget) * 100));
  const over = actual > budget;
  return `<div class="bar-row">
    <div><span class="cat-ico" style="background:${c.color}">${c.icon}</span>${c.name} <span class="sub">${c.nameEn}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${over ? 'var(--red)' : c.color}"></div></div>
    <div class="bar-vals num"><b>${fmt(actual)}</b> / ${fmt(budget)} ${over ? '<span class="pill over">超支 ' + fmt(actual - budget) + '</span>' : `<span class="pill ${pct >= 90 ? 'soon' : 'good'}">${pct}%</span>`}</div>
  </div>`;
}

function cashflowSVG(S, month, T) {
  const txns = txnsFor(S, month);
  const byDay = {};
  for (const t of txns) byDay[t.date] = (byDay[t.date] || 0) + t.amount;
  const days = T.days, cutoff = T.cutoff;
  const pts = [];
  let cum = 0;
  for (let d = 1; d <= cutoff; d++) {
    const key = month + '-' + String(d).padStart(2, '0');
    cum += byDay[key] || 0;
    pts.push([d, cum]);
  }
  const W = 640, H = 190, padL = 46, padB = 22, padT = 12;
  const maxV = Math.max(26000, Math.ceil((T.spent * 1.1) / 5000) * 5000);
  const X = (d) => padL + ((d - 1) / (days - 1)) * (W - padL - 12);
  const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = pts.map(([d, v], i) => (i ? 'L' : 'M') + X(d).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  const pace = (T.plannedSpend / days) * cutoff;
  const paceY = Y(pace);
  const grid = [0, 10000, 20000].map((v) => `<line x1="${padL}" y1="${Y(v)}" x2="${W - 12}" y2="${Y(v)}" stroke="#eee7d8"/><text x="6" y="${Y(v) + 4}" font-size="11" fill="#6f7a6a">¥${(v / 1000).toFixed(0)}k</text>`).join('');
  const dayMarks = [1, 5, 10, 15, 20, cutoff].filter((v, i, a) => a.indexOf(v) === i);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${T.info.label}累计支出曲线">
    ${grid}
    <line x1="${padL}" y1="${paceY}" x2="${W - 12}" y2="${paceY}" stroke="#b7791f" stroke-dasharray="5 4"/>
    <text x="${padL + 4}" y="${paceY - 6}" font-size="11" fill="#b7791f">预算进度线 ${fmt(pace)}</text>
    <path d="${line} L${X(cutoff).toFixed(1)},${Y(0)} L${X(1).toFixed(1)},${Y(0)} Z" fill="rgba(47,125,79,.10)"/>
    <path d="${line}" fill="none" stroke="#2f7d4f" stroke-width="2.5"/>
    <circle cx="${X(cutoff)}" cy="${Y(pts[pts.length - 1][1])}" r="4.5" fill="#2f7d4f"/>
    <text x="${X(cutoff) - 4}" y="${Y(pts[pts.length - 1][1]) - 10}" font-size="12" font-weight="700" fill="#2f7d4f" text-anchor="end">${fmt(T.spent)} · ${cutoff} 日</text>
    ${dayMarks.map((d) => `<text x="${X(d)}" y="${H - 6}" font-size="11" fill="#6f7a6a" text-anchor="middle">${d}日</text>`).join('')}
  </svg>`;
}

function monthBarsSVG(rows) {
  // rows: [{label, income, spent}]
  const W = 640, H = 210, padL = 46, padB = 24, padT = 14;
  const maxV = 32000;
  const bw = 34, gap = 26;
  const X = (i) => padL + 30 + i * (bw * 2 + gap + 46);
  const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const grid = [0, 10000, 20000, 30000].map((v) => `<line x1="${padL}" y1="${Y(v)}" x2="${W - 10}" y2="${Y(v)}" stroke="#eee7d8"/><text x="4" y="${Y(v) + 4}" font-size="11" fill="#6f7a6a">¥${(v / 1000).toFixed(0)}k</text>`).join('');
  const bars = rows.map((r, i) => `
    <rect x="${X(i)}" y="${Y(r.income)}" width="${bw}" height="${H - padB - Y(r.income)}" rx="4" fill="#2f7d4f"/>
    <rect x="${X(i) + bw + 4}" y="${Y(r.spent)}" width="${bw}" height="${H - padB - Y(r.spent)}" rx="4" fill="#e07856"/>
    <text x="${X(i) + bw}" y="${H - 8}" font-size="12" fill="#22301f" text-anchor="middle">${r.label}</text>
    <text x="${X(i) + bw}" y="${Y(r.income) - 5}" font-size="11" fill="#2f7d4f" text-anchor="middle">${fmt(r.income)}</text>
    <text x="${X(i) + bw}" y="${Y(r.spent) - 5}" font-size="11" fill="#c0392b" text-anchor="middle">${fmt(r.spent)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="近三个月收支对比">
    ${grid}${bars}
  </svg>
  <div class="legend"><span><i style="background:#2f7d4f"></i>收入</span><span><i style="background:#e07856"></i>支出</span></div>`;
}

function trendSVG(catByMonth) {
  // Grouped bars per category: Sep / Oct / Nov, all computed from real rows.
  const W = 640, H = 220, padL = 46, padB = 24, padT = 14;
  const maxV = 7000;
  const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const colW = (W - padL - 16) / DATA.categories.length;
  const grid = [0, 2500, 5000].map((v) => `<line x1="${padL}" y1="${Y(v)}" x2="${W - 10}" y2="${Y(v)}" stroke="#eee7d8"/><text x="4" y="${Y(v) + 4}" font-size="11" fill="#6f7a6a">¥${(v / 1000).toFixed(1)}k</text>`).join('');
  const cols = ['#c9d8cc', '#8fb996', '#2f7d4f'];
  const bars = DATA.categories.map((c, i) => {
    const vals = catByMonth.map((m) => m[c.id] || 0);
    return vals.map((v, j) => {
      const x = padL + 8 + i * colW + j * ((colW - 16) / 3);
      return `<rect x="${x.toFixed(1)}" y="${Y(v)}" width="${((colW - 16) / 3 - 2).toFixed(1)}" height="${(H - padB - Y(v)).toFixed(1)}" rx="2" fill="${cols[j]}"/>`;
    }).join('');
  }).join('');
  const labels = DATA.categories.map((c, i) => `<text x="${(padL + 8 + i * colW + colW / 2 - 8).toFixed(1)}" y="${H - 8}" font-size="11.5" fill="#22301f" text-anchor="middle">${c.name}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="分类支出三月趋势">
    ${grid}${bars}${labels}
  </svg>
  <div class="legend"><span><i style="background:#c9d8cc"></i>9 月</span><span><i style="background:#8fb996"></i>10 月</span><span><i style="background:#2f7d4f"></i>11 月</span></div>`;
}

export function viewDashboard(S, ui) {
  const month = ui.month || '2026-11';
  const T = monthTotals(S, month);
  const all = DATA.months.map((m) => monthTotals(S, m.key));
  const txns = txnsFor(S, month);
  const recent = [...txns].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const upcoming = S.bills.filter((b) => !b.paid && daysUntil(b.due) >= 0).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, 4);
  const catRows = DATA.categories.map((c) => catBar(c, T.catActual[c.id], T.budgets[c.id])).join('');
  const topGoal = S.goals[0];
  const sideIncome = T.income - 24000;
  const topCats = [...DATA.categories].sort((a, b) => T.catActual[b.id] - T.catActual[a.id]).slice(0, 3);
  const isCurrent = month === '2026-11';
  const periodNote = isCurrent
    ? `本月已过 26 天：收入到账 ${fmt(T.income)}，花了 ${fmt(T.spent)}，计划结余 ¥3,500，实际已结余 ${fmt(T.saved)}。`
    : `整月已结束：收入 ${fmt(T.income)}，花了 ${fmt(T.spent)}，结余 ${fmt(T.saved)}，储蓄率 ${(T.rate * 100).toFixed(1)}%。点上面切换回 11 月。`;
  return `
  <h1>${T.info.label}总览 <span class="sub">陈家 · 2 大人 2 小孩 · 数据截至 ${isCurrent ? '11 月 26 日' : T.info.label + T.days + ' 日'}</span></h1>
  ${monthSwitcher('', ui)}
  <p class="sub">${periodNote}</p>
  ${overBanner(T)}
  <div class="grid g4" style="margin-top:16px">
    <div class="card stat"><div class="label">${T.info.label}收入</div><div class="big num">${fmt(T.income)}</div><div class="note">工资 ¥24,000 ＋ 兼职 ${fmt(sideIncome)}</div></div>
    <div class="card stat"><div class="label">${T.info.label}已花</div><div class="big num">${fmt(T.spent)}</div><div class="note">共 ${T.count} 笔支出</div></div>
    <div class="card stat good"><div class="label">已结余</div><div class="big num">${fmt(T.saved)}</div><div class="note">储蓄率 ${(T.rate * 100).toFixed(1)}% · 目标 ¥3,500${T.saved >= 3500 ? '已超额' : '未达标'}</div></div>
    <div class="card stat ${T.over.length ? 'warn' : ''}"><div class="label">预算还剩</div><div class="big num">${fmt(T.remaining)}</div><div class="note">计划支出 ${fmt(T.plannedSpend)}${T.over.length ? ` · ${T.over.length} 个分类超支` : ' · 全部在预算内'}</div></div>
  </div>
  <div class="grid g32" style="margin-top:16px">
    <div class="card"><h2>支出曲线 <span class="sub">累计支出 vs 预算进度</span></h2>${cashflowSVG(S, month, T)}
      <p class="foot-note">${T.cutoff} 日累计 ${fmt(T.spent)}，预算进度线是 ${fmt((T.plannedSpend / T.days) * T.cutoff)}：${T.spent > (T.plannedSpend / T.days) * T.cutoff ? '花得比计划略快，剩下的日子收着点花。' : '花得比计划慢，预算还剩 ' + fmt(T.remaining) + '，很稳。'}</p></div>
    <div class="card"><h2>储蓄目标 <span class="more"><a href="#/goals">全部目标 →</a></span></h2>
      <div class="goal-head"><div><strong>${esc(topGoal.name)}</strong><div class="sub">${esc(topGoal.note)}</div></div><div class="goal-pct num">${Math.round((topGoal.saved / topGoal.target) * 100)}%</div></div>
      <div class="progress" style="margin:10px 0 6px"><i style="width:${Math.min(100, (topGoal.saved / topGoal.target) * 100)}%"></i></div>
      <div class="sub num">${fmt(topGoal.saved)} / ${fmt(topGoal.target)}</div>
      <hr style="border:0;border-top:1px dashed var(--line);margin:14px 0">
      ${isCurrent ? `<h3>未来 7 天待付账单</h3>
      ${upcoming.map((b) => `<div class="rowline"><div><strong>${esc(b.name)}</strong><div class="bill-due">${b.due} 到期 · ${esc(b.cycle)}</div></div><div class="num"><b>${fmt(b.amount)}</b> <span class="pill soon">${daysUntil(b.due) === 0 ? '今天' : daysUntil(b.due) + ' 天后'}</span></div></div>`).join('')}
      <p style="margin-top:10px"><a href="#/bills">查看全部 12 笔账单 →</a></p>` : `<h3>${T.info.label}花得最多的分类</h3>
      ${topCats.map((c, i) => `<div class="rowline"><div><span class="cat-ico" style="background:${c.color}">${c.icon}</span><strong>${c.name}</strong></div><div class="num"><b>${fmt(T.catActual[c.id])}</b> <span class="sub">占支出 ${(100 * T.catActual[c.id] / T.spent).toFixed(1)}%</span></div></div>`).join('')}
      <p style="margin-top:10px"><a href="#/reports">看三个月对比报表 →</a></p>`}
    </div>
  </div>
  <div class="grid g23" style="margin-top:16px">
    <div class="card"><h2>分类预算执行 <span class="more"><a href="#/budget?month=${month}">调整预算 →</a></span></h2>${catRows}</div>
    <div class="card"><h2>最近支出 <span class="more"><a href="#/transactions?month=${month}">全部记账 →</a></span></h2>
      ${recent.map((t) => {
        const c = DATA.categories.find((x) => x.id === t.category);
        return `<div class="rowline"><div><span class="cat-ico" style="background:${c.color}">${c.icon}</span><strong>${esc(t.merchant)}</strong> <span class="txn-note">${esc(t.note)}</span><div class="bill-due">${t.date.slice(5)} · ${c.name}</div></div><div class="num"><b>−${fmt(t.amount)}</b></div></div>`;
      }).join('')}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>三个月一览 <span class="more"><a href="#/reports">完整报表 →</a></span></h2>
    <div class="scroll-x"><table><thead><tr><th>月份</th><th class="amt">收入</th><th class="amt">支出</th><th class="amt">结余</th><th class="amt">储蓄率</th><th class="amt">超支分类</th></tr></thead><tbody>
    ${all.map((m) => `<tr><td><strong>${m.info.label}</strong> <span class="sub">${m.count} 笔</span></td><td class="amt num">${fmt(m.income)}</td><td class="amt num">${fmt(m.spent)}</td><td class="amt num"><b>${fmt(m.saved)}</b></td><td class="amt num">${(m.rate * 100).toFixed(1)}%</td><td class="amt">${m.over.length ? '<span class="pill over">' + m.over.map((o) => o.cat.name).join('、') + '超支</span>' : '<span class="pill good">无</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="foot-note">三个月共 ${all.reduce((a, m) => a + m.count, 0)} 笔支出，合计 ${fmt(all.reduce((a, m) => a + m.spent, 0))}；储蓄率从 9 月的 ${(all[0].rate * 100).toFixed(1)}% 降到 11 月的 ${(all[2].rate * 100).toFixed(1)}%，主要是孩子类和餐饮支出在涨。</p>
  </div>`;
}

export function viewTransactions(S, ui) {
  const month = ui.month || '2026-11';
  const T = monthTotals(S, month);
  const txns = txnsFor(S, month);
  const info = monthInfo(month);
  const cats = DATA.categories;
  const q = (ui.q || '').trim();
  const f = ui.filter || 'all';
  let rows = [...txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount));
  if (f !== 'all') rows = rows.filter((t) => t.category === f);
  if (q) rows = rows.filter((t) => (t.merchant + t.note).includes(q));
  const sum = rows.reduce((a, b) => a + b.amount, 0);
  const defaultDate = month === '2026-11' ? '2026-11-26' : month + '-' + String(info.days).padStart(2, '0');
  return `
  <h1>记账 <span class="sub">${T.info.label}共 ${T.count} 笔支出 · 合计 ${fmt(T.spent)}</span></h1>
  ${monthSwitcher('transactions', ui)}
  <div class="toolbar">
    <div class="field"><label>搜索商家或备注</label><input id="q" type="search" placeholder="例如：超市、加油、钢琴" value="${esc(ui.q || '')}"></div>
    <div class="field"><label>分类筛选</label><select id="fcat">
      <option value="all">全部分类</option>
      ${cats.map((c) => `<option value="${c.id}" ${f === c.id ? 'selected' : ''}>${c.name} ${c.nameEn}</option>`).join('')}
    </select></div>
    <button class="btn ghost" id="btn-clear">清空筛选</button>
  </div>
  <div class="chiprow" role="group" aria-label="快捷分类">
    <button class="chip ${f === 'all' ? 'on' : ''}" data-cat="all">全部 ${txns.length}</button>
    ${cats.map((c) => `<button class="chip ${f === c.id ? 'on' : ''}" data-cat="${c.id}">${c.name} ${T.catActual[c.id] ? fmt(T.catActual[c.id]) : ''}</button>`).join('')}
  </div>
  <div class="card">
    <h2>记一笔 <span class="sub">保存后立即计入总览、预算与报表（${T.info.label}）</span></h2>
    <form id="add-form" class="form-grid">
      <div><label>日期</label><input name="date" type="date" value="${defaultDate}" min="${month}-01" max="${month}-${String(info.days).padStart(2, '0')}" required></div>
      <div><label>商家</label><input name="merchant" type="text" placeholder="例如：永辉超市" required maxlength="20"></div>
      <div><label>分类</label><select name="category">${cats.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
      <div><label>金额（¥）</label><input name="amount" type="number" min="1" max="100000" step="1" placeholder="0" required></div>
      <button class="btn" type="submit">记下这笔</button>
    </form>
    <p class="foot-note" id="add-msg">新记的账会保存在本机浏览器，刷新还在；点“家庭 → 恢复演示数据”可清空。</p>
  </div>
  <div class="card" style="margin-top:16px">
    <h2>明细 <span class="sub">${rows.length} 笔 · 小计 ${fmt(sum)}</span></h2>
    ${rows.length ? `<table><thead><tr><th>日期</th><th>商家 / 备注</th><th>分类</th><th class="amt">金额</th><th></th></tr></thead><tbody>
    ${rows.map((t) => {
      const c = DATA.categories.find((x) => x.id === t.category);
      return `<tr><td class="mono">${t.date.slice(5)}</td><td><strong>${esc(t.merchant)}</strong><div class="txn-note">${esc(t.note)}</div></td><td><span class="cat-ico" style="background:${c.color}">${c.icon}</span>${c.name}</td><td class="amt num"><b>−${fmt(t.amount)}</b></td><td><button class="btn danger small" data-del="${t.id}" data-month="${month}">删除</button></td></tr>`;
    }).join('')}</tbody></table>` : '<p class="empty">没有符合条件的记录，换个关键词或分类试试。</p>'}
  </div>`;
}

export function viewBudget(S, ui) {
  const month = ui.month || '2026-11';
  const T = monthTotals(S, month);
  const overTotal = T.over.reduce((a, o) => a + o.by, 0);
  const under = DATA.categories.filter((c) => T.catActual[c.id] <= T.budgets[c.id])
    .sort((a, b) => (T.budgets[b.id] - T.catActual[b.id]) - (T.budgets[a.id] - T.catActual[a.id]));
  const mostOver = T.over.length ? [...T.over].sort((a, b) => b.by - a.by)[0] : null;
  return `
  <h1>月度预算 <span class="sub">${T.info.label}计划支出 ${fmt(T.plannedSpend)} · 已花 ${fmt(T.spent)} · 还剩 ${fmt(T.remaining)}</span></h1>
  ${monthSwitcher('budget', ui)}
  <p class="sub">每月 1 日定预算：工资到账日（5 日）前先把房租、学费这些固定项留出来，剩下的按分类分。改动立即保存到本机，并同步到总览和报表。</p>
  ${overBanner(T)}
  <div class="card" style="margin-top:16px"><h2>各分类预算 vs 实际 <span class="sub">超支的分类会标红</span></h2>
  ${DATA.categories.map((c) => {
    const actual = T.catActual[c.id];
    const budget = T.budgets[c.id];
    const left = budget - actual;
    const pct = Math.min(100, Math.round((actual / budget) * 100));
    return `<div class="bar-row" style="grid-template-columns:92px 1fr 150px 150px">
      <div><span class="cat-ico" style="background:${c.color}">${c.icon}</span>${c.name}</div>
      <div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${actual > budget ? 'var(--red)' : c.color}"></div></div>
      <div class="sub" style="margin-top:4px">${actual > budget ? '已超支 ' + fmt(-left) + ' · 超了 ' + Math.round(((actual / budget) - 1) * 100) + '%' : '还剩 ' + fmt(left) + ' · 已用 ' + pct + '%'}</div></div>
      <div class="bar-vals num"><b>${fmt(actual)}</b> / ${fmt(budget)}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end"><input type="number" min="0" max="20000" step="50" value="${budget}" data-budget="${c.id}" aria-label="${c.name}预算" style="width:110px;padding:7px 9px"><button class="btn small" data-save-budget="${c.id}">保存</button></div>
    </div>`;
  }).join('')}
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>预算怎么定的</h2>
      <dl class="kv"><dt>固定支出</dt><dd>房租 ¥6,500 ＋ 学费 ¥2,800 ＋ 宽带话费 ¥357，每月雷打不动。</dd>
      <dt>吃饭</dt><dd>按每周一次大采购 ¥450 ＋ 每天早餐、午餐算，¥4,800 封顶。</dd>
      <dt>结余目标</dt><dd>先存 ¥3,500 再花：发薪日当天自动转入应急基金。</dd>
      <dt>超支处理</dt><dd>哪个分类超了，下个月就从“其他”里扣，不动储蓄目标。</dd></dl></div>
    <div class="card"><h2>${T.info.label}执行情况</h2>
      ${T.over.length
        ? `<p><strong>${T.over.length} 个分类超支，共超 ${fmt(overTotal)}。</strong>${mostOver ? `最严重的是<strong>${mostOver.cat.name}</strong>，超了 ${fmt(mostOver.by)}。` : ''}</p>
           <p>${month === '2026-09' ? '9 月餐饮预算只给了 ¥4,000，开学季聚餐多，花了 ¥4,150；其他类 ¥2,000 的预算也被秋装采购冲到 ¥2,280。10 月起餐饮预算调回 ¥4,800、其他调到 ¥3,500，就没再超。' : ''}
           ${month === '2026-10' ? '10 月健康预算 ¥800 没留够：体检 ¥186 ＋ 维生素 ¥325 就占了一大半，花了 ¥940；娱乐预算 ¥900 也被国庆档的音乐会和电影顶到 ¥1,050。11 月两项都调高了，目前都在预算内。' : ''}</p>`
        : `<p>8 个分类全部在预算内，没有超支。花得最满的是<strong>住房</strong>（100%，房租固定）和<strong>水电</strong>（95%）；最省的是<strong>健康</strong>（72%），健身房月卡 11 月 17 日才办。</p>
           <p>按目前速度，11 月底预计结余 <strong class="num">${fmt(T.saved)}</strong>，储蓄率 ${(T.rate * 100).toFixed(1)}%，高于家庭目标的 12.3%。</p>`}
      <p>最省的分类是<strong>${under[0].name}</strong>，还剩 ${fmt(T.budgets[under[0].id] - T.catActual[under[0].id])}。</p>
      <p><a href="#/reports">看 9–11 月对比报表 →</a></p></div>
  </div>`;
}

export function viewBills(S) {
  const unpaid = S.bills.filter((b) => !b.paid);
  const paidSum = S.bills.filter((b) => b.paid).reduce((a, b) => a + b.amount, 0);
  const unpaidSum = unpaid.reduce((a, b) => a + b.amount, 0);
  const sorted = [...S.bills].sort((a, b) => (a.due < b.due ? -1 : 1));
  const next = unpaid.filter((b) => daysUntil(b.due) >= 0).sort((a, b) => (a.due < b.due ? -1 : 1))[0];
  return `
  <h1>账单 <span class="sub">12 笔固定账单 · 已付 ${fmt(paidSum)} · 待付 ${fmt(unpaidSum)}</span></h1>
  <div class="callout ${next && daysUntil(next.due) <= 2 ? 'warn' : ''}">
    ${next ? `<strong>最近一笔：${esc(next.name)} ${fmt(next.amount)}，${next.due} 到期（${daysUntil(next.due) === 0 ? '今天' : daysUntil(next.due) + ' 天后'}）。</strong>
    ${next.id === 'b11' ? '这是下个月的第一笔大账单，记得从 11 月结余里先留出来。' : '12 月 1 日房租 ¥6,500 也要记得留出来。'}点“标记已付”可切换状态，状态保存在本机。` : '<strong>全部账单都已付清 ✓</strong> 下一批是 12 月的房租和学费。'}</div>
  <div class="card" style="margin-top:16px"><h2>全部账单 <span class="sub">按到期日排序</span></h2>
    <table><thead><tr><th>账单</th><th>周期</th><th>到期日</th><th class="amt">金额</th><th>状态</th><th></th></tr></thead><tbody>
    ${sorted.map((b) => {
      const d = daysUntil(b.due);
      const c = DATA.categories.find((x) => x.id === b.category);
      return `<tr><td><span class="cat-ico" style="background:${c.color}">${c.icon}</span><strong>${esc(b.name)}</strong></td>
      <td>${esc(b.cycle)}</td><td class="mono">${b.due}</td><td class="amt num"><b>${fmt(b.amount)}</b></td>
      <td>${b.paid ? '<span class="pill good">已付</span>' : `<span class="pill soon">${d === 0 ? '今天到期' : d > 0 ? d + ' 天后' : '已逾期 ' + (-d) + ' 天'}</span>`}</td>
      <td><button class="btn ${b.paid ? 'ghost' : ''} small" data-bill="${b.id}">${b.paid ? '改回未付' : '标记已付'}</button></td></tr>`;
    }).join('')}</tbody></table>
  </div>
  <p class="foot-note">固定账单占月收入的 ${(100 * (paidSum + unpaidSum) / 28400).toFixed(0)}%（¥${(paidSum + unpaidSum).toLocaleString('en-US')} / ¥28,400），其中房租和学费是大头，合计 ¥9,300。</p>`;
}

export function viewGoals(S) {
  return `
  <h1>储蓄目标 <span class="sub">4 个目标 · 已存 ${fmt(S.goals.reduce((a, g) => a + g.saved, 0))} / ${fmt(S.goals.reduce((a, g) => a + g.target, 0))}</span></h1>
  <p class="sub">每月发薪日先存 ¥3,500：¥2,000 进应急基金，¥1,000 进教育基金，¥500 机动。点“存入”会立刻更新进度，存在本机。</p>
  <div class="grid g2">
  ${S.goals.map((g) => {
    const pct = Math.round((g.saved / g.target) * 100);
    const left = g.target - g.saved;
    return `<div class="card"><div class="goal-head"><div><h2 style="margin:0">${esc(g.name)}</h2><div class="sub">${esc(g.nameEn)} · ${esc(g.note)}</div></div><div class="goal-pct num">${pct}%</div></div>
    <div class="progress" style="margin:12px 0 6px"><i style="width:${Math.min(100, pct)}%;background:${g.color}"></i></div>
    <div class="sub num">${fmt(g.saved)} / ${fmt(g.target)} · 还差 ${fmt(left)}</div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn small" data-goal="${g.id}" data-amount="100">存 ¥100</button>
      <button class="btn small" data-goal="${g.id}" data-amount="500">存 ¥500</button>
      <button class="btn small ghost" data-goal="${g.id}" data-amount="1000">存 ¥1,000</button>
    </div></div>`;
  }).join('')}
  </div>
  <div class="card" style="margin-top:16px"><h2>这个月存了多少</h2>
  <p>11 月实际结余 <strong class="num">${fmt(totals(S).saved)}</strong>。按计划：发薪日（11 月 5 日）已转 ¥2,000 到应急基金、¥1,000 到教育基金；月末结余部分将在 11 月 30 日按比例分进四个目标。</p>
  <p class="foot-note">应急基金目标是 6 个月生活费 ¥50,000，目前 ${Math.round((S.goals[0].saved / S.goals[0].target) * 100)}%，还差 ${fmt(S.goals[0].target - S.goals[0].saved)}，按每月 ¥2,000 的速度约 ${(Math.ceil((S.goals[0].target - S.goals[0].saved) / 2000))} 个月存满。</p></div>`;
}

export function viewReports(S) {
  const all = DATA.months.map((m) => monthTotals(S, m.key));
  const rows = all.map((m) => ({ label: m.info.label, income: m.income, spent: m.spent }));
  const catByMonth = all.map((m) => m.catActual);
  const totalSpent = all.reduce((a, m) => a + m.spent, 0);
  const totalIncome = all.reduce((a, m) => a + m.income, 0);
  const totalTxns = all.reduce((a, m) => a + m.count, 0);
  // Top merchants across all three months, and the biggest single expense per month.
  const byMerchant = {};
  for (const m of DATA.months) for (const t of txnsFor(S, m.key)) byMerchant[t.merchant] = (byMerchant[t.merchant] || 0) + t.amount;
  const top = Object.entries(byMerchant).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const biggest = all.map((m) => {
    const t = [...txnsFor(S, m.month)].sort((a, b) => b.amount - a.amount)[0];
    return { label: m.info.label, t };
  });
  const bestSave = [...all].sort((a, b) => b.rate - a.rate)[0];
  const worstCat = DATA.categories.map((c) => ({
    c, delta: all[2].catActual[c.id] - all[0].catActual[c.id],
  })).sort((a, b) => b.delta - a.delta)[0];
  const delta = (a, b) => {
    const d = a - b;
    const pct = ((d / b) * 100).toFixed(1);
    return `${d >= 0 ? '+' : ''}${fmt(d)}（${d >= 0 ? '+' : ''}${pct}%）`;
  };
  return `
  <h1>月度报表 <span class="sub">2026 年 9–11 月 · 全部数字由 ${totalTxns} 笔真实记账算出</span></h1>
  <div class="toolbar">
    <button class="btn" id="btn-csv">导出 11 月明细 CSV</button>
    <button class="btn ghost" id="btn-csv-all">导出三个月总表 CSV</button>
    <button class="btn ghost" id="btn-print">打印报表</button>
    <span class="sub">CSV 可直接用 Excel 打开；总表含 ${totalTxns} 笔支出。</span>
  </div>
  <div class="grid g2">
    <div class="card"><h2>收支对比</h2>${monthBarsSVG(rows)}
      <div class="scroll-x"><table style="margin-top:8px"><thead><tr><th>月份</th><th class="amt">收入</th><th class="amt">支出</th><th class="amt">结余</th><th class="amt">储蓄率</th><th class="amt">较上月支出</th></tr></thead><tbody>
      ${all.map((r, i) => `<tr><td>${r.info.label}</td><td class="amt num">${fmt(r.income)}</td><td class="amt num">${fmt(r.spent)}</td><td class="amt num"><b>${fmt(r.saved)}</b></td><td class="amt num">${(r.rate * 100).toFixed(1)}%</td><td class="amt num">${i === 0 ? '—' : delta(r.spent, all[i - 1].spent)}</td></tr>`).join('')}
      <tr><td><strong>合计</strong></td><td class="amt num"><b>${fmt(totalIncome)}</b></td><td class="amt num"><b>${fmt(totalSpent)}</b></td><td class="amt num"><b>${fmt(totalIncome - totalSpent)}</b></td><td class="amt num">${(((totalIncome - totalSpent) / totalIncome) * 100).toFixed(1)}%</td><td class="amt num">—</td></tr>
      </tbody></table></div></div>
    <div class="card"><h2>分类支出趋势</h2>${trendSVG(catByMonth)}
      <p class="foot-note">${worstCat.c.name}涨得最多：9 月 ${fmt(all[0].catActual[worstCat.c.id])} → 11 月 ${fmt(all[2].catActual[worstCat.c.id])}，涨了 ${fmt(worstCat.delta)}。住房每月固定 ¥6,500，雷打不动；餐饮从 9 月的 ${fmt(all[0].catActual.food)} 到 11 月 ${fmt(all[2].catActual.food)}，先涨后回落。</p></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>分类预算 vs 实际 · 三个月对照 <span class="sub">红色 = 当月超支</span></h2>
    <div class="scroll-x"><table><thead><tr><th>分类</th>${all.map((m) => `<th class="amt">${m.info.label} 实际 / 预算</th>`).join('')}<th class="amt">三月合计</th></tr></thead><tbody>
    ${DATA.categories.map((c) => `<tr><td><span class="cat-ico" style="background:${c.color}">${c.icon}</span>${c.name}</td>
      ${all.map((m) => {
        const a = m.catActual[c.id], b = m.budgets[c.id];
        return `<td class="amt num">${a > b ? '<span class="pill over">超 ' + fmt(a - b) + '</span> ' : ''}${fmt(a)} / ${fmt(b)}</td>`;
      }).join('')}
      <td class="amt num"><b>${fmt(all.reduce((s, m) => s + m.catActual[c.id], 0))}</b></td></tr>`).join('')}
    <tr><td><strong>合计</strong></td>${all.map((m) => `<td class="amt num"><b>${fmt(m.spent)} / ${fmt(m.plannedSpend)}</b></td>`).join('')}<td class="amt num"><b>${fmt(totalSpent)}</b></td></tr>
    </tbody></table></div>
    <p class="foot-note">超支只出现在 9 月和 10 月：9 月餐饮超 ¥150、其他超 ¥280；10 月健康超 ¥140、娱乐超 ¥150。11 月调高了预算，8 个分类全部在预算内。</p></div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>花钱最多的商家（三个月合计）</h2>
      ${top.map(([m, v], i) => `<div class="rowline"><div><strong>${i + 1}. ${esc(m)}</strong></div><div class="num"><b>${fmt(v)}</b> <span class="sub">占支出 ${(100 * v / totalSpent).toFixed(1)}%</span></div></div>`).join('')}
      <p class="foot-note" style="margin-top:10px">单笔最大支出：${biggest.map((b) => `${b.label}${esc(b.t.merchant)} ${fmt(b.t.amount)}`).join('；')}。</p>
    </div>
    <div class="card"><h2>三个月小结</h2>
      <p>收入 ${fmt(totalIncome)}，支出 ${fmt(totalSpent)}，结余 ${fmt(totalIncome - totalSpent)}。存得最好的是<strong>${bestSave.info.label}</strong>，储蓄率 ${(bestSave.rate * 100).toFixed(1)}%。</p>
      <p>最大头仍是住房＋孩子：三个月合计 ${fmt(all.reduce((s, m) => s + m.catActual.housing + m.catActual.kids, 0))}，占支出的 ${(100 * all.reduce((s, m) => s + m.catActual.housing + m.catActual.kids, 0) / totalSpent).toFixed(1)}%。</p>
      <p>储蓄率在往下走（${(all[0].rate * 100).toFixed(1)}% → ${(all[1].rate * 100).toFixed(1)}% → ${(all[2].rate * 100).toFixed(1)}%），收入基本没变，是支出从 ${fmt(all[0].spent)} 涨到 ${fmt(all[2].spent)}。下月想稳住结余，先看孩子类和餐饮这两项。</p>
      <p>下月注意：12 月 1 日房租 ¥6,500、12 月 5 日学费 ¥2,800 到期；游泳课 ¥480（11 月 28 日）记得付。</p></div>
  </div>
  <p class="foot-note" style="margin-top:14px">报表数字与记账页完全一致：11 月支出 ${fmt(all[2].spent)} ＝ 66 笔明细之和；9 月 ${fmt(all[0].spent)} ＝ 60 笔之和；10 月 ${fmt(all[1].spent)} ＝ 60 笔之和；分类趋势的柱子就是各分类的实际支出。</p>`;
}

export function viewHousehold(S) {
  const all = DATA.months.map((m) => monthTotals(S, m.key));
  const totalTxns = all.reduce((a, m) => a + m.count, 0);
  return `
  <h1>家庭 <span class="sub">陈家 · 2 大人 2 小孩</span></h1>
  <div class="grid g2">
    <div class="card"><h2>家庭成员</h2>
      ${DATA.members.map((m) => `<div class="member"><div class="avatar">${esc(m.name[0])}</div><div><strong>${esc(m.name)}</strong> · ${esc(m.role)} <span class="pill muted">${esc(m.tag)}</span><div class="sub">${esc(m.detail)}</div></div></div>`).join('')}
    </div>
    <div class="card"><h2>家庭设置</h2>
      <dl class="kv">
        <dt>记账月份</dt><dd>2026 年 9–11 月（${totalTxns} 笔支出，数据截至 11 月 26 日）</dd>
        <dt>发薪日</dt><dd>每月 5 日（陈伟 ¥14,000 ＋ 李梅 ¥10,000）</dd>
        <dt>货币</dt><dd>人民币 ¥（全站统一）</dd>
        <dt>月结余目标</dt><dd>¥3,500（11 月实际 ${fmt(totals(S).saved)}）</dd>
        <dt>数据保存</dt><dd>只存在本机浏览器（localStorage），不上传、不注册、不登录</dd>
      </dl>
      <hr style="border:0;border-top:1px dashed var(--line);margin:14px 0">
      <h3>演示数据</h3>
      <p class="sub">你记的账、改的预算、标的账单、存的目标都存在本机。点下面恢复成最初的 9–11 月演示数据。</p>
      <button class="btn danger" id="btn-reset">恢复演示数据</button>
      <p class="foot-note" id="reset-msg"></p>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>这个家庭的记账方法</h2>
    <p>1）发薪日先存钱：5 号工资到账当天，¥2,000 应急基金 ＋ ¥1,000 教育基金先转走，剩下的才花。<br>
    2）每周日晚上花 5 分钟对账：把一周的支出记进来，看看哪个分类快超了。<br>
    3）固定账单不拖：房租、学费、宽带都在到期日前 3 天付掉，账单页会倒数提醒。<br>
    4）月底复盘：30 号看报表，结余超过 ¥3,500 的部分按比例分进四个储蓄目标。</p></div>`;
}
