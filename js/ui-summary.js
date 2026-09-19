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
    rounds: g.round, age: E.ageOf(g),
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
    out: !!p.out
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

  const total = Math.round(cashflow * 0.28 + alloc * 0.22 + debtScore * 0.18 + risk * 0.16 + timing * 0.16);
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
      `你在第 ${num(p.escapeRound) || '—'} 轮出圈，但还没有购买任何财务自由圈企业。出圈后目标已经从「被动收入 ＞ 支出」切换为` +
      '「企业月现金流累计增加 ≥ ¥50,000」—— 请把出圈资金优先配置到企业上，而不是继续在内圈买小资产。');
  }

  /* 8. 意外支出的侵蚀 */
  if(num(m.st.forcedTotal) > 0 && m.invested > 0 && num(m.st.forcedTotal) / m.invested > 0.5){
    add('被动支出吃掉了相当一部分本金',
      `整局被动支付（意外支出 / 失业 / 财务自由圈事件）合计 ${money(num(m.st.forcedTotal))}${erosionText(m)}。` +
      '这部分无法避免，只能靠「应急金 + 不让月现金流为负」来降低它的破坏力。');
  }

  /* 9. 时间账：年龄模式下最重要的是剩余轮数 */
  if(E.isAgeMode(g) && !m.escaped && !m.out && sc.total < 72){
    const left = E.yearsLeft(g);
    add('时间是最稀缺的资源',
      `你目前 ${E.ageOf(g)} 岁，距离 ${g.endAge} 岁退休只剩 ${left} 年（${left} 轮）。` +
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
    list.push('出圈后立刻把重心从「买小资产」切到 <b>企业现金流 ≥ ¥50,000</b>，并优先开设特许经营。');
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

/* ------------------------------ 报告主体 ------------------------------ */
function reportHTML(g, pid){
  const p = g.players[pid];
  E.initTrack(p);
  const m = collect(g, p);
  const out = outcomeOf(g, p);
  const sc = scoreOf(g, p, m);
  const advice = adviceOf(g, p, m, sc);
  const plan = planOf(g, p, m);

  const ranked = g.players.slice().sort((a, b)=> E.netWorth(b) - E.netWorth(a));
  const rank = ranked.findIndex(x=>x.id === p.id) + 1;
  const toneColor = TONE[out.tone] || 'var(--accent)';
  const gradeColor = sc.total >= 72 ? 'var(--green)' : sc.total >= 45 ? 'var(--orange)' : 'var(--red)';
  const passive = m.out ? m.peakPassive : m.f.passive;
  const prog = m.target > 0 ? clamp(passive / m.target, 0, 1) : (passive > 0 ? 1 : 0);
  const gap = Math.max(0, m.target - passive);

  const metrics = [
    ['结束时净资产', money(m.nw), `峰值 ${money(m.peakNet)}`],
    ['被动收入峰值', money(m.peakPassive), `出圈门槛 ${money(m.target)}`],
    ['累计投入', money(m.invested), `${m.buys} 笔买入 · 新增现金流 ${money(m.cfGained)}/月`],
    ['现金峰值', money(m.peakCash), m.f.totalExpenses > 0 ? `≈ ${m.safetyMonths.toFixed(1)} 个月支出` : '—'],
    ['融资总额', money(num(m.st.loanTotal)), m.debt > 0 ? `当前负债 ${money(m.debt)}` : '已全部结清'],
    ['被动支出', money(num(m.st.forcedTotal)), `${num(m.st.forcedCount)} 次意外 / 失业 / 事件`]
  ];

  const dimsHTML = sc.dims.map(d=>{
    const s = Math.round(clamp(d.score, 0, 100));
    const c = s >= 72 ? 'var(--green)' : s >= 45 ? 'var(--orange)' : 'var(--red)';
    return `<div class="sum-dim">
      <div class="sum-dim__hd"><span>${d.label}</span><b style="color:${c}">${s}</b></div>
      <div class="sum-dim__bar"><i style="width:${s}%;background:${c}"></i></div>
      <p class="sum-dim__d">${esc(d.comment)}</p>
    </div>`;
  }).join('');

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
      <p class="muted">数据来自整局的每一次决策与逐轮快照，非主观评价</p></div>
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
              <span class="chip">${E.isAgeMode(g) ? '年龄模式' : '无限模式'}</span>
              <span class="chip">第 ${g.round} 轮${E.isAgeMode(g) ? ' · ' + E.ageOf(g) + ' 岁' : ''}</span>
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
          <div class="sec__title"><span>出圈进度（被动收入 ＞ ${money(m.target)}）</span><span>${money(passive)} / ${money(m.target)}</span></div>
          <div class="progress"><div class="progress__bar" style="width:${pct(prog)}%"></div></div>
          <p class="hint">${m.escaped
            ? `已成功出圈${num(p.escapeRound) ? '（第 ' + num(p.escapeRound) + ' 轮）' : ''}，进入财务自由圈后已累计企业现金流 ${money(num(p.ftGain))} / ¥50,000。`
            : (gap > 0 ? `距离出圈还差 <b>${money(gap)}</b> 的月被动收入，相当于完成度 ${pct(prog)}%。` : '已满足出圈条件。')}</p>
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
      const score = $('[data-sum-score]', m);
      if(score) score.onclick = ()=>{ U.closeModal(); window.UiGame.winnerModal(); };
      const again = $('[data-sum-restart]', m);
      if(again) again.onclick = ()=>{ U.closeModal(); window.UiGame.onMenu('restart'); };
    }
  });
}

window.UiSummary = { openSummary, reportHTML, outcomeOf, collect, scoreOf, adviceOf, planOf };
})();
