/* 发布回归：资源内容变化必须换 URL；旧结算引擎不得启动和恢复存档。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.stdout.write(execFileSync(process.execPath, [path.join(root,'tools/version-assets.js'),'--check']));
for(const engine of [undefined, {}]){
  const elements={btnStart:{},btnRoll:{},modeHint:{after(button){ this.button=button; }}};
  const context={
    window:{Engine:engine,location:{href:'https://example.com/CashflowGame/',replace(url){ this.replaced=url; }}},
    document:{readyState:'complete',getElementById(id){return elements[id];},createElement(){return {};}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/main.js'),'utf8'), {...context, URL});
  assert.equal(elements.btnStart.disabled,true);
  assert.equal(elements.btnRoll.disabled,true);
  assert(elements.modeHint.textContent.includes('已有存档会保留'));
  elements.modeHint.button.onclick();
  assert(new URL(context.window.location.replaced).searchParams.has('update'));
}
console.log('✅ 旧引擎或脚本未加载时禁止启动，不触碰存档，并提供重新载入入口');
