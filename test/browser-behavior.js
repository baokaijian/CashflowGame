/* 浏览器行为验证探针（含年度结算与存档恢复：精力/拦阻/失业求职/入不敷出/休假/银翅膀/节税/健康危机/年龄曲线）
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
      C.p8.age = age;
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

  step('I 发薪同步长岁', function(){ return true; }, function(){
    var a=fresh(), g=a.g, p=a.p;
    C.yearGame=g; C.yearPlayer=p; p.pos=1;
    window.UiGame.finishRoll([4,5]);
    ok(p.age===22 && g.players[1].age===20, '跨两个发薪日：本人 20→22 岁，另一位仍 20 岁');
    ok(title().indexOf('发薪日')>=0, '落在发薪日显示结算面板');
    ok(q('#modal').textContent.indexOf('20→22 岁')>=0, '面板显示本次结算的年龄区间');
    mb('确定').click();
    ok(!q('#btnEndTurn').hidden && q('#btnRoll').disabled, '确认后可结束回合，不可重复掷骰');
    var cash=p.cash;
    window.UiGame.saveState();
    window.UiGame.tryRestore();
    g=window.Game.g; p=g.players[0];
    ok(p.age===22 && p.cash===cash && window.Game.rolled, '保存恢复保留个人年龄、现金与已移动状态，不重复结算');
    window.UiGame.endTurn();
    C.lastEnd=Date.now();
    ok(window.Engine.current(g).id===1 && g.players[0].age===22, '换人不长岁，按下一位自己的年龄显示');
    ok(q('#turnChip').textContent.indexOf('20 岁')>=0, '操作栏显示当前玩家 20 岁');
    window.UiGame.showPlayerDetail(0);
    ok(q('#modal').textContent.indexOf('22 岁')>=0, '查看另一位玩家显示其独立年龄');
    window.UI.closeModal();
    window.UiSummary.openSummary(0);
    ok(q('#modal').textContent.indexOf('22 岁')>=0, '复盘也显示被查看玩家的年龄');
    window.UI.closeModal();
  });

  step('J 最后一年缺口', function(){ return Date.now()-C.lastEnd>350; }, function(){
    window.startGame({rule:'101',mode:'solo',count:1,names:['我'],seed:42});
    var g=window.Game.g, p=g.players[0];
    C.finalGame=g; C.finalPlayer=p;
    p.age=64; p.pos=1; p.cash=10000000; p.liabs.bank=5000000;
    window.UiGame.finishRoll([6]);
    ok(p.age===65 && p.pos===2, '达到 65 岁时停在最后一个发薪日，不继续走剩余步数');
    ok(title().indexOf('入不敷出')>=0 && !g.over, '先处理最后一年亏损，未提前结束游戏');
    ok(q('#modal').textContent.indexOf('年度结算缺口')>=0, '缺口面板使用年度文案');
    mb('动用储蓄').click();
    ok(title().indexOf('发薪日')>=0, '支付缺口后回到结算确认');
    mb('确定').click();
    C.finalCash=p.cash;
    window.UiGame.endTurn();
    ok(g.over && g.soloResult.endAgeNow===65 && p.cash===C.finalCash, '结束回合产出 65 岁人生结果，不再次补发或扣钱');
    ok(title().indexOf('人生结算')>=0, '显示人生结算页');
    ok(q('#modal').textContent.indexOf('45 次年度结算')>=0, '结果页使用年度结算次数，不宣称 45 轮');
    window.UI.closeModal();
  });

  step('K 单人旧档恢复后真实掷骰', function(){ return true; }, function(){
    OUT.push(''); OUT.push('=== K. 旧存档 / 单人真实按钮 / 防重复入账 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['Derek'],seed:42});
    var g=window.Game.g, p=g.players[0];
    g.round=3; p.pos=1; p.settledAge=20; p.cash=1000000;
    delete g.timeVersion; delete p.age;
    g.log.unshift({text:'Derek 经过发薪日：一次结算（覆盖 21—22 岁共 2 年），入账 ¥50,160 = 年结余 ¥25,080 × 2', type:'good', who:'Derek'});
    window.UiGame.saveState();
    window.UiGame.tryRestore();
    C.solo=window.Game.g; C.sp=C.solo.players[0];
    ok(C.sp.age===22 && C.sp.cash===1000000, '旧档恢复保留原年龄现金，不补发任何结余');
    ok(q('#paneLog').textContent.indexOf('旧规则历史记录')>=0, '旧版两年补结日志明确标记为历史记录');
    window.Engine.refreshLife(C.solo,C.sp);
    C.payExpected=window.Engine.annual(window.Engine.settleCashflow(C.sp));
    C.payCash=C.sp.cash;
    C.payPeriods=window.Engine.loanInfo(C.sp,'home').periods;
    C.solo.rng=function(){ return 0; }; // 骰子 1 点，1→2 恰好停在发薪日
    q('#btnRoll').click(); q('#btnRoll').click();
  });
  step('K 一次发薪确认', function(){ return !window.Game.animating && title().indexOf('发薪日')>=0; }, function(){
    ok(C.sp.cash-C.payCash===C.payExpected, '真实按钮经过一个发薪日，现金只增加一份年结余：'+C.payExpected);
    ok(C.sp.age===23 && C.sp.pos===2, '双击掷骰只移动一次、长一岁');
    ok(window.Engine.loanInfo(C.sp,'home').periods-C.payPeriods===12, '只摊还 12 期贷款');
    ok(q('#modal').textContent.indexOf('结算 1 年')>=0, '发薪确认显示结算 1 年');
    ok(C.solo.log[0].text.indexOf('× 1')>=0, '新增日志显示年结余 × 1');
    mb('确定').click();
    window.UiGame.finishRoll([1]); // 模拟动画完成通知重复投递
    ok(C.sp.pos===2 && C.sp.cash-C.payCash===C.payExpected, '重复动画回调及确认弹层均不再移动或入账');
    window.UiGame.saveState(); window.UiGame.tryRestore();
    C.solo=window.Game.g; C.sp=C.solo.players[0];
    ok(C.sp.age===23 && C.sp.cash-C.payCash===C.payExpected && window.Game.rolled, '发薪后刷新恢复不重发，仍保持本回合已移动');
    C.lastEnd=Date.now();
  });
  step('K 未经过发薪日', function(){ return Date.now()-C.lastEnd>350; }, function(){
    window.UiGame.endTurn();
    C.lastEnd=Date.now();
    ok(C.sp.age===23 && C.sp.cash-C.payCash===C.payExpected, '结束单人回合不长岁、不补发');
    C.solo.rng=function(){ return 0; }; // 2→3 离开发薪日，只抽卡
    q('#btnRoll').click();
  });
  step('K 非发薪落点', function(){ return !window.Game.animating && window.Game.rolled; }, function(){
    ok(C.sp.pos===3 && C.sp.age===23 && C.sp.cash-C.payCash===C.payExpected, '离开发薪日且未经过下一个发薪日，不再结算');
    window.UI.closeModal(); window.Engine.clearPending(C.solo);
  });

  step('L 商铺与已有抵押物对应', function(){ return true; }, function(){
    OUT.push(''); OUT.push('=== L. 待购商铺与抵押物明细 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['Derek'],seed:42});
    var g=window.Game.g,p=g.players[0],card=window.DECK_SMALL.filter(function(c){return c.id==='sm7';})[0];
    Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});
    p.age=26;p.cash=34505;p.assets.stocks.push({symbol:'TEST',shares:700,cost:22});
    window.Engine.setPending(g,{type:'opportunity',deal:card});
    window.UiPending.showPending();
    q('#modal [data-loan]').click();
    ok(q('#loanPurchaseContext').textContent.indexOf('地铁口小商铺')>=0, '先贷款明确显示待购商铺');
    ok(q('#loanPurchaseContext').textContent.indexOf('¥236,500')>=0 && q('#loanPurchaseContext').textContent.indexOf('¥106,425')>=0, '待购项目总价与首付对应原卡片');
    ok(q('#loanPurchaseContext').textContent.indexOf('不计入下方已有资产估值')>=0, '明确待购商铺未计入已有抵押物');
    var owned=q('#modal [data-collateral-asset]');
    ok(owned.textContent.indexOf('TEST 700 股')>=0 && owned.textContent.indexOf('¥15,400')>=0 && owned.textContent.indexOf('¥7,700')>=0, '无报价股票按取得价参考，抵押金额绑定已有资产');
    ok(q('#modal details.appraisal-detail').open, '抵押物明细默认展开');
    q('#modal [data-close]').click();
    ok(title().indexOf('地铁口小商铺')>=0, '关闭贷款回到原商铺，尚未买入');
    p.cash=200000;p.energy=100;
    window.UiPending.showPending();q('#modal [data-buy]').click();
    window.UiGame.openLoan();
    var all=[].slice.call(document.querySelectorAll('#modal [data-collateral-asset]'));
    var shop=all.filter(function(el){return el.textContent.indexOf('地铁口小商铺')>=0;})[0];
    ok(all.length===2 && shop.textContent.indexOf('¥236,500')>=0 && shop.textContent.indexOf('¥106,425')>=0, '买入成功后商铺以正确成本和首付出现在抵押明细');
    ok(shop.textContent.indexOf('减项目融资余额 ¥130,075')>=0, '商铺按本人估值减对应融资余额折算');
    ok(!q('#loanPurchaseContext'), '买入后不再显示待购状态');
    q('#modal [data-close]').click();
  });

  step('M 共有房产连续出售', function(){ return true; }, function(){
    OUT.push('');OUT.push('=== M. 共有份额与连续卖房 ===');
    window.startGame({rule:'202',mode:'solo',count:1,names:['卖房测试'],seed:42});
    var g=window.Game.g,p=g.players[0];p.cash=2000000;
    Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});
    p.assets.realEstate=[
      {nm:'地铁口小商铺',cost:236500,dp:106425,cf:650},
      {nm:'长租公寓整栋（与机构共有）',cost:645000,dp:193500,cf:837,share:0.5,joint:true,partner:'机构'},
      {nm:'长租公寓整栋',cost:1290000,dp:387000,cf:1673,share:1}
    ];
    window.Engine.setPending(g,{type:'market',card:{kind:'realestate',prop:'长租公寓整栋',price:1935000},
      impact:{options:[{id:'old',pid:0,kind:'realestate',ix:0,price:1935000}],forced:[]}});
    window.UiGame.saveState();window.UiGame.tryRestore();window.UiPending.showPending();
    g=window.Game.g;p=g.players[0];
    ok(q('#modal').textContent.indexOf('本人成交款 ¥967,500')>=0 && q('#modal').textContent.indexOf('实际收回 ¥516,000')>=0, '旧存档行情清单恢复为本人份额报价与回款');
    var buttons=[].slice.call(document.querySelectorAll('#modal [data-sell]'));
    ok(buttons.length===2,'仅列出匹配报价的两套房产');
    buttons[0].click();
    ok(p.cash===2516000 && p.assets.realEstate.length===2 && p.assets.realEstate[0].nm==='地铁口小商铺', '卖出共有房只入账 ¥516,000，保留不匹配的商铺');
    buttons=[].slice.call(document.querySelectorAll('#modal [data-sell]'));
    ok(buttons.length===1,'已卖房产从列表移除，剩余交易自动刷新');
    buttons[0].click();
    ok(p.cash===3548000 && p.assets.realEstate.length===1 && p.assets.realEstate[0].nm==='地铁口小商铺','继续卖出另一套，数组变化后仍定位正确');
    ok(!q('#modal [data-sell]'),'全部匹配房产卖完后不再提供重复出售按钮');
    mb('完成市场结算').click();
  });

  step('N 统一估值与挂牌买回', function(){return true;}, function(){
    OUT.push('');OUT.push('=== N. 统一估值与挂牌买回 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['挂牌测试'],seed:42});
    var E=window.Engine,A=window.Act,g=window.Game.g,p=g.players[0];p.cash=2000000;p.energy=100;
    Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});
    var r={nm:'回归商铺',cost:1000000,dp:300000,cf:1000,rent:3870,share:1,heldYears:4};
    p.assets.realEstate=[r];E.registerProperty(g,p,r);
    A.marketImpact(g,{kind:'realestate',prop:r.nm,price:1200000});
    window.UiGame.onMenu('loan');
    ok(q('#modal').textContent.indexOf('减项目融资余额 ¥700,000')>=0 && q('#modal').textContent.indexOf('抵押折算金额 ¥500,000')>=0,'贷款面板按估值扣项目融资，展示真实权益');
    window.UI.closeModal();
    var opt=A.marketOptions(g,{kind:'realestate',prop:r.nm,price:1200000})[0];A.marketSell(g,opt);
    g.turnNo++;E.setPending(g,{type:'opportunity'});window.UiPending.showPending();
    q('#modal [data-property-market]').click();
    ok(q('#modal').textContent.indexOf(r.propertyId)>=0 && q('#modal').textContent.indexOf('¥840,000')>=0,'挂牌显示原房产编号与本次融资金额');
    q('#modal [data-loan]').click();mb('关闭').click();
    ok(!!q('#modal [data-buy-listing]'),'从贷款返回同一挂牌决策');
    var cash=p.cash;q('#modal [data-buy-listing]').click();
    ok(p.cash===cash-360000 && p.assets.realEstate.length===1 && p.assets.realEstate[0].propertyId===r.propertyId,'买回同一房产，按当前报价支付首付');
    ok(p.assets.realEstate[0].holdingId!==r.holdingId && !g.pending,'新持仓编号、机会已结算，不会重复购买');
    window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(E.assetMarket(g).properties[r.propertyId].history.length===3 && E.propertyListings(g).length===0,'保存恢复保留买卖历史与已成交状态');
  });

  step('O 202 挂牌与共有购买', function(){return true;}, function(){
    OUT.push('');OUT.push('=== O. 202 挂牌与共有购买 ===');
    window.startGame({rule:'202',mode:'solo',count:1,names:['202挂牌'],seed:42});
    var E=window.Engine,A=window.Act,g=window.Game.g,p=g.players[0];p.cash=2000000;p.energy=100;
    Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});
    var r={nm:'挂牌住宅',cost:1000000,dp:300000,cf:1000,rent:3870,share:1};p.assets.realEstate=[r];E.registerProperty(g,p,r);
    A.marketSell(g,A.marketOptions(g,{kind:'realestate',prop:r.nm,price:1200000})[0]);g.turnNo++;
    E.setPending(g,{type:'opportunity202',market:{kind:'stock',symbol:'TEST',price:25}});window.UiPending.showPending();
    q('#modal [data-property-market]').click();q('#modal [data-buy-listing]').click();
    ok(g.pending.type==='market' && E.stockPrice(g,'TEST')===25,'202 买回后保留同时抽到的行情卡');
    mb('完成市场结算').click();ok(!g.pending,'202 行情结算后正常结束机会');
    window.startGame({rule:'202',mode:'age',count:2,names:['共有甲','共有乙'],seed:42});
    g=window.Game.g;p=g.players[0];var other=g.players[1],card=window.DECK_CASHFLOW.find(function(x){return x.kind==='realestate'&&x.joint;});
    g.players.forEach(function(player){Object.keys(player.assets).forEach(function(k){player.assets[k]=[];});player.energy=100;player.cash=card.dp*.6;});
    E.setPending(g,{type:'opportunity202',deal:card});window.UiPending.showPending();
    var cb=q('#modal [data-jp]'),amt=q('#modal [data-jamt]');amt.value=card.dp*.5;cb.checked=true;cb.dispatchEvent(new Event('change'));
    ok(!q('#modal [data-buy]').disabled,'双方分别买不起整套首付时，可以按各自份额联合购买');
    q('#modal [data-buy]').click();
    ok(p.assets.realEstate.length===1 && other.assets.realEstate.length===1 && p.assets.realEstate[0].propertyId===other.assets.realEstate[0].propertyId,'联合购买共用房产实体编号');
    ok(p.assets.realEstate[0].holdingId!==other.assets.realEstate[0].holdingId,'各共有人的持仓与融资独立');
  });

  step('P 家庭年度账本与旧档', function(){return true;}, function(){
    OUT.push('');OUT.push('=== P. 家庭年度账本与旧档 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['家庭测试'],seed:42});
    var E=window.Engine,A=window.Act,g=window.Game.g,p=g.players[0];p.cash=2000000;p.energy=100;
    A.addBaby(g);p.age=37;E.refreshLife(g,p);window.UiGame.renderAll();
    ok(q('#paneFinance [data-child-budget]').textContent.indexOf('17 岁')>=0,'财务面板显示子女的独立年龄');
    var expected=E.annual(E.settleCashflow(p)),cash=p.cash;p.pos=1;
    var ld=E.movePlayer(g,p,1);window.UiGame.renderAll();
    ok(p.cash-cash===Math.max(0,expected) && ld.settled.years[0].amount===expected,'子女成年这一年按长岁前账本结算一次');
    ok(q('#paneFinance [data-child-budget]').textContent.indexOf('成年过渡期')>=0 && E.finance(p).exp.children===Math.round(p.job.perChild*.5),'长岁后面板与引擎均显示减半养育费');
    p.age=60;p.family.contributionYears=40;E.refreshLife(g,p);p.pos=1;E.movePlayer(g,p,1);window.UiGame.renderAll();
    ok(q('#paneFinance [data-contribution-years]').textContent.indexOf('41 年')>=0 && p.salary===Math.round(p.baseSalary*.45),'真实结算补上最后一个缴费年，养老金按41年计算');
    ok(q('#paneFinance [data-medical-base]').textContent.indexOf(E.money(Math.round(p.baseSalary*.02)))>=0,'退休基础医疗在面板单列');
    var family=JSON.stringify(p.family),salary=p.salary,medical=E.finance(p).exp.medical,cash2=p.cash;
    window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(JSON.stringify(p.family)===family && p.salary===salary && E.finance(p).exp.medical===medical && p.cash===cash2,'刷新恢复不增加缴费、不重复入账，医疗和养老金不漂移');
    delete p.family;p.children=2;window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(E.finance(p).exp.children===2*p.job.perChild && q('#paneFinance [data-family-budget]').textContent.indexOf('历史年龄未知')>=0,'旧档保留原养育费并明确提示年龄未知');
    ok(q('#paneFinance [data-family-budget]').textContent.indexOf('旧档兼容估计')>=0,'旧档缴费历史的兼容估计明确展示');
  });

  step('Q 经营选择与机构方案',function(){return true;},function(){
    OUT.push('');OUT.push('=== Q. 经营选择与机构方案 ===');
    window.startGame({rule:'202',mode:'solo',count:1,names:['经营测试'],seed:42});
    var E=window.Engine,A=window.Act,g=window.Game.g,p=g.players[0];
    Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=2000000;p.energy=100;
    var card=window.DECK_CASHFLOW.find(function(x){return x.id==='cf1';});
    E.setPending(g,{type:'opportunity202',deal:card});window.UiPending.showPending();
    ok(document.querySelectorAll('#modal [name=orgPlan]').length===3,'买入前可比较三种机构方案');
    var plan=A.orgPartnerPlan(g,card,'operator');q('#modal [name=orgPlan][value=operator]').click();q('#orgPartner').click();
    ok(q('#needCost').textContent===E.money(plan.mine) && q('#needEnergy').textContent.indexOf(plan.energy+' /')===0,'切换机构同步更新实付和买入精力');
    ok(q('#modal [data-partner-plans]').textContent.indexOf(E.money(plan.fee))>=0 && q('#modal [data-operating-preview]'),'方案展示持续管理费和买入后组合维护');
    q('#modal [data-loan]').click();
    ok(q('#modal [data-loan-partner]').textContent.indexOf(E.money(plan.mine))>=0,'贷款页显示已选机构和本人首付');
    mb('关闭').click();
    ok(q('#orgPartner').checked && q('#modal [name=orgPlan][value=operator]').checked,'贷款返回仍保留所选机构');
    var cash=p.cash;q('#modal [data-buy]').click();var x=p.assets.realEstate[0];
    ok(p.cash===cash-plan.mine && x.orgContract.id==='operator' && E.finance(p).inc.realEstate===plan.cf,'真实买入按选定合同扣款和计净收益');
    window.UiGame.renderAll();
    ok(document.body.textContent.indexOf('运营管家')>=0 && !!q('[data-operating-summary]'),'资产表显示机构费用和组合经营负担');
    window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(p.assets.realEstate[0].orgContract.id==='operator' && E.finance(p).inc.realEstate===plan.cf,'刷新恢复不改机构合同或重复扣管理费');
    p.energy=100;E.setPending(g,{type:'opportunity202',deal:window.DECK_CASHFLOW.find(function(x){return x.id==='cf6';})});window.UiPending.showPending();
    ok(q('#modal [data-operating-preview]').textContent.indexOf('2.0%')>=0 && q('#modal [data-operating-preview]').textContent.indexOf('35%')>=0,'实业买入前展示自身折旧率和残值基准');
    window.UI.closeModal();E.clearPending(g);
  });

  step('R 持续生活预算与提前还款',function(){return true;},function(){
    OUT.push('');OUT.push('=== R. 持续生活预算与提前还款 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['生活预算'],seed:42});
    var E=window.Engine,g=window.Game.g,p=g.players[0];p.cash=2000000;E.amortize(g,p);E.clearPending(g);
    ['car','credit'].forEach(function(key){
      window.UiGame.onMenu('loan');q('#modal [data-pick='+key+']').click();q('#modal [data-quick=all]').click();
      var plan=E.prepayPlan(p,key,p.liabs[key],'settle');
      ok(q('#ppPreview').textContent.indexOf('实际年支出减少')>=0 && q('#ppPreview').textContent.indexOf(E.money(E.annual(plan.budget.saving)))>=0,key+' 还款预览显示持续预算后的实际改善');
      q('#modal [data-do]').click();mb('关闭').click();window.UiGame.renderAll();
      ok(p.liabs[key]===0 && E.finance(p).totalExpenses===plan.budget.after,key+' 真实结清后仍有对应生活预算，支出与预览一致');
    });
    ok(q('#paneFinance [data-budget=car]').textContent.indexOf('补足')>=0 && q('#paneFinance [data-budget=credit]').textContent.indexOf('补足')>=0,'财务面板显示用车和消费补足明细');
    var cash=p.cash,total=E.finance(p).totalExpenses;window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(p.cash===cash && E.finance(p).totalExpenses===total,'恢复存档不补扣历史费用，预算保持一致');
    p.inFT=true;p.ftBase=10000;window.UiGame.renderAll();
    ok(q('#paneFinance [data-living-budget]').textContent.indexOf('已含自由圈生活档次')>=0,'自由圈预算展示已应用生活档次的实际金额');
  });

  step('S 初始房产融资与旧档恢复',function(){return true;},function(){
    OUT.push('');OUT.push('=== S. 初始房产融资与旧档恢复 ===');
    window.UI.closeModal();
    window.startGame({rule:'202',mode:'solo',count:1,names:['融资测试'],seed:20});
    var E=window.Engine,g=window.Game.g,p=g.players[0],r=p.assets.realEstate[0];
    ok(p.portfolio.nm==='老破小出租房' && p.liabs.other===0 && r.projectDebt===120000,'新局组合融资只登记在房产名下');
    window.UiGame.onMenu('finance');q('#modal [data-pid="0"]').click();
    ok(q('#modal').textContent.indexOf('房租净收入 ¥216/月')>=0 && q('#modal').textContent.indexOf('项目融资')>=0,'财务页显示净租金与对应融资');
    window.UI.closeModal();
    p.portfolio={nm:'老破小出租房',realEstate:[{nm:'老破小出租房',cost:170000,dp:50000,cf:708}],liabs:{other:120000},extraPay:492};
    p.liabs.other=120000;p.loans.other={base:120000,due:492,periods:0};r.cf=708;r.rent=708;
    E.amortize(g,p);var debt=p.liabs.other,cash=p.cash;
    window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];r=p.assets.realEstate[0];
    ok(p.liabs.other===0 && r.projectDebt===debt && p.cash===cash,'旧档恢复保留摊还后余额，只移除重复负债，不修改现金');
    var cf=r.cf;window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(p.cash===cash && p.assets.realEstate[0].cf===cf && p.assets.realEstate[0].projectDebt===debt,'再次保存恢复不重复迁移或扣息');
    delete p.portfolioFinancingMigration;p.liabs.other=125000;p.loans.other={base:125000,due:510,periods:0};
    window.UiGame.saveState();window.UiGame.tryRestore();p=window.Game.g.players[0];window.UiGame.onMenu('finance');q('#modal [data-pid="0"]').click();
    ok(p.liabs.other===125000 && !!q('#modal [data-financing-review]'),'来源混合的旧债不自动减记，并在财务页明确提示');
    window.UI.closeModal();
  });

  step('T 玩家转让成本与统一门槛',function(){return true;},function(){
    OUT.push('');OUT.push('=== T. 玩家转让成本与统一门槛 ===');window.UI.closeModal();
    window.startGame({rule:'202',mode:'age',count:2,names:['卖方','买方'],seed:42,showAll:true});
    var E=window.Engine,g=window.Game.g,p=g.players[0],buyer=g.players[1];
    g.players.forEach(function(x){Object.keys(x.assets).forEach(function(k){x.assets[k]=[];});x.cash=100000;});
    p.assets.stocks=[{symbol:'AUDIT',shares:3,cost:10,heldYears:4}];window.UiGame.renderAll();
    window.UiGame.onMenu('trade');q('#modal [data-sell^="stock:"]').click();q('#tradePrice').value='1000';
    var button=q('#modal [data-oid="1"]');q('#tradePrice').value='0.5';button.click();
    ok(p.cash===100000 && buyer.cash===100000 && buyer.assets.stocks.length===0,'无效小数总价在界面拒绝，不转移现金或持仓');
    q('#tradePrice').value='1000';button.click();
    ok(p.cash===101000 && buyer.cash===99000 && Math.abs(buyer.assets.stocks[0].cost*3-1000)<1e-8,'真实股票转让按成交款建立买方成本，保留小数单价');
    var cash=p.cash;button.click();ok(p.cash===cash && buyer.assets.stocks.length===1,'再次触发旧按钮不会重复付款或转移');
    window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];buyer=g.players[1];
    window.UiGame.onMenu('finance');q('#modal [data-pid="1"]').click();
    ok(q('#modal').textContent.indexOf('取得总成本 ¥1,000')>=0 && q('#modal').textContent.indexOf('333.333333')>=0,'恢复后买方财务明细显示总成本与小数单位成本');window.UI.closeModal();
    p.assets.business=[{nm:'转让企业',cost:1000,cf:100,heldYears:8,opProfile:'self'}];
    window.UiGame.onMenu('trade');q('#modal [data-sell^="business:"]').click();q('#tradePrice').value='3000';q('#modal [data-oid="1"]').click();
    ok(buyer.assets.business[0].cost===3000 && buyer.assets.business[0].heldYears===8,'真实企业转让更新成本并保留使用年数');
    ['101','202'].forEach(function(rule){
      window.startGame({rule:rule,mode:'solo',count:1,names:['门槛测试'],seed:42});g=window.Game.g;p=g.players[0];window.UiGame.renderAll();
      var target=E.money(E.annual(E.escapeTarget(g,p)));
      ok(q('#paneFinance [data-escape-target]').textContent.indexOf(target)>=0,rule+' 财务面板的年门槛与真实判定一致');
      window.UiGame.onMenu('finance');q('#modal [data-pid="0"]').click();
      ok(q('#modal [data-escape-target]').textContent.indexOf(target)>=0 && q('#modal [data-escape-target]').textContent.indexOf('严格超过')>=0,rule+' 玩家详情显示同一门槛及严格超过条件');window.UI.closeModal();
      window.UiGame.onMenu('help');ok(q('#modal').textContent.indexOf('跳回合与借贷限制')<0 && q('#modal').textContent.indexOf('不再行动或重新入场')>=0,rule+' 帮助页不再暗示破产后重新行动');window.UI.closeModal();
    });
  });

  step('U 理财到期的持仓、报价与重复操作',function(){return true;},function(){
    OUT.push('');OUT.push('=== U. 理财到期逐笔兑付 ===');
    ['101','202'].forEach(function(rule){
      window.UI.closeModal();window.startGame({rule:rule,mode:'solo',count:1,names:['兑付测试'],seed:42});
      var E=window.Engine,A=window.Act,g=window.Game.g,p=g.players[0];
      Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=100000;p.energy=100;
      A.buyDeal(g,window.DECK_SMALL.find(function(x){return x.id==='sm9';}));
      A.buyDeal(g,window.DECK_BIG.find(function(x){return x.id==='bg12';}));
      E.setPending(g,{type:'market',card:{id:'mk15',kind:'savings',rate:1.05},
        impact:{options:[{id:'v_0_0',kind:'savings',pid:0,ix:0,price:11340}],forced:[]}});
      window.UiGame.saveState();window.UiGame.tryRestore();window.UiPending.showPending();g=window.Game.g;p=g.players[0];
      var cash=p.cash,buttons=[].slice.call(document.querySelectorAll('#modal [data-sell]'));
      ok(buttons.length===2 && buttons[0].textContent==='兑付' && q('#modal').textContent.indexOf('¥45,150')>=0,rule+' 旧行情恢复后按两种产品本金分别展示兑付金额');
      var oldButton=buttons[0],secondId=buttons[1].dataset.sell;oldButton.click();oldButton.onclick();
      ok(p.cash===cash+11340 && p.assets.savings.length===1 && p.assets.savings[0].cost===43000 && q('#modal [data-sell]').dataset.sell===secondId,rule+' 第一笔只收回 ¥11,340，重复旧按钮不卖掉第二笔，也不复用按钮编号');
      ok(q('#toastHost').textContent.indexOf('已兑付 高收益债基金')>=0 && q('#toastHost').textContent.indexOf('操作失败')<0,rule+' 成功兑付提示清晰，旧按钮不会产生失败误报');
      window.UiGame.tryRestore();window.UiPending.showPending();g=window.Game.g;p=g.players[0];
      ok(p.cash===cash+11340 && p.assets.savings.length===1,rule+' 点击后立即恢复，第一笔现金和持仓变动已保存，不重放交易');
      g.pending.impact.options[0].price=11340;q('#modal [data-sell]').click();
      ok(p.cash===cash+11340 && p.assets.savings.length===1 && q('#modal').textContent.indexOf('¥45,150')>=0,rule+' 串用第一笔金额被拒绝且自动刷新正确报价');
      q('#modal [data-sell]').click();
      ok(p.cash===cash+56490 && p.assets.savings.length===0 && !q('#modal [data-sell]'),rule+' 第二笔到账 ¥45,150，总计 ¥56,490，兑付完不残留按钮');
      ok(g.log.some(function(x){return x.text.indexOf('债权转让项目')>=0 && x.text.indexOf('本金 ¥43,000')>=0 && x.text.indexOf('收益 ¥2,150')>=0;}),rule+' 日志记录实际产品、本金、比例、到账和收益');
      mb('完成市场结算').click();ok(!g.pending,rule+' 兑付完成后正常结束行情');
      window.UI.closeModal();q('#toastHost').innerHTML='';
    });
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
