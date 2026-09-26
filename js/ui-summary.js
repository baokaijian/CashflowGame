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
     track       每完成一整轮为所有玩家拍的财富快照（现金 / 被动收入 / 净资产）
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
          : '资不抵债：现金不足以偿付到期债务，且没有可立即变现的资产，银行按半价清算后退出本局。')
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

/* ------------------------------ 五维评分 ------------------------------ */
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
      ? `负债合计 ${money(m.debt)}，${debtPosText(m)}，每月利息支出 ${money(m.monthlyInterest)}。`
      : '全程零负债，没有一分布息支出。' });

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
        `名下资产的每回合维护需要 ${m.upkeep} 点精力，而每回合只能恢复 ${E.energyRecover(g, p)} 点 —— 管不过来的部分，宁可不要。`
      : (m.energySpent > 0
        ? `精力投入合计 ${m.energySpent} 点，全程没有出现健康危机` +
          (m.deficitMonths > 0 ? `；但有 ${m.deficitMonths} 个月入不敷出（合计 ${money(m.deficitTotal)}）。` : '，且收支始终为正。')
        : '整局没有精力投入记录。') });

  const total = Math.round(cashflow * 0.26 + alloc * 0.20 + debtScore * 0.16 + risk * 0.14 + timing * 0.14 + sustain * 0.10);
  const grade = total >= 85 ? 'S' : total >= 72 ? 'A' : total >= 58 ? 'B' : total >= 42 ? 'C' : 'D';
  const gradeText = { S:'出圈高手', A:'财务稳健', B:'稳中有进', C:'尚需优化', D:'亟需调整' }[grade];
  return { dims, total, grade, gradeText };
}

/* 负债占净资产的表述：峰值净资产为负时「百分比」没有意义，必须换成定性说法 */
function debtPosText(m){
  return m.peakNet > 0
    ? `约占峰值净资产的 ${pct(m.debtRatio)}%`
    : '已超过全部资产（峰值净资产为负）';
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
  if(sc.grade === 'S') return '整局节奏很干净：现金流资产持续累积，负债可控，拿到的机会基本没有浪费。';
  if(sc.grade === 'A') return '整体健康：资产端已经跑通，主要差距在出圈速度与安全垫厚度。';
  if(sc.grade === 'B') return '中规中矩：有投资动作，但被动收入增长偏慢，机会利用率还有明确提升空间。';
  if(sc.grade === 'C') return '结构偏弱：现金没能有效转成「能生钱的资产」，负债或意外支出吃掉了本金积累。';
  return '风险敞口过大：现金流为负且缺少缓冲，最终没能撑住。';
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
function classLevers(g, p, m, cls){
  const lv = cls.lv, cover = cls.cover, passive = cls.passive, target = cls.target;
  const out = [];
  const add = (t, d)=> out.push({ t, d });
  const exp = m.f.totalExpenses;
  const upkeep = m.upkeep, recover = E.energyRecover(g, p);

  if(lv === 0){
    add('止血优先于赚钱',
      `当前净资产 ${money(m.nw)}。任何「未来很赚」的资产都比不上先让月度收支转正 —— ` +
      `优先偿清月息最高的那笔负债（信用贷月息 1%，年化约 12%，是所有负债里最贵的）。`);
    add('永远留一项可折价变现的资产',
      '它是你的第二次机会。把全部现金压进流动性差的资产后，一旦遇到意外支出，就只剩「破产出局」这一条路。');
    add('把「月现金流为负」写进禁投清单',
      '哪怕标的账面很便宜 —— 负现金流资产不会让你变富，只会加速把你推出局。');
  }
  if(lv === 1){
    add('第一优先级是攒够 3 个月应急金',
      `按你每月支出 ${money(exp)} 算，目标是 ${money(exp * 3)}；目前现金峰值只有 ${money(m.peakCash)}。` +
      '在攒够之前，不要把钱投入流动性差的资产。');
    add('把「出圈门槛」当成 KPI 来管理',
      `门槛 = 总支出 × ${E.escapeMargin(g)}（现在是 ${money(target)}/月）。偿债能降低支出，但仍需保留住房、用车和消费预算。` +
      '比较贷款管家的实际支出改善，再决定还款顺序。');
    add('每轮固定完成一个动作，不要等「合适的时机」',
      '把「买入 1 笔月现金流为正的资产」写进每轮流程。内圈的财富来自「机会 → 资产」的转化率，不是来自等待。');
  }
  if(lv === 2){
    add('让闲置的现金开始工作',
      `你已经有 ${money(m.peakCash)} 的现金峰值，但被动收入只有 ${money(passive)}/月 —— 钱放在手上不会生钱。` +
      '下一步是把这笔钱换成能持续产生月现金流的资产。');
    add('先配「不需要打理」的金融资产起步',
      '指数基金、存款、债券几乎不占精力、流动性好，适合作为第一桶生息资产；' +
      '等现金流转正、应急金稳固之后，再考虑需要投入时间打理的房产与企业。');
    add('开始接触正现金流房产',
      '判断标准只有一条：租金能否覆盖月供。从「房客替你还贷」开始，而不是从「赌房价上涨」开始。');
  }
  if(lv === 3){
    if(m.seen >= 3 && m.hitRate < 0.5){
      add('提高出手率：机会是内圈唯一的原料',
        `你拿到 ${m.seen} 次机会只出手 ${m.buys} 次（出手率 ${pct(m.hitRate)}）。` +
        '买不起大标的时，就先用成本低、月现金流为正的小额标的上车 —— 空手过格等于放弃一轮复利。');
    } else {
      add('把单笔现金流做大，而不是增加笔数',
        `本局单笔平均带来 ${money(m.avgCf)}/月现金流。下一局把目标定在 +${money(Math.round(Math.max(m.avgCf, 300) * 1.2))}/月以上，` +
        '让每一笔买入都更接近出圈门槛。');
    }
    add('用杠杆，但要让资产替你还债',
      '只有当「月现金流 ≥ 月供」时借钱才是加速；否则杠杆只是把出局的时间提前。');
    add('别只买一类资产',
      '房产/企业拉高被动收入，存款/基金提供流动性防止节奏被打断 —— 两者搭配才能连续爬台阶。');
  }
  if(lv === 4){
    add('同时推「两条边」，比只盯被动收入更快',
      `门槛 = 总支出 × ${E.escapeMargin(g)}（${money(target)}/月）。提前还款可降低偿债支出，` +
      '但住房、用车与消费仍有预算下限；被动收入须严格超过门槛才能出圈。');
    if(upkeep >= recover){
      add('先解决精力约束，再谈扩张',
        `名下资产每回合要花 ${upkeep} 点精力维护，而你的恢复能力只有 ${recover} 点 —— ` +
        '已经没有余量承接新机会。减持一部分需要亲自打理的资产，改配不占精力的金融资产。');
    } else {
      add('把资源集中到最能拉高现金流的那一类标的上',
        `距离 80% 只差 ${money(Math.max(0, target * 0.8 - passive))}。` +
        '与其分散买小资产，不如攒够首付一次拿下现金流最大的标的。');
    }
    add('守住安全垫，别为了提速把应急金也投进去',
      `目前应急金约 ${m.safetyMonths.toFixed(1)} 个月支出。低于 3 个月时，一次意外就能把你打回上一层。`);
  }
  if(lv === 5){
    add('达标当轮立刻出圈，一天都别拖',
      `你距离门槛只差 ${money(Math.max(0, target + 1 - passive))}。出圈资金 = 月被动收入 × 100（≈ 8.3 年被动收入），` +
      '晚一轮就少一轮复利，也会少拿一大笔起始现金。');
    add('最后一笔不要靠高息贷凑',
      '月息 1% 的信用贷会立刻吃掉你刚建立起来的现金流 —— 宁可用小额标的补足，也不要用消费型负债冲线。');
    add('提前想清楚出圈后要做什么',
      `出圈后目标从「被动收入 ＞ 支出 × 安全边际」切换为「企业月现金流累计 ≥ ${money(E.empireTarget())}」。` +
      '先把财务自由圈企业名单看一遍，出圈资金到手就直接下手，不要让现金闲置。');
  }
  if(lv === 6){
    add('把重心从内圈切到企业现金流',
      `你已经出圈，目标变成「企业月现金流累计 ≥ ${money(E.empireTarget())}」，当前累计 ${money(num(p.ftGain))}。` +
      '继续在内圈买小资产已经不再得分，出圈资金应优先配置到企业上。');
    add('性价比最高的动作是特许经营',
      '首付只需要企业成本的 20%，却能拿到原现金流 50% 的额外现金流 —— 这是财务自由圈里回报率最高的一步。');
    add('精力依然是硬约束',
      `企业维护随经营类型与组合规模变化（当前维护 ${upkeep} 点 / 恢复 ${recover} 点）。` +
      '财务自由圈里同样会因过劳而触发健康危机，扩张节奏要留余量。');
  }
  /* 消费升级规则上线后，这条建议对所有中高等级都成立 —— 也是这条规则真正的用意 */
  if(lv >= 4){
    const ls = E.lifestyleOf(g, p);
    add('注意「消费档次」正在抬高你的意外支出',
      `你处在 L${lv}，意外支出按 ×${ls.mult.toFixed(2)} 计价 —— 这是地位的隐性成本：` +
      '豪车的保养与保险、大房子的维护、社会圈的往来标准，都会随档次一起上涨，' +
      '而且几乎无法通过「省一点」来规避，只能通过「不持有」来规避。' +
      '真正的对策是让资产表里以**生息资产**（存款 / 基金 / 股票，不产生维护成本）为主，' +
      '把**消耗型资产**（豪车、豪宅、奢侈品）控制在必要范围内。');
  }
  if(lv === 7){
    add('把这一局的结构复述成你的规则',
      `你以「被动收入 ${money(passive)} ＞ 门槛 ${money(target)}」完成出圈并达成目标。` +
      '真正有价值的是可复用的路径：先把应急金做厚 → 集中买入正现金流资产 → 达标当轮出圈 → 立刻转投企业。');
    add('下一局的挑战是把达标时间往前压',
      `本局在第 ${num(p.escapeRound) || num(m.rounds)} 轮出圈。同样的机会下，能否用更少的轮数完成，是唯一的进阶方向。`);
  }
  /* L4 及以上多给一条：消费档次是「地位越高越贵」的一整套机制，
     只有中产以后才会真正咬人，属于额外的维度，不该挤掉原有的登台阶建议。 */
  return out.slice(0, lv >= 4 ? 4 : 3);
}

/* ------------------------------ 改进建议 ------------------------------ */
/* 全部结论都由 stats / track 推出，带具体数字，可直接指导下一局操作 */
function adviceOf(g, p, m, sc){
  const out = [];
  const add = (t, d)=> out.push({ t, d });
  const passive = m.out ? m.peakPassive : m.f.passive;      /* 出局后资产已清算，用峰值更能反映能力 */
  const gap = Math.max(0, m.target - passive);

  /* 1. 被动收入缺口 —— 内圈的唯一 KPI */
  if(!m.escaped && m.target > 0 && passive < m.target * 0.6){
    const perDeal = Math.max(1, m.avgCf);
    const need = Math.ceil(gap / perDeal);
    add('被动收入是内圈唯一的目标，你的缺口还很实',
      `结束（峰值）被动收入 ${money(passive)}，门槛 ${money(m.target)}，缺口 ${money(gap)}。` +
      (m.deals > 0
        ? `按你本局每笔投资平均带来 ${money(m.avgCf)}/月现金流计算，还需要约 ${need} 笔同类资产。`
        : '本局没有完成任何一笔能产生月现金流的投资，下一局请把「买入正现金流资产」当作每轮的固定动作。'));
  }

  /* 2. 出手率 —— 投资机会是内圈唯一的原料 */
  if(m.seen >= 3 && m.hitRate < 0.5){
    add(sc.total >= 72 ? '出手率还有提升空间' : '投资机会的出手率偏低，机会被大量放弃',
      `拿到 ${m.seen} 次机会只出手 ${m.buys} 次（出手率 ${pct(m.hitRate)}）。内圈的财富来自「机会 → 资产」的转化，` +
      '钱放在手上不会生钱。建议：即使暂时买不起大标的，也优先选成本低、月现金流为正的小额标的先上车。');
  }

  /* 3. 高息负债 —— 唯一会持续吞噬现金流的支出 */
  if(m.monthlyInterest > 0 && m.debtRatio > 0.35){
    add('高息负债正在持续吞噬你的现金流',
      `当前负债 ${money(m.debt)}（${debtPosText(m)}），其中信用贷每月利息 ${money(m.monthlyInterest)}，` +
      `占月收入的 ${pct(ratio(m.monthlyInterest, Math.max(1, m.f.totalIncome)))}%。` +
      '建议：每凑够 6 个月利息就先还一笔本金，并且「还清前不再新增消费型借贷」。');
  }

  /* 4. 安全垫 —— 直接决定会不会被意外击穿 */
  if(!m.out && m.safetyMonths < 2){
    const need = Math.round(m.f.totalExpenses * 3);
    add('没有安全垫，任何一次意外支出都可能直接击穿你',
      `现金峰值 ${money(m.peakCash)}，只够 ${m.safetyMonths.toFixed(1)} 个月的支出。` +
      `建议先把应急金做到 3 个月支出（约 ${money(need)}）再扩大投资，避免被迫做「折价急售」这种亏本变现。`);
  }

  /* 4b. 健康危机 —— 过劳的真实代价，且会持续拖累现金流 */
  if(m.crises > 0){
    add('资产规模已经超出你能照看的范围',
      `整局发生 ${m.crises} 次健康危机。触发原因不是运气，而是结构问题：名下资产每回合需要 ${m.upkeep} 点精力去维护，` +
      `而你的恢复能力只有 ${E.energyRecover(g, p)} 点/回合。` +
      '建议：① 少买「需要你亲自打理」的资产（房产 / 企业），多配「不需要打理」的（指数基金、存款、债券）；' +
      '② 每 2—3 轮安排一次休假（停在起点，花约一个月支出换精力），把状态维持在预警线以上。');
  } else if(m.upkeep >= E.energyRecover(g, p)){
    add('你的资产维护成本已经吃满全部精力',
      `当前资产每回合消耗 ${m.upkeep} 点精力，而恢复能力是 ${E.energyRecover(g, p)} 点 —— 已经没有余量承接新机会。` +
      '建议：先减持一部分需要打理的资产，或改配不占精力的金融资产，再考虑扩张。');
  }

  /* 4c. 入不敷出 —— 收入盖不住支出，是最危险的信号 */
  if(m.deficitMonths > 0){
    add('出现过入不敷出，说明现金流结构本身不成立',
      `整局有 ${m.deficitMonths} 个月收入盖不住支出，累计动用储蓄补了 ${money(m.deficitTotal)}。` +
      (m.jobless > 0
        ? `其中主要发生在失业期间（工资归零、支出照付）—— 这正是应急金的意义：按你目前的支出，` +
          `失业 3 个月就需要准备约 ${money(m.f.totalExpenses * 3)}。`
        : '常见原因是贷款月供超过了收入，建议优先偿还月息最高的那笔，把月现金流拉回正数。'));
  }

  /* 4d. 时间与年龄 —— 收入会随年龄回落，越晚越难 */
  if(E.isAgeMode(g) && !m.escaped && !m.out && m.age >= 40 && m.salaryMult <= 1){
    add('你的收入已经越过了峰值，时间不再是免费的',
      `当前 ${m.age} 岁，收入系数 ×${m.salaryMult}（巅峰期是 ×1.20），此后还会继续回落。` +
      '现实中的职场收入曲线就是这样：35—45 岁是唯一的窗口期。' +
      '建议把「在收入下滑前完成原始积累」当成硬约束 —— 越晚开始，同样一笔资产能滚出的被动收入越少。');
  }

  /* 5. 资产结构 —— 只买一类资产，风险与收益都过于集中 */
  if(m.kindCount > 0 && m.kindCount <= 2 && m.deals >= 2){
    add('资产结构过于单一',
      `整局只配置了 ${m.kinds.map(k=>ASSET_CN[k]).join('、')} 共 ${m.kindCount} 类资产。` +
      '建议把「产生月现金流的资产（房产 / 企业）」与「提供流动性的资产（存款 / 基金）」搭配使用：前者拉高被动收入，后者防止被意外支出打断节奏。');
  }

  /* 6. 破产 / 出局 —— 直接原因复盘 */
  if(m.out){
    add(p.outReason === '主动认输' ? '认输本身没问题，但要看清是哪一步开始失控' : '破产的直接原因：现金流为负 + 没有可动用的资产',
      `出局时月现金流 ${money(m.f.cashflow)}、负债 ${money(m.debt)}、可急售资产为零。` +
      '两个可执行的动作：① 不做「月现金流为负」的投资，哪怕它账面很便宜；② 无论何时都保留至少一项可折价变现的资产，它等于你的第二次机会。');
  }

  /* 7. 出圈之后的新目标 */
  if(m.escaped && !m.out && num(m.st.ftBusinesses) === 0){
    add('已经出圈，但财务自由圈的得分完全没拿到',
      `你在第 ${num(p.escapeRound) || '—'} 轮出圈，但还没有购买任何财务自由圈企业。出圈后目标已经从「被动收入 ＞ 支出 × 安全边际」切换为` +
      `「企业月现金流累计增加 ≥ ${money(E.empireTarget())}」—— 请把出圈资金优先配置到企业上，而不是继续在内圈买小资产。`);
  }

  /* 8. 意外支出的侵蚀 */
  if(num(m.st.forcedTotal) > 0 && m.invested > 0 && num(m.st.forcedTotal) / m.invested > 0.5){
    add('被动支出吃掉了相当一部分本金',
      `整局被动支付（意外支出 / 失业 / 财务自由圈事件）合计 ${money(num(m.st.forcedTotal))}${erosionText(m)}。` +
      '这部分无法避免，只能靠「应急金 + 不让月现金流为负」来降低它的破坏力。');
  }

  /* 9. 时间账：年龄模式下最重要的是剩余轮数 */
  if(E.isAgeMode(g) && !m.escaped && !m.out && sc.total < 72){
    const left = E.yearsLeft(g, p);
    add('时间是最稀缺的资源',
      `你目前 ${E.ageOf(g, p)} 岁，距离 ${g.endAge} 岁退休只剩 ${left} 年（${left} 次年度结算）。` +
      '越往后复利空间越小，建议把「每 2 轮至少完成 1 笔正现金流资产」当作硬性节奏，而不是有合适机会才出手。');
  }

  /* 表现不错时也给一条正向确认与精进方向 */
  if(sc.total >= 72 && out.length < 3){
    add('本局做得好的地方，下一局保持',
      `出圈进度完成度 ${Math.round(clamp(m.target > 0 ? m.peakPassive / m.target : 0, 0, 1) * 100)}%、出手率 ${pct(m.hitRate)}、` +
      `${m.debt > 0 ? '负债控制在净资产的 ' + pct(m.debtRatio) + '%' : '全程零负债'}。` +
      '可以进一步优化的只有一处：把出圈所需的时间压缩 —— 在同样的机会下更快把现金换成资产。');
  }

  if(!out.length){
    add('本局没有发现明显的结构性问题',
      '继续沿用当前节奏即可：优先拿下能产生月现金流的资产，把负债控制在净资产 30% 以内，出圈后立刻把重心切到企业现金流。');
  }
  return out.slice(0, 5);
}

/* ------------------------------ 下一局行动清单 ------------------------------ */
function planOf(g, p, m){
  const list = [];
  const cashNeed = Math.round(Math.max(0, m.f.totalExpenses * 3 - 0));
  if(m.out || m.safetyMonths < 2){
    list.push(`前 3 轮先把应急金攒到约 <b>${money(Math.max(cashNeed, num(p.startCash) * 2))}</b>（≈ 3 个月支出）再开始大面积投资。`);
  } else {
    list.push('保持安全垫：任何时候手上都留够 <b>3 个月支出</b> 的现金，不把它全部投入资产。');
  }
  const perDeal = Math.round(Math.max(m.avgCf, 300) * 1.2 / 100) * 100;
  list.push(`每轮至少完成 <b>1 笔月现金流为正</b> 的资产${m.avgCf > 0 ? `（本局单笔平均 +${money(m.avgCf)}/月，下一局目标 +${money(perDeal)}/月以上）` : ''}，不要空手过格。`);
  if(m.debtRatio > 0.3 || m.monthlyInterest > 0){
    list.push(`把负债压到 <b>净资产的 30% 以内</b>（本局${m.peakNet > 0 ? '约 ' + pct(m.debtRatio) + '%' : '已超过全部资产'}），并优先归还月息最高的那笔。`);
  } else {
    list.push('维持低负债：只在大标的出现、且月现金流能覆盖利息时使用信用贷。');
  }
  if(m.escaped){
    list.push(`出圈后立刻把重心从「买小资产」切到 <b>企业现金流 ≥ ${money(E.empireTarget())}</b>，并优先开设特许经营。`);
  } else if(num(m.f.passive) >= m.target){
    list.push(`你已满足出圈条件（被动收入 ${money(m.f.passive)} ≥ 门槛 ${money(m.target)}），下一局的重点是 <b>更早达标</b>：把达标轮数从第 ${num(m.rounds) || num(g.round)} 轮继续往前压。`);
  } else {
    list.push(`盯住出圈线：把被动收入从 ${money(m.f.passive)} 推到 <b>${money(m.target)}</b> 以上，达标当轮就立刻出圈拿资金。`);
  }
  return list.slice(0, 4);
}

/* ------------------------------ 迷你走势图 ------------------------------ */
function sparkline(track, key, label, fmt){
  const arr = track.map(t=>num(t[key]));
  if(arr.length < 2) return `<div class="sum-chart"><div class="sum-chart__hd"><span>${label}</span></div><p class="muted">对局轮数过少，暂无走势。</p></div>`;
  const W = 300, H = 56;
  const min = Math.min.apply(null, arr), max = Math.max.apply(null, arr);
  const span = (max - min) || 1;
  const step = W / (arr.length - 1);
  const pts = arr.map((v, i)=>[i * step, H - ((v - min) / span) * (H - 10) - 5]);
  const line = pts.map((c, i)=>(i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = line + ` L ${W} ${H} L 0 ${H} Z`;
  return `<div class="sum-chart">
    <div class="sum-chart__hd"><span>${label}</span><b>${fmt(max)}</b></div>
    <svg class="sum-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${area}" style="fill:var(--accent);opacity:.12"/>
      <path d="${line}" style="fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round"/>
    </svg>
    <div class="sum-chart__ft"><span>第 ${track[0].round} 轮 · ${fmt(min)}</span><span>第 ${track[track.length-1].round} 轮 · ${fmt(arr[arr.length-1])}</span></div>
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
    ['健康危机', m.crises > 0 ? `${m.crises} 次` : '未发生',
      m.crises > 0 ? '精力透支到归零 · 被迫休养' : `精力投入合计 ${m.energySpent} 点`],
    ['逆流冲击', m.jobless > 0 ? `失业 ${m.jobless} 次` : '未遭遇失业',
      m.deficitMonths > 0 ? `${m.deficitMonths} 个月入不敷出 ${money(m.deficitTotal)}` : '收支始终为正']
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
  L.push(`> 导出时间：${meta.exportedAt}　|　数据来源：累计统计、保留的关键决策和最近最多 60 个财富采样点；不是完整交易流水，评级为游戏内模型评价。`);
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
      <p class="muted">依据累计统计、保留的关键决策和最近最多 60 个财富采样点；不是完整交易流水，评级为游戏内模型评价。</p></div>
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
          <div class="sec__title">五维表现</div>
          <div class="sum-dims">${dimsHTML}</div>
        </div>

        <div class="sec">
          <div class="sec__title">财富走势（每完成一整轮采样一次）</div>
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
