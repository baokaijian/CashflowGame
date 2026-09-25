/* 长局回归（Node 版）：不依赖浏览器与 DOM，直接驱动引擎。
   验证改造新增的三条路径 —— 精力衰减 / 失业求职期 / 入不敷出 ——
   在长时间多局对局中不会破坏「现金非负、数值有限、回合可推进」这三条不变式。

   ★ 关键：每张卡片都调用它【真实对应的 action】（doDownsized / payDoodad / addBaby ...），
     而不是一律 clearPending。否则「失业求职期」这条路径根本不会被走到，
     回归就会给出「求职 0 次」这种假通过。 */
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(window)) if (!(k in global)) global[k] = window[k];
const E = window.Engine, A = window.Act;

const OUT = [], bad = [];
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); if (!c) bad.push(m); };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');
const finite = v => typeof v === 'number' && isFinite(v);
const cashOk = p => finite(p.cash) && p.cash >= -0.001;

let seed = 20260919;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

/* 处理一张卡片，走它真实的 action。返回 true 表示已消费掉该 pending。 */
function handleCard(g, p, P, seen) {
  switch (P.type) {
    case 'deficit': {
      seen.deficit++;
      const r = A.payDeficit(g, P.amount);
      if (!r.ok) { E.declareBankruptcy(g, p); E.clearPending(g); return true; }
      /* 缺口补上后要回到落格事件继续结算 —— 与界面 showDeficit 的行为一致 */
      const landed = P.landed;
      E.clearPending(g);
      if (landed) E.resolveSpace(g, p, Object.assign({}, landed, { deficit: 0 }));
      return true;
    }
    case 'opportunity':
    case 'opportunity202': {
      /* 真实的入口是 chooseDeck（先付研究精力，才看得到项目）——
         必须走这一步，否则「买入消耗精力」这条路径在长局里根本没被覆盖。 */
      let deal = P.deal;
      if (!deal) {
        const decks = P.choices || (g.rule === '202' ? ['capgain','cashflow'] : ['small','big']);
        const deck = decks[Math.floor(rnd() * decks.length)];
        const r = A.chooseDeck(g, deck);
        if (r && r.ok) deal = r.card; else seen.buyFail++;
      }
      if (deal && p.cash > 8000 && p.energy > 45 && rnd() < 0.5) {
        const r2 = A.buyDeal(g, deal, deal.min || 1);
        if (r2.ok) seen.buy++; else seen.buyFail++;
      }
      if (g.pending) E.clearPending(g);
      return true;
    }
    case 'charity': A.doCharity(g, rnd() < 0.4); if (g.pending) E.clearPending(g); return true;
    case 'rest':
      if (p.energy < 40 && p.cash > 5000) A.vacation(g);
      E.clearPending(g); return true;
    case 'downsized': {
      seen.downsized++;
      A.doDownsized(g, P.amount);      /* 真正进入失业求职期 */
      E.clearPending(g);               /* ⚠️ 必须无条件清掉：漏清会让同一张卡被反复处理，计数翻几十倍 */
      return true;
    }
    case 'doodad': {
      seen.doodad++;
      const r = A.payDoodad(g, P.card);
      if (!r.ok) E.declareBankruptcy(g, p);   /* 付不出且无资产可变现 → 破产，不留负现金 */
      E.clearPending(g);
      return true;
    }
    case 'baby': A.addBaby(g); E.clearPending(g); return true;
    case 'market': {
      seen.market++;
      E.clearPending(g); return true;               /* 行情卡：不做复杂交易决策 */
    }
    default: E.clearPending(g); return true;
  }
}

function playOne(rule, count, cap) {
  const names = ['甲','乙','丙','丁','戊','己'].slice(0, count);
  const g = E.newGame({ rule, mode: 'age', count, names, seed:20260926+Number(rule)+count });
  let turns = 0, negCash = 0, nanSeen = 0, stuck = 0, energyNeg = 0, rehire = 0;
  const seen = { jobless: 0, crisis: 0, deficit: 0, buy: 0, buyFail: 0, downsized: 0, doodad: 0, market: 0 };

  while (!g.over && turns < cap) {
    turns++;
    const p = E.current(g);
    if (!p || p.out) { E.nextPlayer(g); continue; }

    const f = E.finance(p);
    if (!finite(p.cash) || !finite(p.energy) || !finite(f.cashflow)
        || !finite(f.totalIncome) || !finite(f.totalExpenses)) nanSeen++;
    if (!cashOk(p)) negCash++;
    if (p.energy < -0.001) energyNeg++;

    let guard = 0;
    while (g.pending && guard++ < 60) handleCard(g, p, g.pending, seen);
    if (g.pending) { stuck++; E.clearPending(g); }

    /* 失业期间主动求职（这是失业机制唯一的出口，必须被走到） */
    if (E.isJobless(p) && p.energy >= (window.UNEMPLOYMENT.huntEnergy || 12)) {
      seen.jobless++;
      const wasJobless = E.isJobless(p);
      const r = A.huntJob(g);
      if (r.ok && r.done && wasJobless) rehire++;
    }

    if (!p.pausedThisTurn) {
      const n = E.diceCount(g, p);
      const dice = E.rollDice(g, n);
      const landed = E.movePlayer(g, p, dice.reduce((a, b) => a + b, 0));
      E.resolveSpace(g, p, landed);
      let g2 = 0;
      while (g.pending && g2++ < 60) handleCard(g, p, g.pending, seen);
    }

    E.endTurn(g);
    if (g.lastCrisis) seen.crisis++;
  }

  return { g, turns, negCash, nanSeen, stuck, energyNeg, rehire, seen };
}

[['101', 4, 1500], ['101', 6, 1500], ['202', 4, 1500], ['202', 6, 1500]].forEach(([rule, cnt, cap], i) => {
  const r = playOne(rule, cnt, cap);
  sec(`第 ${i + 1} 局：规则 ${rule} · ${cnt} 人 · 实际 ${r.turns} 个回合`);
  ok(r.negCash === 0, `现金从未为负（违规 ${r.negCash} 次）`);
  ok(r.nanSeen === 0, `数值从未出现 NaN / Infinity（违规 ${r.nanSeen} 次）`);
  ok(r.stuck === 0, `卡片从未卡死（卡住 ${r.stuck} 次）`);
  ok(r.energyNeg === 0, `精力从未跌破 0（${r.energyNeg} 次）`);
  ok(r.turns < cap, `未触发安全阀 ${cap}（实际 ${r.turns}）`);
  OUT.push(`   · 事件：失业 ${r.seen.downsized} · 求职 ${r.seen.jobless}（成功复职 ${r.rehire}）`
    + ` · 健康危机 ${r.seen.crisis} · 入不敷出 ${r.seen.deficit}`);
  OUT.push(`   · 卡片：额外支出 ${r.seen.doodad} · 行情 ${r.seen.market} · 买入成功 ${r.seen.buy} / 精力或现金不足被拦 ${r.seen.buyFail}`);
  const ps = r.g.players;
  OUT.push(`   · 存活 ${ps.filter(p => !p.out).length}/${cnt} 人 · 结束年龄 ${E.ageOf(r.g)} 岁`
    + ` · 现金 ${money(Math.min(...ps.map(p => p.cash)))} ~ ${money(Math.max(...ps.map(p => p.cash)))}`
    + ` · 精力 ${Math.round(Math.min(...ps.map(p => p.energy)))} ~ ${Math.round(Math.max(...ps.map(p => p.energy)))}`);
  OUT.push(`   · 结局：${r.g.over ? (r.g.winner != null ? ps[r.g.winner].name + ' 获胜' : '无人获胜（时间到）') : '未结束'}`);
});

/* ---------------- 极端压力专项 ---------------- */
sec('极端压力：巨额负债 + 失业 + 过度扩张并发');
{
  const g = E.newGame({ rule: '101', mode: 'age', count: 2, names: ['甲', '乙'] });
  const p = g.players[0];
  p.liabs.bank = 500000; p.liabs.credit = 100000;
  for (let k = 0; k < 14; k++) p.assets.realEstate.push({ nm: '房' + k, dp: 5000, cost: 65000, cf: 100, rent: 400 });
  E.refreshLife(g, p);
  let neg = 0, nan = 0;
  for (let i = 0; i < 80; i++) {
    const f = E.finance(p);
    if (!finite(f.cashflow) || !finite(f.totalExpenses) || !finite(p.energy)) nan++;
    if (!cashOk(p)) neg++;
    E.tickEnergy(g, p);
    if (p.cash > 0) A.payDeficit(g, Math.min(p.cash, 200000));
  }
  ok(nan === 0, `极端负债下数值仍有限（违规 ${nan} 次）`);
  ok(neg === 0, `极端负债下现金仍非负（违规 ${neg} 次）`);
  ok(p.energy >= 0, `过度扩张下精力被健康危机兜住（现 ${Math.round(p.energy)}）`);
  const f = E.finance(p);
  OUT.push(`   · 月现金流 ${money(f.cashflow)} · 总支出 ${money(f.totalExpenses)}`
    + ` · 维护 ${E.energyUpkeep(p)}/回合 vs 恢复 ${E.energyRecover(g, p)}/回合`);
}

/* ---------------- 年龄全程扫描（固定年龄推进，不依赖回合数） ---------------- */
sec('年龄推进：收入与精力上限的完整曲线');
{
  const g = E.newGame({ rule: '101', mode: 'age', count: 1, names: ['甲'] });
  const p = g.players[0];
  const rows = [];
  for (let age = 20; age <= 65; age += 5) {
    p.age = age;
    E.refreshLife(g, p);
    const f = E.finance(p);
    rows.push(`${age}岁 ${p.salaryPhase}/${p.lifeStage} 工资${money(p.salary)} 支出${money(f.totalExpenses)} 现金流${money(f.cashflow)} 上限${E.energyMax(g, p)}`);
  }
  OUT.push('   · ' + rows.join('\n   · '));
  /* 断言：一生现金流不应在【没有额外负债】的前提下系统性为负 —— 那意味着游戏注定破产 */
  const negAges = [];
  for (let age = 20; age <= 65; age++) {
    p.age = age;
    E.refreshLife(g, p);
    if (E.finance(p).cashflow < 0) negAges.push(age);
  }
  ok(negAges.length === 0, `无额外负债时月现金流不应为负（转负年龄：${negAges.join(',') || '无'}）`);
}

OUT.push('', '══════════════════════════════════');
OUT.push(bad.length ? `❌ 失败 ${bad.length} 项：\n   ` + bad.join('\n   ')
                    : '✅ 长局回归全部通过（无负现金 / 无 NaN / 无卡死 / 精力不破 0）');
console.log(OUT.join('\n'));
process.exit(bad.length ? 1 : 0);
