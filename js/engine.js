/* ==========================================================================
   engine.js — 游戏核心引擎（纯逻辑，无 DOM 依赖）
   规则依据：《富爸爸穷爸爸》现金流游戏完整规则文档（101 + 202 整合版）
   ========================================================================== */
(function(){
'use strict';

/* ------------------------------ 工具 ------------------------------ */
const money = n => (n<0?'-¥':'¥') + Math.abs(Math.round(n)).toLocaleString('en-US');
const moneyK = n => '¥' + Math.round(n).toLocaleString('en-US');
function shuffle(a, rnd){
  const arr = a.slice();
  for(let i=arr.length-1;i>0;i--){ const j = Math.floor((rnd?rnd():Math.random())*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}
function pick(arr, rnd){ return arr[Math.floor((rnd?rnd():Math.random())*arr.length)]; }

/* ------------------------------ 卡组 ------------------------------ */
/* ★ 牌堆必须记住自己的随机源：牌抽完重洗时若退回 Math.random()，
   同一个 seed 下「前一轮可复现、重洗之后不可复现」—— 确定性会从中间断掉。 */
function makeDeck(cards, rnd){
  return { draw: shuffle(cards, rnd), disc: [], total: cards.length, rnd: rnd || null };
}
function drawCard(deck, onReshuffle){
  if(deck.draw.length === 0){
    deck.draw = shuffle(deck.disc, deck.rnd); deck.disc = [];
    if(onReshuffle) onReshuffle();
  }
  return deck.draw.pop() || null;
}
function deckLeft(deck){ return deck.draw.length; }

/* ------------------------------ 贷款计划 ------------------------------ */
/* 统一口径：六类负债都是「等额本息」，每笔贷款都有明确的
   剩余本金 / 合同月供 / 月利率 / 剩余期数 / 剩余利息，且全部支持提前还款。
   ★ 期数不写死，而是由 (剩余本金, 月利率, 合同月供) 反推 ——
     这样职业卡上的月供与现有现金流一分不变，只是把原本缺失的
     「还了多少期、还剩几期、还剩多少利息」补齐。
   ★ liabs.* 仍然只存【剩余本金】这一个数字：净资产、破产清算、存档格式零改动。 */
const LOAN_KEYS = ['home','school','car','credit','other','bank'];
const numOr = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
const numOrDef = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
function loanType(key){
  const t = (window.LOAN_TYPES || {})[key];
  return t || { nm:key, rate:0.004, prepayRate:0, minPeriod:0, kind:'annuity', note:'' };
}
/* 等额本息：由 (本金, 月利率, 期数) 求月供 */
function dueOf(balance, rate, n){
  const b = numOr(balance);
  if(b <= 0) return 0;
  if(rate <= 0) return Math.ceil(b / Math.max(1, n));
  if(!n || n <= 0) return Math.ceil(b * (1 + rate));
  const f = Math.pow(1 + rate, n);
  return Math.ceil(b * rate * f / (f - 1));
}
/* ------------------------------ 时间口径 ------------------------------ */
/* 每经过一个发薪日 / 分红日结算 1 年，并让该玩家长 1 岁。
   回合只表示行动顺序，不推进年龄；没有积欠或额外补结。 */

function monthsPerPayday(){
  return (window.TIME && window.TIME.monthsPerPayday) || 12;
}
/* 一年有多少个月 —— 目前与 monthsPerPayday 相等，但概念不同：
   前者是「利率年化的分母」，后者是「一次发薪日结算的月数」。
   分开定义，将来若要改成「半年结算一次」，只需改 monthsPerPayday。 */
function monthsPerYear(){
  return (window.TIME && window.TIME.monthsPerYear) || 12;
}
/* 期数（月）→ 年。向上取整：还剩 1 期也要说「还剩 1 年」，
   说「还剩 0 年」会让玩家以为已经还清了。 */
function toYears(periods){
  if(periods == null || !isFinite(periods)) return periods;   /* Infinity（还不完）原样透传 */
  return Math.ceil(numOr(periods) / monthsPerPayday());
}
/* 已还期数 → 已还年数（向下取整：不满一年不算一年） */
function toYearsFloor(periods){
  if(periods == null || !isFinite(periods)) return periods;
  return Math.floor(numOr(periods) / monthsPerPayday());
}
/* 月度金额 → 年度金额。界面统一读它，不要各处自己 ×12 */
function annual(v){ return Math.round(numOr(v) * monthsPerPayday()); }

/* 等额本息：由 (本金, 月利率, 月供) 反推剩余期数；月供不足以覆盖利息时返回 Infinity */
function periodsOf(balance, rate, due){
  const b = numOr(balance), d = numOr(due);
  if(b <= 0) return 0;
  if(d <= 0) return Infinity;
  if(rate <= 0) return Math.ceil(b / d);
  const cover = b * rate;
  if(d <= cover) return Infinity;
  return Math.ceil(-Math.log(1 - cover / d) / Math.log(1 + rate));
}
/* 职业卡上的月供（旧存档没有贷款计划时回落用） */
function cardDue(p, key){
  const job = p.job || {};
  if(key === 'home')   return numOr(job.home);
  if(key === 'school') return numOr(job.school);
  if(key === 'car')    return numOr(job.car) || Math.round(numOr(p.liabs && p.liabs.car) * 0.025);
  if(key === 'credit') return numOr(job.credit);
  return 0;
}
/* 建立 / 补齐贷款计划。旧存档（没有 p.loans）在首次访问时自动补出来 */
function ensureLoans(p){
  if(!p) return p;
  if(!p.liabs) p.liabs = { home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 };
  if(!p.loans || typeof p.loans !== 'object') p.loans = {};
  /* 旧存档兼容：早期组合卡把负债写在 extra 上；它的月供记在 extraPay 里，建计划时并进去 */
  const legacy = numOr(p.liabs.extra) > 0;
  if(legacy){
    p.liabs.other = numOr(p.liabs.other) + numOr(p.liabs.extra);
    p.liabs.extra = 0;
  }
  const extra = p._pfExtra || null;          /* 202 组合卡附带的月供，并入对应贷款 */
  LOAN_KEYS.forEach(key=>{
    const bal = numOr(p.liabs[key]);
    let m = p.loans[key];
    const fresh = !m || typeof m !== 'object';
    if(fresh) m = p.loans[key] = { base:bal, due:cardDue(p, key), periods:0 };
    if(typeof m.base !== 'number')    m.base = bal;
    if(typeof m.due !== 'number')     m.due = cardDue(p, key);
    if(typeof m.periods !== 'number') m.periods = 0;
    if(bal > m.base) m.base = bal;                    /* 中途又借了 → 原本金跟进 */
    if(extra && extra[key]) m.due += numOr(extra[key]);
    if(fresh && legacy && key === 'other' && numOr(p.liabs.extraPay) > 0){
      m.due = numOr(p.liabs.extraPay);                /* 旧档把这笔月供记在 extraPay 上，迁移过来 */
      p.liabs.extraPay = 0;
    }
  });
  if(extra) delete p._pfExtra;
  return p;
}
/* 当前月供：信用贷按余额计息，其余用合同月供 */
function loanDue(p, key){
  ensureLoans(p);
  const bal = numOr(p.liabs[key]);
  if(bal <= 0) return 0;
  const t = loanType(key);
  if(t.kind === 'revolving') return Math.round(bal * t.rate);
  const m = p.loans[key];
  return numOr(m && m.due) || cardDue(p, key) || Math.round(bal * t.rate);
}
/* 单笔贷款的全貌：贷款管家面板与复盘报告都用它 */
function loanInfo(p, key){
  ensureLoans(p);
  const t = loanType(key), bal = numOr(p.liabs[key]);
  const m = p.loans[key] || { base:bal, due:0, periods:0 };
  const due = loanDue(p, key);
  const revolving = t.kind === 'revolving';
  const remaining = (bal <= 0) ? 0 : (revolving ? null : periodsOf(bal, t.rate, due));
  const interestLeft = (remaining === null || !isFinite(remaining)) ? null : Math.max(0, due * remaining - bal);
  const M = monthsPerPayday(), per = numOr(m.periods);
  return {
    key, nm:t.nm, note:t.note, kind:t.kind,
    rate:t.rate, rateAnnual:t.rate * monthsPerYear(), prepayRate:t.prepayRate, minPeriod:t.minPeriod,
    balance:bal, due, dueYear:annual(due),          /* 月供与年供，界面按「年」展示 */
    base:numOr(m.base), periods:per,
    /* ★ 期限一律以【年】对外：remainingYears 才是给玩家看的那个数，
       remaining（月）只留给提前还款的计算用 —— 两者不要混着放进界面。 */
    remaining, remainingYears: toYears(remaining),
    paidYears: toYearsFloor(per),
    interestLeft, interestLeftYear: interestLeft == null ? null : Math.round(interestLeft),
    revolving,
    canPrepay: bal > 0 && per >= t.minPeriod,
    canPrepayYears: Math.floor(t.minPeriod / M)
  };
}
/* 推进一期还款：利息 = 剩余本金 × 月利率，月供的其余部分冲减本金。
   在「经过发薪日」时调用 —— 与月现金流（其中已含月供）同步结算，账实一致。 */
/* 每个结算年 → 摊还 monthsPerPayday() 期（领几年就还几年）。
   ★ 为什么必须一次还 12 期，而不是「一年只还 1 期」：
     合同的月供是按【月】计息的（月利率 0.41% 等），若一年只还 1 期，
     本金下降速度远慢于时间的流逝 —— 一笔 140 期的房贷要 140 年才能还完，
     而人的一生只有 45 年，于是「剩余期限」永远停在原地。
     一次还满 12 期之后，期限与年龄才是同一个刻度：140 期 = 11.7 年。
   ★ 逐期取整而不是一次性算 12 期：利息是小数，分 12 次取整能保持
     「剩余本金始终是整数」，且每期的还款额与合同月供完全一致。 */
/* 一次摊还 `years` 年（默认 1 年 = monthsPerPayday 期）。
   ★ 参数化的原因：结算覆盖的年数不再固定为 1 年（见 movePlayer），
     摊还必须跟着结算走 —— 否则会出现「领了 3 年的钱、只还了 1 年的债」。 */
function amortize(g, p, years){
  if(!p || p.out) return;
  ensureLoans(p);
  const M = monthsPerPayday() * Math.max(1, Math.round(numOrDef(years, 1)));
  LOAN_KEYS.forEach(key=>{
    const t = loanType(key);
    if(t.kind === 'revolving') return;               /* 信用贷按余额计息，不做本金摊还 */
    let bal = numOr(p.liabs[key]);
    if(bal <= 0) return;
    const due = loanDue(p, key);
    for(let k = 0; k < M; k++){
      if(bal <= 1) break;
      const pay = Math.min(bal, Math.max(0, due - bal * t.rate));
      bal = Math.round(bal - pay);
      p.loans[key].periods += 1;
    }
    p.liabs[key] = bal <= 1 ? 0 : bal;
    /* 只在「这一年正好还清」时报一次，避免逐期刷屏 */
    if(p.liabs[key] === 0){
      const n = p.loans[key].periods;
      log(g, `${p.name} 的${t.nm}已还清（共摊还 ${n} 期 ≈ ${toYears(n)} 年）`, 'good', p.name);
    }
  });
}
/* 提前还款「预演」：只计算不落账。
   ★ 界面上的预览与真正扣款共用这一个函数，杜绝「算一套、扣另一套」的偏差。
   amount = 本次还本额；mode = 'shorten'（月供不变·缩短期限，默认）| 'reduce'（期限不变·减少月供）
   应还现金 = 还本额 + 违约金；违约金 = 还本额 × 该类贷款的 prepayRate（房贷/助学/信用贷/其他为 0） */
function prepayPlan(p, key, amount, mode){
  ensureLoans(p);
  const t = loanType(key), info = loanInfo(p, key);
  const plan = { ok:false, msg:'', key, nm:t.nm, t, info, mode:'shorten' };
  if(info.balance <= 0){ plan.msg = `${t.nm}已经结清，无需还款。`; return plan; }
  if(!info.canPrepay){ plan.msg = `${t.nm}需还满 ${t.minPeriod} 期后才能提前还款（目前已还 ${info.periods} 期）。`; return plan; }
  let amt = Math.round(numOr(amount));
  if(amt <= 0){ plan.msg = '提前还款金额需大于 0。'; return plan; }
  amt = Math.min(amt, info.balance);
  const cleared = amt >= info.balance;
  if(!cleared && !info.revolving && info.due > 0 && amt < info.due){
    plan.msg = `部分提前还款不得低于 1 期月供（${money(info.due)}）；想一次还清请直接选「结清全部」。`;
    return plan;
  }
  const fee = Math.round(amt * t.prepayRate);
  const need = amt + fee;
  if(p.cash < need){
    plan.msg = `现金不足：本次需支付 ${money(need)}（还本 ${money(amt)}${fee ? ` + 违约金 ${money(fee)}` : ''}）。`;
    return plan;
  }
  const newBal = info.balance - amt;
  let newDue = info.due, newRem = info.remaining;
  if(cleared){ newDue = 0; newRem = 0; }
  else if(info.revolving){ newDue = Math.round(newBal * t.rate); newRem = null; }
  else if(mode === 'reduce'){
    /* 期限不变·减少月供：按「原剩余期数」重算月供 */
    const n = (isFinite(info.remaining) && info.remaining > 0) ? info.remaining : periodsOf(info.balance, t.rate, info.due);
    newDue = dueOf(newBal, t.rate, n);
  } else {
    /* 月供不变·缩短期限 */
    newRem = periodsOf(newBal, t.rate, info.due);
  }
  const newInt = (newRem === null || !isFinite(newRem)) ? null : Math.max(0, newDue * newRem - newBal);
  return Object.assign(plan, {
    ok:true, amt, fee, need, cleared,
    mode: cleared ? 'settle' : (mode === 'reduce' ? 'reduce' : 'shorten'),
    before:{ due:info.due, remaining:info.remaining, interestLeft:info.interestLeft, balance:info.balance },
    after:{ due:newDue, remaining:newRem, interestLeft:newInt, balance:newBal },
    savedInterest:(info.interestLeft != null && newInt != null) ? Math.max(0, info.interestLeft - newInt) : null
  });
}
/* 提前还款：预演通过后落账 —— 扣现金、减本金、按所选方式更新还款计划 */
function prepay(g, p, key, amount, mode){
  const plan = prepayPlan(p, key, amount, mode);
  if(!plan.ok) return plan;
  const t = plan.t;
  p.cash -= plan.need;
  p.liabs[key] = Math.max(0, plan.after.balance);
  if(plan.after.balance > 0 && !plan.info.revolving && plan.mode === 'reduce'){
    p.loans[key].due = plan.after.due;
  }
  const cleared = plan.after.balance <= 0;
  log(g, `${p.name} 提前偿还${t.nm} ${money(plan.amt)}${plan.fee ? `（违约金 ${money(plan.fee)}）` : ''}${cleared ? '，该笔贷款已结清' : `，剩余本金 ${money(plan.after.balance)}`}`, cleared ? 'good' : 'info', p.name);
  milestone(g, p, `第 ${g.round} 轮提前偿还${t.nm} ${money(plan.amt)}${plan.fee ? `（违约金 ${money(plan.fee)}）` : ''}${cleared ? '，贷款结清' : `，剩余 ${money(plan.after.balance)}`}`, 'info');
  return { ok:true, paid:plan.need, fee:plan.fee, principal:plan.amt, cleared, mode:plan.mode,
    before:plan.before, after:plan.after, savedInterest:plan.savedInterest };
}

/* ------------------------------ 人生阶段与精力 ------------------------------ */
/* 借鉴「财富流沙盘」的三层人生结构与精力机制，并结合中国现实标定。
   设计前提：下面这些量【全部推导自年龄】，而不是散落在各处手写常数 ——
   于是「年龄推进 → 收入与支出结构随之变化」成为一条可验证的因果链。 */
function curveAt(curve, age, key){
  for(let i=0;i<curve.length;i++) if(age <= curve[i].age) return curve[i][key];
  return curve[curve.length-1][key];
}
function salaryStageOf(g, p){
  const age = ageOf(g, p), C = window.SALARY_CURVE;
  for(let i=0;i<C.length;i++) if(age <= C[i].to) return C[i];
  return C[C.length-1];
}
function lifeStageOf(g, p){
  const age = ageOf(g, p), L = window.LIFE_STAGES;
  for(let i=0;i<L.length;i++) if(age <= L[i].to) return L[i];
  return L[L.length-1];
}
/* 精力上限：随年龄衰减（40 岁后体力与恢复力明显下降） */
function energyMax(g, p){ return curveAt(window.ENERGY.maxCurve, ageOf(g, p), 'max'); }
/* 每回合自然恢复；健康危机期间打对折 —— 身体处在恢复期，休息效率本身就低 */
function energyRecover(g, p){
  let v = curveAt(window.ENERGY.recoverCurve, ageOf(g, p), 'v');
  if(numOr(p.crisisTurns) > 0) v = Math.round(v / 2);
  return v;
}
/* 每回合「持有」维护精力：金融资产几乎不需要打理，房产 / 企业 / 持仓期权才持续占用时间。
   这正是「长期持有指数基金」与「自己开店」在真实世界里最本质的差别之一。 */
function energyUpkeep(p){
  const U = window.ENERGY.upkeep;
  let v = 0;
  v += (p.assets.realEstate||[]).length * U.realEstate;
  v += (p.assets.business||[]).length   * U.business;
  v += (p.assets.ftBusiness||[]).length * U.ftBusiness;
  v += (p.options||[]).length           * U.option;
  v += (p.shorts||[]).length            * U.short;
  return v;
}
function isJobless(p){ return numOr(p.joblessNeed) > 0 && numOr(p.joblessProgress) < numOr(p.joblessNeed); }
/* 按年龄与就业状态重算：工资、个税、生活支出系数、赡养支出、精力上限。
   ★ 之所以把结果【写回玩家字段】而不是改 finance 的签名，是为了让 finance(p) 保持原样 ——
     否则几十处调用点都要改成 finance(g,p)，风险远大于收益。 */
function refreshLife(g, p){
  if(!p || !g) return p;
  const sc = salaryStageOf(g, p), ls = lifeStageOf(g, p);
  if(typeof p.baseSalary !== 'number') p.baseSalary = numOrDef(p.job && p.job.salary, 0);
  p.salaryMult  = sc.mult;
  p.salaryPhase = sc.phase;
  p.lifeStage   = ls.nm;
  /* 失业期间生活支出下调：失业后家庭会砍掉非必要消费（见 UNEMPLOYMENT.lifeCut）。
     ⚠️ 必须用【折减后】的系数写回 p.lifeCoef，让 finance / 界面 / 复盘读同一个值 ——
        若只在这里算一次而 let finance 自己再乘，就会出现两套口径。 */
  p.lifeCoef    = ls.coef * (isJobless(p) ? numOrDef(window.UNEMPLOYMENT.lifeCut, 1) : 1);
  p.elderRatio  = ls.elderRatio || 0;
  /* 退休断崖（仅单人模式）：到了退休年龄，工资停发，改领养老金。
     现实依据：我国城镇职工养老金替代率约 40%—50%，即退休后收入只有在职时的
     一半上下 —— 这正是「只靠劳动收入」的人生在 61 岁会遇到的那道台阶。
     多人模式保留原工资规则，各自到 65 岁后结束行动。 */
  const S = window.SOLO;
  p.retired = isSolo(g) && ageOf(g, p) >= S.retireAge;
  /* ★ 到了退休年龄就不再「求职」了：被裁后没能在退休前找到工作，
     结果就是直接退休领养老金 —— 而不是永远停在求职期。
     不清理会出现荒谬状态：65 岁还在「投递简历」，且因为求职期工资归零，
     连养老金都领不到，最后以「失业」之名破产。 */
  if(p.retired && numOr(p.joblessNeed) > 0){
    p.joblessNeed = 0; p.joblessProgress = 0;
  }
  /* 失业期间主动收入归零；低精力则绩效打折（现实里状态差会直接影响产出与奖金）。
     注：退休后不再进入求职期（见 startJobless），所以这里三者不会同时成立。 */
  let salary = p.retired ? p.baseSalary * S.pensionRatio : p.baseSalary * sc.mult;
  if(isJobless(p)) salary = 0;
  else if(numOr(p.energy) < window.ENERGY.lowAt) salary = salary * window.ENERGY.lowSalaryMult;
  p.salary   = Math.round(salary);
  /* 赡养支出 = 实发工资 × 阶段比例。用【实发工资】而不是基础工资，
     这样失业（工资归零）时赡养负担也随之暂停 —— 现实中失去收入后，
     赡养通常由其他兄弟姐妹分担或降到最低限度，不会照旧全额支出。 */
  p.elderCare = Math.round(p.salary * p.elderRatio);
  /* 养老金免征个人所得税（《个人所得税法》第四条）；失业期间没有工资薪金所得，
     工资薪金个税同样不该计 —— 旧版只在退休时归零、失业时仍照扣，
     于是出现「没有收入却还在交税」，并且把失业期的缺口整体放大了。 */
  p.taxesCur  = (p.retired || isJobless(p))
    ? 0 : Math.round(numOrDef(p.job && p.job.taxes, 0) * sc.mult);
  return p;
}
function refreshAllLife(g){ g.players.forEach(p=>refreshLife(g, p)); }
function refreshAllEnergy(g){ g.players.forEach(p=>{ p.energy = Math.min(numOr(p.energy), energyMax(g, p)); }); }
/* 一次性精力投入：不足时拒绝，而不是把精力扣成负数 */
function spendEnergy(p, n){
  const need = Math.max(0, Math.round(n || 0));
  const cur  = numOr(p.energy);
  if(cur < need) return { ok:false, need, lack:need - cur };
  p.energy = cur - need;
  bump(p, 'energySpent', need);
  return { ok:true, need, lack:0 };
}
/* 回合结束时的精力结算：自然恢复 − 持有维护。归零即触发健康危机。 */
function tickEnergy(g, p){
  if(!p || p.out) return null;
  p.energy = Math.min(energyMax(g, p), numOr(p.energy) + energyRecover(g, p) - energyUpkeep(p));
  if(numOr(p.crisisTurns) > 0){
    p.crisisTurns--;
    if(p.crisisTurns <= 0){
      p.medicalExp = 0;
      log(g, `${p.name} 身体康复，医疗支出恢复正常`, 'good', p.name);
    }
  }
  if(p.energy <= 0) return healthCrisis(g, p);
  return null;
}
/* 健康危机：强制休养 + 持续医疗支出 + 精力只恢复一半。
   现实依据：长期过劳的代价不是「扣一笔罚款」，而是此后很长一段时间状态与现金流都被拖住。 */
function healthCrisis(g, p){
  const EN = window.ENERGY, f = finance(p);
  p.crisisTurns = EN.crisisTurns;                              /* 康复期：期间持续支付医疗支出 */
  p.medicalExp  = Math.round(f.totalExpenses * EN.crisisMedicalMult);  /* 每月医疗支出 ≈ 半个月开销 */
  p.skipTurns   = Math.max(numOr(p.skipTurns), EN.crisisRestTurns);
  p.energy      = Math.round(energyMax(g, p) * EN.crisisRecoverRatio);
  bump(p, 'crises');
  milestone(g, p, `第 ${g.round} 轮精力耗尽引发健康危机：强制休养 ${EN.crisisRestTurns} 个回合，此后每月新增医疗支出 ${money(p.medicalExp)}`, 'bad');
  log(g, `${p.name} 精力耗尽、健康亮红灯：强制休养 ${EN.crisisRestTurns} 个回合，每月新增医疗支出 ${money(p.medicalExp)}`, 'bad', p.name);
  return { type:'health', by:p.id, name:p.name, medical:p.medicalExp, rest:EN.crisisRestTurns, energy:Math.round(p.energy) };
}
/* 失业：不再是「付一笔钱就结束」，而是进入求职期 —— 工资归零、支出照付。
   求职所需回合数随年龄上升（40 岁 / 50 岁两道门槛），
   这正是现实中「年龄越大越难再就业」的建模。 */
/* 保留旧接口供存档 / 调用方兼容。收入变化不补发、也不扣除未经过的年份。 */
function settleAtBreak(g, p){ return null; }

/* 退休只切换下一年的收入口径，刚结束的一年已在发薪日结清。 */
function retireBreakOf(g){
  if(!isSolo(g)) return null;
  const p = g.players[0];
  if(!p || p.out || p.retireSettled || ageOf(g, p) < window.SOLO.retireAge) return null;
  p.retireSettled = true;
  p.retireRound = g.round;
  const age = ageOf(g, p);
  milestone(g, p, `${age} 岁退休：此后工资改为养老金（基础工资的 ${Math.round(window.SOLO.pensionRatio * 100)}%），不额外补结`, 'info');
  return { by:p.id, age, years:0, amount:0, deficit:0 };
}

/* 终局只评档 / 排名，不产生第二笔收入或贷款摊还。 */
function finalSettle(g){
  g.finalSettled = [];
  return g.finalSettled;
}

function startJobless(g, p, severance){
  const U = window.UNEMPLOYMENT, age = ageOf(g, p);
  /* 退休之后不该再有「求职期」—— 这个年龄已经不会有人来招了。
     语义改成「退休返聘结束」：一次性少发一个月养老金，然后照常领。
     否则会出现「61 岁被裁 → 投简历 → 63 岁重新就业」这种明显不真实的流程。 */
  if(isSolo(g) && age >= window.SOLO.retireAge){
    refreshLife(g, p);
    const hit = Math.round(p.salary * (window.SOLO.retireShockMult || 1));
    const r = payCash(p, hit);           /* 已退休：没有离职补偿，只有退休金少发一个月 */
    bump(p, 'downsized'); bump(p, 'forcedCount');
    if(r.ok) bump(p, 'forcedTotal', r.paid);
    const paid = r.ok ? r.paid : 0;
    milestone(g, p, `第 ${g.round} 轮退休返聘结束（${age} 岁）：不进入求职期，退休金一次性少发 ${money(paid)}`, 'bad');
    log(g, `${p.name} 退休返聘结束（${age} 岁）：不再求职，退休金一次性少发 ${money(paid)}`, 'bad', p.name);
    return { ok:true, retired:true, hit:paid, shortfall:r.ok ? 0 : r.shortfall, need:0, severance:0 };
  }
  const need = U.effortBase + (age > 40 ? U.over40Extra : 0) + (age > 50 ? U.over50Extra : 0);
  /* 就业变化只影响下一个发薪日；离职补偿仍按事件即时支付。 */
  p.joblessProgress = 0;
  p.joblessNeed = need;
  if(severance) p.cash += severance;
  refreshLife(g, p);
  bump(p, 'downsized');
  milestone(g, p, `第 ${g.round} 轮被裁员失业，进入求职期（预计 ${need} 个回合），期间工资归零`, 'bad');
  log(g, `${p.name} 被裁员失业：工资归零，需要投入时间求职（预计 ${need} 个回合）${severance ? `，领取离职补偿 ${money(severance)}` : ''}`, 'bad', p.name);
  return { ok:true, need, severance:severance||0, brk:null };
}
/* 求职：消耗精力推进进度。精力不足时只能先休息，求职期相应拉长 ——
   越疲惫越难找到工作，这在现实中完全成立。 */
function jobHunt(g, p){
  if(!isJobless(p)) return { ok:false, msg:'当前有工作，无需求职。' };
  const U = window.UNEMPLOYMENT;
  const r = spendEnergy(p, U.huntEnergy);
  if(!r.ok) return { ok:false, msg:`精力不足：求职需要 ${U.huntEnergy} 点精力（当前 ${Math.round(numOr(p.energy))}）。先休息一回合更实际。` };
  p.joblessProgress = numOr(p.joblessProgress) + 1;
  const done = p.joblessProgress >= numOr(p.joblessNeed);
  if(done){
    p.joblessProgress = 0; p.joblessNeed = 0;
    refreshLife(g, p);
    bump(p, 'rehired');
    milestone(g, p, `第 ${g.round} 轮重新就业，工资恢复为 ${money(p.salary)}`, 'good');
    log(g, `${p.name} 重新就业成功，工资恢复为 ${money(p.salary)}`, 'good', p.name);
  } else {
    log(g, `${p.name} 投递简历、参加面试（求职进度 ${p.joblessProgress}/${p.joblessNeed}）`, 'info', p.name);
  }
  return { ok:true, done, progress:p.joblessProgress, need:p.joblessNeed, energy:U.huntEnergy, salary:p.salary };
}
/* 公益捐赠税前扣除的节税额估算（法规依据见 data-careers.js 的 DONATION 注释） */
function donationRefund(p, amount){
  const D = window.DONATION, f = finance(p);
  const taxable = Math.max(0, Math.round(f.inc.salary * D.taxableRatio));
  const deductible = Math.min(numOr(amount), Math.round(taxable * D.limit));
  return Math.round(deductible * D.marginalRate);
}
/* 银翅膀：做慈善获得的一次「掷 2 粒骰子」机会 */
function useWing(p){
  if(numOr(p.wings) > 0){ p.wings--; return true; }
  return false;
}

/* ------------------------------ 人生阶段（单人模式） ------------------------------ */
/* 阶段只是「把三张曲线讲成一个人这一生」的叙事层，本身不含任何数值 ——
   收入看 SALARY_CURVE、支出看 LIFE_STAGES、精力看 ENERGY，各有各的边界。
   这么做是为了避免「阶段说 ×1.35、工资表说 ×1.20」这类两套口径：
   界面上这两处是同时显示的，一旦对不上，玩家第一反应就是「系统算错了」。 */
function soloStageOf(g){
  const age = ageOf(g), S = window.SOLO_STAGES;
  for(let i=0;i<S.length;i++) if(age <= S[i].to) return i;
  return S.length-1;
}
function soloStage(g){ return window.SOLO_STAGES[soloStageOf(g)]; }
/* 年龄跨过阶段边界时播报一次。返回 null 表示没有发生切换（同一年内重复调用不会重复播报）。 */
function checkSoloStage(g){
  if(!isSolo(g)) return null;
  const i = soloStageOf(g);
  if(g.soloStage === i) return null;
  const prev = g.soloStage;
  g.soloStage = i;
  const st = window.SOLO_STAGES[i], p = current(g);
  log(g, `【人生阶段 ${i+1}/${window.SOLO_STAGES.length}】${st.nm} · ${st.range} · ${st.tag} —— 本期核心：${st.tension}`, 'info', p.name);
  if(p && !p.out) milestone(g, p, `第 ${g.round} 轮进入「${st.nm}」（${st.range} · ${st.tag}）：${st.tension}`, 'info');
  return { index:i, prev, stage:st };
}

/* ------------------------------ 生活基线 ------------------------------ */
/* 住房基线：自有住房的成本从未归零 —— 房贷还清后只是从「还本付息」
   变成「物业 + 修缮 + 改善 + 换租」。
   它解决的是「门槛随负债消失而崩塌」：旧版门槛 = 总支出，房贷一还清
   门槛就从 ¥3,000 掉到 ¥400，出圈瞬时变成走过场。
   见 data-careers.js 的 LIFEBASE 注释（现实依据与「为什么只对住房设基线」）。 */
function lifeBaseHousing(p){
  const LB = window.LIFEBASE || {};
  const base = numOrDef(p.baseSalary, numOrDef(p.job && p.job.salary, 0));
  return Math.max(0, Math.round(base * numOrDef(LB.housingRate, 0) * numOrDef(p.lifeCoef, 1)));
}

/* ------------------------------ 财务计算 ------------------------------ */
/* 收入支出表 + 资产负债表（实时推导，任何操作后立即生效） */
function finance(p){
  ensureLoans(p);
  const inc = {
    salary:      p.salary || 0,
    interest:    (p.assets.savings||[]).reduce((s,x)=>s+x.interest,0),
    dividend:    (p.assets.funds||[]).reduce((s,x)=>s+x.interest,0),
    realEstate:  (p.assets.realEstate||[]).reduce((s,x)=>s+x.cf,0),   /* 联合购买时 cf 已按出资比例切分 */
    business:    (p.assets.business||[]).reduce((s,x)=>s+x.cf,0),
    ftBusiness:  (p.assets.ftBusiness||[]).reduce((s,x)=>s+x.cf,0)
  };
  /* 生活性支出随人生阶段浮动（35—55 岁是「三明治一代」的支出高峰）；
     赡养父母与医疗支出为阶段性的新增科目 */
  const lifeCoef = numOrDef(p.lifeCoef, 1);
  /* ★ 住房支出的「地板」：max(房贷月供, 住房基线)，两者【不叠加】。
     有房贷时按房贷算 —— 与改造前的数据完全一致，平衡不动；
     房贷还清后按基线算 —— 成本不归零，门槛自然不崩塌。
     ⚠️ 不能改成「房贷月供 + 基线」（开局会双算），也不能只放在门槛里
        （那样现金流会因还清贷款而暴涨，同样不真实）。 */
  const homeDue     = numOr(p.liabs.home) > 0 ? loanDue(p, 'home') : 0;
  const housingBase = lifeBaseHousing(p);
  const housingGap  = Math.max(0, housingBase - homeDue);
  const exp = {
    taxes:  numOrDef(p.taxesCur, numOrDef(p.job.taxes, 0)),
    home:   homeDue,
    housingGap,
    school: numOr(p.liabs.school) > 0 ? loanDue(p, 'school') : 0,
    car:    numOr(p.liabs.car)    > 0 ? loanDue(p, 'car')    : 0,
    credit: numOr(p.liabs.credit) > 0 ? loanDue(p, 'credit') : 0,
    otherLoan: numOr(p.liabs.other) > 0 ? loanDue(p, 'other') : 0,
    retail: Math.round(numOrDef(p.job.retail, 0) * lifeCoef),
    other:  Math.round(numOrDef(p.job.other, 0)  * lifeCoef),
    elder:  numOr(p.elderCare),
    medical:numOr(p.medicalExp),
    extra:  p.liabs.extraPay || 0,
    children: p.children * numOrDef(p.job.perChild, 0),
    bank:   loanDue(p, 'bank')
  };
  const totalIncome   = inc.salary + inc.interest + inc.dividend + inc.realEstate + inc.business + inc.ftBusiness;
  const totalExpenses = exp.taxes+exp.home+exp.housingGap+exp.school+exp.car+exp.credit+exp.retail+exp.other
    +exp.elder+exp.medical+exp.otherLoan+exp.extra+exp.children+exp.bank;
  const passive = inc.interest + inc.dividend + inc.realEstate + inc.business + inc.ftBusiness;
  const loanTotal = exp.home + exp.school + exp.car + exp.credit + exp.otherLoan + exp.bank;
  return { inc, exp, totalIncome, totalExpenses, cashflow: totalIncome - totalExpenses, passive,
           bankLoanPay: exp.bank, loanTotal, housingBase, housingGap };
}

/* 跳出老鼠赛跑的门槛 */
/* 出圈门槛的安全边际：被动收入 > 总支出 × 边际
   ★ 不再是「刚好覆盖」—— 真实财务自由留有缓冲（4% 法则隐含 25 倍年支出）。
     支出会波动（医疗、通胀、家庭变故），零缓冲意味着任何一次意外都会击穿，
     所以真实规划里没有人会在「被动收入 = 支出」那一刻辞职。 */
function escapeMargin(g){
  const Y = window.YIELD || {};
  return g && g.rule === '202'
    ? numOrDef(Y.safetyMargin202, 2.5)
    : numOrDef(Y.safetyMargin, 1.5);
}
/* 财务自由圈的企业达标线 —— 单一真源。
   ⚠️ 原先这个数字在 5 处硬编码（3 处胜利判定 + 2 处里程碑文案 + 1 处界面），
      改收益口径时必然漏改，所以收敛到这里。 */
function empireTarget(){
  return numOrDef((window.YIELD || {}).empireTarget, 20000);
}
function escapeTarget(g, p){
  const f = finance(p);
  return Math.round(f.totalExpenses * escapeMargin(g));
}
/* 出圈进度：完成度 = 被动收入 / 门槛。finance() 每次调用都重新推导，
   所以任何操作（买资产、还款、添丁）之后进度立即反映 —— 这就是「实时」的来源。

   ★ 门槛口径是【严格大于】，所以恰好等于门槛时仍需再涨 1 元。
     pctText 因此做了一件特殊处理：只有真的能出圈时才显示 100%，
     否则最多显示 99%。不然会出现「100% 却还不能出圈」这种自相矛盾的读法。 */
function escapeProgress(g, p){
  const f = finance(p), t = escapeTarget(g,p);
  const passive = f.passive;
  const canEscape = passive > t;
  const rawPct = t > 0 ? passive / t : 1;
  return {
    passive, target:t,
    pct: Math.min(1, rawPct),                                  /* 进度条填充比例 */
    pctText: canEscape ? 100 : Math.min(99, Math.floor(rawPct * 100)),
    gap: canEscape ? 0 : Math.round(t - passive) + 1,           /* 还差多少被动收入 */
    canEscape,
    escaped: !!p.inFT,
    status: p.inFT ? 'escaped' : (canEscape ? 'ready' : 'progress')
  };
}
/* 财务自由圈月现金流 = 出圈时锁定的被动收入 + 财务自由圈企业现金流 */
function ftMonthly(p){
  return (p.ftBase||0) + (p.assets.ftBusiness||[]).reduce((s,x)=>s+x.cf,0);
}
/* 资产总账面价值（用于净资产统计） */
function netWorth(p){
  let a = p.cash;
  a += p.assets.stocks.reduce((s,x)=>s+x.shares*x.cost,0);
  a += p.assets.realEstate.reduce((s,x)=>s+x.dp,0);
  a += p.assets.business.reduce((s,x)=>s+x.cost,0);
  a += p.assets.ftBusiness.reduce((s,x)=>s+x.cost,0);
  a += p.assets.savings.reduce((s,x)=>s+x.cost,0);
  a += p.assets.funds.reduce((s,x)=>s+x.cost,0);
  a += p.assets.lands.reduce((s,x)=>s+x.cost,0);
  a += p.assets.collectibles.reduce((s,x)=>s+x.cost,0);
  ensureLoans(p);
  let debt = 0;
  LOAN_KEYS.forEach(k=> debt += numOr(p.liabs[k]));
  return a - debt;
}

/* ------------------------------ 财务自由圈的收支 ------------------------------ */
/* 旧版顺流层【只发钱、不扣支出】：分红日按毛被动收入入账，于是现金无上限增长
   （实测期末中位 ¥100 万+），「财务自由」变成了一个绝对安全的区。
   现实里并不是这样：财务自由之后生活方式会升级（换更好的房子、请人打理、
   更高标准的医疗与出行），这些同样是固定支出，而且几乎没有上限。
   所以顺流层也要有账本，也一样会破产。 */
function ftExpenseOf(p, f){
  f = f || finance(p);
  const LB = window.LIFEBASE || {};
  /* 只放大【生活性】支出 —— 贷款月供按实际金额计，不随生活档次膨胀 */
  const life  = f.exp.retail + f.exp.other + f.exp.elder + f.exp.medical
              + f.exp.children + f.exp.extra + f.exp.housingGap;
  /* ★ 工资薪金个税不再计 —— 出圈意味着主动收入退出生活，工资既然不入账，
     与工资绑定的个税与五险一金也一并停征（现实里财务自由后改按资产收益计税，
     本作简化为不计）。若只停收入不停税，会出现「为不存在的工资交税」的荒谬口径。
     但贷款月供照旧：负债不会因为你财务自由就消失。 */
  return Math.round(life * numOrDef(LB.freeTrackMult, 1)) + f.loanTotal;
}
function ftFinance(p){
  const f = finance(p);
  const income  = ftMonthly(p);                    /* 自由圈的收入是「分红」，不是工资 */
  const expense = ftExpenseOf(p, f);
  return { income, expense, cashflow: income - expense,
           loans: f.loanTotal, payrollTax: 0, living: expense - f.loanTotal };
}

/* ------------------------------ 资产估值（抵押物动态估值） ------------------------------ */
/* 抵押物估值不能是静态的：银行放贷时看的是【当前市价】。市价会随行情涨跌，
   资产本身还会折旧 —— 这两件事在现实中天天发生，静态估值等于把它们抹掉了。
   估值 = 账面成本 × 市场指数（周期 × 行情冲击） × 折旧因子(持有年数)。
   标定依据见 data-careers.js 的 MARKET 注释。 */

/* 行情卡冲击（可累乘，带上下限防止漂移到荒谬区间） */
function marketShockOf(g, kind){
  if(!g || !g.market) return 1;
  return numOrDef(g.market[kind], 1);
}
/* 价格周期：确定性正弦，不引入随机数 —— 同一存档重放必须得到同样的估值，
   否则存档、复盘与回归都会失去可复现性。各类资产相位错开，避免同涨同跌。 */
function marketCycleOf(g, kind){
  const cy = (window.MARKET && window.MARKET.cycle) || {};
  /* 不参与周期的资产（存款 / 理财）：本金是约定金额，不随行情涨跌 */
  if((cy.flat || []).indexOf(kind) >= 0) return 1;
  const years = Math.max(1, numOrDef(cy.years, 8));
  const amp   = numOrDef(cy.amp, 0.15);
  /* ⚠️ phase 里找不到该类资产时默认 0 —— 那会让它与房产同相、同步涨跌。
     所以相位表的键名必须与 ASSET_KINDS 对齐（见 MARKET 注释与回归断言）。 */
  const ph    = numOrDef((cy.phase || {})[kind], 0);
  const elapsed = g ? Math.max(0, ...(g.players || []).map(p=>ageOf(g, p) - g.startAge)) : 0;
  const t = elapsed / years * Math.PI * 2 + ph;
  return 1 + amp * Math.sin(t);
}
function marketIndex(g, kind){ return marketCycleOf(g, kind) * marketShockOf(g, kind); }
/* 行情冲击的累乘（带 clamp） */
function bumpMarket(g, kind, mult){
  if(!g) return 1;
  if(!g.market) g.market = {};
  const cl = (window.MARKET && window.MARKET.shockClamp) || [0.4, 2.5];
  const next = numOrDef(g.market[kind], 1) * numOrDef(mult, 1);
  g.market[kind] = Math.max(numOrDef(cl[0], 0.4), Math.min(numOrDef(cl[1], 2.5), next));
  return g.market[kind];
}
/* 资产类别清单 —— 只此一份，估值 / 抵押 / 汇总都从这里遍历，
   避免「新增了一类资产但某个函数忘了算」这种漏项。 */
const ASSET_KINDS = ['savings','funds','stocks','collectibles','lands','realEstate','business','ftBusiness'];

/* 账面成本（取得时的金额，不随市价变动；界面上用来对照估值涨跌） */
function assetBookOf(kind, item){
  if(!item) return 0;
  if(kind === 'stocks') return numOr(item.shares) * numOr(item.cost);
  if(kind === 'realEstate') return numOr(item.cost) || numOr(item.dp);
  return numOr(item.cost);
}
/* 单项资产重估：账面 → 市场指数 → 折旧 → 当前估值 */
function appraiseAsset(g, kind, item){
  const D = (window.MARKET && window.MARKET.decay) || {};
  const book  = assetBookOf(kind, item);
  const index = marketIndex(g, kind);
  const held  = Math.max(0, numOr(item && item.heldYears));
  const decay = Math.pow(1 - numOrDef(D[kind], 0), held);
  return { book, index, years: held, decay,
           value: Math.max(0, Math.round(book * index * decay)) };
}
/* 给资产记录买入轮次和持有年数；持有年数只在持有者经过结算日时增加。
   ★ 统一在这里打标（而不是在各个 push 点手写），避免漏掉某条买入路径。 */
function stampAsset(g, item){
  if(item && item.buyRound == null) item.buyRound = numOr(g && g.round) || 1;
  if(item && item.heldYears == null) item.heldYears = 0;
  return item;
}
/* 玩家全部资产的重估汇总 */
function appraiseAll(g, p){
  const rows = [];
  let book = 0, value = 0;
  if(!p) return { rows, book, value, index: 1 };
  ASSET_KINDS.forEach(kind=>{
    (p.assets[kind] || []).forEach(item=>{
      const a = appraiseAsset(g, kind, item);
      rows.push(Object.assign({ kind, item }, a));
      book += a.book; value += a.value;
    });
  });
  return { rows, book, value, index: marketIndex(g, 'realEstate') };
}

/* 可抵押资产的【当前估值净值】 —— 失业 / 无收入时的应急授信依据。
   ★ 与 liquidatableValue 的区别：那个是「破产清算时的快速变现值」（房产不计，
     因为卖不掉），这个是「抵押授信依据」（房产可以抵押，但要按净值算）。
   ★ 房产与企业用【已付首付】而不是总价：还在还贷的部分不属于你，
     银行不会为不属于你的份额放款。 */
function collateralValue(g, p){
  if(!p) return 0;
  const H = (window.MARKET && window.MARKET.haircut) || {};
  let v = 0;
  ASSET_KINDS.forEach(kind=>{
    (p.assets[kind] || []).forEach(item=>{
      const ap = appraiseAsset(g, kind, item);
      const h  = H[kind];
      /* 'equity'：房产按「已付首付占市价的比例」折算权益 ——
         还在还贷的部分不属于你，银行不会为不属于你的份额放款。
         用比例而不是固定折扣的好处：房价上涨时你的权益份额同步上涨，
         这是现实中「房子升值 → 可贷额度跟着提高」的由来。 */
      let share;
      if(h === 'equity'){
        const cost = numOr(item.cost) || numOr(item.dp);
        share = cost > 0 ? Math.min(1, numOr(item.dp) / cost) : 1;
      } else {
        share = numOrDef(h, 0.5);
      }
      v += ap.value * share;
    });
  });
  return Math.round(v);
}

/* 当前适用的【月度结余】—— 两圈各用各的账本：
   老鼠赛跑 = 工资 + 被动 − 支出；财务自由圈 = 分红 − 自由圈支出 − 仍在还的贷款。
   ★ 界面上的每一处「年结余」都必须读它，不允许各处自己判断圈层 ——
     否则会出现「分红日入账 ¥59,928，年结余却显示 ¥97,824」这种同一屏两套口径。 */
function settleCashflow(p){
  if(!p) return 0;
  return p.inFT ? ftFinance(p).cashflow : finance(p).cashflow;
}

/* ------------------------------ 信用额度 ------------------------------ */
/* 信用贷不是「想要多少有多少」：收入决定了你能借多少。
   旧版无限额度、只还息、无期限 —— 回归里 AI 曾滚到 ¥5,700 万且永不破产，
   那不是「玩家太激进」，而是规则本身在鼓励杠杆螺旋。
   见 data-careers.js 的 CREDIT 注释（DTI / 授信倍数 / 白户 / 破产 / 退休）。 */
/* ------------------------------ 多头借贷识别 ------------------------------ */
/* 「多头借贷」= 同一借款人同时在多个（信用类）产品有借贷关系 ——
   这是资金链紧张的最强信号，因为同时借这么多笔往往意味着借新还旧。
   只统计【信用类】产品：房贷 / 车贷 / 助学属于正常负债，不计入。
   阈值与依据见 data-careers.js 的 CREDIT.multi 注释。

   ★ 使用率的基数刻意用「按收入本可获得的无抵押额度」而不是最终的 limit ——
     用 limit 会形成循环依赖（额度要用多头系数，多头系数又要用额度）。 */
function multiBorrowingOf(g, p, f){
  const C = window.CREDIT || {}, M = C.multi || {};
  if(!p) return { mult:1, level:'—', nProducts:0, products:[], draws:0, util:0, reasons:[] };
  f = f || finance(p);
  const counted = Array.isArray(M.counted) ? M.counted : ['credit','other','bank'];
  const reasons = [];

  /* ① 在贷信用类产品数 */
  const products = counted.filter(k => numOr(p.liabs[k]) > 0);
  const nProducts = products.length;
  const pWarn = numOrDef(M.productWarn, 1);
  let productMult = 1;
  if(nProducts > pWarn){
    productMult = Math.max(numOrDef(M.productFloor, 0.7),
                           Math.pow(numOrDef(M.productStep, 0.86), nProducts - pWarn));
    /* 文案用产品中文名 —— 界面直接把 reasons 展示给玩家，
       显示内部 key（credit / bank）等于把实现细节漏出去。 */
    const names = products.map(k => (loanType(k) || {}).nm || k);
    reasons.push(`同时在 ${nProducts} 个信用类产品上有余额（${names.join(' / ')}）`);
  }
  /* ② 近期信用贷借款次数 —— 借新还旧的直接信号 */
  const win   = Math.max(1, numOrDef(M.drawWindow, 6));
  const now   = numOr(g && g.round);
  const draws = (p.loanDrawRounds || []).filter(r => now - numOr(r) < win).length;
  const dWarn = numOrDef(M.drawWarn, 1);
  let drawMult = 1;
  if(draws > dWarn){
    drawMult = Math.max(numOrDef(M.drawFloor, 0.65),
                        Math.pow(numOrDef(M.drawStep, 0.88), draws - dWarn));
    reasons.push(`最近 ${win} 个回合内申请了 ${draws} 次信用贷`);
  }
  /* ③ 额度使用率（相对「按收入本可获得的额度」） */
  const base = Math.max(1, Math.min(annual(numOr(f.totalIncome)) * numOrDef(C.incomeMult, 1.2),
                                   numOrDef(C.hardCap, 600000)));
  const util = numOr(p.liabs.bank) / base;
  const uWarn = numOrDef(M.utilWarn, 0.6), uMax = numOrDef(M.utilMax, 1);
  let utilMult = 1;
  if(util > uWarn){
    const over = Math.min(1, (util - uWarn) / Math.max(0.01, uMax - uWarn));
    utilMult = Math.max(numOrDef(M.utilFloor, 0.75), 1 - over * (1 - numOrDef(M.utilFloor, 0.75)));
    reasons.push(`信用贷额度使用率 ${(util * 100).toFixed(0)}%`);
  }
  const mult = Math.max(0.05, Math.min(1, productMult * drawMult * utilMult));
  const level = mult >= 0.99 ? '正常' : mult >= 0.8 ? '关注' : mult >= 0.6 ? '较集中' : '多头';
  return { mult, level, nProducts, products, draws, drawWindow: win, util, base,
           productMult, drawMult, utilMult, reasons };
}

function creditGradeOf(score){
  if(score >= 0.95) return { key:'A', label:'优质' };
  if(score >= 0.75) return { key:'B', label:'良好' };
  if(score >= 0.50) return { key:'C', label:'一般' };
  if(score >= 0.30) return { key:'D', label:'较差' };
  return { key:'E', label:'受限' };
}
function creditProfile(g, p){
  const C = window.CREDIT || {};
  if(!p) return null;
  const f = finance(p);
  const rate = loanType('bank').rate || 0.01;
  const st = p.stats || {};
  const monthlyIncome = numOr(f.totalIncome);
  const annualIncome  = annual(monthlyIncome);
  const used   = numOr(p.liabs.bank);
  const jobless = isJobless(p);
  const retired = !!p.retired;
  const maxDTI  = numOrDef(C.maxDTI, 0.55);
  const reasons = [];
  /* 多头借贷档案要最先算出来：下面的主体资格检查会用到它的硬规则判定 */
  const multi = multiBorrowingOf(g, p, f);

  /* ① 主体资格：第一还款来源，或可抵押的资产。
     两者都没有才是真的借不到 —— 失业但有房 / 有存单的人，现实中仍有抵押融资渠道。 */
  const collateral   = collateralValue(g, p);
  const byCollateral = Math.round(collateral * numOrDef(C.collateralRate, 0.5));
  if(monthlyIncome <= 0 && byCollateral <= 0){
    reasons.push(jobless
      ? '当前处于失业 / 求职期，既没有稳定收入也没有可抵押的资产，无法获得授信。'
      : '当前没有任何收入来源、也没有可抵押的资产，不符合「第一还款来源」要求。');
  }
  const banLeft = Math.max(0, numOr(p.creditBanUntil) - numOr(g && g.round));
  if(banLeft > 0) reasons.push(`征信恢复期内（还需 ${banLeft} 个回合），暂不受理新的授信申请。`);
  /* 风控硬规则：多头过于集中直接拒贷，不是降额 —— 现实里这种客户过不了审批 */
  if(multi.nProducts >= numOrDef(C.rejectProducts, 4)){
    reasons.push(`多头借贷：同时在 ${multi.nProducts} 个信用类产品上有余额，超出风控上限（${numOrDef(C.rejectProducts, 4)} 个）。`);
  } else if(multi.draws >= numOrDef(C.rejectDraws, 4)){
    reasons.push(`近期借款过于频繁：最近 ${multi.drawWindow} 个回合内申请了 ${multi.draws} 次，风控判定为「借新还旧」倾向。`);
  }

  /* ② 信用系数：还得上过吗 */
  let score = numOrDef(C.base, 1);
  const bankrupts     = numOr(st.bankrupts);
  const deficitMonths = numOr(st.deficitMonths);
  if(bankrupts > 0) score *= Math.pow(numOrDef(C.bankruptMult, 0.45), bankrupts);
  /* 白户：只看有没有【还款记录】。若用「借过款」做判据，会出现
     「借满之后因为不再是白户、额度反而回升」的怪事 —— 判据要跟着现实走。 */
  else if(numOr(st.repaid) <= 0 && numOr(st.loansCleared) <= 0) score *= numOrDef(C.thinFile, 0.90);
  if(deficitMonths > 0){
    score *= Math.max(numOrDef(C.deficitFloor, 0.6),
                      Math.pow(numOrDef(C.deficitMult, 0.94), deficitMonths));
  }
  score = Math.max(numOrDef(C.bankruptFloor, 0.2), Math.min(1, score));
  /* ③ 多头借贷：这是【行为记录】，与有没有工作无关 ——
     所以作用在征信分上（进而同时影响收入授信与抵押授信），
     而不是像失业那样只压收入侧。 */
  score = Math.max(0.05, Math.min(1, score * multi.mult));
  /* ★ 就业状态只作用于【收入授信】，不作用于【抵押授信】：
     抵押贷看的是抵押物价值，与有没有工作无关。
     若把失业折扣也乘到抵押额度上，就会出现「失业 → 授信清零 → 连房子都抵押不出去」，
     等于把「失业」直接变成「出局」—— 而现实里抵押融资恰恰是失业者的救命通道。 */
  const incomeScore = score
    * (jobless ? numOrDef(C.joblessMult, 0.35) : 1)
    * (retired ? numOrDef(C.retireMult, 0.5) : 1);
  const grade = creditGradeOf(score);

  /* ③ 额度：授信倍数 与 负债收入比，取较小者，再乘信用系数 */
  const byIncome = Math.min(annualIncome * numOrDef(C.incomeMult, 1.2), numOrDef(C.hardCap, 600000));
  const dtiNow   = monthlyIncome > 0 ? f.loanTotal / monthlyIncome : 1;
  const dtiRoom  = Math.max(0, monthlyIncome * maxDTI - f.loanTotal);
  const byDTI    = dtiRoom / rate;                       /* 新增月息的剩余空间折算成本金 */
  /* 两条独立的产品线，取较大者：
     ① 收入授信（在职）：年收入 × 倍数，并受 DTI 约束，再乘含就业状态的系数
     ② 资产抵押（失业 / 无收入时的主通道）：可变现资产 × 抵押率，不受 DTI 约束 */
  const incomeCap = Math.min(byIncome, used + byDTI) * incomeScore;
  const assetCap  = byCollateral * score;
  const limit     = Math.max(0, Math.round(Math.max(incomeCap, assetCap)));
  const available = Math.max(0, limit - used);

  if(reasons.length === 0 && available <= 0){
    if(used >= limit) reasons.push('授信额度已用尽。');
    else reasons.push(`负债收入比已达 ${(maxDTI * 100).toFixed(0)}% 红线`
      + `（当前 ${(dtiNow * 100).toFixed(0)}%），无法新增授信。`);
  }
  return { ok: reasons.length === 0 && available > 0, score, grade,
           limit, used, available, byIncome, byDTI, byCollateral, collateral,
           incomeScore, multi, appraisal: appraiseAll(g, p),
           gross: Math.max(incomeCap, assetCap), want:0,
           dtiNow, maxDTI, monthlyIncome, annualIncome, rate,
           bankrupts, deficitMonths, jobless, retired, banLeft, reasons };
}

/* ------------------------------ 玩家 ------------------------------ */
const ASSET_KEYS = ['stocks','realEstate','business','ftBusiness','savings','funds','lands','collectibles'];
function newPlayer(i, name, job, color, icon){
  return {
    id:i, seat:i, name:name||('玩家'+(i+1)), color, icon,
    job,
    salary: job.salary,
    children: 0,
    cash: 0,
    liabs: { home:job.liab.home, school:job.liab.school, car:job.liab.car, credit:job.liab.credit, bank:0, other:0, extraPay:0 },
    assets: { stocks:[], realEstate:[], business:[], ftBusiness:[], savings:[], funds:[], lands:[], collectibles:[] },
    pos: 0, ftPos: 0, inFT: false,
    ftBase: 0, ftGain: 0,
    charityTurns: 0, skipTurns: 0, pausedThisTurn: false, pausedNotified: false,
    /* 每个玩家独立计龄；settledAge 仅为旧存档兼容镜像，不再决定发薪。 */
    age: AGE_START, settledAge: AGE_START, settledYears: 0, finished: false,

    /* 人生模拟：精力 / 就业 / 医疗，以及由年龄推导出的收入支出参数 */
    energy: 100, baseSalary: job.salary, salaryMult: 1, salaryPhase: '', taxesCur: null,
    lifeStage: '', lifeCoef: 1, elderCare: 0,
    joblessProgress: 0, joblessNeed: 0, wings: 0,
    medicalExp: 0, crisisTurns: 0,
    /* 信用贷禁贷期（破产后的征信恢复期）：到这一轮为止不受理新的授信申请 */
    creditBanUntil: 0,
    /* 信用贷的申请轮次（最多保留最近若干条）—— 多头借贷识别要看「近期借了几次」，
       这是「借新还旧」最直接的行为信号。 */
    loanDrawRounds: [],
    /* 退休突变点是否已结清（只触发一次；用显式标记而不是靠 p.retired 推导） */
    retireSettled: false, retireRound: null,
    dreamIdx: i % DREAMS.length, dreamOwned: false,
    /* 单人模式：达成的里程碑（人生赢家 / 企业帝国），含达成时的年龄 ——
       单人模式不在达成瞬间结束对局，所以要记下「什么时候达成的」。 */
    achievements: [],
    options: [], shorts: [],
    turnsPlayed: 0,
    out: false, outReason: '',
    franchise: [],
    /* 复盘数据：决策计数 / 关键节点 / 逐轮财富快照（随整局状态一起被存档持久化） */
    stats: null, track: [], milestones: [],
    escaped: false, escapeRound: null, escapePassive: 0,
    reportShown: false
  };
}

/* ------------------------------ 开局 ------------------------------ */
function newGame(cfg){
  /* 游戏模式：age = 年龄模式（20 岁起步，65 岁退休结算）；
     solo = 单人模式（同为年龄制，但只有 1 位玩家，且启用退休断崖与机构替代）；
     endless = 无限模式 */
  const mode = cfg.mode === 'solo' ? 'solo'
             : cfg.mode === 'endless' ? 'endless' : 'age';
  const n = mode === 'solo' ? 1 : cfg.count;      /* 单人模式强制 1 位玩家 */
  /* ★ 随机源必须在洗牌【之前】建好，并贯穿到牌堆与掷骰 ——
     否则 `cfg.seed` 只决定了掷骰，而「谁是什么职业」「先抽到哪张卡」仍走 Math.random()，
     于是同一份 seed 两次开局会得到完全不同的对局（存档重放、复盘与回归都失去意义）。
     不传 seed 时 rng 为 null，各处会退回 Math.random()，行为与改造前一致。 */
  const rng = cfg.seed
    ? (function(s){ return function(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(cfg.seed)
    : null;
  const careers = shuffle(CAREERS.slice(), rng);
  const portfolios = shuffle(PORTFOLIOS.slice(), rng);
  const g = {
    rule: cfg.rule || '101',
    mode,
    startAge: AGE_START, endAge: AGE_END, timeVersion: 2,
    players: [], cur: 0, round: 1, turnNo: 0,
    phase: 'ratrace',
    over: false, winner: null, winReason: '',
    /* 单人模式：当前人生阶段下标（开局为「起步期」）与退休结算结果 */
    soloStage: null, soloResult: null,
    /* 资产行情冲击的累计值（各类资产各一份）：空对象表示尚未发生过行情冲击。
       资产估值 = 账面 × 周期 × 该冲击 × 折旧，见 appraiseAsset。 */
    market: {},
    /* 退休突变点的结算结果（UI 据此提示「为什么收入突然少了一半」）*/
    lastRetire: null, finalSettled: null,
    log: [], pending: null, lastDice: [], lastPath: [],
    rng,
    decks: {
      small:  makeDeck(DECK_SMALL, rng),
      big:    makeDeck(DECK_BIG, rng),
      market: makeDeck(cfg.rule==='202' ? DECK_MARKET_202 : DECK_MARKET_101, rng),
      doodad: makeDeck(cfg.rule==='202' ? DECK_DOODAD_202 : DECK_DOODAD_101, rng),
      capgain:makeDeck(DECK_CAPGAIN, rng),
      cashflow:makeDeck(DECK_CASHFLOW, rng)
    },
    marketDrawn: 0
  };
  for(let i=0;i<n;i++){
    const p = newPlayer(i, (cfg.names&&cfg.names[i])||('玩家'+(i+1)), careers[i%careers.length],
                        PLAYER_COLORS[i].c, PLAYER_ICONS[i]);
    ensureLoans(p);                       /* 职业卡负债 → 贷款计划（本金 / 月供 / 期数） */
    if(g.rule==='202'){
      const pf = portfolios[i%portfolios.length];
      applyPortfolio(p, pf);
      ensureLoans(p);                     /* 组合卡追加的负债与月供并入计划 */
      p.portfolio = pf;
      /* 组合卡里的资产在开局就已持有 → 买入轮次记为第 1 轮（折旧从 20 岁起算）。
         不标记的话，它们会在玩家第一次买入任何资产时被误标成「当前轮次」，
         折旧年限凭空少算。 */
      ASSET_KINDS.forEach(k => (p.assets[k] || []).forEach(it => stampAsset(g, it)));
    }
    refreshLife(g, p);                    /* 按年龄推导工资 / 税负 / 支出系数 / 赡养支出 */
    p.energy = energyMax(g, p);           /* 开局精力满格 */
    p.age = p.settledAge = g.startAge;   /* 首次发薪结算 20→21 岁这一年 */
    const f = finance(p);
    /* 第 7 步：起始现金 = 月现金流 + 储蓄（202 规则另加初始投资组合中的现金） */
    p.cash = f.cashflow + p.job.savings + (p.pfCash || 0);
    p.startCash = p.cash;
    g.players.push(p);
  }
  const modeNm = g.mode === 'solo'    ? `单人模式（${g.startAge}→${g.endAge} 岁，共 ${maxYears(g)} 次年度结算）`
               : g.mode === 'age'     ? `年龄模式（${g.startAge}→${g.endAge} 岁，共 ${maxYears(g)} 次年度结算）`
               : '无限模式';
  log(g, `游戏开始 · ${g.rule} 规则 · ${n} 位玩家 · ${modeNm}`, 'sys');
  syncPhase(g);
  /* 门槛倍数从 escapeMargin 读 —— 与判定、面板、复盘同源 */
  log(g, g.rule==='202'
    ? `跳出条件：被动收入 > 总支出 × ${escapeMargin(g)}；启用资本利得/大额现金流卡、做空与期权。`
    : `跳出条件：被动收入 > 总支出 × ${escapeMargin(g)}；投资机会格仅抽投资卡。`, 'info');
  g.players.forEach(p=>{
    log(g, `${p.name} 抽到【${p.job.name}】工资 ${money(p.salary)}，起始现金 ${money(p.cash)}`, 'info', p.name);
  });
  if(isSolo(g)){
    const S = window.SOLO;
    g.soloStage = soloStageOf(g);
    const st = window.SOLO_STAGES[g.soloStage];
    log(g, `单人模式规则：${S.retireAge} 岁起工资停发、改领养老金（替代率 ${Math.round(S.pensionRatio*100)}%）；` +
           `没有其他玩家 —— 遇到投资机会只能「买入」或「放弃」，202 大额房产的联合购买由机构合伙人承接`, 'info');
    log(g, `【人生阶段 1/${window.SOLO_STAGES.length}】${st.nm} · ${st.range} · ${st.tag} —— 本期核心：${st.tension}`, 'info');
  }
  trackRound(g);                   /* 起始快照：报告的财富走势从第 1 轮就有基准点 */
  return g;
}

function applyPortfolio(p, pf){
  if(pf.cash) p.cash = (p.cash||0) + 0;   // 现金直接加到起始现金
  if(pf.stocks) for(const k in pf.stocks){
    p.assets.stocks.push({ symbol:k, shares:pf.stocks[k].shares, cost:pf.stocks[k].cost });
  }
  if(pf.realEstate) pf.realEstate.forEach(x=>p.assets.realEstate.push(Object.assign({},x)));
  if(pf.business) pf.business.forEach(x=>p.assets.business.push(Object.assign({},x)));
  if(pf.land) p.assets.lands.push(Object.assign({},pf.land));
  if(pf.collectible) p.assets.collectibles.push(Object.assign({},pf.collectible));
  if(pf.liabs) for(const k in pf.liabs){ p.liabs[k] = (p.liabs[k]||0) + pf.liabs[k]; }
  /* 组合卡附带的 extraPay 本质是那笔负债的月供：并进对应贷款的计划里，
     避免既算一份月供、又在「每月额外固定支出」里再算一次（重复计费） */
  if(pf.extraPay){
    const target = Object.keys(pf.liabs || {}).filter(k=> LOAN_KEYS.indexOf(k) >= 0)[0];
    if(target){
      p._pfExtra = p._pfExtra || {};
      p._pfExtra[target] = (p._pfExtra[target] || 0) + pf.extraPay;
    } else {
      p.liabs.extraPay = (p.liabs.extraPay||0) + pf.extraPay;
    }
  }
  p.pfCash = pf.cash || 0;
  p.pfIncome = pf.income || null;
  if(pf.income){
    const amt = pf.income.interest || pf.income.dividend || 0;
    if(pf.income.interest) p.assets.savings.push({ nm:pf.nm, cost:pf.cash||5000, interest:amt });
    else p.assets.funds.push({ nm:pf.nm, cost:pf.cash||3000, interest:amt });
  }
}

/* ------------------------------ 日志 ------------------------------ */
function log(g, text, type, who){
  g.log.unshift({ text, type:type||'info', who:who||'', t:Date.now(), round:g.round });
  if(g.log.length > 300) g.log.length = 300;
}

/* ------------------------------ 年龄 / 轮次 ------------------------------ */
/* 年龄属于玩家。只在发薪 / 分红日推进，round 仅用于轮转与回合制效果。 */
function ageOf(g, p){
  p = p || current(g);
  return numOrDef(p && p.age, g.startAge);
}
function yearsLeft(g, p){ return Math.max(0, g.endAge - ageOf(g, p)); }
function maxYears(g){ return g.endAge - g.startAge; }
function maxRounds(g){ return Infinity; }  /* 兼容旧调用；年龄模式也没有固定轮数上限 */
function lifeComplete(g, p){ return isAgeMode(g) && ageOf(g, p) >= g.endAge; }

/* 旧档保留已经发生的现金和年龄，从恢复点开始按发薪日推进，绝不重发历史收入。 */
function migrateTime(g){
  if(g.timeVersion === 2) return g;
  const legacyAge = g.startAge + Math.max(0, numOr(g.round) - 1);
  g.players.forEach(p=>{
    p.age = isAgeMode(g) ? Math.min(g.endAge, legacyAge) : legacyAge;
    ASSET_KINDS.forEach(k=>(p.assets[k] || []).forEach(it=>{
      if(it.heldYears == null) it.heldYears = Math.max(0, g.round - numOrDef(it.buyRound, 1));
    }));
    p.settledAge = p.age;
    p.settledYears = Math.max(0, p.age - g.startAge);
    p.finished = !!g.over && !p.out && lifeComplete(g, p);
    if(p.escapeRound != null && p.escapeAge == null) p.escapeAge = g.startAge + p.escapeRound - 1;
    (p.track || []).forEach(t=>{ if(t.age == null) t.age = g.startAge + t.round - 1; });
  });
  g.lastRetire = null;
  g.timeVersion = 2;
  return g;
}

/* 单人模式同样按年龄推进（20→65 岁），所以也属于「年龄制」；
   凡是只关心「有没有年龄与退休」的地方用 isAgeMode，
   凡是只该在单人下生效的规则用 isSolo。 */
function isAgeMode(g){ return g.mode === 'age' || g.mode === 'solo'; }
function isSolo(g){ return g.mode === 'solo'; }
/* 模式名只在这里拼一次：isAgeMode 对单人模式也返回 true，
   各处若自己写 `isAgeMode ? '年龄模式' : '无限模式'`，单人会被显示成「年龄模式」。 */
function modeLabel(g){
  return g.mode === 'solo' ? '单人模式' : (g.mode === 'endless' ? '无限模式' : '年龄模式');
}

/* ------------------------------ 复盘数据采集 ------------------------------ */
/* 游戏结束时能给出「有据可依」的复盘：结论全部由这里记录的计数与快照推导，
   而不是事后从日志文本里猜。兼容旧存档 —— 旧档没有这些字段，initTrack 会补齐默认值。 */
const STAT_KEYS = {
  paychecks:0, dealsSeen:0, dealsBought:0, dealsPassed:0, dealsSold:0, dealsSoldTotal:0,
  investTotal:0, cfGained:0,
  loans:0, loanTotal:0, repaid:0, marketSells:0, marketProceeds:0,
  donations:0, donationTotal:0, forcedCount:0, forcedTotal:0, downsized:0, babies:0,
  liquidations:0, liquidatedValue:0, ftBusinesses:0, buyouts:0, dreams:0, loansCleared:0,
  /* 人生模拟：健康危机 / 失业求职 / 重新就业 / 精力投入总量 */
  crises:0, jobless:0, rehired:0, energySpent:0,
  /* 破产次数：征信记录的直接依据（信用额度的乘数、禁贷期的触发条件） */
  bankrupts:0,
  /* 入不敷出：失业或高负债导致收入盖不住支出的月份数与总额 */
  deficitMonths:0, deficitTotal:0,
  /* 消费升级：因社会等级（消费档次）而在意外支出上多付的累计金额 */
  doodadTierPaid:0,
  /* 单人模式：本局达成的「获胜类」成就次数（人生赢家 / 企业帝国） */
  soloWins:0,
  /* 峰值用 null 哨兵：初始 0 会让「净资产长期为负」的对局把峰值误记成 0 */
  peakPassive:null, peakNetWorth:null, peakCash:null
};
function initTrack(p){
  if(!p.stats || typeof p.stats !== 'object') p.stats = {};
  for(const k in STAT_KEYS){
    const def = STAT_KEYS[k];
    if(def === null){ if(p.stats[k] === undefined) p.stats[k] = null; }
    else if(typeof p.stats[k] !== 'number') p.stats[k] = def;
  }
  if(!Array.isArray(p.track)) p.track = [];
  if(!Array.isArray(p.milestones)) p.milestones = [];
  if(typeof p.escaped !== 'boolean') p.escaped = !!p.inFT;
  if(p.escapeRound === undefined) p.escapeRound = null;
  if(typeof p.reportShown !== 'boolean') p.reportShown = false;
  return p;
}
function bump(p, key, n){
  initTrack(p);
  p.stats[key] = (p.stats[key] || 0) + (n === undefined ? 1 : n);
}
/* 关键节点：只记「值得回看」的决策，报告的决策时间线直接用它 */
function milestone(g, p, text, kind){
  initTrack(p);
  p.milestones.push({ round:g.round, age:ageOf(g, p), text, kind:kind || 'info' });
  if(p.milestones.length > 60) p.milestones.shift();
}
/* 每完成一整轮给所有玩家拍一张快照：现金 / 被动收入 / 月现金流 / 净资产 */
function trackRound(g){
  g.players.forEach(p=>{
    initTrack(p);
    const f = finance(p), nw = netWorth(p);
    p.track.push({ round:g.round, age:ageOf(g, p), cash:p.cash, passive:f.passive, cf:f.cashflow, net:nw });
    if(p.track.length > 60) p.track.shift();
    const st = p.stats;
    if(st.peakPassive === null || f.passive > st.peakPassive) st.peakPassive = f.passive;
    if(st.peakCash === null || p.cash > st.peakCash) st.peakCash = p.cash;
    if(st.peakNetWorth === null || nw > st.peakNetWorth) st.peakNetWorth = nw;
  });
}

/* ------------------------------ 回合流转 ------------------------------ */
function current(g){ return g.players[g.cur]; }
function alivePlayers(g){ return g.players.filter(p=>!p.out); }

/* 某个玩家所在的圈：圈层状态属于玩家自身，随时可查 */
function phaseOf(g, p){ return (p || current(g)).inFT ? 'fasttrack' : 'ratrace'; }
/* g.phase 是早期「全局阶段」的遗留字段。现在它只是「当前行动玩家所在圈」的镜像，
   保留仅为兼容旧存档 / 外部读取 —— 规则判断一律用 phaseOf(g,p) 或 p.inFT。 */
function syncPhase(g){ g.phase = phaseOf(g); return g.phase; }

function beginTurn(g){
  const p = current(g);
  if(g.over) return null;
  if(p.out || p.finished){ nextPlayer(g); return g.over ? null : beginTurn(g); }
  p.turnStart = { cash:p.cash, cf:settleCashflow(p) };
  /* 慈善加成回合递减 */
  if(p.charityTurns>0) { /* 在实际掷骰后消耗 */ }
  syncPhase(g);
  return p;
}

/* 「暂停回合」（裁员失业的惩罚）＝【这个回合不能行动】，而不是【把这个回合从轮转里删掉】。
   旧实现是在 nextPlayer 里递归跳过该玩家，后果是两人局里对手会连走三轮
   （甲→甲→甲→乙…），看起来就像「已经出圈的那个人还在行动」，而另一个人永远轮不到。
   现在改成：回合照常轮到他，但他本回合不能掷骰 / 交易，界面给一张明确的暂停提示卡，
   交棒后即可轮到下一位 —— 轮转始终严格交替，不会再有人被跳过。 */
function markTurnPause(g){
  const p = current(g);
  if(!p) return false;
  if(p.skipTurns > 0){
    p.skipTurns--;
    p.pausedThisTurn = true;
    p.pausedNotified = false;                 /* 交给界面去提示一次 */
    log(g, `${p.name} 本回合暂停（剩余 ${p.skipTurns} 轮）`, 'sys', p.name);
  } else {
    p.pausedThisTurn = false;
  }
  return p.pausedThisTurn;
}

function nextPlayer(g){
  if(g.over) return null;
  if(isAgeMode(g) && alivePlayers(g).every(p=>p.finished)){
    isSolo(g) ? endSolo(g) : endByAge(g);
    return null;
  }
  let guard = 0;
  do{
    g.cur = (g.cur + 1) % g.players.length;
    if(g.cur === 0){
      trackRound(g);
      g.round++;
      expireOptions(g);
    }
    guard++;
  } while((g.players[g.cur].out || g.players[g.cur].finished) && guard < g.players.length * 2);
  markTurnPause(g);
  refreshLife(g, current(g));
  syncPhase(g);
  return current(g);
}

/* 年龄模式结束：按净资产排名，最高者获胜 */
function endByAge(g){
  if(g.over) return;
  g.over = true;
  finalSettle(g);              /* 收支已逐年结清，此处只排名 */
  const alive = alivePlayers(g).slice().sort((a,b)=>netWorth(b)-netWorth(a));
  if(alive.length){
    g.winner = alive[0].id;
    g.winReason = `到达 ${g.endAge} 岁退休结算，按净资产排名 ${alive[0].name} 以 ${money(netWorth(alive[0]))} 位列第一`;
    log(g, `🏁 到达 ${g.endAge} 岁，本局退休结算：${alive[0].name} 净资产 ${money(netWorth(alive[0]))} 排名第一`, 'good', alive[0].name);
  } else {
    g.winner = null;
    g.winReason = `到达 ${g.endAge} 岁，但全部玩家均已破产出局，本局无人获胜`;
    log(g, `🏁 到达 ${g.endAge} 岁，全部玩家均已出局，本局结束`, 'sys');
  }
}

/* ------------------------------ 单人模式结算 ------------------------------ */
/* 结局判定：自上而下，第一个命中即为结局。判据全部来自「什么时候做到了什么」，
   而不是「比别人多多少钱」—— 单人模式没有可比的人，只能与时间比。 */
function soloOutcome(g, p){
  const S = window.SOLO, A = p.achievements || [];
  const firstAge = k => {
    const xs = A.filter(x=>x.kind === k).map(x=>x.age).sort((a,b)=>a-b);
    return xs.length ? xs[0] : null;
  };
  const dreamAge  = firstAge('dream');
  const empireAge = firstAge('empire');
  const escapeAge = p.escapeAge != null ? p.escapeAge : null;
  const base = { dreamAge, empireAge, escapeAge, winAge:S.winAge };
  if(p.out){
    return Object.assign(base, { key:'bankrupt', win:false,
      label: p.outReason === '主动认输' ? '中途退出' : '中途出局',
      reason: `${ageOf(g, p)} 岁时${p.outReason || '出局'} —— 现金流断裂是财富积累中唯一不可逆的失败，` +
              '它不会给你「下次再说」的机会' });
  }
  if(dreamAge != null && dreamAge <= S.winAge){
    return Object.assign(base, { key:'winner', win:true, label:'人生赢家',
      reason: `${dreamAge} 岁进入财务自由圈并实现梦想，早于 ${S.winAge} 岁这道门槛；` +
              '此后即便不再工作，生活也由资产支撑 —— 这就是「财务自由」的全部含义' });
  }
  if(dreamAge != null){
    return Object.assign(base, { key:'late', win:true, label:'大器晚成',
      reason: `${dreamAge} 岁实现梦想 —— 做到了，但晚于 ${S.winAge} 岁这道门槛；` +
              '赢了结果，输了时间，而时间恰恰是财富积累里最不可再生的东西' });
  }
  if(p.inFT || p.escaped){
    return Object.assign(base, { key:'free', win:false, label:'自由未圆梦',
      reason: (escapeAge != null ? `${escapeAge} 岁跳出老鼠赛跑，` : '进入了财务自由圈，') +
              `到退休时仍未把梦想落到具体的事上 —— 有了自由，但自由没有被兑现` });
  }
  return Object.assign(base, { key:'stuck', win:false, label:'仍在老鼠赛跑',
    reason: `到 ${g.endAge} 岁退休时，被动收入仍未覆盖支出 —— 一生都在用时间换钱，` +
            '一旦停下工作，收入就归零' });
}

/* 人生评级：把「结局 + 最终社会等级」压缩成一个字母，作为单人模式的成绩。
   未出圈的人和破产的人必须区分开 —— 前者是「没做到」，后者是「没走下去」。 */
function soloGrade(g, p, oc, cls){
  if(oc.key === 'bankrupt') return 'F';
  if(oc.key === 'winner')   return 'S';
  if(oc.key === 'late')     return 'A';
  if(oc.key === 'free')     return 'B';
  /* 未出圈：已经积累了可观的资产（L3 小有积累及以上）算「差一步」，
     否则与破产同档处理 —— 都没能摆脱「用时间换钱」。 */
  return cls && cls.lv >= 3 ? 'C' : 'D';
}

/* 结算结果只在这里算一次。
   ★ 必须独立于 endSolo：单人最常见的失败路径是【中途破产】，
     而破产走的是 checkLastStanding 而不是「到 65 岁」——
     若结算只在 endSolo 里生成，破产那条路上会没有任何结算可看。 */
function buildSoloResult(g){
  const p = g.players[0];
  const cls = socialClassOf(g, p);
  const oc = soloOutcome(g, p);
  const grade = soloGrade(g, p, oc, cls);
  g.soloResult = {
    key:oc.key, label:oc.label, grade, win:oc.win, reason:oc.reason,
    lv:cls.lv, levelName:cls.level.name, cover:cls.cover, passive:cls.passive, target:cls.target,
    dreamAge:oc.dreamAge, escapeAge:oc.escapeAge, winAge:oc.winAge,
    netWorth: netWorth(p), endAge: g.endAge, endRound: g.round, endAgeNow: ageOf(g, p),
    over: g.over
  };
  g.winner = oc.win ? p.id : null;
  g.winReason = oc.reason;
  return g.soloResult;
}

function endSolo(g){
  if(g.over) return;
  g.over = true;
  /* 最后一年已经在发薪日结清，终局不补结。 */

  finalSettle(g);
  const r = buildSoloResult(g);
  log(g, `🏁 ${g.endAge} 岁退休结算 · 人生评级 ${r.grade}（${r.label}）—— ${r.reason}`, r.win ? 'good' : 'bad', g.players[0].name);
}

/* 期权 3 回合限制 */
function expireOptions(g){
  g.players.forEach(p=>{
    if(p.out || p.finished) return;
    const alive = [];
    p.options.forEach(o=>{
      if(o.expiresAt <= g.turnNo){
        log(g, `${p.name} 的 ${o.label} 已到期作废，权利金 ${money(o.premium*o.shares)} 损失`, 'bad', p.name);
      } else alive.push(o);
    });
    p.options = alive;
  });
}

/* ------------------------------ 掷骰 & 移动 ------------------------------ */
function diceCount(g, p){
  /* ★ 只看【这个玩家自己】的圈：g.phase 是全局的、一旦有人出圈就永久为 'fasttrack'，
     用它会泄漏到内圈玩家。圈层状态属于玩家自身（p.inFT），不能由全局量决定。 */
  if(p.inFT) return 2;
  /* 银翅膀（做慈善获得）：可把这一次掷骰换成 2 粒 —— 走得快，但落点更难控制 */
  if(numOr(p.wings) > 0 && (p.diceChoice || 1) === window.WINGS.dice) return window.WINGS.dice;
  return 1;
}
function rollDice(g, n){
  const out = [];
  for(let i=0;i<n;i++) out.push(1 + Math.floor((g.rng? g.rng():Math.random())*6));
  return out;
}
function spacesOf(g, p){ return p.inFT ? FAST_TRACK : RAT_RACE; }
const RING_LEN = 24;

/* 执行真实路径：包含落点，不包含起点；零步不绕圈，多圈不漏格。 */
function movePlayer(g, p, steps){
  const spaces = spacesOf(g, p);
  const from = p.inFT ? p.ftPos : p.pos;
  const path = [], rows = [];
  let to = from, collected = 0, deficit = 0;
  const count = Math.max(0, Math.floor(numOr(steps)));
  for(let i = 0; i < count; i++){
    if(g.over || p.out || p.finished || lifeComplete(g, p)) break;
    to = (to + 1) % spaces.length;
    path.push(to);
    const sp = spaces[to];
    if(sp.t !== (p.inFT ? 'cashflowday' : 'paycheck')) continue;

    /* 用长岁前的账本结算这一年，再摊还和长岁。
       多个发薪日逐笔计算：还清贷款 / 退休 / 工资阶段变化会影响下一笔。 */
    refreshLife(g, p);
    const since = ageOf(g, p), monthly = settleCashflow(p), amount = annual(monthly);
    if(amount >= 0){ p.cash += amount; collected += amount; }
    else deficit += -amount;
    amortize(g, p, 1);
    ASSET_KINDS.forEach(k=>(p.assets[k] || []).forEach(it=>{ it.heldYears = numOr(it.heldYears) + 1; }));
    p.age = since + 1;
    p.settledAge = p.age;
    p.settledYears = numOr(p.settledYears) + 1;
    bump(p, 'paychecks');
    rows.push({ ix:to, years:1, monthly, amount, since, through:p.age });
    const retirement = retireBreakOf(g);
    if(retirement) g.lastRetire = retirement;
    p.energy = Math.min(numOr(p.energy), energyMax(g, p));
    refreshLife(g, p);
    checkSoloStage(g);
    log(g, `${p.name} 经过${p.inFT ? '分红日' : '发薪日'}：结算 1 年（${since}→${p.age} 岁）`
      + (amount >= 0 ? `，入账 ${money(amount)} = 年结余 ${money(amount)} × 1`
                     : `，入不敷出 ${money(-amount)}`), amount >= 0 ? 'good' : 'bad', p.name);
  }
  g.lastPath = path;
  if(p.inFT) p.ftPos = to; else p.pos = to;
  const settled = rows.length ? {
    count:rows.length, yearsPaid:rows.length, skipped:0, since:rows[0].since,
    through:ageOf(g, p), arrears:0, amount:collected, deficit, years:rows
  } : null;
  return { from, to, path, collected, deficit, settled, space:spaces[to],
           lifeComplete:lifeComplete(g, p) };
}



/* ------------------------------ 格子结算 ------------------------------ */
/* 「经过结算格（发薪日 / 分红日）但未停留」时的提示数据。
   ★ 为什么需要它：结算本身发生在 movePlayer（经过与到达都结算），
     但界面原本只在【停在】结算格时才弹确认面板 —— 仅经过时只有一条日志，
     玩家看到现金涨了却不知道是发薪，也不知道涨的是哪几年的钱。

   ★ 两个「不提示」的分支，都是为了不重复播报同一件事：
     ① 停在结算格 —— resolveSpace 会弹出一个完整的确认面板（结算年数 / 金额 / 年龄变化）；
     ② 纯入不敷出 —— resolveSpace 会优先弹出入不敷出面板处理缺口。
     两者都比一条 Toast 说得更清楚，再叠一条就是同一件事说两遍。

   ★ 本函数只返回【数据】，不拼文案、不碰 DOM ——
     与「判定归引擎，文案归 UI」的既有约定一致（也使它能被 Node 侧直接断言）。 */
function paydayNoticeOf(g, landed, inFT){
  if(!landed || !landed.settled) return null;
  const st = landed.settled, sp = landed.space;
  const settleType = inFT ? 'cashflowday' : 'paycheck';
  if(sp && sp.t === settleType) return null;          /* ① 停在结算格 → 交给确认面板 */
  if(st.deficit > 0 && st.amount <= 0) return null;    /* ② 纯入不敷出 → 交给入不敷出面板 */
  return {
    /* 收支打平也算实际完成了一年的结算。 */
    kind: 'paid',
    inFT: !!inFT,
    years: st.yearsPaid,        /* 本次实际结算的年数（经过几个结算格就结几年） */
    /* 每年均额 = 该结算格的月结余 × 12。界面要显示「年结余 × N」这个算式，
       算式里的年结余必须由引擎给 —— 界面自己除会有取整误差，也违反单一真源。 */
    perYear: (function(){
      const paid = (st.years || []).filter(y => y.years > 0)[0];
      return paid ? annual(paid.monthly) : 0;
    })(),
    amount: st.amount,          /* 实发金额（与入账同源，界面不再自己算） */
    deficit: st.deficit,        /* 同一次移动里另有入不敷出的部分 */
    count: st.count,            /* 本回合经过几个结算格 */
    skipped: st.skipped,        /* 兼容字段，始终为 0 */
    since: st.since,            /* 本次结算的起点年龄 */
    yearsList: (st.years || []).filter(y => y.years > 0).map(y => y.since + 1),  /* 各笔结的年份 */
    through: st.through,        /* 结算后已结到几岁 */
    arrears: st.arrears,        /* 兼容字段，始终为 0 */
    age: st.through,   /* 当前年龄 */
    landedType: sp ? sp.t : null
  };
}

function resolveSpace(g, p, landed){
  /* 入不敷出优先处理：现金是硬约束，钱的问题没解决，后面的格子事件没有意义。
     处理完之后界面会带着 landed 回到这里，继续走原来的落格事件。 */
  if(landed && landed.deficit > 0){
    setPending(g, { type:'deficit', amount:landed.deficit, landed, title:'入不敷出', ico:'📉' });
    return g.pending;
  }
  const sp = landed.space;
  const isFT = p.inFT;
  switch(sp.t){
    case 'start':
      /* 起点 = 可休假。精力机制必须有一条玩家能主动使用的恢复通道，
         否则「资产过多 → 精力下滑」只会变成一条无法自救的死亡螺旋。 */
      setPending(g, { type:'rest', ico:'🏁', title: isFT?'财务自由圈起点':'起点' });
      break;
    case 'paycheck': case 'cashflowday':{
      /* ★ 这里显示的必须是【实际入账额】。
         旧版写的是 finance(p).cashflow（月度值），而引擎实发的是 annual(...)（年度值）——
         弹层写 ¥674、实际到账 ¥8,088，属于典型的「账实不符」。
         现在读 movePlayer（或补偿结算）落下的记录，显示与实扣同源。 */
      const st = landed && landed.settled;
      const nm = isFT ? '分红日' : '发薪日';
      const yrs = st ? st.yearsPaid : 0;
      let msg = st
        ? `结算 ${yrs} 年（${st.since}→${st.through} 岁）：入账 ${money(st.amount)}`
          + (yrs === 1 && st.deficit === 0 ? ` = 年结余 ${money(st.amount)} × 1` : `（每个${nm}各结 1 年）`)
          + (st.deficit > 0 ? `；入不敷出 ${money(st.deficit)}，已在上一面板补上` : '') + '。'
        : '本次没有新的移动结算。';
      if(landed.lifeComplete) msg += `已到达 ${g.endAge} 岁，结束回合后完成人生结算。`;

      setPending(g, { type:'info', ico:'💰', title:nm, msg });
      break;
    }
    case 'opportunity':
      if(g.rule === '202'){
        /* 202：停在投资机会格同时抽取投资卡与行情卡（投资卡由玩家选择牌堆后再抽） */
        const mk = drawMarket(g);
        setPending(g, { type:'opportunity202', market:mk, choices:['capgain','cashflow'],
          title:'投资机会格', ico:'💡' });
      } else {
        setPending(g, { type:'opportunity', choices:['small','big'], title:'投资机会格', ico:'💡' });
      }
      break;
    case 'market':{
      const mk = drawMarket(g);
      setPending(g, { type:'market', card:mk, title:'市场行情', ico:'📈' });
      break;
    }
    case 'doodad':{
      const card = drawCard(g.decks.doodad, ()=>log(g,'额外支出卡用完，重新洗牌','sys'));
      if(card) g.decks.doodad.disc.push(card);   /* 用完放回弃牌堆，抽完自动重洗 */
      /* ★ 落格时就把「实际金额」算好并锁进 pending：
         消费档次是按当下的社会等级算的，弹层上写的数字必须与实际扣款一致，
         不能让界面和扣款各算一遍（旧版失业卡就踩过这个坑）。 */
      const cost = card ? doodadCost(g, p, card) : null;
      setPending(g, { type:'doodad', card, cost, title:'额外支出', ico:'💳' });
      break;
    }
    case 'charity':{
      const f = finance(p);
      const amount = Math.round(f.totalIncome * 0.10);
      setPending(g, { type:'charity', amount, title:'公益捐赠', ico:'🎗️' });
      break;
    }
    case 'baby':
      setPending(g, { type:'baby', title:'孩子', ico:'👶' });
      break;
    case 'downsized':{
      const f = finance(p);
      setPending(g, { type:'downsized', amount:f.totalExpenses, title:'失业', ico:'📉' });
      break;
    }
    case 'business':
      setPending(g, { type:'business', title:'企业投资', ico:'🏭', shop:FT_BUSINESSES });
      break;
    case 'dream':{
      const dream = DREAMS[sp.dream];
      setPending(g, { type:'dream', dream, title:'梦想格', ico:'🌸' });
      break;
    }
    case 'taxaudit': case 'divorce': case 'lawsuit':{
      /* 金额在「落到格子的那一刻」锁定：之后中途贷款 / 变现不会改变这笔已发生的债务，
         也保证弹层上写的数字与实际扣款完全一致。 */
      const key = sp.t, ev = FT_EVENTS[key];
      let amount = 0;
      if(key === 'taxaudit') amount = Math.min(Math.max(10000, Math.round(p.cash*0.5)), p.cash);
      if(key === 'divorce')  amount = Math.round(p.cash*0.5);
      if(key === 'lawsuit')  amount = Math.min(50000, p.cash);
      setPending(g, { type:'ftEvent', key, ev, amount, title:ev.nm, ico:ev.ico });
      break;
    }
    default:
      setPending(g, { type:'info', title:sp.nm, ico:sp.ico||'•', msg:'无特殊操作。' });
  }
  return g.pending;
}
function setPending(g, obj){ obj.p = g.cur; g.pending = obj; return g.pending; }
function clearPending(g){
  /* 保险：pending 清掉意味着「这张卡的事已经处理完」，此时现金必须是非负的。
     正常情况下各支付路径自己已处理干净，这里是最后一道防线 ——
     宁可被迫变现，也不能让负现金流到下一回合（那会破坏整局赖以成立的不变式）。 */
  const p = (g.pending && g.pending.p != null) ? g.players[g.pending.p] : null;
  g.pending = null;
  if(p && p.cash < 0) settleNegativeCash(g, p);
}

/* ------------------------------ 抽卡 ------------------------------ */
function drawDeal(g, deckName){
  const n = deckName || (g.rule==='202' ? 'capgain' : 'small');
  const deck = g.decks[n];
  const card = drawCard(deck, ()=>log(g,'投资卡用完，重新洗牌','sys'));
  if(card) deck.disc.push(card);   /* 抽过的卡进入弃牌堆，牌堆抽空后重新洗入 */
  return Object.assign({ deck:n }, card || {});
}
function drawMarket(g){
  const deck = g.decks.market;
  if(deck.draw.length === 0){
    deck.draw = shuffle(deck.disc.concat(g.rule==='202'?[]:[]));
    deck.disc = [];
    if(g.rule==='202'){ g.marketDrawn = 0; log(g,'202 行情卡已抽满，重新洗牌 42 张','sys'); }
  }
  const card = deck.draw.pop();
  deck.disc.push(card);
  g.marketDrawn++;
  /* 202：抽满 25 张后重新洗牌（不保证所有行情卡都出现） */
  if(g.rule==='202' && g.marketDrawn >= 25 && deck.draw.length>0){
    deck.draw = shuffle(deck.draw.concat(deck.disc)); deck.disc=[]; g.marketDrawn = 0;
    log(g, '202 规则：行情卡抽满 25 张，重新洗牌','sys');
  }
  return card;
}

/* ------------------------------ 结束回合 ------------------------------ */
function endTurn(g){
  if(g.over || g.pending) return null;
  const p = current(g);
  if(p.charityTurns > 0){
    p.charityTurns--;
    if(p.charityTurns===0) log(g, `${p.name} 的慈善加成结束`, 'info', p.name);
  }
  p.turnsPlayed++;
  p.diceChoice = 1;
  g.turnNo++;
  g.lastCrisis = lifeComplete(g, p) ? null : tickEnergy(g, p);          /* 自然恢复 − 持有维护；归零则触发健康危机 */
  if(!lifeComplete(g, p)) checkBankruptcy(g, p);
  if(g.over) return null;
  if(!p.out && lifeComplete(g, p)){
    p.finished = true;
    p.finishRound = g.round;
    milestone(g, p, `${p.age} 岁完成人生结算，等待其他玩家结束`, 'info');
    trackRound(g);
  }
  nextPlayer(g);
  return current(g);
}

/* ------------------------------ 现金不变式 ------------------------------ */
/* 规则：现金永不为负。付不出的部分必须先通过「向银行贷款」或「变卖资产」补足，
   两条路都走不通时，只能宣告破产退出游戏 —— 与真实社会的处理方式一致。
   旧版允许现金先变负、回合结束时按【账面原价】自动变现补齐，既不真实玩家也无感。 */
const SELL_RATE = 0.8;              /* 主动变卖：账面价 × 80%（急售折价） */
const BANK_RATE = 0.5;              /* 破产清算：银行半价收购 */

function assetLabel(it){
  if(it.symbol) return `${it.symbol} ${it.shares} 股`;
  if(it.qty) return `${it.nm} ×${it.qty}`;
  return it.nm;
}
/* 唯一支付原语：现金不足时不扣款，而是返回差额（绝不产生负数现金） */
function payCash(p, amount){
  const amt = Math.max(0, Math.round(amount || 0));
  if(amt <= p.cash){ p.cash -= amt; return { ok:true, paid:amt, shortfall:0 }; }
  return { ok:false, paid:0, shortfall: amt - p.cash };
}
/* 可主动变卖的资产清单（含急售价）。期权与财务自由圈企业不计入：
   期权本就随时可能作废，财务自由圈企业计入出圈战绩、不便回退。 */
const SELL_KEYS = ['stocks','realEstate','business','savings','funds','lands','collectibles'];
function sellableAssets(p){
  const out = [];
  p.assets.stocks.forEach((s,i)=>out.push({ key:'stocks', i, nm:assetLabel(s), book:s.shares*s.cost }));
  p.assets.realEstate.forEach((r,i)=>out.push({ key:'realEstate', i, nm:assetLabel(r), book:r.dp||0 }));
  p.assets.business.forEach((b,i)=>out.push({ key:'business', i, nm:assetLabel(b), book:b.cost||0 }));
  p.assets.savings.forEach((x,i)=>out.push({ key:'savings', i, nm:assetLabel(x), book:x.cost||0 }));
  p.assets.funds.forEach((x,i)=>out.push({ key:'funds', i, nm:assetLabel(x), book:x.cost||0 }));
  p.assets.lands.forEach((l,i)=>out.push({ key:'lands', i, nm:assetLabel(l), book:l.cost||0 }));
  p.assets.collectibles.forEach((c,i)=>out.push({ key:'collectibles', i, nm:assetLabel(c), book:c.cost||0 }));
  return out.map(x=>Object.assign(x, { value: Math.round(x.book * SELL_RATE) }));
}
function sellValue(p){ return sellableAssets(p).reduce((s,x)=>s+x.value, 0); }
/* 变卖一项资产换现金：拿到急售价，同时永久失去该资产及其现金流 */
function liquidate(g, p, key, idx){
  if(SELL_KEYS.indexOf(key) < 0) return { ok:false, msg:'该资产不可变卖。' };
  const list = p.assets[key];
  if(!list || !list[idx]) return { ok:false, msg:'资产不存在。' };
  const info = sellableAssets(p).filter(x=>x.key===key && x.i===idx)[0];
  const value = info ? info.value : 0;
  list.splice(idx, 1);
  p.cash += value;
  bump(p, 'liquidations'); bump(p, 'liquidatedValue', value);
  milestone(g, p, `第 ${g.round} 轮急售「${info?info.nm:''}」换现金 ${money(value)}（账面 ${money(info?info.book:0)}，折价变现）`, 'bad');
  log(g, `${p.name} 急售 ${info?info.nm:''}，账面 ${money(info?info.book:0)}，按 ${Math.round(SELL_RATE*100)}% 变现 ${money(value)}`, 'info', p.name);
  return { ok:true, value };
}
/* 主动宣告破产：银行半价收购全部可变现资产抵债，玩家退出游戏 */
function declareBankruptcy(g, p){
  if(p.out) return { ok:false, msg:'该玩家已经出局。' };
  bankLiquidate(g, p);
  p.cash = Math.max(0, p.cash);
  p.out = true;
  p.outReason = '宣告破产';
  bump(p, 'bankrupts');
  p.creditBanUntil = numOr(g.round) + numOrDef((window.CREDIT || {}).banTurns, 10);
  milestone(g, p, `第 ${g.round} 轮现金不足以偿付到期债务，宣告破产（银行半价清算全部可变现资产抵债）`, 'bad');
  log(g, `${p.name} 无力偿付到期债务，宣告破产退出游戏`, 'bad', p.name);
  checkLastStanding(g);
  return { ok:true };
}

/* 补上「当月入不敷出」的缺口：只能动用现金（贷款 / 变卖由资金不足面板引导） */
function payDeficit(g, p, amount){
  const r = payCash(p, amount);
  if(!r.ok) return { ok:false, shortfall:r.shortfall };
  bump(p, 'deficitMonths'); bump(p, 'deficitTotal', r.paid);
  log(g, `${p.name} 动用储蓄补上年度收支缺口 ${money(r.paid)}`, 'bad', p.name);
  return { ok:true, paid:r.paid };
}

/* 主动认输：不等破产，玩家自己选择退出本局。
   与破产的区别：认输保留全部资产与负债（仍按净资产计入最终排名），不做半价清算。 */
function surrender(g, p){
  if(p.out) return { ok:false, msg:'该玩家已经出局。' };
  p.out = true;
  p.outReason = '主动认输';
  milestone(g, p, `第 ${g.round} 轮主动认输退出本局（资产与负债完整保留，按净资产计入排名）`, 'bad');
  log(g, `${p.name} 主动认输，退出本局`, 'bad', p.name);
  checkLastStanding(g);
  return { ok:true };
}

/* ------------------------------ 破产 ------------------------------ */
function liquidatableValue(p){
  let v = 0;
  p.assets.stocks.forEach(s=>v += s.shares*s.cost*0.5);
  p.options.forEach(o=>v += 0);           // 银行以半价收购期权，且作废不计
  p.assets.collectibles.forEach(c=>v += c.cost*0.5);
  p.assets.savings.forEach(c=>v += c.cost);
  p.assets.funds.forEach(c=>v += c.cost);
  return v;
}
/* 现金为负 → 被迫变现资产偿债（仍不足则进入破产判定） */
function settleNegativeCash(g, p){
  if(p.cash >= 0) return true;
  const pool = [];
  p.assets.stocks.forEach((s,i)=>pool.push({ k:'stock', i, v:s.shares*s.cost, name:`${s.symbol} 股票 ${s.shares} 股` }));
  p.assets.collectibles.forEach((c,i)=>pool.push({ k:'collectible', i, v:c.cost, name:c.nm }));
  p.assets.savings.forEach((c,i)=>pool.push({ k:'savings', i, v:c.cost, name:c.nm }));
  p.assets.funds.forEach((c,i)=>pool.push({ k:'funds', i, v:c.cost, name:c.nm }));
  p.assets.lands.forEach((c,i)=>pool.push({ k:'land', i, v:c.cost, name:c.nm }));
  pool.sort((a,b)=>b.v-a.v);
  for(const it of pool){
    if(p.cash >= 0) break;
    p.cash += it.v;
    if(it.k==='stock')            p.assets.stocks.splice(it.i,1);
    else if(it.k==='collectible') p.assets.collectibles.splice(it.i,1);
    else if(it.k==='savings')     p.assets.savings.splice(it.i,1);
    else if(it.k==='funds')       p.assets.funds.splice(it.i,1);
    else if(it.k==='land')        p.assets.lands.splice(it.i,1);
    log(g, `${p.name} 现金不足，被迫变现 ${it.name} 换取 ${money(it.v)}`, 'bad', p.name);
  }
  return p.cash >= 0;
}

/* 破产：月现金流为负，且出售所有可变现资产后仍无法扭转 → 退出游戏 */
function checkBankruptcy(g, p){
  if(p.out || p.finished) return false;
  settleNegativeCash(g, p);                    /* 现金为负时先被迫变现资产 */
  /* ★ 两圈各用各的账本：老鼠赛跑看「工资 + 被动 − 支出」，
     财务自由圈看「分红 − 自由圈生活支出 − 仍在还的贷款」。
     用同一个账本会漏判自由圈的破产风险（分红减去支出后可能是负的）。 */
  const f = p.inFT ? ftFinance(p) : finance(p);
  if(f.cashflow >= 0) return false;            /* 现金流为正的角色不会破产 */
  const liq = p.cash + liquidatableValue(p);
  if(liq > 0) return false;                    /* 仍有资产可变现，玩家可自行扭转 */
  /* 出售所有资产仍无法扭转 → 破产出局 */
  bankLiquidate(g, p);
  p.out = true;
  p.outReason = '破产';
  bump(p, 'bankrupts');
  p.creditBanUntil = numOr(g.round) + numOrDef((window.CREDIT || {}).banTurns, 10);
  milestone(g, p, `第 ${g.round} 轮${p.inFT ? '自由圈 ' : ''}现金流为负（${money(f.cashflow)}）且已无资产可变现，被动破产出局`, 'bad');
  log(g, `${p.name} 月现金流为负且已无偿付能力，出售全部资产后仍无法扭转，宣告破产，退出游戏`, 'bad', p.name);
  if(g.rule==='202'){
    log(g, `202 破产惩罚：跳过 3 回合且此后仅能就特定卡牌借贷（该玩家已出局）`, 'bad', p.name);
  }
  checkLastStanding(g);
  return true;
}
function bankLiquidate(g, p){
  let proceeds = 0;
  /* 银行按半价收购全部可变现资产（房产 / 企业 / 土地此前漏掉，会凭空消失且不计价） */
  p.assets.stocks.forEach(s=>{ proceeds += s.shares*s.cost*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的 ${s.symbol} 股票 ${s.shares} 股`, 'bad', p.name); });
  p.assets.collectibles.forEach(c=>{ proceeds += c.cost*BANK_RATE; });
  p.assets.savings.forEach(c=>{ proceeds += c.cost; });
  p.assets.funds.forEach(c=>{ proceeds += c.cost; });
  p.assets.realEstate.forEach(r=>{ proceeds += (r.dp||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的房产「${r.nm}」`, 'bad', p.name); });
  p.assets.business.forEach(b=>{ proceeds += (b.cost||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的企业「${b.nm}」`, 'bad', p.name); });
  p.assets.lands.forEach(l=>{ proceeds += (l.cost||0)*BANK_RATE; log(g,`银行以半价收购 ${p.name} 的土地「${l.nm}」`, 'bad', p.name); });
  p.options.forEach(o=>log(g, `${p.name} 的期权作废`, 'bad', p.name));
  p.assets.stocks=[]; p.assets.collectibles=[]; p.assets.savings=[]; p.assets.funds=[];
  p.assets.realEstate=[]; p.assets.business=[]; p.assets.lands=[]; p.options=[];
  p.cash += proceeds;
  /* 优先还贷，不足部分银行核销 */
  const debt = p.liabs.home+p.liabs.school+p.liabs.car+p.liabs.credit+p.liabs.bank+(p.liabs.other||0);
  const pay = Math.min(p.cash, debt);
  const rest = debt - pay;
  p.cash -= pay;
  p.liabs = { home:0, school:0, car:0, credit:0, bank:0, other:0, extraPay:0 };
  if(rest>0) log(g, `${p.name} 贷款缺口 ${money(rest)} 由银行核销`, 'sys', p.name);
}

/* ------------------------------ 胜负 ------------------------------ */
function checkLastStanding(g){
  const alive = alivePlayers(g);
  /* 全员破产出局：本局无人获胜，直接结束（否则会在没有存活玩家的情况下无限空转） */
  if(alive.length === 0){
    g.over = true; g.winner = null;
    if(isSolo(g)){
      /* 单人出局 = 这一生没能走下去。结算必须照常产出 ——
         这正是单人模式最需要复盘的一条路径（钱是怎么断的）。 */
      const r = buildSoloResult(g);
      log(g, `🏁 人生提前结束 · 评级 ${r.grade}（${r.label}）—— ${r.reason}`, 'bad', g.players[0].name);
      return;
    }
    g.winReason = '全部玩家均已破产出局，本局无人获胜';
    log(g, '🏁 全部玩家均已破产出局，本局结束', 'sys');
    return;
  }
  if(alive.length === 1 && g.players.length > 1 && g.rule === '202'){
    win(g, alive[0], '通过买断与破产机制成为最后的存活者');
  }
}
function win(g, p, reason, kind){
  if(p.out) return;
  /* 单人模式：达成即记录，但【不结束对局】。
     理由有两层 ——
       ① 单人模式的目标是「完整走完一生」。若买到梦想就收场，玩家会看不到
          财务自由圈的后续人生（企业、更多梦想）以及最关键的退休期；
       ② 这更贴近财富流原意：进入顺流层后赚钱更快，但能否守住仍取决于后续决策。
     于是把「什么时候达成的」记下来，留到 65 岁退休结算时按达成时间评档。 */
  if(isSolo(g)){
    p.achievements = p.achievements || [];
    if(!p.achievements.some(a=>a.reason === reason)){
      p.achievements.push({ age:ageOf(g, p), round:g.round, reason, kind:kind || 'other' });
    }
    bump(p, 'soloWins');
    milestone(g, p, `第 ${g.round} 轮（${ageOf(g, p)} 岁）达成：${reason}`, 'good');
    log(g, `🎉 ${p.name} 达成「${reason}」——单人模式对局继续，直到 ${g.endAge} 岁退休结算`, 'good', p.name);
    return;
  }
  g.over = true; g.winner = p.id; g.winReason = reason;
  log(g, `🏆 ${p.name} 获胜：${reason}`, 'good', p.name);
}
function checkWin(g, p, reason){ win(g, p, reason); }

/* ------------------------------ 导出 ------------------------------ */
/* ------------------------------ 社会等级 ------------------------------ */
/* 用两条【真实的轴】定位玩家所处的社会层级，而不是按结局排名 ——
   现实中决定一个人在哪一层的，恰恰就是这两件事：
     ① 你对工资的依赖程度 —— 被动收入 ÷ 出圈门槛（覆盖度）
     ② 你扛得住多久的意外 —— 应急金能撑几个月

   ★ 等级判定放在引擎层，因为它已经不只是「展示指标」：
     意外支出的金额要按等级缩放（消费升级规则），这是真正的**规则输入**。
     若把它留在表现层，引擎就得反过来依赖 UI —— 会破坏「引擎零 DOM 依赖」的约定。
   ★ 被动收入取的口径与出圈进度完全一致（出局玩家用峰值），
     否则会出现「进度显示 38% 却被评成中产」这种自相矛盾的展示。
   ★ 低三层用【应急金】而不是【净资产】做门槛：本作每个人的初始净资产都被房贷
     拖成负数（现金 + 资产 − 剩余本金），拿它当「扛不扛得住」的信号，
     会把所有刚开局的人一律打成最底层。而「能撑几个月」才是真实的抗风险刻度。 */
const LADDER = [
  { lv:0, name:'入不敷出', ico:'🆘', tone:'bad',
    real:'月现金流为负且没有缓冲，或已被迫出局 —— 收入结构本身不成立。' },
  { lv:1, name:'月光无余', ico:'🌙', tone:'bad',
    real:'收支能大致打平，但应急金撑不到 3 个月 —— 收入一旦中断就立刻陷入被动。' },
  { lv:2, name:'温饱有余', ico:'🍚', tone:'warn',
    real:'手里有了应急金，但收入仍几乎全部来自工资，资产端还没真正启动。' },
  { lv:3, name:'小有积累', ico:'🏠', tone:'warn',
    real:'已经有了一批能生息的资产，被动收入开始替一部分支出买单。' },
  { lv:4, name:'稳健中产', ico:'🏙️', tone:'good',
    real:'半数支出已由资产覆盖，抗风险能力明显强于只靠工资的人。' },
  { lv:5, name:'临门一脚', ico:'🚪', tone:'good',
    real:'只差最后一笔，被动收入就足以覆盖全部支出。' },
  { lv:6, name:'财务自由', ico:'🕊️', tone:'good',
    real:'被动收入已经超过全部支出 —— 工作由必答题变成选择题。' },
  { lv:7, name:'人生赢家', ico:'🏆', tone:'good',
    real:'在财务自由之上还完成了自己的梦想，是这一局里唯一走到终点的人。' }
];
/* 峰值口径与复盘里的 peak() 保持一致：走势快照、统计记录、当前值三者取最大；
   出局玩家的「当前值」是清算后的残值，不能当峰值用。 */
function peakCashOf(p){
  const tr = p.track || [];
  const fromTrack = tr.length ? tr.reduce((m, t)=>Math.max(m, numOr(t.cash)), -Infinity) : -Infinity;
  const fromStat = (p.stats && typeof p.stats.peakCash === 'number') ? p.stats.peakCash : -Infinity;
  const v = Math.max(fromTrack, fromStat, p.out ? -Infinity : numOr(p.cash));
  return isFinite(v) ? v : 0;
}
function peakPassiveOf(p){
  const tr = p.track || [];
  const fromTrack = tr.length ? tr.reduce((m, t)=>Math.max(m, numOr(t.passive)), -Infinity) : -Infinity;
  const fromStat = (p.stats && typeof p.stats.peakPassive === 'number') ? p.stats.peakPassive : -Infinity;
  const v = Math.max(fromTrack, fromStat);
  return isFinite(v) ? Math.max(0, v) : 0;
}
function socialClassOf(g, p){
  const f = finance(p);
  const target = Math.max(0, escapeTarget(g, p));
  const passive = p.out ? peakPassiveOf(p) : f.passive;
  const exp = f.totalExpenses;
  const cover = target > 0 ? passive / target : (passive > 0 ? 1 : 0);
  const safety3 = exp * 3;
  const peakCash = peakCashOf(p);
  const safetyProg = safety3 > 0 ? Math.max(0, Math.min(1, peakCash / safety3)) : 0;
  const bankrupt = !!p.out && p.outReason !== '主动认输';
  const isWin = !!g.over && g.winner === p.id;

  /* 自上而下匹配：越高层级的条件越强，第一个命中即为当前层级 */
  let lv;
  if(isWin) lv = 7;
  else if(p.inFT || p.escaped || cover > 1) lv = 6;
  else if(cover >= 0.80) lv = 5;
  else if(cover >= 0.50) lv = 4;
  else if(cover >= 0.25) lv = 3;
  else if(safetyProg >= 1) lv = 2;
  else if(bankrupt) lv = 0;
  else lv = 1;

  return { lv, level:LADDER[lv], nextLv: lv < 7 ? lv + 1 : null,
           passive, target, cover, peakCash, exp, safety3,
           safetyMonths: exp > 0 ? peakCash / exp : 0, safetyProg,
           bankrupt, escaped: !!(p.inFT || p.escaped), win: isWin };
}

/* ------------------------------ 消费升级 ------------------------------ */
/* 消费档次：由社会等级决定的意外支出系数。
   地位越高 → 名下值钱的东西越多 → 同一件「意外」要花的钱越多。
   这是「生活方式膨胀」的直接建模：不是买不起，而是**养不起**。 */
function lifestyleOf(g, p){
  const L = window.LIFESTYLE || { byLevel:[1], why:[], label:'消费档次' };
  const cls = socialClassOf(g, p);
  const mult = numOrDef(L.byLevel[cls.lv], 1);
  return { lv:cls.lv, level:cls.level, mult,
           why:(L.why || [])[cls.lv] || '', label:L.label || '消费档次', cls };
}
/* 意外支出的实际金额 = 卡片标价 × 消费档次系数。
   按卡片敏感度分两档承接：
     scale:'life'  消费升级型（修车 / 换车 / 房屋 / 出游 / 培训）→ 全额承接，系数 1.75 就是 1.75
     scale:'basic' 基础型（税费 / 罚款 / 医疗 / 人情）→ 只承接 basicDamp 的比例
   —— 否则「补缴个税」也会随豪车一起涨价，不合逻辑。 */
function doodadCost(g, p, card){
  const ls = lifestyleOf(g, p);
  const kind = (card && card.scale) === 'basic' ? 'basic' : 'life';
  const damp = kind === 'basic' ? numOrDef((window.LIFESTYLE || {}).basicDamp, 0) : 1;
  const factor = 1 + (ls.mult - 1) * damp;
  const base = Math.max(0, Math.round(numOr(card && card.cost)));
  const extraBase = Math.max(0, Math.round(numOr(card && card.extraPay)));
  const cost = Math.round(base * factor);
  return { base, extraBase, cost, extraPay: Math.round(extraBase * factor),
           mult: ls.mult, factor, kind, damp, lv: ls.lv, levelName: ls.level.name,
           why: ls.why, added: cost - base };
}

window.Engine = {
  money, moneyK, shuffle, pick, finance, escapeMargin, empireTarget, escapeTarget, escapeProgress, ftMonthly, netWorth,
  newGame, current, alivePlayers, beginTurn, nextPlayer, endTurn, diceCount, rollDice,
  movePlayer, resolveSpace, paydayNoticeOf, clearPending, setPending, drawDeal, drawMarket, drawCard,
  log, expireOptions, checkBankruptcy, settleNegativeCash, checkLastStanding, win, ftMonthlyIncome: ftMonthly,
  RING_LEN, ASSET_KEYS, liquidatableValue, applyPortfolio, deckLeft,
  /* 现金不变式：现金永不为负 */
  SELL_RATE, BANK_RATE, assetLabel, payCash, sellableAssets, sellValue, liquidate, declareBankruptcy,
  /* 年龄 / 轮次 */
  ageOf, yearsLeft, maxYears, maxRounds, lifeComplete, migrateTime, isAgeMode, isSolo, modeLabel, endByAge,
  /* 单人模式：人生阶段（叙事层）与退休结算 */
  soloStageOf, soloStage, checkSoloStage, soloOutcome, soloGrade, buildSoloResult, endSolo,
  /* 圈层：状态属于玩家自身，g.phase 仅为镜像 */
  phaseOf, syncPhase,
  /* 暂停回合：回合仍属于该玩家，只是本回合不能行动 */
  markTurnPause,
  /* 复盘数据采集 */
  surrender, initTrack, bump, milestone, trackRound, STAT_KEYS,
  /* 贷款计划：等额本息 + 全类型提前还款 */
  LOAN_KEYS, loanType, loanDue, loanInfo, ensureLoans, amortize, prepay, prepayPlan, periodsOf, dueOf,
  /* 时间口径：发薪日推进一年；一个结算年 = monthsPerPayday() 个月（见 window.TIME） */
  monthsPerPayday, monthsPerYear, toYears, toYearsFloor, annual,
  /* 人生阶段：收入 / 支出 / 赡养 / 医疗，全部由年龄推导 */
  curveAt, salaryStageOf, lifeStageOf, refreshLife, refreshAllLife, refreshAllEnergy,
  /* 精力：上限与恢复随年龄衰减，持有资产持续消耗，归零触发健康危机 */
  energyMax, energyRecover, energyUpkeep, spendEnergy, tickEnergy, healthCrisis,
  /* 失业求职期 / 公益捐赠税前扣除 / 银翅膀 */
  isJobless, startJobless, settleAtBreak, jobHunt, donationRefund, useWing,
  /* 生活基线 / 自由圈账本 / 信用额度 */
  lifeBaseHousing, ftExpenseOf, ftFinance, collateralValue, creditGradeOf, creditProfile, settleCashflow,
  /* 突变点与终局结算 */
  retireBreakOf, finalSettle,
  /* 资产估值：市场周期 + 行情冲击 + 折旧 */
  ASSET_KINDS, marketShockOf, marketCycleOf, marketIndex, bumpMarket,
  assetBookOf, appraiseAsset, appraiseAll, stampAsset,
  /* 多头借贷识别 */
  multiBorrowingOf,
  /* 入不敷出：月现金流为负时的统一处理入口 */
  payDeficit,
  /* 社会等级 / 消费升级：等级是意外支出金额的规则输入 */
  LADDER, peakCashOf, peakPassiveOf, socialClassOf, lifestyleOf, doodadCost
};
})();
