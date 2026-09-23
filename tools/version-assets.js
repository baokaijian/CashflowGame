/* 静态页面资源按内容更新 URL，避免上线后继续使用浏览器中的旧结算脚本。
   node tools/version-assets.js          更新 index.html
   node tools/version-assets.js --check  发布前检查（无写入） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'index.html');
const before = fs.readFileSync(entry, 'utf8');
let count = 0;
const after = before.replace(/(\b(?:src|href)=")((?:js|css)\/[^"?]+)(?:\?[^"\s]*)?(")/g,
  (_, attr, file, quote)=>{
    const hash = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 16);
    count++;
    return `${attr}${file}?v=${hash}${quote}`;
  });
if(!count) throw new Error('未找到静态资源引用');
if(process.argv.includes('--check')){
  if(after !== before){
    console.error('资源版本已过期：请执行 node tools/version-assets.js 后重新验证。');
    process.exitCode = 1;
  } else console.log(`✅ ${count} 个静态资源版本与内容一致`);
} else {
  fs.writeFileSync(entry, after);
  console.log(`已更新 ${count} 个静态资源版本`);
}
