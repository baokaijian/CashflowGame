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
function makeDeck(cards){
  return { draw: shuffle(cards), disc: [], total: cards.length };
}
function drawCard(deck, onReshuffle){
  if(deck.draw.length === 0){
    deck.draw = shuffle(deck.disc); deck.disc = [];
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
  return {
    key, nm:t.nm, note:t.note, kind:t.kind,
    rate:t.rate, rateAnnual:t.rate * 12, prepayRate:t.prepayRate, minPeriod:t.minPeriod,
    balance:bal, due, base:numOr(m.base), periods:numOr(m.periods),
    remaining, interestLeft, revolving,
    canPrepay: bal > 0 && numOr(m.periods) >= t.minPeriod
  };
}
/* 推进一期还款：利息 = 剩余本金 × 月利率，月供的其余部分冲减本金。
   在「经过发薪日」时调用 —— 与月现金流（其中已含月供）同步结算，账实一致。 */
function amortize(g, p){
  if(!p || p.out) return;
  ensureLoans(p);
  LOAN_KEYS.forEach(key=>{
    const t = loanType(key);
    if(t.kind === 'revolving') return;               /* 信用贷按余额计息，不做本金摊还 */
    const bal = numOr(p.liabs[key]);
    if(bal <= 0) return;
    const due = loanDue(p, key);
    const pay = Math.min(bal, Math.max(0, due - bal * t.rate));
    /* 取整：利息是小数，但「剩余本金」必须保持整数，否则净资产 / 存档会出现一长串小数 */
    p.liabs[key] = Math.round(bal - pay);
    p.loans[key].periods += 1;
    if(p.liabs[key] <= 1){
      p.liabs[key] = 0;
      log(g, `${p.name} 的${t.nm}已还清（共 ${p.loans[key].periods} 期）`, 'good', p.name);
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
function salaryStageOf(g){
  const age = ageOf(g), C = window.SALARY_CURVE;
  for(let i=0;i<C.length;i++) if(age <= C[i].to) return C[i];
  return C[C.length-1];
}
function lifeStageOf(g){
  const age = ageOf(g), L = window.LIFE_STAGES;
  for(let i=0;i<L.length;i++) if(age <= L[i].to) return L[i];
  return L[L.length-1];
}
/* 精力上限：随年龄衰减（40 岁后体力与恢复力明显下降） */
function energyMax(g, p){ return curveAt(window.ENERGY.maxCurve, ageOf(g), 'max'); }
/* 每回合自然恢复；健康危机期间打对折 —— 身体处在恢复期，休息效率本身就低 */
function energyRecover(g, p){
  let v = curveAt(window.ENERGY.recoverCurve, ageOf(g), 'v');
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
  const sc = salaryStageOf(g), ls = lifeStageOf(g);
  if(typeof p.baseSalary !== 'number') p.baseSalary = numOrDef(p.job && p.job.salary, 0);
  p.salaryMult  = sc.mult;
  p.salaryPhase = sc.phase;
  p.lifeStage   = ls.nm;
  p.lifeCoef    = ls.coef;
  p.elderRatio  = ls.elderRatio || 0;
  /* 失业期间主动收入归零；低精力则绩效打折（现实里状态差会直接影响产出与奖金） */
  let salary = p.baseSalary * sc.mult;
  if(isJobless(p)) salary = 0;
  else if(numOr(p.energy) < window.ENERGY.lowAt) salary = salary * window.ENERGY.lowSalaryMult;
  p.salary   = Math.round(salary);
  /* 赡养支出 = 实发工资 × 阶段比例。用【实发工资】而不是基础工资，
     这样失业（工资归零）时赡养负担也随之暂停 —— 现实中失去收入后，
     赡养通常由其他兄弟姐妹分担或降到最低限度，不会照旧全额支出。 */
  p.elderCare = Math.round(p.salary * p.elderRatio);
  p.taxesCur  = Math.round(numOrDef(p.job && p.job.taxes, 0) * sc.mult);
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
function startJobless(g, p, severance){
  const U = window.UNEMPLOYMENT, age = ageOf(g);
  const need = U.effortBase + (age > 40 ? U.over40Extra : 0) + (age > 50 ? U.over50Extra : 0);
  p.joblessProgress = 0;
  p.joblessNeed = need;
  if(severance) p.cash += severance;
  refreshLife(g, p);
  bump(p, 'downsized');
  milestone(g, p, `第 ${g.round} 轮被裁员失业，进入求职期（预计 ${need} 个回合），期间工资归零`, 'bad');
  log(g, `${p.name} 被裁员失业：工资归零，需要投入时间求职（预计 ${need} 个回合）${severance ? `，领取离职补偿 ${money(severance)}` : ''}`, 'bad', p.name);
  return { ok:true, need, severance:severance||0 };
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
/* 银翅膀：做慈善获得的一次「掷 3 粒骰子」机会 */
function useWing(p){
  if(numOr(p.wings) > 0){ p.wings--; return true; }
  return false;
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
  const exp = {
    taxes:  numOrDef(p.taxesCur, numOrDef(p.job.taxes, 0)),
    home:   numOr(p.liabs.home)   > 0 ? loanDue(p, 'home')   : 0,
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
  const totalExpenses = exp.taxes+exp.home+exp.school+exp.car+exp.credit+exp.retail+exp.other
    +exp.elder+exp.medical+exp.otherLoan+exp.extra+exp.children+exp.bank;
  const passive = inc.interest + inc.dividend + inc.realEstate + inc.business + inc.ftBusiness;
  const loanTotal = exp.home + exp.school + exp.car + exp.credit + exp.otherLoan + exp.bank;
  return { inc, exp, totalIncome, totalExpenses, cashflow: totalIncome - totalExpenses, passive, bankLoanPay: exp.bank, loanTotal };
}

/* 跳出老鼠赛跑的门槛 */
function escapeTarget(g, p){
  const f = finance(p);
  return g.rule==='202' ? f.totalExpenses*2 : f.totalExpenses;
}
function escapeProgress(g, p){
  const f = finance(p), t = escapeTarget(g,p);
  return { passive:f.passive, target:t, pct: t>0 ? Math.min(1, f.passive/t) : 1,
           canEscape: f.passive > t };
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
    /* 人生模拟：精力 / 就业 / 医疗，以及由年龄推导出的收入支出参数 */
    energy: 100, baseSalary: job.salary, salaryMult: 1, salaryPhase: '', taxesCur: null,
    lifeStage: '', lifeCoef: 1, elderCare: 0,
    joblessProgress: 0, joblessNeed: 0, wings: 0,
    medicalExp: 0, crisisTurns: 0,
    dreamIdx: i % DREAMS.length, dreamOwned: false,
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
  const n = cfg.count;
  const careers = shuffle(CAREERS.slice());
  const portfolios = shuffle(PORTFOLIOS.slice());
  const g = {
    rule: cfg.rule || '101',
    /* 游戏模式：age = 年龄模式（20 岁起步，65 岁退休结算）；endless = 无限模式 */
    mode: cfg.mode === 'endless' ? 'endless' : 'age',
    startAge: AGE_START, endAge: AGE_END,
    players: [], cur: 0, round: 1, turnNo: 0,
    phase: 'ratrace',
    over: false, winner: null, winReason: '',
    log: [], pending: null, lastDice: [], lastPath: [],
    rng: cfg.seed ? (function(s){ return function(){ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(cfg.seed) : null,
    decks: {
      small:  makeDeck(DECK_SMALL),
      big:    makeDeck(DECK_BIG),
      market: makeDeck(cfg.rule==='202' ? DECK_MARKET_202 : DECK_MARKET_101),
      doodad: makeDeck(cfg.rule==='202' ? DECK_DOODAD_202 : DECK_DOODAD_101),
      capgain:makeDeck(DECK_CAPGAIN),
      cashflow:makeDeck(DECK_CASHFLOW)
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
    }
    refreshLife(g, p);                    /* 按年龄推导工资 / 税负 / 支出系数 / 赡养支出 */
    p.energy = energyMax(g, p);           /* 开局精力满格 */
    const f = finance(p);
    /* 第 7 步：起始现金 = 月现金流 + 储蓄（202 规则另加初始投资组合中的现金） */
    p.cash = f.cashflow + p.job.savings + (p.pfCash || 0);
    p.startCash = p.cash;
    g.players.push(p);
  }
  log(g, `游戏开始 · ${g.rule} 规则 · ${n} 位玩家 · ${g.mode==='age' ? `年龄模式（${g.startAge}→${g.endAge} 岁，共 ${maxRounds(g)} 轮）` : '无限模式'}`, 'sys');
  syncPhase(g);
  log(g, g.rule==='202'
    ? '跳出条件：被动收入 > 总支出 × 2；启用资本利得/大额现金流卡、做空与期权。'
    : '跳出条件：被动收入 > 总支出；投资机会格仅抽投资卡。', 'info');
  g.players.forEach(p=>{
    log(g, `${p.name} 抽到【${p.job.name}】工资 ${money(p.salary)}，起始现金 ${money(p.cash)}`, 'info', p.name);
  });
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
/* 年龄模式：开局 20 岁，所有玩家各行动一次算一轮，每完成一整轮长 1 岁。
   round 表示「当前正在进行的第几轮」（从 1 开始），因此：
     年龄 = startAge + (round - 1)
   已完成的轮数 = round - 1
   总轮数上限 = endAge - startAge（20 → 65 共 45 轮） */
function ageOf(g){ return g.startAge + (g.round - 1); }
function yearsLeft(g){ return Math.max(0, g.endAge - ageOf(g)); }
function maxRounds(g){ return g.endAge - g.startAge; }
function isAgeMode(g){ return g.mode === 'age'; }

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
  /* 入不敷出：失业或高负债导致收入盖不住支出的月份数与总额 */
  deficitMonths:0, deficitTotal:0,
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
  p.milestones.push({ round:g.round, text, kind:kind || 'info' });
  if(p.milestones.length > 60) p.milestones.shift();
}
/* 每完成一整轮给所有玩家拍一张快照：现金 / 被动收入 / 月现金流 / 净资产 */
function trackRound(g){
  g.players.forEach(p=>{
    initTrack(p);
    const f = finance(p), nw = netWorth(p);
    p.track.push({ round:g.round, cash:p.cash, passive:f.passive, cf:f.cashflow, net:nw });
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
  if(p.out){ nextPlayer(g); return beginTurn(g); }
  p.turnStart = { cash:p.cash, cf:finance(p).cashflow };
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
  if(g.over) return;
  let guard = 0;
  do{
    g.cur = (g.cur+1) % g.players.length;
    if(g.cur === 0){
      trackRound(g);
      g.round++;                 /* 全局长 1 岁 → 所有人的收入与支出结构随之变化 */
      refreshAllLife(g);
      refreshAllEnergy(g);
      expireOptions(g);
    }
    guard++;
  } while(g.players[g.cur].out && guard < g.players.length*2);
  /* 年龄模式：完成一整轮（所有玩家各行动一次，即 round 递增）即长 1 岁，满 65 岁退休结算 */
  if(isAgeMode(g) && g.round > maxRounds(g)){ endByAge(g); return null; }
  markTurnPause(g);
  refreshLife(g, current(g));    /* 精力可能在上一回合变化 → 主动收入与税负跟着刷新 */
  syncPhase(g);
  return current(g);
}

/* 年龄模式结束：按净资产排名，最高者获胜 */
function endByAge(g){
  if(g.over) return;
  g.over = true;
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

/* 期权 3 回合限制 */
function expireOptions(g){
  g.players.forEach(p=>{
    if(p.out) return;
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
  /* 银翅膀（做慈善获得）：可把这一次掷骰换成 3 粒 —— 走得快，但落点更难控制 */
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

function pathBetween(from, to){
  const out = []; let i = from;
  let guard = 0;
  do{ i = (i+1) % RING_LEN; out.push(i); guard++; } while(i !== to && guard < 60);
  return out;
}

/* 执行移动 + 结算经过的格子 + 返回落点待处理事件 */
function movePlayer(g, p, steps){
  const spaces = spacesOf(g, p);
  const from = p.inFT ? p.ftPos : p.pos;
  const to = (from + steps) % RING_LEN;
  const path = pathBetween(from, to);
  g.lastPath = path;
  if(p.inFT) p.ftPos = to; else p.pos = to;

  /* 经过 / 停留 结算日格子 → 领取月现金流
     ★ 月现金流可能为负（失业期没有工资而支出照付，或贷款月供超过了收入）——
       负值【不能直接加到现金上】，否则会破坏「现金永不为负」这条不变式。
       这里把它记成一笔「当期入不敷出」，交给界面走统一的资金不足处理流程。 */
  let collected = 0, deficit = 0;
  path.forEach(ix=>{
    const sp = spaces[ix];
    if(!p.inFT && sp.t === 'paycheck'){
      const cf = finance(p).cashflow;
      if(cf >= 0) collected += cf; else deficit += -cf;
      amortize(g, p);
    }
    if(p.inFT && sp.t === 'cashflowday'){ collected += ftMonthly(p); }
  });
  if(collected !== 0){
    p.cash += collected;
    log(g, `${p.name} 经过发薪日，领取 ${money(collected)}`, 'good', p.name);
  }
  if(deficit > 0){
    log(g, `${p.name} 本月入不敷出 ${money(deficit)}（收入不足以覆盖支出）`, 'bad', p.name);
  }
  return { from, to, path, collected, deficit, space: spaces[to] };
}

/* ------------------------------ 格子结算 ------------------------------ */
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
    case 'paycheck': case 'cashflowday':
      setPending(g, { type:'info', ico:'💰', title: isFT?'现金流日':'发薪日',
        msg:`已领取月现金流 ${money(isFT?ftMonthly(p):finance(p).cashflow)}。` });
      break;
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
      setPending(g, { type:'doodad', card, title:'额外支出', ico:'💳' });
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
  const p = current(g);
  clearPending(g);
  if(p.charityTurns > 0){
    p.charityTurns--;
    if(p.charityTurns===0) log(g, `${p.name} 的慈善加成结束`, 'info', p.name);
  }
  p.turnsPlayed++;
  p.diceChoice = 1;
  g.turnNo++;
  g.lastCrisis = tickEnergy(g, p);          /* 自然恢复 − 持有维护；归零则触发健康危机 */
  checkBankruptcy(g, p);
  if(g.over) return null;
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
  log(g, `${p.name} 动用储蓄补上本月收支缺口 ${money(r.paid)}`, 'bad', p.name);
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
  if(p.out) return false;
  settleNegativeCash(g, p);                    /* 现金为负时先被迫变现资产 */
  const f = finance(p);
  if(f.cashflow >= 0) return false;            /* 月现金流为正的角色不会破产 */
  const liq = p.cash + liquidatableValue(p);
  if(liq > 0) return false;                    /* 仍有资产可变现，玩家可自行扭转 */
  /* 出售所有资产仍无法扭转 → 破产出局 */
  bankLiquidate(g, p);
  p.out = true;
  p.outReason = '破产';
  milestone(g, p, `第 ${g.round} 轮月现金流为负（${money(f.cashflow)}）且已无资产可变现，被动破产出局`, 'bad');
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
    g.winReason = '全部玩家均已破产出局，本局无人获胜';
    log(g, '🏁 全部玩家均已破产出局，本局结束', 'sys');
    return;
  }
  if(alive.length === 1 && g.players.length > 1 && g.rule === '202'){
    win(g, alive[0], '通过买断与破产机制成为最后的存活者');
  }
}
function win(g, p, reason){
  g.over = true; g.winner = p.id; g.winReason = reason;
  log(g, `🏆 ${p.name} 获胜：${reason}`, 'good', p.name);
}
function checkWin(g, p, reason){ win(g, p, reason); }

/* ------------------------------ 导出 ------------------------------ */
window.Engine = {
  money, moneyK, shuffle, pick, finance, escapeTarget, escapeProgress, ftMonthly, netWorth,
  newGame, current, alivePlayers, beginTurn, nextPlayer, endTurn, diceCount, rollDice,
  movePlayer, resolveSpace, clearPending, setPending, drawDeal, drawMarket, drawCard,
  log, expireOptions, checkBankruptcy, settleNegativeCash, checkLastStanding, win, ftMonthlyIncome: ftMonthly,
  RING_LEN, ASSET_KEYS, liquidatableValue, applyPortfolio, deckLeft,
  /* 现金不变式：现金永不为负 */
  SELL_RATE, BANK_RATE, assetLabel, payCash, sellableAssets, sellValue, liquidate, declareBankruptcy,
  /* 年龄 / 轮次 */
  ageOf, yearsLeft, maxRounds, isAgeMode, endByAge,
  /* 圈层：状态属于玩家自身，g.phase 仅为镜像 */
  phaseOf, syncPhase,
  /* 暂停回合：回合仍属于该玩家，只是本回合不能行动 */
  markTurnPause,
  /* 复盘数据采集 */
  surrender, initTrack, bump, milestone, trackRound, STAT_KEYS,
  /* 贷款计划：等额本息 + 全类型提前还款 */
  LOAN_KEYS, loanType, loanDue, loanInfo, ensureLoans, amortize, prepay, prepayPlan, periodsOf, dueOf,
  /* 人生阶段：收入 / 支出 / 赡养 / 医疗，全部由年龄推导 */
  curveAt, salaryStageOf, lifeStageOf, refreshLife, refreshAllLife, refreshAllEnergy,
  /* 精力：上限与恢复随年龄衰减，持有资产持续消耗，归零触发健康危机 */
  energyMax, energyRecover, energyUpkeep, spendEnergy, tickEnergy, healthCrisis,
  /* 失业求职期 / 公益捐赠税前扣除 / 银翅膀 */
  isJobless, startJobless, jobHunt, donationRefund, useWing,
  /* 入不敷出：月现金流为负时的统一处理入口 */
  payDeficit
};
})();
