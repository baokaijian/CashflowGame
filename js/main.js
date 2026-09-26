/* ==========================================================================
   main.js — 启动引导
   ========================================================================== */
(function(){
'use strict';
const U = window.UI, E = window.Engine;

function boot(){
  /* 页面与旧缓存脚本混用时停止启动，不能继续用旧积欠模型处理存档。 */
  if(!E || E.PAYDAY_RULE !== 'one-year-per-crossing' || !E.restoreRandom || !window.SaveState){
    document.getElementById('btnStart').disabled = true;
    document.getElementById('btnRoll').disabled = true;
    const hint = document.getElementById('modeHint');
    hint.textContent = '游戏规则尚未更新完整，请重新载入后继续。已有存档会保留。';
    const retry = document.createElement('button');
    retry.className = 'btn btn--primary';
    retry.textContent = '重新载入最新规则';
    retry.onclick = ()=>{
      const url = new URL(window.location.href);
      url.searchParams.set('update', Date.now());
      window.location.replace(url.href);
    };
    hint.after(retry);
    return;
  }
  U.initTheme();
  U.initSetup();
  U.initChrome({ onMenu: act => window.UiGame.onMenu(act) });
  window.UiGame.bind();
  /* 有本地存档则直接续玩上次进度，否则停留在开局设置页 */
  window.UiGame.tryRestore();

  /* 点遮罩 / 按 ESC 一律走 requestClose：本轮卡片未结算时会被拦下，避免回合卡死 */
  const host = document.getElementById('modalHost');
  host.addEventListener('click', ev=>{ if(ev.target === host) U.requestClose(); });
  document.addEventListener('keydown', ev=>{
    if(ev.key === 'Escape'){
      if(!host.hidden) U.requestClose();
      else U.closeDrawer();
      return;
    }
    if(ev.key === ' ' && window.Game.g && host.hidden){
      ev.preventDefault();
      const b = document.getElementById('btnRoll');
      if(!b.disabled) window.UiGame.roll();
      else if(!document.getElementById('btnEndTurn').hidden) window.UiGame.endTurn();
    }
  });

  /* 移动端首次进入提示 */
  if(window.innerWidth < 861){
    setTimeout(()=>U.toast('移动端提示：棋盘格较小时可点击玩家卡片查看财务明细。','ok'), 900);
  }
  console.log('%c现金流游戏 · Cashflow 101 + 202','color:#7c4dff;font-weight:bold');
  console.log('规则引擎：', Object.keys(E).length, '个导出方法');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
