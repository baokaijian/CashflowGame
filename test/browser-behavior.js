/* 浏览器行为验证探针（8 组：精力/拦阻/失业求职/入不敷出/休假/银翅膀/节税/健康危机/年龄曲线）
   运行方式见 test/README.md。它由外层脚本包进 index.html 的副本里，
   结果写入 <pre id="DIAG">，再从 --dump-dom 里抽取。 */
/* 人生模拟机制的行为验证：精力消耗 / 失业求职 / 入不敷出 / 休假 / 银翅膀 / 健康危机 */
var OUT = [], STEPS = [], i = 0, guard = 0;
function q(s){ return document.querySelector(s); }
function title(){ return (document.querySelector('#modal .modal__head h3') || {}).textContent || ''; }
function mb(txt){
  return [].slice.call(document.querySelectorAll('#modal .modal__foot button'))
    .filter(function(b){ return b.textContent.indexOf(txt) >= 0; })[0];
}
function anyBtn(txt){
  return [].slice.call(document.querySelectorAll('#modal button'))
    .filter(function(b){ return b.textContent.indexOf(txt) >= 0; })[0];
}
function ok(c, t){ OUT.push((c ? '   ✅ ' : '   ❌ ') + t); }
function step(desc, wait, fn){ STEPS.push({ desc:desc, w:wait, fn:fn }); }
function fresh(over){
  window.UI.setTheme('dark');
  window.startGame({rule:'101', mode:'age', count:2, names:['甲','乙'], showAll:true});
  var g = window.Game.g, p = g.players[0];
  p.cash = 2000000;
  if(over) Object.keys(over).forEach(function(k){ p[k] = over[k]; });
  window.UiGame.renderAll();
  return { g:g, p:p, E:window.Engine };
}
function newRound(g, p){ window.UiGame.resetBoardView(g); window.UiGame.renderAll(); }

window.addEventListener('error', function(e){
  OUT.push('   ❌ 未捕获异常：' + e.message + ' @' + String(e.filename||'').split('/').pop() + ':' + e.lineno);
});

window.addEventListener('load', function(){
  var C = {};

  /* ============ A. 考察与买入的精力消耗 ============ */
  step('准备 A', function(){ return true; }, function(){
    C.a = fresh(); C.g = C.a.g; C.p = C.a.p; C.E = C.a.E;
    OUT.push('=== A. 考察与买入消耗精力 ===');
    C.e0 = C.p.energy;
    C.dCost = window.ENERGY.dealCost.small;
    C.bCost = null;                          /* 买入成本要按卡片实际类型取，见下一步 */
    C.r = window.Act.chooseDeck(C.g, 'small');
    ok(C.r.ok, '精力充足 → 考察成功（扣 ' + C.dCost + ' 点）');
    ok(C.p.energy === C.e0 - C.dCost, '精力 ' + C.e0 + ' → ' + C.p.energy + '（−' + C.dCost + '）');
    C.card = C.r.card;                     /* chooseDeck 把卡放在返回值里（g.pending 可能为空） */
    ok(!!C.card, '已抽到投资卡：' + (C.card && (C.card.nm || C.card.symbol)));
  });
  step('A 买入', function(){ return !!C.card; }, function(){
    C.e1 = C.p.energy;
    C.bCost = window.Act.dealEnergy(C.card);   /* 与界面显示共用同一份映射 */
    var r = window.Act.buyDeal(C.g, C.card, { qty: (C.card.min||1) });
    ok(r.ok, '买入成功：' + (r.ok ? '' : r.msg));
    if(r.ok) ok(C.p.energy === C.e1 - C.bCost,
      '买入（' + C.card.kind + '）再扣 ' + C.bCost + ' 点：' + C.e1 + ' → ' + C.p.energy);
  });

  /* ============ B. 精力不足被拦下 ============ */
  step('准备 B', function(){ return true; }, function(){
    C.b = fresh(); C.g2 = C.b.g; C.p2 = C.b.p;
    OUT.push(''); OUT.push('=== B. 精力不足时明确拦下 ===');
    C.p2.energy = 1;
    var r = window.Act.chooseDeck(C.g2, 'small');
    ok(!r.ok, '考察被拒绝');
    ok(/精力不足/.test(r.msg || ''), '错误信息可执行：' + String(r.msg || '').slice(0, 60) + '…');
    ok(C.p2.energy === 1, '精力未被扣减（不是静默失败）');
    var r2 = window.Act.buyDeal(C.g2, { kind:'savings', nm:'测试存单', cost:1000, interest:10, dp:1000 }, { qty:1 });
    ok(!r2.ok || C.p2.energy >= window.ENERGY.buyCost.savings, '精力不足时买入同样被拦：' + String(r2.msg || '已放行').slice(0, 40));
  });

  /* ============ C. 失业 → 求职期 ============ */
  step('准备 C', function(){ return true; }, function(){
    C.c = fresh(); C.g3 = C.c.g; C.p3 = C.c.p;
    OUT.push(''); OUT.push('=== C. 失业 → 求职期（工资归零）===');
    C.salBefore = C.p3.salary;
    C.p3.energy = 100;
    var f0 = window.Engine.finance(C.p3);
    C.cfBefore = f0.cashflow;
    var r = window.Act.doDownsized(C.g3, f0.totalExpenses);
    ok(r.ok, '失业事件执行成功');
    ok(r.severance > 0, '领取离职补偿 +' + r.severance + '（不是支付一笔钱）');
    ok(C.p3.salary === 0, '工资归零：' + C.salBefore + ' → ' + C.p3.salary);
    ok(C.p3.joblessNeed > 0, '进入求职期，需要 ' + C.p3.joblessNeed + ' 个回合');
    var f1 = window.Engine.finance(C.p3);
    ok(f1.cashflow < C.cfBefore, '月现金流因失业而恶化：' + C.cfBefore + ' → ' + f1.cashflow);
    ok(window.Engine.isJobless(C.p3) === true, 'isJobless 判定正确');
    window.UiGame.updateActions();
    ok(!document.getElementById('btnJobHunt').hidden, '操作区出现「投递简历 · 求职」按钮');
  });
  step('C 求职', function(){ return !document.getElementById('btnJobHunt').hidden; }, function(){
    var before = C.p3.energy;
    document.getElementById('btnJobHunt').click();
    OUT.push('   · 求职后进度 ' + C.p3.joblessProgress + '/' + C.p3.joblessNeed + '，精力 ' + before + ' → ' + C.p3.energy);
    ok(C.p3.energy === before - window.UNEMPLOYMENT.huntEnergy, '求职消耗 ' + window.UNEMPLOYMENT.huntEnergy + ' 点精力');
  });
  step('C 求职耗尽', function(){ return true; }, function(){
    C.p3.energy = 100;
    var n = 0;
    while(window.Engine.isJobless(C.p3) && n < 10){ window.Act.huntJob(C.g3); C.p3.energy = 100; n++; }
    ok(!window.Engine.isJobless(C.p3), '投递 ' + n + ' 次后重新就业');
    ok(C.p3.salary > 0, '工资恢复为 ' + C.p3.salary);
    ok(C.p3.salary === Math.round(C.p3.baseSalary * C.p3.salaryMult), '恢复后的工资 = 基础工资 × 当前年龄系数');
    C.p3.energy = 3;
    window.Engine.startJobless(C.g3, C.p3, 0);
    var r = window.Act.huntJob(C.g3);
    ok(!r.ok && /精力不足/.test(r.msg), '精力不足时无法求职：' + String(r.msg||'').slice(0, 32) + '…');
  });

  /* ============ D. 入不敷出 ============ */
  step('准备 D', function(){ return true; }, function(){
    C.d = fresh(); C.g4 = C.d.g; C.p4 = C.d.p;
    OUT.push(''); OUT.push('=== D. 入不敷出（月现金流为负）===');
    C.p4.liabs.bank = 3000000;                     /* 月息 3 万 → 现金流必为负 */
    C.p4.pos = 0;                                  /* 从起点出发，掷 2 点会经过发薪日 */
    window.Game.rolled = false;
    window.UiGame.renderAll();
    var f = window.Engine.finance(C.p4);
    ok(f.cashflow < 0, '月现金流已为负：' + f.cashflow);
    C.cash0 = C.p4.cash;
    var res = window.Engine.movePlayer(C.g4, C.p4, 2);
    ok(res.deficit > 0, '经过发薪日产生缺口 ' + res.deficit + '（而不是把现金扣成负数）');
    ok(C.p4.cash === C.cash0, '现金未被扣减，不变式保持');
    window.Engine.resolveSpace(C.g4, C.p4, res);
    window.UiGame.renderAll();
    window.UiPending.showPending();
  });
  step('D 缺口弹层', function(){ return title().indexOf('入不敷出') >= 0; }, function(){
    OUT.push('   · 弹层：「' + title() + '」');
    ok(!!mb('动用储蓄补上'), '提供「动用储蓄补上」按钮');
    var cash = C.p4.cash;
    mb('动用储蓄补上').click();
    OUT.push('   · 支付后现金 ' + cash + ' → ' + C.p4.cash);
  });
  step('D 结算后', function(){ return title() !== '入不敷出'; }, function(){
    ok(C.p4.cash < C.cash0, '缺口已从现金中扣除');
    ok(!C.p4.pending || C.p4.pending.type !== 'deficit', '缺口状态已清除并回到落格事件');
    OUT.push('   · 回到落格事件：「' + title() + '」');
    window.UI.closeModal();
    C.g4.pending = null;
    window.UiGame.renderAll();
  });

  /* ============ E. 休假 ============ */
  step('准备 E', function(){ return true; }, function(){
    C.e = fresh(); C.g5 = C.e.g; C.p5 = C.e.p;
    OUT.push(''); OUT.push('=== E. 起点休假 ===');
    C.p5.energy = 20;
    C.p5.pos = 0;
    var cost = Math.round(window.Engine.finance(C.p5).totalExpenses * window.ENERGY.vacationCostMult);
    C.vacCost = cost;
    C.cash1 = C.p5.cash;
    window.Engine.resolveSpace(C.g5, C.p5, { space: window.RAT_RACE[0], path:[], collected:0, deficit:0 });
    window.UiGame.renderAll();
    window.UiPending.showPending();
  });
  step('E 休假弹层', function(){ return title().indexOf('起点') >= 0; }, function(){
    ok(!!mb('休假'), '提供「休假」按钮');
    var r = window.Act.vacation(C.g5);
    ok(r.ok, '休假执行成功，花费 ' + r.cost + '，精力 +' + r.gain);
    ok(C.p5.cash === C.cash1 - C.vacCost, '现金扣减 ' + C.vacCost + '：' + C.cash1 + ' → ' + C.p5.cash);
    ok(C.p5.energy === 20 + window.ENERGY.vacationEnergy, '精力 20 → ' + C.p5.energy);
    window.UI.closeModal(); C.g5.pending = null; window.UiGame.renderAll();
  });

  /* ============ F. 银翅膀 ============ */
  step('准备 F', function(){ return true; }, function(){
    C.f = fresh(); C.g6 = C.f.g; C.p6 = C.f.p;
    OUT.push(''); OUT.push('=== F. 银翅膀（掷 2 粒骰子）===');
    C.p6.energy = 100;
    var r = window.Act.doCharity(C.g6, true);
    ok(r.ok, '公益捐赠成功：捐赠 ' + r.amount + '，节税 ' + r.refund + '，银翅膀 ×' + r.wings);
    ok(r.refund > 0, '税前扣除产生节税 ' + r.refund + '（国内捐赠可税前扣除）');
    ok(C.p6.wings === 1, '获得银翅膀 ×' + C.p6.wings);
    ok(window.Engine.diceCount(C.g6, C.p6) === 1, '默认仍是 1 粒骰子');
    C.p6.diceChoice = window.WINGS.dice;
    ok(window.Engine.diceCount(C.g6, C.p6) === 2, '选择后变成 2 粒骰子');
    window.UiGame.updateActions();
    ok(!document.getElementById('btnDiceChoice').hidden, '操作区出现银翅膀切换按钮：' + document.getElementById('btnDiceChoice').textContent);
    ok(window.Engine.useWing(C.p6) === true && C.p6.wings === 0, '掷出后消耗银翅膀');
    ok(window.Engine.diceCount(C.g6, C.p6) === 1, '用尽后回落为 1 粒');

    /* 单人模式同源验证：银翅膀骰数读同一个 WINGS.dice，不因模式而异 */
    window.startGame({rule:'101', mode:'solo', count:1, names:['单人测'], showAll:true});
    var gs = window.Game.g, ps = gs.players[0];
    ps.cash = 2000000;
    var rs = window.Act.doCharity(gs, true);
    ok(rs.ok && ps.wings === 1, '单人模式捐赠同样获得银翅膀 ×' + ps.wings);
    ps.diceChoice = window.WINGS.dice;
    var ns = window.Engine.diceCount(gs, ps);
    ok(ns === 2, '单人模式选择银翅膀后掷 ' + ns + ' 粒（应为 2，与多人同源）');
    var dsc = window.Engine.rollDice(gs, ns);
    ok(dsc.length === 2, '单人模式实际掷出 ' + dsc.length + ' 粒骰子：[' + dsc.join(', ') + ']');
  });

  /* ============ G. 健康危机 ============ */
  step('准备 G', function(){ return true; }, function(){
    C.h = fresh(); C.g7 = C.h.g; C.p7 = C.h.p;
    OUT.push(''); OUT.push('=== G. 健康危机（精力归零）===');
    /* 精力归零的真实路径：名下资产的维护消耗超过了每回合恢复能力 */
    for(var k = 0; k < 10; k++) C.p7.assets.realEstate.push({ nm:'房产' + k, dp:5000, cost:65000, cf:100, rent:400 });
    C.p7.energy = 0;
    OUT.push('   · 过度扩张：维护 ' + window.Engine.energyUpkeep(C.p7) + '/回合 > 恢复 ' + window.Engine.energyRecover(C.g7, C.p7) + '/回合');
    C.g7.lastCrisis = window.Engine.tickEnergy(C.g7, C.p7);
    ok(!!C.g7.lastCrisis, '精力归零 → 触发健康危机');
    window.UiGame.renderAll();
    ok(window.UiGame.crisisNotice(C.g7), '健康危机提示卡弹出');
    ok(title().indexOf('健康危机') >= 0, '提示卡标题：' + title());
    C.medi = C.p7.medicalExp;
    ok(C.medi > 0, '新增每月医疗支出 ' + C.medi);
    ok(C.p7.skipTurns === 2, '强制休养 ' + C.p7.skipTurns + ' 个回合');
    window.UI.closeModal();
    ok(C.p7.medicalExp > 0, '医疗支出已进入财务报表');
    var finHtml = document.getElementById('paneFinance').innerHTML;
    ok(finHtml.indexOf('医疗') >= 0, '财务面板显示医疗支出');
    ok(document.getElementById('paneSettings').innerHTML.indexOf('医疗支出') >= 0, '设置面板显示医疗支出');
  });

  /* ============ H. 精力回复与上限随年龄 ============ */
  step('准备 H', function(){ return true; }, function(){
    C.i = fresh(); C.g8 = C.i.g; C.p8 = C.i.p;
    OUT.push(''); OUT.push('=== H. 年龄推进 → 收入与精力上限变化 ===');
    var caps = [], sals = [];
    [20, 30, 40, 50, 60].forEach(function(age){
      C.g8.round = age - 20 + 1;
      window.Engine.refreshAllLife(C.g8);
      caps.push(window.Engine.energyMax(C.g8, C.p8));
      sals.push(C.p8.salary);
    });
    OUT.push('   · 精力上限 20→60 岁：' + caps.join(' → '));
    OUT.push('   · 工资 20→60 岁：' + sals.join(' → '));
    ok(caps[0] > caps[4], '精力上限随年龄衰减');
    ok(sals[2] > sals[4], '收入在巅峰期后回落（' + sals[2] + ' → ' + sals[4] + '）');
    ok(sals[0] < sals[1], '起步期收入低于成长期（' + sals[0] + ' → ' + sals[1] + '）');
  });

  /* ---------------- 状态机驱动 ---------------- */
  var timer = setInterval(function(){
    if(i >= STEPS.length){
      clearInterval(timer);
      var d = document.createElement('pre'); d.id = 'DIAG'; d.textContent = OUT.join('\n');
      document.body.appendChild(d); return;
    }
    guard++;
    if(guard > 500){
      clearInterval(timer);
      var e = document.createElement('pre'); e.id = 'DIAG';
      e.textContent = OUT.join('\n') + '\n\n⛔ 卡在第 ' + (i+1) + ' 步：' + STEPS[i].desc + '（当前弹层：' + title() + '）';
      document.body.appendChild(e); return;
    }
    var s = STEPS[i];
    var ready = false;
    try{ ready = s.w(); }catch(err){ ready = true; OUT.push('   ⚠️ 等待条件抛错：' + err.message); }
    if(!ready) return;
    i++; guard = 0;
    try{ s.fn(); }catch(err){ OUT.push('   ❌ 步骤「' + s.desc + '」抛异常：' + err.message); }
  }, 60);
});
