/* ==========================================================================
   ui-summary.js — 游戏结束「整体复盘报告」
   ---------------------------------------------------------------------------
   触发时机：
     · 破产出局（现金不足且无资产可变现 → 宣告破产）
     · 主动认输（玩家自己选择退出）
     · 本局结束（65 岁退休结算 / 买下梦想 / 企业现金流达标 / 最后存活者）
     · 随时可通过菜单「本局复盘报告」查看阶段性总结
   数据来源：engine.js 在整局过程中采集的三份原始数据 ——
     stats       决策计数（买入 / 放弃 / 贷款 / 变现 / 强制支出 …）
     track       每轮观察、按玩家年龄聚合的财富快照（保留首个已知点及同龄最新点）
     milestones  关键决策节点（时间线）
   报告的每一条结论都由这三份数据推导，不做主观臆测。
   ========================================================================== */
(function(){
'use strict';
const E = window.Engine, U = window.UI;
const $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;
const G = () => window.UiGame.Game;

/* ------------------------------ 小工具 ------------------------------ */
const clamp = (n, a, b)=>Math.max(a, Math.min(b, n));
const num = x => (typeof x === 'number' && isFinite(x)) ? x : 0;
const ratio = (a, b)=> b > 0 ? clamp(num(a)/b, 0, 1) : 0;
const pct = v => Math.round(clamp(num(v), 0, 1) * 100);
const TONE = { good:'var(--green)', warn:'var(--orange)', bad:'var(--red)' };
const ASSET_CN = {
  stocks:'股票 / ETF', realEstate:'房产', business:'企业', ftBusiness:'财务自由圈企业',
  savings:'存款 / 理财', funds:'基金', lands:'土地', collectibles:'另类资产'
};
const ASSET_KEYS = ['stocks','realEstate','business','ftBusiness','savings','funds','lands','collectibles'];

/* ------------------------------ 结局判定 ------------------------------ */
function outcomeOf(g, p){
  if(p.out){
    const giveUp = p.outReason === '主动认输';
    const bought  = p.outReason === '资产被买断';
    return {
      key: giveUp ? 'surrender' : 'bankrupt',
      ico: giveUp ? '🏳️' : (bought ? '🤝' : '💀'),
      title: giveUp ? '主动认输' : (bought ? '资产被买断' : '破产出局'),
      tone: giveUp ? 'warn' : 'bad',
      desc: giveUp
        ? '你在局势还可控时主动退出本局。与破产不同，认输不清算资产 —— 名下的资产与负债完整保留，最终仍按净资产计入排名。'
        : (bought
          ? '对手以 1.5 倍溢价买断了你的全部资产，你失去了产生现金流的来源。'
          : '本局已按破产规则清算并退出。请结合退出前的缺口与交易记录核对原因，清算后的余额不代表当时的财务状态。')
    };
  }
  if(g.over && g.winner === p.id){
    return { key:'win', ico:'🏆', title:'获胜', tone:'good', desc:'你达成了本局的获胜条件，率先完成财富目标。' };
  }
  if(g.over && g.winner === null){
    return { key:'none', ico:'🏁', title:'无人获胜', tone:'warn', desc:'本局全部玩家均已出局，没有产生获胜者。' };
  }
  if(g.over){
    return { key:'lose', ico:'🏁', title:'本局结束', tone:'warn', desc:'本局已按结算规则结束，你没有拿到第一名。' };
  }
  if(p.inFT){
    return { key:'running-ft', ico:'🎡', title:'已出圈 · 对局进行中', tone:'good', desc:'你已经跳出老鼠赛跑进入财务自由圈，本局仍在进行。' };
  }
  return { key:'running', ico:'🐭', title:'老鼠赛跑中 · 对局进行中', tone:'warn', desc:'本局仍在进行，这是一份基于当前进度的阶段总结。' };
}

/* ------------------------------ 指标汇总 ------------------------------ */
function collect(g, p){
  E.initTrack(p);
  const st = p.stats, track = p.track;
  const f = E.finance(p);
  if(p.inFT){
    const ft=E.ftFinance(p);
    f.totalIncome=ft.income;f.totalExpenses=ft.expense;f.cashflow=ft.cashflow;
  }
  const escp = E.escapeProgress(g, p);
  const alive = !p.out;
  /* 峰值取「stats 记录值」「走势采样值」「当前值」三者的最大，旧存档缺 stats 也能算。
     ⚠️ 两个来源的字段名不同：stats 用 peakXxx，走势快照用 cash / passive / net。 */
  const peak = (statKey, trackKey, cur)=>{
    const fromTrack = track.length ? track.reduce((m, t)=>Math.max(m, num(t[trackKey])), -Infinity) : -Infinity;
    const fromStat = (typeof st[statKey] === 'number') ? st[statKey] : -Infinity;
    /* 出局玩家的「当前值」是清算后的残值（现金清零、负债核销），拿它当峰值没有意义 —— 
       它会把一个真实峰值为负的对局美化成 0，所以出局后只用历史采样与记录值。 */
    const v = alive ? Math.max(fromTrack, fromStat, num(cur)) : Math.max(fromTrack, fromStat);
    return isFinite(v) ? v : 0;
  };
  const buys = num(st.dealsBought), passes = num(st.dealsPassed);
  const seen = Math.max(buys + passes, num(st.dealsSeen));
  const debt = num(p.liabs.bank) + num(p.liabs.home) + num(p.liabs.school) + num(p.liabs.car) + num(p.liabs.credit) + num(p.liabs.other);
  const kinds = ASSET_KEYS.filter(k => (p.assets[k] || []).length > 0);
  const nw = E.netWorth(p);
  const peakCash = peak('peakCash', 'cash', p.cash);
  const peakNet = peak('peakNetWorth', 'net', nw);
  const deals = buys + num(st.ftBusinesses);
  return {
    f, escp, st, track, nw,
    rounds: p.finishRound || g.round, age: E.ageOf(g, p),
    target: num(escp.target),
    peakPassive: peak('peakPassive', 'passive', f.passive),
    peakCash,
    peakNet,
    buys, passes, seen, deals,
    hitRate: (buys + passes) > 0 ? buys / (buys + passes) : 0,
    invested: num(st.investTotal),
    cfGained: num(st.cfGained),
    avgCf: deals > 0 ? Math.round(num(st.cfGained) / deals) : 0,
    debt,
    debtRatio: peakNet > 0 ? debt / peakNet : (debt > 0 ? 1 : 0),
    monthlyInterest: Math.round(num(p.liabs.bank) * BANK.loanRate),
    kinds, kindCount: kinds.length,
    safetyMonths: f.totalExpenses > 0 ? num(peakCash) / f.totalExpenses : 0,
    currentSafetyMonths: f.totalExpenses > 0 ? Math.max(0,num(p.cash)) / f.totalExpenses : null,
    expiredOptions: 0,
    escaped: !!p.inFT || !!p.escaped,
    out: !!p.out,
    /* ---- 人生模拟维度 ---- */
    energy: Math.round(num(p.energy)),
    energyMax: E.energyMax(g, p),
    energySpent: num(st.energySpent),
    upkeep: E.energyUpkeep(p),
    crises: num(st.crises),
    jobless: num(st.downsized),
    rehired: num(st.rehired),
    deficitMonths: num(st.deficitMonths),
    deficitTotal: num(st.deficitTotal),
    vacations: num(st.vacations),
    salaryMult: typeof p.salaryMult === 'number' ? p.salaryMult : 1,
    lifeStage: p.lifeStage || ''
  };
}

/* ------------------------------ 六维评分 ------------------------------ */
function scoreOf(g, p, m){
  const dims = [];

  /* 1. 现金流建设：出圈进度 —— 这局的核心目标 */
  const cashflow = clamp(m.target > 0 ? m.peakPassive / m.target : (m.peakPassive > 0 ? 1 : 0), 0, 1) * 100;
  dims.push({ key:'cashflow', label:'现金流建设', score: cashflow,
    comment:`被动收入峰值 ${money(m.peakPassive)}，出圈门槛 ${money(m.target)}，最高完成度 ${Math.round(cashflow)}%。` });

  /* 2. 资产配置：买了多少、买了多少类、相对起始现金投入了多少 */
  const alloc = clamp(m.buys / 8, 0, 1) * 40
              + clamp(m.kindCount / 4, 0, 1) * 30
              + ratio(m.invested, Math.max(1, num(p.startCash)) * 5) * 30;
  dims.push({ key:'alloc', label:'资产配置', score: alloc,
    comment:`整局完成 ${m.buys} 笔买入，累计投入 ${money(m.invested)}，覆盖 ${m.kindCount} 类资产${m.kindCount ? '（' + m.kinds.map(k=>ASSET_CN[k]).join('、') + '）' : ''}。` });

  /* 3. 负债管理：负债 / 峰值净资产 的比例 + 利息对收入的吞噬 */
  const interestLoad = clamp(ratio(m.monthlyInterest, Math.max(1, m.f.totalIncome)) / 0.5, 0, 1) * 30;
  const debtScore = clamp(100 - clamp(m.debtRatio / 1.5, 0, 1) * 70 - interestLoad, 0, 100);
  dims.push({ key:'debt', label:'负债管理', score: debtScore,
    comment: m.debt > 0
      ? `当前个人贷款合计 ${money(m.debt)}，${debtPosText(m)}，其中信用贷每月利息 ${money(m.monthlyInterest)}。`
      : '当前个人贷款已结清；这不代表整局没有借款或利息支出。房产项目融资另计在资产净收入中。' });

  /* 4. 风险抵御：现金安全垫 + 是否被迫急售 + 是否出局 */
  const risk = m.out ? 0
    : clamp(clamp(m.safetyMonths / 3, 0, 1) * 70 + 30 - num(m.st.liquidations) * 6, 0, 100);
  dims.push({ key:'risk', label:'风险抵御', score: risk,
    comment: m.out
      ? '出局：现金流断裂时没有任何可动用的缓冲。'
      : `现金峰值 ${money(m.peakCash)}，约等于 ${m.safetyMonths.toFixed(1)} 个月的支出；被追到急售变现 ${num(m.st.liquidations)} 次。` });

  /* 5. 机会把握：出手率 + 行情兑现次数 + 是否成功出圈 */
  const timing = clamp(m.hitRate * 60 + clamp(num(m.st.marketSells) / 4, 0, 1) * 25 + (m.escaped ? 15 : 0), 0, 100);
  dims.push({ key:'timing', label:'机会把握', score: timing,
    comment: m.seen > 0
      ? `共拿到 ${m.seen} 次投资机会，出手 ${m.buys} 次（出手率 ${pct(m.hitRate)}），行情兑现 ${num(m.st.marketSells)} 次${m.escaped ? '，并成功出圈' : ''}。`
      : '整局没有获得过投资机会。' });

  /* 6. 可持续性（精力管理）—— 财富流把「精力」和钱并列，现实里也一样：
     赚到了钱却把身体和现金流都拖垮，长期看同样是失败。 */
  const sustain = clamp(
    100
    - m.crises * 35                                                          /* 健康危机：最重的扣分 */
    - clamp(m.deficitMonths / 6, 0, 1) * 30                                  /* 入不敷出的月份占比 */
    - (m.jobless > 0 ? 10 : 0)                                               /* 经历过失业 */
    - clamp(m.upkeep / Math.max(1, E.energyRecover(g, p)) , 0, 2) * 10,      /* 持有维护已超出恢复能力 */
  0, 100);
  dims.push({ key:'sustain', label:'可持续性', score: sustain,
    comment: m.crises > 0
      ? `整局发生 ${m.crises} 次健康危机：精力被透支到归零，被迫休养并承担持续医疗支出。` +
        energyDiagnosis(g,p,m)
      : (m.energySpent > 0
        ? `已记录精力投入合计 ${m.energySpent} 点，未记录到健康危机` +
          (m.deficitMonths > 0 ? `；记录到 ${m.deficitMonths} 个月年度结算缺口（合计 ${money(m.deficitTotal)}）。` : '，未记录到年度结算缺口。')
        : '整局没有精力投入记录。') });

  const total = Math.round(cashflow * 0.26 + alloc * 0.20 + debtScore * 0.16 + risk * 0.14 + timing * 0.14 + sustain * 0.10);
  const grade = total >= 85 ? 'S' : total >= 72 ? 'A' : total >= 58 ? 'B' : total >= 42 ? 'C' : 'D';
  const gradeText = { S:'出圈高手', A:'财务稳健', B:'稳中有进', C:'尚需优化', D:'亟需调整' }[grade];
  return { dims, total, grade, gradeText };
}

/* 负债占净资产的表述：峰值净资产为负时「百分比」没有意义，必须换成定性说法 */
function debtPosText(m){
  return m.peakNet > 0
    ? `约占峰值净资产的 ${Math.round(m.debtRatio*100)}%`
    : '峰值净资产不为正，不计算负债与峰值净资产的比例';
}
/* 被动支出对投入的侵蚀：比例超过 100% 时改用绝对值表述，避免出现「占 100%」这种失真文案 */
function erosionText(m){
  const forced = num(m.st.forcedTotal);
  if(m.invested <= 0) return '';
  const r = forced / m.invested;
  return r >= 1
    ? `，已超过你整局的累计投入 ${money(m.invested)}`
    : `，相当于你总投入的 ${pct(r)}%`;
}

function verdictOf(g, p, m, sc){
  if(m.out) return `本局已${p.outReason||'出局'}。请结合保留的结算与交易日志核对退出前的收支，清算后余额不能用于还原退出前状态。`;
  if(m.crises>0) return `本局记录到 ${m.crises} 次精力归零引发的健康危机。资产收益之外，还需要优先改善投入、维护与恢复之间的平衡。`;
  if(m.f.cashflow<0) return '当前月净现金流为负。先检查收入、生活费用和月供，再评估新投资对现金及精力的影响。';
  if(m.currentSafetyMonths!==null&&m.currentSafetyMonths<3) return '当前收支与现金储备需要一起看：保留足够的现金缓冲，再安排后续投资。';
  return `当前月净现金流 ${money(m.f.cashflow)}，综合评级 ${sc.grade}。下一步结合出圈进度、资产维护和可用现金选择行动。`;
}

/* 危机次数是历史记录，维护与恢复是当前值；不据此断言过去每次的具体成因。 */
function energyDiagnosis(g,p,m){
  const recover=E.energyRecover(g,p),gap=recover-m.upkeep;
  return `当前每回合维护消耗 ${m.upkeep} 点、自然恢复 ${recover} 点${num(p.crisisTurns)>0?'（康复期间恢复减半）':''}，`+
    (gap<0?`即使不新增行动，精力仍净减少 ${-gap} 点。应先降低持续维护负担，再考虑扩张。`:
     gap===0?'维护已用尽自然恢复量，购买、研究和求职等额外投入会消耗剩余精力。':
     `扣除维护后可恢复 ${gap} 点；购买、研究和求职等投入仍需单独预留。`)+
    '当前数值不代表历史危机发生时的资产组合和恢复能力。';
}

/* ------------------------------ 社会等级（展示层） ------------------------------ */
/* ★ 等级【判定】在 engine.js（Engine.LADDER / Engine.socialClassOf）——
   因为它已经是游戏规则的输入：意外支出的「消费档次」系数由它决定。
   判定若留在表现层，引擎就得反过来依赖 UI，会破坏「引擎零 DOM 依赖」的约定。
   这里只负责把结论讲清楚：判定依据、距上一层的差距、以及怎么往上走。 */
function classDetail(g, p, m){
  const cls = E.socialClassOf(g, p);
  return Object.assign({}, cls, {
    next: nextReqOf(g, p, cls),
    evidence: classEvidence(g, p, m, cls),
    levers: classLevers(g, p, m, cls)
  });
}
/* 给对局面板用的精简入口：只要「等级 + 距上一级」两件事。
   不复用 classDetail —— 那个会连带构造判定依据与建议文案，而面板每次操作都会重渲染。 */
function classBrief(g, p){
  const cls = E.socialClassOf(g, p);
  return Object.assign({}, cls, { next: nextReqOf(g, p, cls), mult: E.lifestyleOf(g, p).mult });
}
/* 距离上一层：达标条件 + 还差多少 + 达成度。
   只有这一层需要把数字格式化成文案，所以留在展示层。 */
function nextReqOf(g, p, cls){
  const L = E.LADDER, lv = cls.lv;
  const seg = (lo, hi, v)=> hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 0;
  if(lv === 7) return null;
  if(lv <= 1) return { name:L[2].name, req:'应急金达到 3 个月支出',
    need:`还差 ${money(Math.max(0, cls.safety3 - cls.peakCash))}（目前峰值现金 ${money(cls.peakCash)}）`,
    prog: cls.safetyProg };
  if(lv === 2) return { name:L[3].name, req:`被动收入达到门槛的 25%（${money(cls.target * 0.25)}）`,
    need:`还差 ${money(Math.max(0, cls.target * 0.25 - cls.passive))}`, prog: seg(0, 0.25, cls.cover) };
  if(lv === 3) return { name:L[4].name, req:`被动收入达到门槛的 50%（${money(cls.target * 0.5)}）`,
    need:`还差 ${money(Math.max(0, cls.target * 0.5 - cls.passive))}`, prog: seg(0.25, 0.50, cls.cover) };
  if(lv === 4) return { name:L[5].name, req:`被动收入达到门槛的 80%（${money(cls.target * 0.8)}）`,
    need:`还差 ${money(Math.max(0, cls.target * 0.8 - cls.passive))}`, prog: seg(0.50, 0.80, cls.cover) };
  if(lv === 5) return { name:L[6].name, req:`被动收入超过门槛（${money(cls.target + 1)}）`,
    need:`还差 ${money(Math.max(0, cls.target + 1 - cls.passive))}，达标当轮就出圈拿资金`,
    prog: seg(0.80, 1.00, cls.cover) };
  return { name:L[7].name, req:`达成获胜条件（梦想格付清 / 企业月现金流累计 ≥ ${money(E.empireTarget())}）`,
    need: p.inFT ? `企业现金流累计 ${money(num(p.ftGain))} / ${money(E.empireTarget())}`
                 : '进入财务自由圈后，在梦想格付清费用即获胜',
    prog: clamp(num(p.ftGain) / E.empireTarget(), 0, 1) };
}
/* 判定依据：把「凭什么给这个等级」摊开，玩家可以自己核对 */
function classEvidence(g, p, m, cls){
  const ls = E.lifestyleOf(g, p);
  return [
    ['被动收入覆盖度', `${pct(cls.cover)}%（${money(cls.passive)} / 门槛 ${money(cls.target)}）`],
    ['应急金', `${cls.safetyMonths.toFixed(1)} 个月支出${cls.safetyProg >= 1 ? '（已达 3 个月）' : '（不足 3 个月）'}`],
    ['月现金流', `${money(m.f.cashflow)}${m.f.cashflow < 0 ? ' · 为负' : ''}`],
    ['消费档次', `×${ls.mult.toFixed(2)} —— 意外支出按此系数计价`],
    ['净资产', `${money(m.nw)}（峰值 ${money(m.peakNet)}）`]
  ];
}

/* 提升等级的具体财商手段：按【当前层级】给动作，回答「怎么往上走一层」。
   与 adviceOf 的分工：那份是整局的结构性诊断，这份是登台阶的动作清单。 */
function classLevers(g,p,m,cls){
  const out=[],add=(t,d)=>out.push({t,d}),recover=E.energyRecover(g,p);
  const next=nextReqOf(g,p,cls);
  if(p.out){
    add('以退出前记录复核本局',`本局已${p.outReason||'出局'}，当前余额可能是清算结果。下一局先核对现金储备、实际月供与可变现渠道。`);
  }else if(!p.inFT){
    add('按当前账本核对出圈条件',
      `当前被动收入 ${money(cls.passive)}/月，须严格超过支出 ×${E.escapeMargin(g)} 的门槛 ${money(cls.target)}/月。`+
      '增加资产净收益和减少个人月供均可能改善进度；提前还款不取消住房、用车与日常消费预算。');
  }else{
    add('在自由圈目标之间安排资源',
      `当前企业新增月现金流累计 ${money(num(p.ftGain))}，目标 ${money(E.empireTarget())}；也可选择梦想目标。`+
      '比较企业、特许经营与保留资金的效果，继续计入自由圈生活费用、贷款和维护。');
  }
  if(next) add('下一等级的参考条件',`${next.name}：${next.req}。${next.need}。等级只是阶段指标，不能替代当前现金与经营能力检查。`);
  add('为新机会预留现金与精力',
    `当前现金 ${money(p.cash)}，三个月当前支出的参考储备为 ${money(m.f.totalExpenses*3)}；维护 ${m.upkeep} 点、自然恢复 ${recover} 点/回合。`+
    '买入前核对首付、资产净收入、额外贷款月供、一次性精力及持续维护，承受能力不足时可以放弃。');
  if(cls.lv>=4){
    const life=E.lifestyleOf(g,p);
    add('消费档次会改变额外支出',
      `当前 L${cls.lv}，额外消费卡金额按 ×${life.mult.toFixed(2)} 计算。`+
      '档次来自游戏的财富与现金流指标，不能靠卖掉某一类资产保证降低；预留现金并核对卡面实际扣款。');
  }
  return out;
}

/* ------------------------------ 改进建议 ------------------------------ */
/* 全部结论都由 stats / track 推出，带具体数字，可直接指导下一局操作 */
function adviceOf(g, p, m, sc){
  const out=[],add=(t,d)=>out.push({t,d});
  const recover=E.energyRecover(g,p),room=recover-m.upkeep;
  const passive=m.out?m.peakPassive:m.f.passive;
  const gap=Math.max(0,m.target-passive+1);

  if(m.out){
    add(p.outReason==='主动认输'?'主动退出后复核决策过程':'按退出前记录核对出局过程',
      `本局退出原因：${p.outReason||'未记录'}。退出后的资产和负债可能已被清算，不能据此认定退出前没有资产或月净额一定为负。`+
      '结合保留的缺口事件、交易及关键决策，区分现金不足、持仓无法及时变现与主动退出。');
  }

  if(m.crises>0){
    add('精力曾被透支，需要调整经营与恢复节奏',
      `本局记录到 ${m.crises} 次健康危机。游戏中精力降至零时触发危机，随后需要强制休养并承担医疗支出。`+
      energyDiagnosis(g,p,m)+
      `安排新行动前，检查行动精力成本及维护后的余量，尽量保持在 ${window.ENERGY.lowAt} 点低精力线以上。`+
      '停在起点且现金足够时可选择休假；休假只补充精力，不能消除持续维护负担。');
  }else if(room<=0){
    add(room<0?'当前维护消耗超过恢复能力':'当前维护已占满自然恢复量',energyDiagnosis(g,p,m)+
      '比较不同经营类型、规模协同和机构合同的维护成本，优先减少高维护、低净收益的持仓。');
  }
  if(m.deficitMonths>0){
    add('曾出现年度结算缺口，先核对发生年份的账单',
      `记录到 ${m.deficitMonths} 个月的结算缺口，累计 ${money(m.deficitTotal)}。`+
      `当前月净现金流 ${money(m.f.cashflow)}。缺口可能随工资、家庭费用、月供或资产收入变化，`+
      '请按发薪日对账明细核对具体原因；有失业记录也不能据此断定全部缺口来自失业。');
  }
  if(!m.out&&m.currentSafetyMonths!==null&&m.currentSafetyMonths<3){
    add('当前现金缓冲不足，先预留应急和恢复费用',
      `当前现金 ${money(p.cash)}，约覆盖 ${m.currentSafetyMonths.toFixed(1)} 个月当前支出；`+
      `三个月支出的参考储备为 ${money(m.f.totalExpenses*3)}。历史现金峰值 ${money(m.peakCash)} 不代表现在可动用的现金。`+
      '投资前同时预留意外支出、还款和可能的休假费用，避免被迫折价变现。');
  }
  if(m.monthlyInterest>0){
    add('将新增融资成本与资产净收益一起比较',
      `当前个人贷款 ${money(m.debt)}，其中信用贷利息 ${money(m.monthlyInterest)}/月。`+
      '借款到账只增加现金和负债，未来利息会减少月净额。提前还款前比较贷款管家的支出改善、所需现金和违约金，并保留应急储备。');
  }
  if(!m.escaped&&m.target>0&&passive<m.target*.6){
    add('被动收入仍有缺口，按资金和精力筛选机会',
      `${m.out?'历史峰值':'当前'}被动收入 ${money(passive)}/月；按当前账本，须严格超过门槛 ${money(m.target)}/月。`+
      `尚差 ${money(gap)}/月。`+
      (m.avgCf>0?`以已完成投资平均新增 ${money(m.avgCf)}/月粗略估算，相当于约 ${Math.ceil(gap/m.avgCf)} 笔同等收益投资；未来报价和维护成本可能不同。`:
       '优先比较正净现金流、可承担首付与维护成本的机会，无需为完成固定笔数而投资。'));
  }
  if(m.seen>=3&&m.hitRate<.5){
    add('复核放弃机会的原因，而非单纯追求出手率',
      `已记录 ${m.seen} 次投资机会，买入 ${m.buys} 次、放弃 ${m.passes} 次。`+
      '仅凭次数无法判断放弃是否合理。核对当时的现金、精力、融资成本和净收益，资金或维护能力不足时放弃是合理选择。');
  }
  if(!m.out&&m.kindCount>0&&m.kindCount<=2&&m.deals>=2){
    add('评估当前持仓集中度和变现能力',
      `当前持有 ${m.kinds.map(k=>ASSET_CN[k]).join('、')}，共 ${m.kindCount} 类资产。`+
      '类别数量只是提示；结合单项占比、净现金流和可变现渠道判断是否需要分散，金融资产同样需核对报价、兑付条件和交易机会。');
  }
  if(m.escaped&&!m.out&&num(m.st.ftBusinesses)===0){
    add('出圈后继续比较可承担的企业机会',
      `已出圈，尚未记录财务自由圈企业买入。企业新增月现金流累计目标为 ${money(E.empireTarget())}，也可通过梦想目标完成游戏。`+
      '先检查当前分红净额、生活费用、现金与维护余量，再选择企业、特许经营或保留资金。');
  }
  if(E.isAgeMode(g)&&!m.escaped&&!m.out){
    const left=E.yearsLeft(g,p),peak=Math.max(...window.SALARY_CURVE.map(x=>x.mult));
    add('按剩余结算年安排投资和偿债',
      `当前 ${m.age} 岁，距终龄还有 ${left} 次年度结算；当前工资倍率 ×${m.salaryMult}，配置中的峰值倍率为 ×${peak}。`+
      '回合数与结算年数不同。根据下一年预计收支、家庭费用和精力安排行动，不设置固定每轮买入要求。');
  }
  if(sc.total>=72&&out.length<5){
    add('已取得的进展与后续关注点',
      `被动收入历史峰值 ${money(m.peakPassive)}/月，已完成 ${m.buys} 次买入；`+
      `${m.escaped?'已有出圈记录':'当前尚未出圈'}，当前个人贷款 ${money(m.debt)}。`+
      '保留已验证有效的决策，同时持续检查现金储备、维护负担和家庭支出，提速并非唯一目标。');
  }
  if(!out.length) add('继续按当前账本评估下一步',
    `当前月净现金流 ${money(m.f.cashflow)}，维护 ${m.upkeep} 点/回合、恢复 ${recover} 点/回合。`+
    '现有记录没有触发重点提示；每次行动仍需检查现金、月供和精力影响。');
  return out.slice(0,5);
}

/* ------------------------------ 下一局行动清单 ------------------------------ */
function planOf(g,p,m){
  const list=[];
  if(m.crises>0||m.upkeep>=E.energyRecover(g,p)) list.push(
    '先平衡精力：比较行动投入、持仓维护与自然恢复。持续维护超过恢复时先调整组合；起点休假按现金和精力需要选择。');
  list.push(`按当前每月支出 ${money(m.f.totalExpenses)}，把约 <b>${money(m.f.totalExpenses*3)}</b> 作为三个月现金储备参考；投资和提前还款后仍需留出缓冲。`);
  list.push('有投资机会时比较<b>净现金流、首付、融资和维护成本</b>；承受能力不足时保留现金，不追求固定每轮成交笔数。');
  list.push(m.debt>0?'用贷款管家比较提前还款的现金成本与月供改善，优先考虑高成本负债，并保留应急资金。':
    '个人贷款已结清；再融资前核对新增月供，房产项目融资仍需通过资产净收入核对。');
  list.push(m.escaped?`出圈后在企业现金流累计目标 <b>${money(E.empireTarget())}</b> 与梦想目标之间安排资金，扩张前检查分红净额和精力余量。`:
    `被动收入须严格超过当前门槛 <b>${money(m.target)}</b>；达到后检查自由圈费用与维护负担，再决定出圈时机。`);
  return list;
}

/* ------------------------------ 迷你走势图 ------------------------------ */
function sparkline(track, key, label, fmt){
  const arr = track.map(t=>num(t[key]));
  if(arr.length < 2) return `<div class="sum-chart"><div class="sum-chart__hd"><span>${label}</span></div><p class="muted">采样不足，暂无走势。</p></div>`;
  const W = 300, H = 56;
  const min = Math.min.apply(null, arr), max = Math.max.apply(null, arr);
  const span = (max - min) || 1;
  const startAge=num(track[0].age),endAge=num(track[track.length-1].age);
  const pts = arr.map((v, i)=>[endAge>startAge?(num(track[i].age)-startAge)/(endAge-startAge)*W:i*W/(arr.length-1), H - ((v - min) / span) * (H - 10) - 5]);
  const line = pts.map((c, i)=>(i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = line + ` L ${W} ${H} L 0 ${H} Z`;
  return `<div class="sum-chart">
    <div class="sum-chart__hd"><span>${label}</span><b>${fmt(max)}</b></div>
    <svg class="sum-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${area}" style="fill:var(--accent);opacity:.12"/>
      <path d="${line}" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round"/>
    </svg>
    <div class="sum-chart__ft"><span>${startAge} 岁 · ${fmt(arr[0])}</span><span>${endAge} 岁 · ${fmt(arr[arr.length-1])}</span></div>
  </div>`;
}

/* ------------------------------ 指标清单（HTML 与导出共用） ------------------------------ */
/* 抽出来是为了让「屏幕上看到的」和「导出文件里的」保证是同一份数据 ——
   两处各写一遍，迟早会对不上。 */
function metricsOf(g, p, m){
  return [
    ['结束时净资产', money(m.nw), `峰值 ${money(m.peakNet)}`],
    ['被动收入峰值', money(m.peakPassive), `出圈门槛 ${money(m.target)}`],
    ['累计投入', money(m.invested), `${m.buys} 笔买入 · 新增现金流 ${money(m.cfGained)}/月`],
    ['现金峰值', money(m.peakCash), m.f.totalExpenses > 0 ? `≈ ${m.safetyMonths.toFixed(1)} 个月支出` : '—'],
    ['融资总额', money(num(m.st.loanTotal)), m.debt > 0 ? `当前负债 ${money(m.debt)}` : '已全部结清'],
    ['被动支出', money(num(m.st.forcedTotal)), `${num(m.st.forcedCount)} 次意外 / 失业 / 事件`],
    ['精力余量', `${m.energy} / ${m.energyMax}`,
      m.upkeep > 0 ? `资产维护 ${m.upkeep}/回合 · 恢复 ${E.energyRecover(g, p)}/回合` : `每回合恢复 ${E.energyRecover(g, p)}`],
    ['健康危机', m.crises > 0 ? `${m.crises} 次` : '未记录',
      m.crises > 0 ? '精力透支到归零 · 被迫休养' : `精力投入合计 ${m.energySpent} 点`],
    ['逆流冲击', m.jobless > 0 ? `失业 ${m.jobless} 次` : '未记录失业',
      m.deficitMonths > 0 ? `${m.deficitMonths} 个月结算缺口 ${money(m.deficitTotal)}` : '未记录年度结算缺口']
  ];
}

/* ------------------------------ 导出 ------------------------------ */
/* Markdown 与 JSON 两个导出器共用 analyzeAll()，保证两份文件说的是同一套数字。
   全部数据来自 engine 全程采集的 stats / track / milestones，不额外臆测。 */
function analyzeAll(g){
  const ranked = g.players.slice().sort((a, b)=> E.netWorth(b) - E.netWorth(a));
  return g.players.map(p=>{
    const m = collect(g, p);
    const sc = scoreOf(g, p, m);
    return {
      p, m, sc,
      out: outcomeOf(g, p),
      cls: classDetail(g, p, m),
      rank: ranked.findIndex(x=> x.id === p.id) + 1
    };
  });
}
function metaOf(g){
  return {
    rule: g.rule,
    mode: E.modeLabel(g),
    round: g.round,
    age: E.isSolo(g) ? E.ageOf(g) : null,
    endAge: g.endAge,
    players: g.players.length,
    over: !!g.over,
    winner: (g.winner != null && g.players[g.winner]) ? g.players[g.winner].name : null,
    winReason: g.winReason || '',
    exportedAt: dateText()
  };
}
function dateText(){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
function fileStamp(){
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
}
/* 纯前端下载：Blob + 临时 <a download>。file:// 下同样可用，不需要任何后端。 */
function download(name, text, mime){
  const blob = new Blob([text], { type:(mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}
const stripTags = s => String(s).replace(/<\/?b>/g, '').replace(/<br\s*\/?>/g, ' ');
const mdCell = s => stripTags(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function exportMarkdown(g){
  const meta = metaOf(g), all = analyzeAll(g);
  const L = [];
  L.push('# 现金流游戏 · 本局复盘分析');
  L.push('');
  L.push(`> 导出时间：${meta.exportedAt}　|　数据来源：累计统计、保留的关键决策和最多 60 个财富采样点（按年龄聚合，保留首个已知点）；旧档缺失历史不补造，不是完整交易流水，评级为游戏内模型评价。`);
  L.push('');
  L.push('| 项目 | 内容 |');
  L.push('| --- | --- |');
  L.push(`| 规则版本 | ${meta.rule} ${meta.rule === '202' ? '进阶版' : '基础版'} |`);
  L.push(`| 游戏模式 | ${meta.mode}${meta.age != null ? `（${meta.age} 岁 / 共到 ${meta.endAge} 岁）` : ''} |`);
  L.push(`| 进行到 | 第 ${meta.round} 轮${meta.age != null ? ` · ${meta.age} 岁` : ''}${meta.over ? '（本局已结束）' : '（对局进行中）'} |`);
  L.push(`| 参与者 | ${meta.players} 人 |`);
  L.push(`| 本局结果 | ${meta.winner ? `🏆 ${meta.winner} 获胜` : (meta.over ? '无人获胜（全部出局）' : '进行中')}${meta.winReason ? ` —— ${mdCell(meta.winReason)}` : ''} |`);
  L.push('');

  all.forEach((a, i)=>{
    const { p, m, sc, out, cls, rank } = a;
    L.push('---');
    L.push('');
    L.push(`## ${i + 1}/${all.length} · ${p.name} · ${p.job.name}`);
    L.push('');
    L.push('### 基本信息');
    L.push('');
    L.push('| 项目 | 内容 |');
    L.push('| --- | --- |');
    L.push(`| 结局 | ${out.ico} ${out.title}${p.outReason ? `（${p.outReason}）` : ''} |`);
    L.push(`| 净资产排名 | 第 ${rank} / ${all.length} 名 |`);
    L.push(`| 综合评级 | ${sc.grade} · ${sc.gradeText}（${sc.total} / 100） |`);
    L.push(`| 社会等级 | **L${cls.lv} ${cls.level.name}** —— ${cls.level.real} |`);
    L.push(`| 结束时 | 第 ${m.rounds} 轮${E.isAgeMode(g) ? ` · ${m.age} 岁` : ''} |`);
    L.push('');
    L.push(`> ${out.desc}`);
    L.push('');

    L.push('### 关键指标');
    L.push('');
    L.push('| 指标 | 数值 | 说明 |');
    L.push('| --- | --- | --- |');
    metricsOf(g, p, m).forEach(x=> L.push(`| ${mdCell(x[0])} | ${mdCell(x[1])} | ${mdCell(x[2])} |`));
    L.push('');

    L.push('### 维度评分');
    L.push('');
    L.push('| 维度 | 得分 | 分析结论 |');
    L.push('| --- | --- | --- |');
    sc.dims.forEach(d=> L.push(`| ${d.label} | ${Math.round(clamp(d.score, 0, 100))} | ${mdCell(d.comment)} |`));
    L.push(`| **加权总分** | **${sc.total}** | ${mdCell(verdictOf(g, p, m, sc))} |`);
    L.push('');

    L.push(`### 社会等级评估：L${cls.lv} ${cls.level.name}`);
    L.push('');
    L.push(`- **当前等级定性**：${cls.level.real}`);
    L.push('- **判定依据**：');
    cls.evidence.forEach(x=> L.push(`  - ${x[0]}：${stripTags(x[1])}`));
    if(cls.next){
      L.push(`- **距离「${cls.next.name}」**：达成度 ${pct(cls.next.prog)}%`);
      L.push(`  - 达标条件：${stripTags(cls.next.req)}`);
      L.push(`  - 当前差距：${stripTags(cls.next.need)}`);
    } else {
      L.push('- 已经是本局可达到的最高等级。');
    }
    L.push('');

    L.push('### 提升等级的财商手段');
    L.push('');
    cls.levers.forEach((a2, k)=>{
      L.push(`${k + 1}. **${stripTags(a2.t)}**`);
      L.push(`   ${stripTags(a2.d)}`);
    });
    L.push('');

    L.push('### 出圈诊断与改进建议');
    L.push('');
    adviceOf(g, p, m, sc).forEach((a2, k)=>{
      L.push(`${k + 1}. **${stripTags(a2.t)}**`);
      L.push(`   ${stripTags(a2.d)}`);
    });
    L.push('');

    L.push('### 下一局行动清单');
    L.push('');
    planOf(g, p, m).forEach((t, k)=> L.push(`${k + 1}. ${stripTags(t)}`));
    L.push('');

    const ms = p.milestones.slice().reverse().slice(0, 20);
    if(ms.length){
      L.push('### 关键决策时间线（近 ' + ms.length + ' 条）');
      L.push('');
      L.push('| 轮次 | 事件 |');
      L.push('| --- | --- |');
      ms.forEach(x=> L.push(`| 第 ${x.round} 轮 | ${mdCell(x.text)} |`));
      L.push('');
    }
  });

  L.push('---');
  L.push('');
  L.push('*本文件由游戏内「复盘报告 → 导出」生成，可直接用于复盘讨论或存档对照。*');
  return L.join('\n');
}

function exportJSON(g){
  const meta = metaOf(g), all = analyzeAll(g);
  return JSON.stringify({
    meta,
    players: all.map(a=>{
      const { p, m, sc, out, cls, rank } = a;
      return {
        name: p.name,
        job: p.job.name,
        outcome: { key: out.key, title: out.title, desc: out.desc, reason: p.outReason || '' },
        rank: { position: rank, of: all.length },
        grade: { total: sc.total, grade: sc.grade, text: sc.gradeText, verdict: verdictOf(g, p, m, sc) },
        socialClass: {
          level: cls.lv,
          name: cls.level.name,
          summary: cls.level.real,
          passiveIncomeCoverage: +cls.cover.toFixed(4),
          evidence: cls.evidence.map(x=>({ label: x[0], value: stripTags(x[1]) })),
          next: cls.next
            ? { name: cls.next.name, requirement: stripTags(cls.next.req),
                gap: stripTags(cls.next.need), progress: +cls.next.prog.toFixed(4) }
            : null,
          levers: cls.levers.map(x=>({ title: stripTags(x.t), detail: stripTags(x.d) }))
        },
        metrics: {
          rounds: m.rounds, age: m.age, escapeTarget: m.target,
          netWorth: m.nw, peakNetWorth: m.peakNet,
          passiveIncome: m.f.passive, peakPassiveIncome: m.peakPassive,
          totalIncome: m.f.totalIncome, totalExpenses: m.f.totalExpenses, monthlyCashflow: m.f.cashflow,
          cash: p.cash, peakCash: m.peakCash, safetyMonths: +m.safetyMonths.toFixed(2),
          currentSafetyMonths: m.currentSafetyMonths===null?null:+m.currentSafetyMonths.toFixed(2),
          debt: m.debt, monthlyInterest: m.monthlyInterest,
          invested: m.invested, dealsSeen: m.seen, dealsBought: m.buys, dealsPassed: m.passes,
          cashflowGained: m.cfGained, avgCashflowPerDeal: m.avgCf,
          assetKinds: m.kinds.map(k=>ASSET_CN[k]),
          energy: m.energy, energyMax: m.energyMax, energySpent: m.energySpent, energyUpkeep: m.upkeep,
          healthCrises: m.crises, jobless: m.jobless, rehired: m.rehired,
          deficitMonths: m.deficitMonths, deficitTotal: m.deficitTotal, vacations: m.vacations,
          salaryMultiplier: m.salaryMult, lifeStage: m.lifeStage,
          escaped: m.escaped, escapeRound: num(p.escapeRound) || null, ftCashflowGain: num(p.ftGain)
        },
        dimensions: sc.dims.map(d=>({
          key: d.key, label: d.label, score: Math.round(clamp(d.score, 0, 100)), comment: d.comment
        })),
        advice: adviceOf(g, p, m, sc).map(x=>({ title: stripTags(x.t), detail: stripTags(x.d) })),
        nextGamePlan: planOf(g, p, m).map(stripTags),
        milestones: p.milestones.map(x=>({ round: x.round, age:x.age, kind: x.kind, text: x.text })),
        wealthTrack: m.track.map(t=>({ round: t.round, age:t.age, cash: t.cash, passive: t.passive, cashflow: t.cf, netWorth: t.net }))
      };
    })
  }, null, 2);
}

/* 文件名：带上规则 / 模式 / 轮次 / 时间，多次导出不会互相覆盖 */
function exportName(g, ext){
  const meta = metaOf(g);
  return `现金流复盘_${meta.rule}_${meta.mode}_第${meta.round}轮_${fileStamp()}.${ext}`;
}

/* ------------------------------ 报告主体 ------------------------------ */
function reportHTML(g, pid){
  const p = g.players[pid];
  E.initTrack(p);
  const m = collect(g, p);
  const out = outcomeOf(g, p);
  const sc = scoreOf(g, p, m);
  const cls = classDetail(g, p, m);
  const advice = adviceOf(g, p, m, sc);
  const plan = planOf(g, p, m);

  const ranked = g.players.slice().sort((a, b)=> E.netWorth(b) - E.netWorth(a));
  const rank = ranked.findIndex(x=>x.id === p.id) + 1;
  const toneColor = TONE[out.tone] || 'var(--accent)';
  const gradeColor = sc.total >= 72 ? 'var(--green)' : sc.total >= 45 ? 'var(--orange)' : 'var(--red)';
  const passive = m.out ? m.peakPassive : m.f.passive;
  const prog = m.target > 0 ? clamp(passive / m.target, 0, 1) : (passive > 0 ? 1 : 0);
  const gap = Math.max(0, m.target - passive);

  const metrics = metricsOf(g, p, m);

  const dimsHTML = sc.dims.map(d=>{
    const s = Math.round(clamp(d.score, 0, 100));
    const c = s >= 72 ? 'var(--green)' : s >= 45 ? 'var(--orange)' : 'var(--red)';
    return `<div class="sum-dim">
      <div class="sum-dim__hd"><span>${d.label}</span><b style="color:${c}">${s}</b></div>
      <div class="sum-dim__bar"><i style="width:${s}%;background:${c}"></i></div>
      <p class="sum-dim__d">${esc(d.comment)}</p>
    </div>`;
  }).join('');

  /* 社会等级：阶梯 + 判定依据 + 距上一层 + 登台阶的动作 */
  const clsTone = TONE[cls.level.tone] || 'var(--accent)';
  const ladderHTML = E.LADDER.map((L, i)=>
    `<span class="sc-step${i <= cls.lv ? ' sc-step--on' : ''}${i === cls.lv ? ' sc-step--cur' : ''}"
      style="--sc:${TONE[L.tone] || 'var(--accent)'}" title="L${i} ${L.name}"></span>`).join('');
  const clsHTML = `
    <div class="sc-card" style="--sc:${clsTone}">
      <div class="sc-head">
        <span class="sc-ico">${cls.level.ico}</span>
        <div class="sc-head__t">
          <b>L${cls.lv} · ${esc(cls.level.name)}</b>
          <small>${esc(cls.level.real)}</small>
        </div>
      </div>
      <div class="sc-ladder">${ladderHTML}</div>
      <div class="sc-ev">
        ${cls.evidence.map(x=>`<div class="sc-ev__i"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('')}
      </div>
      ${cls.next
        ? `<div class="sc-next">
             <div class="sc-next__hd"><span>距离「${esc(cls.next.name)}」</span><b>${pct(cls.next.prog)}%</b></div>
             <div class="progress"><div class="progress__bar" style="width:${pct(cls.next.prog)}%"></div></div>
             <p class="hint">达标条件：${esc(cls.next.req)}<br>${esc(cls.next.need)}</p>
           </div>`
        : `<p class="hint" style="margin-top:10px">已经是本局可达到的最高等级。</p>`}
    </div>
    <div class="sec__title" style="margin-top:16px">提升等级的财商手段</div>
    <div class="sum-advice">
      ${cls.levers.map((a, i)=>`<div class="sum-adv">
        <div class="sum-adv__n">${i + 1}</div>
        <div><div class="sum-adv__t">${esc(a.t)}</div><p class="sum-adv__d">${esc(a.d)}</p></div>
      </div>`).join('')}
    </div>`;

  const tl = p.milestones.slice().reverse().slice(0, 14);
  const tlHTML = tl.length
    ? tl.map(x=>`<div class="sum-tl__i sum-tl__i--${x.kind}">
        <span class="sum-tl__r">第 ${x.round} 轮</span>
        <span class="sum-tl__t">${esc(x.text)}</span></div>`).join('')
    : '<p class="muted">本局还没有记录到关键决策节点。</p>';

  const adviceHTML = advice.map((a, i)=>`<div class="sum-adv">
      <div class="sum-adv__n">${i + 1}</div>
      <div><div class="sum-adv__t">${esc(a.t)}</div><p class="sum-adv__d">${esc(a.d)}</p></div>
    </div>`).join('');

  const switchHTML = g.players.length > 1
    ? `<div class="segmented segmented--sm sum-switch">
        ${g.players.map(x=>`<button class="segmented__item ${x.id === p.id ? 'segmented__item--active' : ''}" data-sum-pid="${x.id}">${x.icon} ${esc(x.name)}</button>`).join('')}
      </div>`
    : '';

  return `
    <div class="modal__head"><h3>📊 本局复盘报告</h3>
      <p class="muted">依据累计统计、保留的关键决策和最多 60 个财富采样点（按年龄聚合，保留首个已知点）；旧档缺失历史不补造，不是完整交易流水，评级为游戏内模型评价。</p></div>
    <div class="modal__body">
      <div class="sum-scroll">
        ${switchHTML}

        <div class="sum-hero">
          <div class="sum-grade" style="--gc:${gradeColor}">
            <b>${sc.grade}</b><small>${sc.gradeText}</small>
          </div>
          <div class="sum-hero__body">
            <div class="sum-hero__title"><span class="token" style="background:${p.color}">${p.icon}</span> ${esc(p.name)} · ${esc(p.job.name)}</div>
            <div class="sum-hero__tags">
              <span class="chip" style="color:${toneColor};border-color:${toneColor}">${out.ico} ${esc(out.title)}</span>
              <span class="chip">${g.rule} 规则</span>
              <span class="chip">${E.modeLabel(g)}</span>
              <span class="chip">第 ${g.round} 轮${E.isAgeMode(g) ? ' · ' + E.ageOf(g, p) + ' 岁' : ''}</span>
              <span class="chip">净资产第 ${rank} / ${g.players.length} 名</span>
            </div>
            <p class="sum-hero__desc">${esc(out.desc)}</p>
            ${g.winReason ? `<p class="hint">结局：${esc(g.winReason)}</p>` : ''}
          </div>
        </div>

        <div class="sum-verdict" style="border-left-color:${gradeColor}">
          <b>总评 ${sc.total} / 100</b>　${esc(verdictOf(g, p, m, sc))}
        </div>

        <div class="sum-metrics">
          ${metrics.map(x=>`<div class="sum-metric"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('')}
        </div>

        <div class="sec">
          <div class="sec__title"><span>出圈进度（被动收入 ＞ ${money(m.target)}<span class="muted"> = 总支出 × ${E.escapeMargin(g)}</span>）</span><span>${money(passive)} / ${money(m.target)}</span></div>
          <div class="progress"><div class="progress__bar" style="width:${pct(prog)}%"></div></div>
          <p class="hint">${m.escaped
            ? `已成功出圈${num(p.escapeRound) ? '（第 ' + num(p.escapeRound) + ' 轮）' : ''}，进入财务自由圈后已累计企业现金流 ${money(num(p.ftGain))} / ${money(E.empireTarget())}。`
            : (gap > 0 ? `距离出圈还差 <b>${money(gap)}</b> 的月被动收入，相当于完成度 ${pct(prog)}%。` : '已满足出圈条件。')}</p>
        </div>

        <div class="sec">
          <div class="sec__title"><span>社会等级评估</span><span>L${cls.lv} / ${E.LADDER.length - 1}</span></div>
          ${clsHTML}
        </div>

        <div class="sec">
          <div class="sec__title">六维表现</div>
          <div class="sum-dims">${dimsHTML}</div>
        </div>

        <div class="sec">
          <div class="sec__title">财富走势（按年龄聚合回合采样）</div>
          ${p.trackLegacy?'<p class="hint">含旧档保留的历史采样；丢失的早年记录无法补回，历史现金流保持原记录。</p>':''}
          <div class="sum-charts">
            ${sparkline(m.track, 'net', '净资产', v=>money(v))}
            ${sparkline(m.track, 'passive', '被动收入', v=>money(v))}
          </div>
        </div>

        <div class="sec">
          <div class="sec__title">关键决策时间线（近 ${tl.length} 条）</div>
          <div class="sum-tl">${tlHTML}</div>
        </div>

        <div class="sec">
          <div class="sec__title">出圈诊断与改进建议</div>
          <div class="sum-advice">${adviceHTML}</div>
        </div>

        <div class="sec">
          <div class="sec__title">下一局行动清单</div>
          <div class="rowlist">
            ${plan.map((t, i)=>`<div class="rowlist__row"><span>${i + 1}. ${t}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="modal__foot">
      <button class="btn btn--tonal" data-sum-export-md
        title="导出全部 ${g.players.length} 位参与者的维度数据与分析结论（Markdown）">⬇️ 导出分析</button>
      <button class="btn btn--text" data-sum-export-json
        title="导出结构化数据，便于二次处理（JSON）">⬇️ 导出 JSON</button>
      <button class="btn btn--text" data-sum-close>关闭</button>
      ${g.over ? `<button class="btn btn--tonal" data-sum-score>查看战绩</button>` : ''}
      ${g.over ? `<button class="btn btn--primary" data-sum-restart>再来一局</button>` : ''}
    </div>`;
}

/* ------------------------------ 打开报告 ------------------------------ */
function openSummary(pid){
  const g = G() && G().g;
  if(!g) { U.toast('还没有开始对局', 'err'); return; }
  const fallback = (g.winner != null && g.players[g.winner]) ? g.winner : g.cur;
  const target = (pid == null || !g.players[pid]) ? fallback : pid;
  U.openModal(reportHTML(g, target), {
    onDismiss: ()=> U.closeModal(),
    onMount(m){
      $$('[data-sum-close]', m).forEach(b=> b.onclick = U.closeModal);
      $$('[data-sum-pid]', m).forEach(b=> b.onclick = ()=> openSummary(+b.dataset.sumPid));
      const expMd = $('[data-sum-export-md]', m);
      if(expMd) expMd.onclick = ()=>{
        try{
          download(exportName(g, 'md'), exportMarkdown(g), 'text/markdown');
          U.toast(`已导出全部 ${g.players.length} 位参与者的分析报告`, 'ok');
        }catch(e){ U.toast('导出失败：' + e.message, 'err'); }
      };
      const expJson = $('[data-sum-export-json]', m);
      if(expJson) expJson.onclick = ()=>{
        try{
          download(exportName(g, 'json'), exportJSON(g), 'application/json');
          U.toast('已导出结构化数据（JSON）', 'ok');
        }catch(e){ U.toast('导出失败：' + e.message, 'err'); }
      };
      const score = $('[data-sum-score]', m);
      if(score) score.onclick = ()=>{ U.closeModal(); window.UiGame.winnerModal(); };
      const again = $('[data-sum-restart]', m);
      if(again) again.onclick = ()=>{ U.closeModal(); window.UiGame.onMenu('restart'); };
    }
  });
}

window.UiSummary = { openSummary, reportHTML, outcomeOf, collect, scoreOf, adviceOf, planOf,
  /* 社会等级评估 + 导出（供测试与未来复用） */
  classDetail, classBrief, nextReqOf, classEvidence, analyzeAll, metricsOf, exportMarkdown, exportJSON, exportName, download };
})();
