# test/ —— 验证脚本

本项目**没有测试框架、没有依赖**，这里是四个可直接运行的验证脚本。
改动人生命题与消费升级相关的参数（`SALARY_CURVE` / `LIFE_STAGES` / `ENERGY` / `UNEMPLOYMENT` / `LIFESTYLE`）后，**必须重跑前三个**。

---

## 1. `career-cashflow-scan.js` —— 全职业 × 全年龄现金流扫描

回答一个问题：**有没有哪个职业在「没有任何额外负债」的默认轨迹上，一生现金流会转负？**
如果有，说明数值标定失衡，游戏会变成「注定破产」而不是「有时间压力」。

```bash
node test/career-cashflow-scan.js
```

期望输出：`✅ 全部 12 个职业在默认轨迹上一生现金流为正`，
且**最低点统一落在 56 岁**（收入已回落、赡养仍最高的交汇点 —— 这是设计意图）。

---

## 2. `lifecycle-regression.js` —— 长局回归

用固定随机种子跑 4 局完整对局（101/202 × 4/6 人），并在**每一回合**校验四条不变式：

| 不变式 | 含义 |
|---|---|
| 现金永不为负 | 负现金会破坏整局赖以成立的财务逻辑 |
| 数值有限 | 不出现 `NaN` / `Infinity` |
| 卡片不卡死 | 每张 pending 都能被处理完 |
| 精力不破 0 | 归零即触发健康危机，不允许继续下探 |

```bash
node test/lifecycle-regression.js      # 退出码 0 = 全通过
```

脚本会走**每种卡片的真实 action**（`doDownsized` / `payDoodad` / `chooseDeck` → `buyDeal` …），
而不是一律清掉 pending —— 否则「失业求职期」「买入消耗精力」这两条路径根本不会被覆盖，
回归会给出「求职 0 次」这种假通过。

> 固定种子 → 结果可复现。**断言若失败，先看它指出的是产品缺陷还是脚本缺陷**：
> 首版脚本就曾因为漏清 pending，把「失业 240 次」这种不可能的计数报出来。

---

## 3. `consumption-tier.js` —— 消费升级规则（意外支出 × 消费档次）

验证「社会等级越高，意外支出越贵」这条规则的计价是否处处自洽：

```bash
node test/consumption-tier.js      # 退出码 0 = 全通过
```

覆盖：系数阶梯与等级数一一对应且单调不降、**22 张意外支出卡全部标注了消费敏感度**、
逐级核对（L0—L7）「消费升级型全额承接 / 基础型只承接 basicDamp 比例」、
每月额外支出同步放大、实际扣款按实付计且加成单独记账、
**传入手工锁定金额时按锁定值扣款**（保证弹层与账目一致）。

> 改动 `LIFESTYLE`（系数 / basicDamp）、社会等级门槛、或意外支出卡数据后**必须重跑**。

## 4. `browser-behavior.js` —— 浏览器行为验证

覆盖 8 组新机制的真实交互：精力消耗与不足拦阻、失业→求职期→复职、入不敷出处理、
起点休假、银翅膀掷 3 粒、公益捐赠税前扣除、健康危机、年龄推进曲线。

它需要在浏览器里跑，做法是把探针注入 `index.html` 的副本，再从 `--dump-dom` 抽取结果：

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

python3 - <<'PY'
h = open('index.html', encoding='utf-8').read()
open('__probe.html','w',encoding='utf-8').write(
    h.replace('</body>', '<script src="test/browser-behavior.js"></script>\n</body>'))
PY

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --disable-gpu --allow-file-access-from-files \
  --window-size=1440,900 --virtual-time-budget=40000 --dump-dom \
  "file://$PWD/__probe.html" 2>/dev/null \
| python3 -c "import sys,re,html; d=sys.stdin.read(); m=re.search(r'<pre id=\"DIAG\">(.*?)</pre>', d, re.S); print(html.unescape(m.group(1)) if m else 'NO DIAG')"

rm -f __probe.html        # ⚠️ 验证完务必清理，别把临时文件留在仓库里
```

无头 Chrome 也可换成 Playwright 自带的 `chrome-headless-shell`（更轻，但需自行指定路径）。

---

## 语法自检（改完代码先跑这个）

```bash
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done
```
