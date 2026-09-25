/* 单人模式验证（Node 版，零依赖）：
     1. 人生阶段的划分与边界
     2. 退休断崖（61 岁收入切换、养老金替代率、免征个税，且不影响多人模式）
     3. 机构替代：投资卡接盘折现、与机构合伙的分账与精力
     4. 五种结局与人生评级的逐一构造
     5. 单人 45 年长局回归（无死锁 / 负现金 / NaN），并核对退休结算产出

   运行：node test/solo-mode.js     退出码 0 = 全通过
   改动 SOLO / SOLO_STAGES / SALARY_CURVE / LIFE_STAGES / ENERGY 后必须重跑。 */
const fs = require('fs');
const DIR = require('path').join(__dirname, '..', 'js') + '/';
global.window = {};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js','engine-actions.js'])
  eval(fs.readFileSync(DIR + f, 'utf8'));
for (const k of Object.keys(window)) if (!(k in global)) global[k] = window[k];
const E = window.Engine, A = window.Act;
const SOLO = window.SOLO, STG = window.SOLO_STAGES;

const OUT = [], bad = [];
const ok = (c, m) => { OUT.push((c ? '   ✅ ' : '   ❌ ') + m); if (!c) bad.push(m); };
const sec = t => OUT.push('', '=== ' + t + ' ===');
const money = v => '¥' + Math.round(v).toLocaleString('en-US');
const finite = v => typeof v === 'number' && isFinite(v);
const cashOk = p => finite(p.cash) && p.cash >= -0.001;

let seed = 20260920;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const soloGame = (rule) => E.newGame({ rule: rule || '101', mode: 'solo', count: 6, names: ['我'], seed: 4242 });

/* ---------------- ① 人生阶段 ---------------- */
sec('① 人生阶段的划分与边界');
{
  const g = soloGame();
  const p = g.players[0];
  const seen = [];
  for (let age = 20; age <= 65; age++) {
    p.age = age;
    seen.push(E.soloStageOf(g));
  }
  ok(STG.length === 6, `共 ${STG.length} 个人生阶段（预期 6）`);
  /* 边界单调：阶段下标必须随年龄单调不降 —— 否则「人生阶段」会来回跳 */
  ok(seen.every((v, i) => i === 0 || v >= seen[i - 1]), '阶段随年龄单调不降（不会回跳）');
  /* 逐段核对边界年龄 */
  const expect = [[20, 0], [27, 0], [28, 1], [35, 1], [36, 2], [45, 2], [46, 3], [55, 3], [56, 4], [60, 4], [61, 5], [65, 5]];
  let edgeOk = true, firstBad = '';
  for (const [age, idx] of expect) {
    p.age = age;
    const got = E.soloStageOf(g);
    if (got !== idx) { edgeOk = false; firstBad = firstBad || `${age} 岁应为第 ${idx + 1} 段，实为第 ${got + 1} 段`; }
  }
  ok(edgeOk, '每个阶段的起止年龄都落在预期段内' + (firstBad ? `（${firstBad}）` : ''));
  ok(STG[STG.length - 1].nm === '退休期' && STG[STG.length - 2].to === SOLO.retireAge - 1,
    `退休期起点与 SOLO.retireAge=${SOLO.retireAge} 对齐`);
  /* 阶段表只写叙事、不写数值 —— 防止「阶段说 ×1.35、工资表说 ×1.20」两套口径 */
  const numericKeys = new Set();
  STG.forEach(x => Object.keys(x).forEach(k => { if (typeof x[k] === 'number') numericKeys.add(k); }));
  numericKeys.delete('to');
  ok(numericKeys.size === 0, `阶段表不含业务数值字段（实际含：${[...numericKeys].join(',') || '无'}）`);
  OUT.push('   · ' + STG.map((x, i) => `${i + 1}.${x.nm}(${x.range})`).join(' · '));

  /* 阶段切换必须被 checkSoloStage 捕捉到 */
  const g2 = soloGame();
  g2.players[0].age = 20; g2.soloStage = E.soloStageOf(g2);
  g2.players[0].age = 28;                                        /* 28 岁 → 成长期 */
  const ch = E.checkSoloStage(g2);
  ok(ch && ch.index === 1 && ch.stage.nm === '成长期', `跨过边界时播报阶段切换（${ch ? ch.stage.nm : '未触发'}）`);
  ok(E.checkSoloStage(g2) === null, '同一年内重复调用不会重复播报');
}

/* ---------------- ② 退休断崖 ---------------- */
sec('② 退休断崖（61 岁起收入切换）');
{
  const g = soloGame();
  const p = g.players[0];
  p.family.contributionYears = window.FAMILY.pensionFullYears; // 本组只验证已足额缴费者的退休切换
  const jump = (age) => { p.age = age; E.refreshLife(g, p); return { s: p.salary, t: p.taxesCur, r: p.retired, cf: E.finance(p).cashflow }; };

  const a60 = jump(SOLO.retireAge - 1);
  const a61 = jump(SOLO.retireAge);
  const a65 = jump(65);
  ok(a60.r === false && a61.r === true, `退休标记在 ${SOLO.retireAge} 岁翻转（60 岁 ${a60.r} → 61 岁 ${a61.r}）`);
  ok(a60.s > a61.s, `收入在退休时下降：${money(a60.s)} → ${money(a61.s)}`);
  ok(a61.s === Math.round(p.baseSalary * SOLO.pensionRatio),
    `养老金 = 基础工资 ${money(p.baseSalary)} × ${Math.round(SOLO.pensionRatio * 100)}% = ${money(a61.s)}`);
  ok(a61.t === 0, `养老金免征个人所得税（退休后税负 = ${money(a61.t)}）`);
  ok(a65.s === a61.s, '退休后收入保持不变（不会继续衰减）');
  OUT.push(`   · 收入轨迹：60 岁 ${money(a60.s)}（现金流 ${money(a60.cf)}） → 61 岁 ${money(a61.s)}（现金流 ${money(a61.cf)}）`);
  ok(a61.cf < a60.cf, `退休后月现金流确实变差：${money(a60.cf)} → ${money(a61.cf)}`);

  /* ★ 关键：退休断崖只作用于单人模式 —— 多人年龄模式在 65 岁同步结算，不该被改动 */
  const gm = E.newGame({ rule: '101', mode: 'age', count: 2, names: ['甲', '乙'] });
  const pm = gm.players[0];
  pm.age = 65; E.refreshLife(gm, pm);
  ok(pm.retired === false, '多人年龄模式在 65 岁不会进入退休状态（未污染既有模式）');
  ok(pm.taxesCur > 0, `多人模式的税负未被清零（${money(pm.taxesCur)}）`);

  /* 退休后不再进入求职期 */
  const g3 = soloGame();
  const p3 = g3.players[0];
  p3.age = 63; E.refreshLife(g3, p3);
  const r = E.startJobless(g3, p3, 0);
  ok(r.retired === true && E.isJobless(p3) === false, '退休后遇到裁员不再进入求职期（改为退休金调整）');
  ok(r.severance === 0, '退休返聘结束不发放离职补偿');
  OUT.push(`   · 63 岁被「裁员」→ ${money(r.hit)} 的退休金调整，求职期未启动`);
}

/* ---------------- ③ 单人下不存在机会转让 ---------------- */
/* 单人模式遇到机会只有【买入】或【放弃】两条路。
   把一张自己吃不下的投资机会卖出去换现金，现实里没有对应场景
   （机构完全可以自己找项目，不必为你「看过一眼」付费）——
   所以这条路径是【整体取消】，而不是换成一个打折的替代品。
   多人模式的「卖给其他玩家」必须照常保留，两组断言一起守。 */
sec('③ 单人模式：遇到机会只有「买入」或「放弃」');
{
  const g = soloGame();
  const p = g.players[0];

  /* 引擎层：转让能力必须彻底不存在，不能只是界面上藏起来 */
  ok(typeof A.sellCardToOrg === 'undefined',
    '引擎里已不存在 sellCardToOrg（不是只把按钮藏起来）');
  ok(typeof A.orgPriceOf === 'undefined' && typeof A.orgBaseOf === 'undefined',
    '与转让配套的报价函数也已移除');
  ok(SOLO.orgBuyRate === undefined,
    'SOLO 里不再保留 orgBuyRate（避免「定义了却没人读」的假配置）');

  /* 买不了的时候必须能安全放弃，且不产生任何现金变化 */
  p.cash = 10;
  const before = p.cash;
  E.setPending(g, { type:'opportunity', p:p.id, ico:'💡', title:'投资机会',
                    deal:{ id:'x1', nm:'城郊住宅', kind:'realestate', dp:60000, cost:600000, cf:3600 } });
  E.clearPending(g);
  ok(p.cash === before, `放弃一张买不起的机会不产生任何现金变化（${money(before)}）`);
  ok(g.pending === null, '放弃后 pending 被正常清掉，回合可以继续');

  /* ★ 多人模式必须不受影响：区分处理 */
  const gm = E.newGame({ rule:'101', mode:'age', count:3, names:['甲','乙','丙'] });
  ok(typeof A.sellOpportunity === 'function', '多人模式仍保留 sellOpportunity（卖给其他玩家）');
  const seller = gm.players[0], buyer = gm.players[1];
  seller.cash = 0; buyer.cash = 100000;
  const card = { id:'m1', nm:'城郊住宅', kind:'realestate', dp:30000, cost:300000, cf:1800, rent:4500 };
  gm.cur = seller.id;
  const rr = A.sellOpportunity(gm, card, buyer.id, 8000);
  ok(rr.ok && seller.cash === 8000,
    `多人模式转让照常可用：卖方向买方收到 ${money(8000)}（现金 ${money(seller.cash)}）`);
}

/* ---------------- ④ 机构合伙 ---------------- */
sec('④ 机构替代之二：与机构合伙人联合购买');
{
  const g = soloGame('202');
  const p = g.players[0];
  p.cash = 500000; p.energy = 100;
  const card = { id: 'j1', nm: '公寓楼', kind: 'realestate', dp: 100000, cost: 1200000, cf: 8000, rent: 18000, joint: true };
  const beforeCash = p.cash, beforeEnergy = p.energy, beforeCf = E.finance(p).passive;
  const r = A.buyDealWithOrg(g, card);
  ok(r.ok, '与机构合伙买入成功');
  ok(r.mine === Math.round(100000 * (1 - SOLO.partnerShare)),
    `玩家出资 = 首付 ${money(100000)} × ${Math.round((1 - SOLO.partnerShare) * 100)}% = ${money(r.mine)}`);
  ok(p.cash === beforeCash - r.mine, `只扣自己的那部分首付（现金 ${money(beforeCash)} → ${money(p.cash)}）`);
  ok(r.cf === Math.round(8000 * (1 - SOLO.partnerShare)), `月现金流按出资比例切分（+${money(r.cf)}）`);
  const asset = p.assets.realEstate[p.assets.realEstate.length - 1];
  ok(asset.joint === true && asset.partner === '机构', '资产上标注了「与机构共有」');
  ok(p.energy < beforeEnergy, `精力按承担比例扣除（${Math.round(beforeEnergy)} → ${Math.round(p.energy)}）`);
  ok(E.finance(p).passive > beforeCf, '被动收入确实增加了');

  /* 现金不足时必须拦下，且不能动现金 */
  const g2 = soloGame('202');
  const p2 = g2.players[0];
  p2.cash = 10; p2.energy = 100;
  const before2 = p2.cash;
  const r2 = A.buyDealWithOrg(g2, card);
  ok(!r2.ok && p2.cash === before2, '现金不足时拒绝，且不产生任何扣款');
  OUT.push(`   · ${r2.msg}`);
}

/* ---------------- ⑤ 结局与评级 ---------------- */
sec('⑤ 五种结局与人生评级');
{
  const mk = (setup) => {
    const g = soloGame();
    const p = g.players[0];
    p.achievements = []; p.dreamOwned = false; p.inFT = false; p.escaped = false;
    p.escapeRound = null; p.out = false; p.outReason = '';
    setup(g, p);
    const oc = E.soloOutcome(g, p);
    return { g, p, oc, grade: E.soloGrade(g, p, oc, E.socialClassOf(g, p)) };
  };
  const cases = [
    ['60 岁前圆梦', (g, p) => { p.achievements = [{ age: 52, round: 33, kind: 'dream', reason: 'r' }]; p.escaped = true; p.inFT = true; p.escapeRound = 30; }, 'winner', 'S'],
    ['晚于门槛圆梦', (g, p) => { p.achievements = [{ age: 63, round: 44, kind: 'dream', reason: 'r' }]; p.escaped = true; p.inFT = true; p.escapeRound = 40; }, 'late', 'A'],
    ['恰好 60 岁圆梦', (g, p) => { p.achievements = [{ age: SOLO.winAge, round: 41, kind: 'dream', reason: 'r' }]; p.escaped = true; p.inFT = true; p.escapeRound = 38; }, 'winner', 'S'],
    ['出圈未圆梦', (g, p) => { p.escaped = true; p.inFT = true; p.escapeRound = 35; }, 'free', 'B'],
    ['未出圈', () => {}, 'stuck', 'D'],          /* 无资产 → D；L3 以上的 C 由下一段专门构造 */
    ['中途破产', (g, p) => { p.out = true; p.outReason = '破产'; }, 'bankrupt', 'F'],
  ];
  for (const [nm, setup, key, grade] of cases) {
    const r = mk(setup);
    ok(r.oc.key === key, `${nm} → 结局「${r.oc.label}」（${r.oc.key}）`);
    ok(r.grade === grade, `${nm} → 人生评级 ${r.grade}（预期 ${grade}）`);
  }
  /* 未出圈也分两档：社会等级 L3（小有积累）以上算「差一步」，否则与破产同视为「没摆脱用时间换钱」。
     构造方式是给一笔能产生被动收入的金融资产，把覆盖度推到 25% 的 L3 门槛之上。 */
  const r1 = mk(() => {});
  const r2 = mk((g, p) => {
    p.assets.savings.push({ nm: '理财', cost: 100000, interest: Math.ceil(E.escapeTarget(g, p) * 0.30) });
  });
  ok(r1.oc.key === 'stuck' && r2.oc.key === 'stuck', '两种构造都归属于「未出圈」这一结局');
  ok(r1.grade === 'D', `未出圈且几乎没资产 → D（等级 L${E.socialClassOf(r1.g, r1.p).lv}）`);
  ok(r2.grade === 'C', `未出圈但已积累到 L${E.socialClassOf(r2.g, r2.p).lv}（小有积累）→ C（差一步）`);
  /* 评级只有 soloGrade 一处权威 —— soloOutcome 不得自带 grade */
  const ok2 = Object.keys(r1.oc).indexOf('grade') < 0;
  ok(ok2, 'soloOutcome 不自行计算 grade（避免与 soloGrade 两套口径）');
  OUT.push(`   · ${r1.oc.label}：${r1.oc.reason}`);

  /* 端到端：走真实的 endSolo 结算链路（上面几段只单独调了评估函数，
     没有验证「结算结果有没有真的写到对局上、胜利者有没有被正确标记」） */
  const ge = soloGame();
  const pe = ge.players[0];
  pe.achievements = [{ age: 49, round: 30, kind: 'dream', reason: 'r' }];
  pe.escaped = true; pe.inFT = true; pe.escapeRound = 26; pe.escapeAge = 45;
  E.endSolo(ge);
  ok(ge.over === true, 'endSolo 把对局置为结束');
  ok(ge.soloResult && ge.soloResult.grade === 'S' && ge.soloResult.key === 'winner',
    `结算写入对局：评级 ${ge.soloResult && ge.soloResult.grade} · ${ge.soloResult && ge.soloResult.label}`);
  ok(ge.winner === pe.id, '达成人生赢家时 g.winner 被正确设置（战绩页据此展示）');
  /* 年龄换算：年龄 = startAge + round − 1 —— escapeRound 26 → 45 岁 */
  ok(ge.soloResult.dreamAge === 49 && ge.soloResult.escapeAge === ge.startAge + 26 - 1,
    `结算里保留了关键时间点：出圈 ${ge.soloResult.escapeAge} 岁 / 圆梦 ${ge.soloResult.dreamAge} 岁`);
  /* 未达成时 winner 必须为 null，否则战绩页会错误地显示「获胜」 */
  const gf = soloGame();
  E.endSolo(gf);
  ok(gf.soloResult.grade !== 'S' && gf.winner === null, '未达成时 g.winner 保持为 null');
}

/* ---------------- ⑥ 单人长局回归 ---------------- */
sec('⑥ 单人 45 年长局回归');
{
  function handleCard(g, p, P, seen) {
    switch (P.type) {
      case 'deficit': {
        seen.deficit++;
        let r = A.payDeficit(g, P.amount);
        if (!r.ok) {
          /* 走真实路径：界面在资金不足时引导玩家「先贷款」，而不是直接破产。
             直接破产会把「应急金不足 → 被迫加杠杆」这条路径整个掩盖掉。 */
          A.takeLoan(g, Math.max(1000, Math.ceil(r.shortfall / 1000) * 1000));
          seen.borrow++;
          r = A.payDeficit(g, P.amount);
        }
        if (!r.ok) { seen.bankrupt++; E.declareBankruptcy(g, p); return true; }
        const landed = P.landed;
        E.clearPending(g);
        if (landed) E.resolveSpace(g, p, Object.assign({}, landed, { deficit: 0 }));
        return true;
      }
      case 'opportunity':
      case 'opportunity202': {
        let deal = P.deal;
        if (!deal) {
          const decks = P.choices || (g.rule === '202' ? ['capgain','cashflow'] : ['small','big']);
          const r = A.chooseDeck(g, decks[Math.floor(rnd() * decks.length)]);
          if (r && r.ok) deal = r.card; else seen.buyFail++;
        }
        /* 决策放宽到「留 3000 应急金就投」——若过于保守，整局不会产生任何被动收入，
           「买入 → 被动收入 → 出圈」这条主路径就永远不会被回归覆盖（会给出假的通过）。 */
        if (deal && p.cash > 3000 && p.energy > 30 && rnd() < 0.70) {
          /* 单人模式只有买入或放弃 —— 买不起就放弃，没有转让这条退路 */
          const r2 = A.buyDeal(g, deal, deal.min || 1);
          if (r2.ok) seen.buy++;
          else { seen.buyFail++; seen.passed++; }
        }
        if (g.pending) E.clearPending(g);
        return true;
      }
      case 'charity': A.doCharity(g, rnd() < 0.4); if (g.pending) E.clearPending(g); return true;
      case 'rest': if (p.energy < 40 && p.cash > 5000) A.vacation(g); E.clearPending(g); return true;
      case 'downsized': seen.downsized++; A.doDownsized(g, P.amount); E.clearPending(g); return true;
      case 'doodad': {
        seen.doodad++;
        let r = A.payDoodad(g, P.card, P.cost);
        if (!r.ok) {
          const short = r.shortfall || 0;
          A.takeLoan(g, Math.max(1000, Math.ceil(short / 1000) * 1000));
          seen.borrow++;
          r = A.payDoodad(g, P.card, P.cost);
        }
        if (!r.ok) { seen.bankrupt++; E.declareBankruptcy(g, p); }
        E.clearPending(g); return true;
      }
      case 'baby': A.addBaby(g); E.clearPending(g); return true;
      case 'market': seen.market++; E.clearPending(g); return true;
      default: E.clearPending(g); return true;
    }
  }
  function play(rule) {
    const g = E.newGame({ rule, mode: 'solo', count: 6, names: ['我'], seed: 20260920 });
    const p = g.players[0];
    let turns = 0, negCash = 0, nanSeen = 0, stuck = 0, energyNeg = 0, stageJump = 0, retiredSeen = 0;
    const seen = { deficit: 0, buy: 0, buyFail: 0, passed: 0, downsized: 0, doodad: 0, market: 0, crisis: 0, borrow: 0, bankrupt: 0 };
    const cap = 400;
    let lastStage = g.soloStage;
    while (!g.over && turns < cap) {
      turns++;
      const cur = E.current(g);
      if (!cur || cur.out) { E.nextPlayer(g); continue; }
      if (g.soloStage !== lastStage) { stageJump++; lastStage = g.soloStage; }
      if (cur.retired) retiredSeen++;

      const f = E.finance(cur);
      if (!finite(cur.cash) || !finite(cur.energy) || !finite(f.cashflow)) nanSeen++;
      if (!cashOk(cur)) negCash++;
      if (cur.energy < -0.001) energyNeg++;

      let guard = 0;
      while (g.pending && guard++ < 60) handleCard(g, cur, g.pending, seen);
      if (g.pending) { stuck++; E.clearPending(g); }

      if (E.isJobless(cur) && cur.energy >= (window.UNEMPLOYMENT.huntEnergy || 12)) A.huntJob(g);

      if (!cur.pausedThisTurn) {
        const n = E.diceCount(g, cur);
        const dice = E.rollDice(g, n);
        const landed = E.movePlayer(g, cur, dice.reduce((a, b) => a + b, 0));
        E.resolveSpace(g, cur, landed);
        let g2 = 0;
        while (g.pending && g2++ < 60) handleCard(g, cur, g.pending, seen);
      }
      E.endTurn(g);
      if (g.lastCrisis) seen.crisis++;
    }
    return { g, p, turns, negCash, nanSeen, stuck, energyNeg, stageJump, retiredSeen, seen, cap };
  }

  ['101', '202'].forEach((rule, i) => {
    const r = play(rule);
    sec(`第 ${i + 1} 局：规则 ${rule} · 单人 · 实际 ${r.turns} 个回合`);
    ok(r.negCash === 0, `现金从未为负（违规 ${r.negCash} 次）`);
    ok(r.nanSeen === 0, `数值未出现 NaN / Infinity（违规 ${r.nanSeen} 次）`);
    ok(r.stuck === 0, `卡片未卡死（卡住 ${r.stuck} 次）`);
    ok(r.energyNeg === 0, `精力未跌破 0（${r.energyNeg} 次）`);
    ok(r.turns < r.cap, `未触发安全阀 ${r.cap}（实际 ${r.turns}）`);
    ok(r.g.over === true, '对局正常结束（未死锁）');
    ok(r.g.players.length === 1, '单人模式始终只有 1 位玩家');
    /* ★ 关键断言：结算必须【无论怎么结束】都产出 ——
       走到 65 岁退休是一条路，「中途破产出局」是另一条，且后者更常见。
       若结算只在 endSolo 里生成，破产这条路上玩家会看不到任何总结。 */
    ok(!!r.g.soloResult, '产出了结算结果（退休结算或中途出局均需产出）');
    if (r.g.soloResult) {
      const S = r.g.soloResult;
      ok(['S','A','B','C','D','F'].indexOf(S.grade) >= 0, `人生评级合法：${S.grade}（${S.label}）`);
      ok(finite(S.netWorth) && finite(S.cover) && finite(S.endAgeNow), '结算里的净资产 / 覆盖度 / 结束年龄均为有限数值');
      ok((S.grade === 'F') === (S.key === 'bankrupt'), '评级 F 与「中途出局」结局严格对应');
      const finished = S.endAgeNow >= r.g.endAge;
      ok(finished ? S.endAgeNow === r.g.endAge : true,
        finished ? `走到退休结算（${S.endAgeNow} 岁）` : `提前出局于 ${S.endAgeNow} 岁（属正常结束，非死锁）`);
      if (finished) ok(r.stageJump >= 4, `走完全程时人生阶段推进了 ${r.stageJump} 次（共 6 段）`);
    }
    OUT.push(`   · 事件：裁员 ${r.seen.downsized} · 额外支出 ${r.seen.doodad} · 行情 ${r.seen.market}`
      + ` · 健康危机 ${r.seen.crisis} · 入不敷出 ${r.seen.deficit}`);
    OUT.push(`   · 卡片：买入 ${r.seen.buy} · 买不起而放弃 ${r.seen.passed} · 被拦 ${r.seen.buyFail}`
      + ` · 被迫加杠杆 ${r.seen.borrow} 次 · 破产清算 ${r.seen.bankrupt} 次`);
    OUT.push(`   · 退休期经过 ${r.retiredSeen} 个回合 · 现金 ${money(r.p.cash)} · 被动收入 ${money(E.finance(r.p).passive)}`);
    if (r.g.soloResult) OUT.push(`   · 结局：${r.g.soloResult.grade} · ${r.g.soloResult.label} —— ${r.g.soloResult.reason}`);
  });
}

OUT.push('', '══════════════════════════════════');
OUT.push(bad.length ? `❌ 失败 ${bad.length} 项：\n   ` + bad.join('\n   ')
                    : '✅ 单人模式全部通过（阶段 / 退休断崖 / 仅买入或放弃 / 机构合伙 / 结局评级 / 长局回归）');
console.log(OUT.join('\n'));
process.exit(bad.length ? 1 : 0);
