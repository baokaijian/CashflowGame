/* 时间口径验证（Node 版，零依赖）：「一轮 = 一年，一个结算年 = 12 个月」
   守住三件事 ——
     1. 口径只有一个真源（window.TIME），界面与引擎都从它推
     2. 一次发薪日恰好结算 12 个月：领取年度结余、摊还 12 期
     3. 剩余期限以【年】呈现，且「还清」的边界行为明确

   运行：node test/time-unit.js     退出码 0 = 全通过
   改动 TIME / LOAN_TYPES / 职业卡负债数据后必须重跑。 */
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(window)) if (!(k in global)) global[k] = window[k];
const E = window.Engine, A = window.Act;
const M = window.TIME.monthsPerPayday;

const OUT = [], bad = [];
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); if (!c) bad.push(m); };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');
const newG = (mode, rule) => E.newGame({ rule: rule || '101', mode: mode || 'age',
                                         count: mode === 'solo' ? 1 : 3, names: ['甲','乙','丙'], seed: 20260920 });

/* ---------------- ① 口径真源 ---------------- */
sec('① 口径真源');
{
  ok(!!window.TIME, 'window.TIME 存在');
  ok(M === 12, `一次发薪日 = ${M} 个月 = 1 年`);
  ok(E.monthsPerPayday() === M, 'E.monthsPerPayday() 与常量一致');
  ok(E.annual(1000) === 1000 * M, `E.annual(1000) = ${E.annual(1000)}`);
  ok(E.annual(-500) === -500 * M, '负值（入不敷出）同样按年换算');
  ok(E.annual(0) === 0, 'E.annual(0) = 0');
  /* 源文件里不得再出现写死的 12 —— 否则改口径时必然漏改 */
  const src = fs.readFileSync(DIR + 'engine.js', 'utf8');
  const hardcoded = (src.match(/\*\s*12\b/g) || []).length;
  ok(hardcoded === 0, `engine.js 里没有写死的「× 12」（实际 ${hardcoded} 处）`);
}

/* ---------------- ② 期数 → 年 ---------------- */
sec('② 期数 → 年');
{
  const cases = [[12,1],[13,2],[1,1],[0,0],[23,2],[24,2],[25,3],[140,12],[278,24]];
  let allOk = true, badCase = '';
  for (const [p, y] of cases) {
    const got = E.toYears(p);
    if (got !== y) { allOk = false; badCase = badCase || `${p} 期应为 ${y} 年，实为 ${got}`; }
  }
  ok(allOk, '剩余期数 → 年（向上取整）全部正确' + (badCase ? `（${badCase}）` : ''));
  ok(E.toYears(Infinity) === Infinity, '月供不足以覆盖利息（Infinity）原样透传，不会被显示成 0 年');
  ok(E.toYears(14) === 2, '不满一年按一年算（14 期 → 2 年）—— 显示「0 年」会让玩家以为已还清');
  ok(E.toYearsFloor(11) === 0 && E.toYearsFloor(12) === 1 && E.toYearsFloor(23) === 1,
    '已还年数向下取整（不满一年不算一年）');
}

/* ---------------- ③ 一个结算年 = 12 个月 ---------------- */
sec('③ 一次发薪日恰好结算 12 个月');
{
  const g = newG();
  const p = g.players[0];
  const payIx = window.RAT_RACE.map((s, i) => s.t === 'paycheck' ? i : -1).filter(i => i >= 0)[0];
  ok(payIx != null, `内圈存在发薪日格（位置 ${payIx}）`);

  /* 站到发薪日前一格，走 1 步正好落在发薪日 */
  p.pos = (payIx - 1 + window.RAT_RACE.length) % window.RAT_RACE.length;
  const cfYear = E.annual(E.finance(p).cashflow);
  const homeBefore = E.loanInfo(p, 'home');
  const cashBefore = p.cash;
  const landed = E.movePlayer(g, p, 1);

  ok(landed.collected === cfYear,
    `领取年度结余 ${money(cfYear)}（= 月结余 ${money(E.finance(p).cashflow)} × ${M}）`);
  ok(p.cash - cashBefore === cfYear, `现金正好增加一年的结余（${money(p.cash - cashBefore)}）`);
  const homeAfter = E.loanInfo(p, 'home');
  ok(homeAfter.periods - homeBefore.periods === M,
    `一次发薪日摊还 ${homeAfter.periods - homeBefore.periods} 期（= 1 年）`);
  ok(homeAfter.balance < homeBefore.balance,
    `贷款余额同步下降（${money(homeBefore.balance)} → ${money(homeAfter.balance)}）`);
  ok(homeAfter.remainingYears < homeBefore.remainingYears,
    `剩余年限同步下降（${homeBefore.remainingYears} 年 → ${homeAfter.remainingYears} 年）`);
  ok(homeAfter.paidYears === 1, `已还年数 = ${homeAfter.paidYears}`);

  /* ★ 一处容易误解的地方：一次移动经过 N 个发薪日，并不摊还 N 年。
     结算覆盖的是「自上次结算以来经过的年数」—— 同一年只结一次账，
     所以同一次移动里的第 2、第 3 个发薪日会因「本年已结」而略过，摊还也只按实际结算的年数。
     这样「领了几年就还几年」才成立；旧口径（每个发薪日都各还 1 年）会让负债还得比收入快。 */
  const g2 = newG();
  const p2 = g2.players[0];
  const perBefore = E.loanInfo(p2, 'home').periods;
  const ld2 = E.movePlayer(g2, p2, window.RAT_RACE.length);   /* 整整绕一圈，经过全部发薪日 */
  const perAfter = E.loanInfo(p2, 'home').periods;
  const payCount = window.RAT_RACE.filter(s => s.t === 'paycheck').length;
  ok(ld2.settled.count === payCount && ld2.settled.skipped === payCount - 1,
    `绕一圈经过 ${payCount} 个发薪日，只有第 1 个真正结算（略过 ${ld2.settled.skipped} 个）`);
  ok(perAfter - perBefore === ld2.settled.yearsPaid * M,
    `摊还期数 = 结算年数 × ${M}（${ld2.settled.yearsPaid} 年 → ${perAfter - perBefore} 期），不是「经过几个就还几年」`);
}

/* ---------------- ④ 还清的边界 ---------------- */
sec('④ 边界：剩余期限归 0');
{
  const g = newG();
  const p = g.players[0];
  p.liabs.car = 100; E.ensureLoans(p);
  const before = E.loanInfo(p, 'car');
  ok(before.balance === 100, `构造一笔只剩 ${money(100)} 的贷款`);
  ok(before.remainingYears >= 1, `1 期也显示 ${before.remainingYears} 年，不会显示 0 年`);

  E.amortize(g, p);
  const after = E.loanInfo(p, 'car');
  ok(after.balance === 0, `再还一年后余额归零（${after.balance}）`);
  ok(after.remaining === 0 && after.remainingYears === 0, '还清后剩余期数与剩余年限都是 0');
  ok(after.due === 0 && after.dueYear === 0, '还清后月供与年供都是 0（不再计入支出）');
  const f = E.finance(p);
  ok(f.exp.car === 0, '还清的车贷从支出中消失，年结余同步改善');

  /* 已经还清的贷款再调用 amortize 不应出错、也不应产生负数 */
  E.amortize(g, p);
  ok(E.loanInfo(p, 'car').balance === 0, '对已还清的贷款重复结算不会出错');
}

/* ---------------- ⑤ 贷款会在游戏内还清 ---------------- */
sec('⑤ 贷款确实能在 45 轮内还清');
{
  const g = newG();
  const p = g.players[0];
  const start = E.loanInfo(p, 'home');
  /* 直接按「一个结算年 = 12 个月」连续结算，看需要几年 */
  let years = 0;
  while (E.loanInfo(p, 'home').balance > 0 && years < 100) { E.amortize(g, p); years++; }
  const st = E.loanInfo(p, 'home');
  ok(st.balance === 0, `房贷在第 ${years} 次发薪日（= ${years} 年）还清`);
  ok(years === start.remainingYears || Math.abs(years - start.remainingYears) <= 1,
    `与「剩余 ${start.remainingYears} 年」一致（实际 ${years} 年）`);
  OUT.push(`   · 期初剩余 ${start.remaining} 期 = ${start.remainingYears} 年 · 年供 ${money(start.dueYear)}`);

  /* 45 轮里大约经过 20 次发薪日 —— 长周期贷款能否还清取决于这个次数 */
  const payCount = window.RAT_RACE.filter(s => s.t === 'paycheck').length;
  const perRound = payCount / (window.RAT_RACE.length / 3.5);
  const paydaysInGame = Math.round(perRound * 45);
  OUT.push(`   · 内圈 ${window.RAT_RACE.length} 格 / ${payCount} 个发薪日 → 平均每轮 ${perRound.toFixed(2)} 次`);
  OUT.push(`   · 45 轮合计约 ${paydaysInGame} 次发薪日 = ${paydaysInGame} 年（⚠️ 小于 45 年，见文档）`);
  ok(years <= paydaysInGame + 2,
    `房贷能在整局里还清（需 ${years} 年 ≤ 约 ${paydaysInGame} 次发薪日）`);
}

/* ---------------- ⑥ 单人 / 多人一致 ---------------- */
sec('⑥ 单人模式与多人模式同口径');
{
  for (const [mode, label] of [['age','多人年龄模式'], ['solo','单人模式']]) {
    const g = newG(mode);
    const p = g.players[0];
    const per0 = E.loanInfo(p, 'home').periods;
    E.amortize(g, p);
    ok(E.loanInfo(p, 'home').periods - per0 === M, `${label}：一次发薪日同样摊还 ${M} 期`);
    ok(E.loanInfo(p, 'home').remainingYears === E.toYears(E.loanInfo(p, 'home').remaining),
      `${label}：剩余年限与剩余期数换算一致`);
  }
}

/* ---------------- ⑦ 长局：年限随轮次单调下降 ---------------- */
sec('⑦ 长局：剩余年限随游戏推进单调下降');
{
  const g = newG('solo');
  const p = g.players[0];
  let turns = 0, prevHomeYears = null, increases = 0, debtAtEnd = null;
  const trace = [];
  while (!g.over && turns < 400) {
    turns++;
    const cur = E.current(g);
    if (cur.pausedThisTurn === undefined) { E.nextPlayer(g); continue; }
    /* 只推进「经过发薪日」的那部分，不做卡片决策 —— 这里只验证时间口径 */
    E.movePlayer(g, cur, 3);
    /* 一个结算年 = 12 个月：年限不会因为还本而上升 */
    const hy = E.loanInfo(cur, 'home').remainingYears;
    if (prevHomeYears !== null && hy > prevHomeYears) increases++;
    if (prevHomeYears !== null && hy < prevHomeYears && trace.length < 8)
      trace.push(`${E.ageOf(g)} 岁：${prevHomeYears} 年 → ${hy} 年`);
    prevHomeYears = hy;
    E.endTurn(g);
    debtAtEnd = E.LOAN_KEYS.reduce((s, k) => s + E.loanInfo(cur, k).balance, 0);
  }
  ok(increases === 0, `剩余年限从未上升（异常 ${increases} 次）`);
  ok(trace.length > 0, '剩余年限确实随发薪日下降');
  OUT.push('   · ' + trace.join(' · '));
  const hy = E.loanInfo(p, 'home');
  ok(hy.remainingYears >= 0 && isFinite(hy.remainingYears), `结束时尚有剩余 ${hy.remainingYears} 年（有限值）`);
  OUT.push(`   · 结束时负债合计 ${money(debtAtEnd)}`);
}

OUT.push('', '══════════════════════════════════');
OUT.push(bad.length ? `❌ 失败 ${bad.length} 项：\n   ` + bad.join('\n   ')
                    : '✅ 时间口径全部通过（一个结算年 = 12 期）');
console.log(OUT.join('\n'));
process.exit(bad.length ? 1 : 0);
