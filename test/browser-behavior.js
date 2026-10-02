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
      ok(q('#ppPreview').textContent.indexOf('未来一年支出减少')>=0 && q('#ppPreview').textContent.indexOf(E.money(plan.budget.yearSaving))>=0,key+' 还款预览显示持续预算后的实际改善');
      q('#modal [data-do]').click();mb('关闭').click();window.UiGame.renderAll();
      ok(p.liabs[key]===0 && E.finance(p).totalExpenses===plan.budget.after,key+' 真实结清后仍有对应生活预算，支出与预览一致');
    });
    ok(q('#paneFinance [data-budget=car]').textContent.indexOf('生活费用')>=0 && q('#paneFinance [data-budget=credit]').textContent.indexOf('生活费用')>=0,'财务面板显示独立的用车和消费费用');
    var cash=p.cash,total=E.finance(p).totalExpenses;window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
    ok(p.cash===cash && E.finance(p).totalExpenses===total,'恢复存档不补扣历史费用，预算保持一致');
    p.inFT=true;p.assets.business.push({nm:'分红测试企业',cost:100000,cf:10000});window.UiGame.renderAll();
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

  step('V 自由圈当前持仓与旧档收入',function(){return true;},function(){
    OUT.push('');OUT.push('=== V. 自由圈收益归属 ===');
    ['101','202'].forEach(function(rule){
      window.UI.closeModal();window.startGame({rule:rule,mode:'solo',count:1,names:['分红归属'],seed:42});
      var E=window.Engine,g=window.Game.g,p=g.players[0];Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=2000000;p.energy=100;
      p.assets.realEstate=[{nm:'收益测试房产',cost:1000000,dp:300000,cf:100000,rent:102870,orgContract:{fee:.2,upkeep:.55}}];
      E.registerProperty(g,p,p.assets.realEstate[0]);window.UiGame.renderAll();var cash=p.cash,escapeButton=q('#btnEscape');escapeButton.click();escapeButton.onclick();
      ok(p.inFT && p.cash===cash+8000000 && E.ftMonthly(p)===80000,rule+' 真实出圈奖励只发一次，分红按扣管理费后的持仓收入');
      var panel=q('#paneFinance [data-ft-income]').textContent;
      ok(panel.indexOf('房产净收入（已扣项目利息与机构管理费）')>=0 && panel.indexOf('¥960,000')>=0 && !/<\/?span|class=/.test(panel),rule+' 财务明细列出当前收入来源，没有代码标签');
      E.setPending(g,{type:'market',card:{kind:'realestate',prop:'收益测试房产',price:1200000}});window.UiPending.showPending();q('#modal [data-sell]').click();
      ok(p.assets.realEstate.length===0 && E.ftMonthly(p)===0 && q('#paneFinance [data-ft-income]').textContent.indexOf('当前持仓分红')>=0,rule+' 真实售房按钮执行后，房产和对应分红同时消失');
      mb('完成市场结算').click();var biz=window.FT_BUSINESSES[0];E.setPending(g,{type:'business'});window.UiPending.showPending();q('#modal [data-buy="'+biz.id+'"]').click();
      ok(E.ftMonthly(p)===biz.cf && p.ftGain===biz.cf && q('#paneFinance [data-ft-income]').textContent.indexOf('自由圈企业现金流')>=0,rule+' 购买自由圈企业只增加一份收入，财务和企业战绩一致');
      p.ftBase=80000;delete p.ftIncomeVersion;cash=p.cash;window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
      ok(p.cash===cash && E.ftMonthly(p)===biz.cf && !!q('#paneFinance [data-ft-income-migration]'),rule+' 旧档只改未来分红，保留现金并明确显示迁移说明');
      window.UiGame.onMenu('finance');q('#modal [data-pid="0"]').click();
      ok(q('#modal [data-ft-income]').textContent.indexOf(E.money(E.annual(biz.cf)))>=0 && !!q('#modal [data-ft-income-migration]'),rule+' 玩家详情使用同一收入金额与旧档说明');window.UI.closeModal();
      window.UiGame.saveState();window.UiGame.tryRestore();g=window.Game.g;p=g.players[0];
      ok(p.cash===cash && E.ftMonthly(p)===biz.cf,rule+' 再次恢复不补发收入或重复奖励');
      var expected=E.annual(E.ftFinance(p).cashflow),age=p.age;p.ftPos=0;var ld=E.movePlayer(g,p,1);
      ok(ld.collected===Math.max(0,expected) && ld.deficit===Math.max(0,-expected) && p.age===age+1,rule+' 下一次分红日仅按当前账本结算一年并长一岁');
      E.clearPending(g);window.UI.closeModal();q('#toastHost').innerHTML='';
    });
  });

  step('W 保存失败、备份与恢复校验',function(){return true;},function(){
    OUT.push('');OUT.push('=== W. 存档保护 ===');window.UI.closeModal();
    window.startGame({rule:'101',mode:'solo',count:1,names:['存档验证'],seed:42});
    var U=window.UiGame,S=window.SaveState,g=window.Game.g,p=g.players[0];
    U.saveState();var raw=localStorage.getItem(S.KEY),last=U.saveStatus.lastSuccess,original=Storage.prototype.setItem;
    p.cash+=987;Storage.prototype.setItem=function(key,value){if(key===S.KEY)throw new DOMException('空间不足','QuotaExceededError');return original.call(this,key,value);};
    try{
      ok(!U.saveState().ok && localStorage.getItem(S.KEY)===raw && U.saveStatus.lastSuccess===last,'保存配额不足时保留上次好档与成功时间');
      ok(q('#saveNotice').textContent.indexOf('进度未保存')>=0 && q('#paneSettings [data-save-error]').textContent.indexOf('空间不足')>=0,'常驻状态与设置都明确提示失败');
      C.backup=U.backupText();ok(S.prepare(C.backup).g.players[0].cash===p.cash,'无法本地保存时仍能生成当前完整备份');
      var before=JSON.stringify(g);ok(!U.importBackup(C.backup).ok && window.Game.g===g && JSON.stringify(g)===before && localStorage.getItem(S.KEY)===raw,'恢复时写入失败不替换当前游戏或原存档');
    }finally{Storage.prototype.setItem=original;}
    U.saveState();ok(U.saveStatus.state==='saved' && q('#saveNotice').textContent.indexOf('已保存')>=0,'再次自动保存成功后清除失败状态');
    var snapshot=JSON.stringify(window.Game.g),saved=localStorage.getItem(S.KEY);
    ['{',JSON.stringify({v:99}),window.UiSummary.exportJSON(g)].forEach(function(text){ok(!U.importBackup(text).ok && JSON.stringify(window.Game.g)===snapshot && localStorage.getItem(S.KEY)===saved,'损坏文件、未知版本或复盘报告拒绝恢复，原对局不变');});
    var get=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key===S.KEY)throw new DOMException('不允许','SecurityError');return get.call(this,key);};
    try{ok(!U.tryRestore() && window.Game.g===g && U.saveStatus.state==='failed','存储被禁用时有错误状态，内存对局不丢失');}finally{Storage.prototype.getItem=get;}
    U.saveState();window.UI.closeModal();q('#toastHost').innerHTML='';
  });

  step('W 内部恢复异常回滚',function(){return true;},function(){
    var U=window.UiGame,S=window.SaveState,g=window.Game.g,raw=localStorage.getItem(S.KEY),snapshot=JSON.stringify(g);
    var candidate=JSON.parse(C.backup);candidate.g.pending={type:'rest',p:0};var show=window.UiPending.showPending;
    window.UiPending.showPending=function(){throw new Error('测试恢复界面异常');};
    try{ok(!U.importBackup(JSON.stringify(candidate)).ok && window.Game.g===g && JSON.stringify(g)===snapshot && localStorage.getItem(S.KEY)===raw,'恢复界面异常时回滚内存和本机记录，不替换为半恢复状态');}finally{window.UiPending.showPending=show;}
    U.saveState();window.UI.closeModal();q('#toastHost').innerHTML='';
  });

  step('X 掷骰动画中保存与恢复',function(){return true;},function(){
    OUT.push('');OUT.push('=== X. 掷骰中恢复 ===');
    window.startGame({rule:'101',mode:'solo',count:1,names:['骰子恢复'],seed:42});
    var E=window.Engine,U=window.UiGame,g=window.Game.g;g.players[0].cash=2000000;
    var copy=window.SaveState.prepare(U.backupText()).g;C.expectedDice=E.rollDice(copy,E.diceCount(copy,copy.players[0]));
    U.roll();ok(window.Game.animating && JSON.stringify(window.Game.pendingDice)===JSON.stringify(C.expectedDice),'真实掷骰已确定结果，动画只负责展示');
    var state=g.rngState.state;ok(U.saveState().ok,'动画中能保存待完成骰子');
    U.tryRestore();C.restoredRoll=window.Game.g;C.afterRollCash=C.restoredRoll.players[0].cash;C.afterRollPos=C.restoredRoll.players[0].pos;
    ok(window.Game.rolled && !window.Game.animating && window.Game.pendingDice===null && C.restoredRoll.rngState.state===state,'恢复只完成已掷出的结果，不重新消耗随机数');
    ok(JSON.stringify(C.restoredRoll.lastDice)===JSON.stringify(C.expectedDice) && C.afterRollPos===C.expectedDice.reduce(function(a,b){return a+b;},0),'恢复的骰子与移动位置保持一致');
  });
  step('X 旧动画回调不得重复移动',function(){return !window.Game.animating;},function(){
    window.UiGame.finishRoll(C.expectedDice);
    ok(C.restoredRoll.players[0].cash===C.afterRollCash && C.restoredRoll.players[0].pos===C.afterRollPos,'旧完成回调不重复移动或结算');
    window.UiGame.saveState();window.UiGame.tryRestore();
    ok(window.Game.rolled && window.Game.g.players[0].cash===C.afterRollCash && window.Game.g.players[0].pos===C.afterRollPos,'再次恢复保留已行动状态，不重放骰子');window.Engine.clearPending(window.Game.g);window.UI.closeModal();
  });

  step('Y 可达房产报价与年度复盘',function(){return true;},function(){
    OUT.push('');OUT.push('=== Y. 行情对应与复盘轨迹 ===');
    var E=window.Engine,A=window.Act,U=window.UiGame;
    ['m22','m23','m24','m26'].forEach(function(id){
      window.UI.closeModal();window.startGame({rule:'202',mode:'solo',seed:42,names:['报价核对']});
      var g=window.Game.g,p=g.players[0],card=window.DECK_MARKET_202.find(function(x){return x.id===id;}),deal=window.DECK_CAPGAIN.concat(window.DECK_CASHFLOW).find(function(x){return x.id===card.sourceCard;});
      Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=10000000;p.energy=100;
      A.buyDeal(g,deal);var cash=p.cash;E.setPending(g,{type:'market',card:card});window.UiPending.showPending();
      ok(!!q('#modal [data-sell]') && q('#modal').textContent.indexOf(card.prop)>=0 && q('#modal').textContent.indexOf(E.money(card.price))>=0,id+' 报价卡与已购房产对应，能显示出售按钮');
      q('#modal [data-sell]').click();
      ok(p.assets.realEstate.length===0 && p.cash-cash===card.price-(deal.cost-deal.dp),id+' 真实卖出按整套报价扣项目融资');
      mb('完成市场结算').click();
    });
    var g=window.Game.g,p=g.players[0];p.inFT=true;p.cash=100000;p.track=[];p.age=20;E.trackRound(g);
    for(var age=21;age<=65;age++){p.age=age;p.cash=age*100;for(var j=0;j<3;j++){g.round++;E.trackRound(g);}}
    ok(p.track.length===46 && p.track[0].age===20 && p.track[0].cash===100000,'135轮采样后仍保留20岁起点，按年龄合并');
    ok(p.track[p.track.length-1].cf===E.ftFinance(p).cashflow,'自由圈轨迹现金流与实际分红账本一致');
    window.UiSummary.openSummary(0);
    ok(q('#modal').textContent.indexOf('按年龄聚合回合采样')>=0 && q('#modal').textContent.indexOf('20 岁 · '+E.money(p.track[0].net))>=0,'真实复盘显示年龄横轴和正确起点金额');
    window.UI.closeModal();U.saveState();U.tryRestore();p=window.Game.g.players[0];
    ok(p.track.length===46 && p.track[0].cash===100000,'存档恢复保留聚合轨迹，不补造或重复采样');
    E.clearPending(window.Game.g);window.UI.closeModal();
  });

  step('Z 高维护休养恢复',function(){return true;},function(){
    OUT.push('');OUT.push('=== Z. 强制休养可恢复行动 ===');
    window.UI.closeModal();window.startGame({rule:'101',mode:'solo',seed:42,names:['休养回归']});
    var E=window.Engine,U=window.UiGame,g=window.Game.g,p=g.players[0];p.age=61;p.cash=100000000;p.energy=1;p.pos=1;
    p.assets.business=Array.from({length:30},function(_,i){return {nm:'维护企业'+i,cost:1000,cf:0};});
    E.endTurn(g);U.renderAll();ok(p.pausedThisTurn && q('#btnRoll').disabled,'危机后的强制休养禁用掷骰');
    U.saveState();U.tryRestore();g=window.Game.g;p=g.players[0];window.UI.closeModal();
    ok(p.pausedThisTurn && p.skipTurns===1,'刷新保留已进入第一轮休养及剩余轮次');
    var crises=p.stats.crises;E.endTurn(g);E.endTurn(g);U.renderAll();
    ok(!p.pausedThisTurn && !q('#btnRoll').disabled,'两轮休养结束后真实掷骰按钮重新可用');
    ok(p.stats.crises===crises && p.energy===0,'休养仍扣维护精力，但不会重复续期');
    C.recoveryAge=p.age;q('#btnRoll').click();
  });
  step('Z 恢复后的实际掷骰',function(){return !window.Game.animating && window.Game.rolled;},function(){
    ok(window.Game.g.players[0].age===C.recoveryAge+1,'恢复后真实掷骰跨过发薪日，年龄能继续推进');
    window.Engine.clearPending(window.Game.g);window.UI.closeModal();
  });

  step('AA 毛租金与自由圈复盘',function(){return true;},function(){
    OUT.push('');OUT.push('=== AA. 毛租金逐次调整与复盘口径 ===');
    var E=window.Engine,U=window.UiGame;
    window.UI.closeModal();window.startGame({rule:'202',mode:'solo',seed:42,names:['租金核对']});
    var g=window.Game.g,p=g.players[0];Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=1000000;
    var r={nm:'租金测试商铺',cost:200000,dp:100000,projectDebt:100000,financingRate:.006,rent:1000,cf:400,orgContract:{fee:.2,upkeep:.55}};
    p.assets.realEstate.push(r);E.registerProperty(g,p,r);E.setPending(g,{type:'market',card:{kind:'rentDelta',pct:.2}});window.UiPending.showPending();
    ok(r.rent===1200 && r.cf===600 && E.finance(p).passive===480,'租金涨20%后为1200，扣利息600与管理费120，净收入480');
    window.UiPending.showPending();ok(r.rent===1200 && r.cf===600,'重复显示同次行情不会再次调整租金');
    mb('完成市场结算').click();E.setPending(g,{type:'market',card:{kind:'rentDelta',pct:-.2}});window.UiPending.showPending();
    ok(r.rent===960 && r.cf===360,'后续跌20%按1200继续调整，不回到首次净现金流基准');
    U.saveState();U.tryRestore();g=window.Game.g;p=g.players[0];r=p.assets.realEstate[0];
    ok(r.rent===960 && r.cf===360,'行情中保存恢复不重复调整或重算已发生现金');mb('完成市场结算').click();
    p.inFT=true;E.refreshLife(g,p);U.renderAll();var ft=E.ftFinance(p),out=JSON.parse(window.UiSummary.exportJSON(g)).players[0].metrics;
    ok(out.totalIncome===ft.income && out.totalExpenses===ft.expense && out.monthlyCashflow===ft.cashflow,'自由圈复盘导出收入、支出、现金流与实际账本一致');
    window.UiSummary.openSummary(0);ok(q('#modal').textContent.indexOf(E.money(ft.cashflow))>=0,'真实复盘显示当前自由圈现金流');window.UI.closeModal();
  });
  step('AA 旧机会卡的无租金属性',function(){return true;},function(){
    window.startGame({rule:'202',mode:'solo',seed:42,names:['无租金核对']});
    var E=window.Engine,g=window.Game.g,p=g.players[0];Object.keys(p.assets).forEach(function(k){p.assets[k]=[];});p.cash=1000000;p.energy=100;
    var card=Object.assign({},window.DECK_CAPGAIN.find(function(x){return x.id==='cg14';}),{rent:717});
    E.setPending(g,{type:'opportunity202',deal:card,deckName:'capgain'});window.UiPending.showPending();
    ok(q('#modal').textContent.indexOf('无租金收入')>=0 && q('#modal').textContent.indexOf('¥717 / 月')<0,'旧卡缓存有租金字段时，界面仍明确无租金');
    q('#modal [data-buy]').click();var r=p.assets.realEstate[0];ok(r.capital && r.rent===0 && r.cf===0,'真实买入纯资本利得房产保持零租金');
    E.setPending(g,{type:'market',card:{kind:'rentDelta',pct:.3}});window.UiPending.showPending();
    ok(r.rent===0 && r.cf===0,'租金上涨行情不会让无租金房产产生收入');mb('完成市场结算').click();window.UI.closeModal();
  });

  step('AB 月净现金流与还贷真实交互',function(){return true;},function(){
    OUT.push('');OUT.push('=== AB. 贷款月供与净现金流 ===');
    var E=window.Engine,U=window.UiGame;
    [false,true].forEach(function(free){
      window.UI.closeModal();window.startGame({rule:'101',mode:'solo',seed:42,names:['月供核对']});
      var g=window.Game.g,p=g.players[0];p.cash=1000000;p.inFT=free;
      E.LOAN_KEYS.forEach(function(k){p.liabs[k]=0;p.loans[k]={base:0,due:0,periods:24};});
      p.assets.business.push({nm:'月供测试企业',cost:100000,cf:20000});E.refreshLife(g,p);U.renderAll();
      var monthly=E.settleCashflow(p),cash=p.cash;
      U.onMenu('loan');q('#loanAmt').value='10000';q('#modal [data-loan]').click();
      ok(p.cash===cash+10000 && E.settleCashflow(p)===monthly-100,(free?'自由圈':'内圈')+' 真实借款到账10000，月净额减少100');
      ok(q('#paneFinance [data-monthly-cashflow]').textContent.indexOf(E.money(monthly-100))>=0,'借款关闭面板后月净额立即刷新');
      U.onMenu('loan');q('#modal [data-pick=bank]').click();q('#modal [data-quick=all]').click();
      ok(q('#ppPreview').textContent.indexOf('未来一年支出减少')>=0 && q('#ppPreview').textContent.indexOf(E.money(1200))>=0,'结清预览显示未来一年少扣1200');
      q('#modal [data-do]').click();mb('关闭').click();
      ok(p.liabs.bank===0 && E.settleCashflow(p)===monthly && p.cash===cash,'真实结清恢复原月净额，生活费用不吞掉收益');
      ok(q('#paneFinance [data-monthly-cashflow]').textContent.indexOf(E.money(monthly))>=0,'结清后财务面板立即刷新');
      U.saveState();U.tryRestore();g=window.Game.g;p=g.players[0];
      ok(p.liabs.bank===0 && E.settleCashflow(p)===monthly,'保存恢复不恢复已结清的月供');
    });
    var g=window.Game.g,p=g.players[0];p.liabs.car=250;p.loans.car={base:250,due:100,periods:24};
    var plan=E.settlementPlan(p);U.renderAll();U.onMenu('loan');
    ok(q('#modal').textContent.indexOf(E.money(252))>=0,'只剩三期时贷款管家显示实际一年还款252');window.UI.closeModal();
    ok(q('#paneFinance').textContent.indexOf(E.money(plan.amount))>=0,'财务页年度净额包含年中结清，未按月初净额重复扣全年');
    var cash=p.cash;p.ftPos=0;var landed=E.movePlayer(g,p,1);E.resolveSpace(g,p,landed);window.UiPending.showPending();
    ok(p.cash-cash===plan.amount && p.liabs.car===0,'分红日实际入账与逐月预览一致，贷款同步结清');
    ok(q('#modal').textContent.indexOf(E.money(plan.amount))>=0,'结算弹窗显示实际全年净额');
    E.clearPending(g);window.UI.closeModal();
  });

  /* AC. 自动续局与迁移，没有任何手动备份或恢复入口。 */
  step('AC 仅自动保存与续局',function(){return true;},function(){
    var a=fresh(),U=window.UiGame,S=window.SaveState,p=a.p;
    ok(!document.querySelector('[data-save], [data-save-file], [data-repair-history], [data-repair-field], #btnSaveDetails'),'开局、设置与全局均无备份、导入或历史核对入口');
    ok(!U.openHistoryRepair&&!U.previewImport&&!U.downloadBackup,'手动恢复弹层与下载入口已移除');
    p.cash=123456;U.saveState();U.tryRestore();
    ok(window.Game.g.players[0].cash===123456&&q('#setupScreen').hidden,'有本地进度时自动进入原对局');
    var saved=localStorage.getItem(S.KEY);window.Game.g=null;q('#setupScreen').hidden=false;localStorage.removeItem(S.KEY);
    ok(!U.tryRestore()&&window.Game.g===null&&!q('#setupScreen').hidden,'无本地进度时显示新游戏设置，不出现恢复选项');
    localStorage.setItem(S.KEY,saved);U.tryRestore();
  });
  step('AC 自动凭据恢复与写入失败', function(){return true;}, function(){
    var a=fresh(),g=a.g,p=a.p,E=a.E,U=window.UiGame,S=window.SaveState,b=g.players[1];
    p.assets.stocks=[{symbol:'AC-COST',shares:3,cost:100}];b.cash=10000;
    var id=E.holdingId(g,p.assets.stocks[0]);window.Act.transferAsset(g,p,b,'stock',id,1001);
    b.assets.stocks[0].cost=100;var cash=b.cash;U.saveState();U.tryRestore();
    ok(window.Game.g.players[1].assets.stocks[0].cost===1001/3&&window.Game.g.players[1].cash===cash,'恢复时按唯一成交凭据自动修复成本，现金不重付');
    ok(JSON.parse(localStorage.getItem(S.REPAIR_BACKUP_KEY)).g.players[1].assets.stocks[0].cost===100,'自动修正同样保留修正前原档');
    var original=Storage.prototype.setItem,current=window.Game.g.players[0].cash,stored=localStorage.getItem(S.KEY);
    var plan=S.planRepair(U.backupText(),{kind:'cash',player:0,cash:current+777,evidence:'保存失败测试所用核对依据'});
    try{
      Storage.prototype.setItem=function(key,value){if(key===S.KEY)throw new DOMException('已满','QuotaExceededError');return original.call(this,key,value);};
      ok(!U.applyRepair(plan).ok,'修正前备份成功但新档写入失败时明确拒绝应用');
    }finally{Storage.prototype.setItem=original;}
    ok(window.Game.g.players[0].cash===current&&localStorage.getItem(S.KEY)===stored,'新档写入失败保留原对局与已保存记录');
  });

  step('AD 发薪日志年度对账', function(){return true;}, function(){
    var a=fresh(),g=a.g,p=a.p,E=a.E,U=window.UiGame;
    p.pos=1;E.movePlayer(g,p,1);
    p.assets.business.push({nm:'<img src=x onerror=alert(1)> 对账商店',cost:1000,cf:100});
    p.pos=1;E.movePlayer(g,p,1);U.renderAll();
    var detail=q('#paneLog .log__audit');
    ok(!!detail&&!detail.open,'发薪日志默认折叠明细，保留净额变化摘要');
    detail.querySelector('summary').click();
    ok(detail.open&&detail.textContent.indexOf('使年净额增加 ¥1,200')>=0,'点击展开可核对新增持仓的年度贡献');
    ok(q('#paneLog .log__item').textContent.indexOf('原因：新增持仓：')>=0,'无需展开即可看到年净额变化原因');
    ok(detail.querySelector('p').textContent.indexOf('与上次对账：')===0,'差额对账显示在完整账单之前');
    ok(detail.textContent.indexOf('年内月净额经过')>=0&&detail.textContent.indexOf('本年收支')>=0,'同一条日志包括收支等式与逐月经过');
    ok(!detail.querySelector('img')&&detail.textContent.indexOf('<img src=x')>=0,'资产名称按文本显示，不执行标记');
    var text=detail.textContent,cash=p.cash;U.saveState();U.tryRestore();
    ok(q('#paneLog .log__audit').textContent===text&&window.Game.g.players[0].cash===cash,'刷新续局保留原对账明细且不重复入账');
    var entry=window.Game.g.log[0],lines=entry.cashflowDetails,start=lines.findIndex(function(x){return x.indexOf('本年收支：')===0;});
    entry.cashflowDetails=lines.slice(start,start+2).concat(lines.slice(0,start),lines.slice(start+2));
    var raw=JSON.stringify(entry.cashflowDetails);U.renderAll();
    ok(q('#paneLog .log__audit p').textContent.indexOf('与上次对账：')===0,'旧日志重新打开也将对账原因前置');
    ok(JSON.stringify(entry.cashflowDetails)===raw,'旧日志展示调整不改写原凭据');
  });

  step('AE 复盘诊断机制与当前状态', function(){return true;}, function(){
    var a=fresh(),g=a.g,p=a.p,E=a.E;
    E.initTrack(p);p.stats.crises=10;p.stats.peakCash=1000000;p.cash=10;
    E.LOAN_KEYS.forEach(function(k){p.liabs[k]=0;});p.assets.business=[];
    window.UiSummary.openSummary(0);var text=q('#modal').textContent;
    ok(text.indexOf('精力降至零时触发危机')>=0,'真实复盘说明健康危机的精力触发机制');
    ok(text.indexOf('不代表历史危机发生时')>=0,'当前经营数据不冒充历史危机成因');
    ok(text.indexOf('当前现金 ¥10')>=0,'应急诊断使用当前现金，不使用历史现金峰值');
    ok(text.indexOf('当前个人贷款已结清')>=0&&text.indexOf('全程零负债')<0,'已结清贷款不描述为全程零负债');
    ok(!/运气|每 2—3 轮|每轮至少|只有一处/.test(text),'复盘移除运气归因与固定行动要求');
    ok(text.indexOf('先平衡精力')>=0,'下一局清单针对健康记录优先安排精力管理');
    window.UI.closeModal();
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
