# 现金流游戏 · 中国本土版

> 基于《富爸爸穷爸爸》现金流游戏的网页实现：**老鼠赛跑 → 财务自由圈** 双跑道、**101 + 202** 两套规则、**年龄 / 无限** 两种模式，并已完成中国本土化改造（货币、职业、收支科目、投资标的、市场与政策事件）。

纯静态前端，**没有任何构建步骤** —— 双击 `index.html` 就能玩。

---

## 目录

- [快速开始](#快速开始)
- [玩法速览](#玩法速览)
- [操作入口](#操作入口)
- [目录结构](#目录结构)
- [架构说明](#架构说明)
- [数据模型](#数据模型)
- [关键常量](#关键常量)
- [存档与复盘数据](#存档与复盘数据)
- [设计系统](#设计系统)
- [本地开发与验证](#本地开发与验证)
- [已知约束](#已知约束)

---

## 快速开始

```bash
# 方式一：直接打开（推荐，零依赖）
open index.html            # macOS
# Windows / Linux 双击 index.html 亦可

# 方式二：本地起一个静态服务（行为与 file:// 一致）
python3 -m http.server 8080   # 然后访问 http://localhost:8080
```

**浏览器要求**：需支持 `color-mix()` 与 `:has()` 的现代浏览器 —— Chrome / Edge 111+、Safari 16.4+、Firefox 113+。
**无需 Node / npm / 打包工具**，项目里没有 `package.json`、没有依赖、没有构建产物。

---

## 玩法速览

### 两种游戏模式

| 模式 | 规则 | 结束条件 |
|---|---|---|
| **年龄模式**（默认） | 20 岁起步，**所有存活玩家各行动一次 = 一轮 = 长 1 岁** | 到 65 岁（共 45 轮）退休结算，**按净资产排名，最高者获胜** |
| **无限模式** | 不设年龄与轮数上限 | 一直玩到有人达成获胜条件 |

- 年龄 = `startAge + (round - 1)`；年龄模式下若有玩家提前买下梦想 / 企业达标，对局仍会提前结束。
- 模式选择会随开局配置一起记入本地存档，下次打开开局页自动回填。

### 两套规则版本

| | 101 基础版 | 202 进阶版 |
|---|---|---|
| 出圈条件 | 被动收入 ＞ 总支出 | 被动收入 ＞ **总支出 × 2** |
| 投资卡方向 | 小额理财 / 大额置业 | 杠杆交易 / 大额现金流 |
| 行情政策卡 | 16 张，波动温和 | 42 张，抽满 25 张重洗 |
| 交易方向 | 仅做多 | 做多 + 融券做空 + 期权 |
| 机会格 | 只抽投资卡 | 投资卡 + 行情卡同抽 |
| 房产 | 独立购买 | 可联合购买，租金随行情波动 |
| 财务自由圈企业 | 仅可购买 | 可开设特许经营 |
| 初始资产 | 仅职业卡 | 职业卡 + 随机投资组合卡 |

### 核心机制

| 机制 | 规则 |
|---|---|
| **起点 / 发薪日** | 经过或停在发薪日，领取一次月现金流（收入 − 支出） |
| **投资机会格** | 抽投资卡决定是否买入；买不起可把投资卡转让给其他玩家换现金 |
| **市场行情格** | 抽行情政策卡，所有玩家的同类资产同时受到影响，可自行决定是否卖出 |
| **意外支出格** | 支付卡片金额，部分卡还会永久增加每月固定支出 |
| **添丁格** | 子女 +1（上限 3 个），每月养育支出增加 |
| **公益捐赠格** | 捐出总收入 10%，换取未来 2 轮可选掷 1—2 粒骰子 |
| **裁员失业格** | 一次性支付总支出，并暂停两轮 |
| **现金约束** | **现金永不为负**：付不出必须三选一 —— 贷款补足 / 变卖资产（账面 80% 急售）/ 宣告破产 |
| **主动认输** | 随时可退出本局；**不清算资产**，名下资产负债完整保留并按净资产计入排名 |
| **被动破产** | 月现金流为负且已无资产可变现 → 银行按账面 50% 清算后出局 |
| **出圈（跳出老鼠赛跑）** | 被动收入 ＞ 门槛，进入财务自由圈并获得**出圈资金 = 被动收入 × 100** |
| **财务自由圈** | 掷 2 粒骰子；企业只能用现金买（不可贷款）；梦想格支付费用即获胜 |
| **期权** | 有效期 3 回合，逾期权利金损失 |
| **融券做空** | 不占用现金，但一旦出现该标的报价即**强制买回平仓** |
| **买断（202）** | 在财务自由圈可按对手资产账面价 × 1.5 买断，迫使其出局 |

### 获胜条件（满足任一即结束）

1. 第一个在财务自由圈**买下自己的梦想**；
2. 第一个通过购买企业使**月现金流累计增加 ≥ ¥50,000**；
3. 202 规则下**买断对手资产成为最后存活者**；
4. 年龄模式**到 65 岁按净资产排名第一**。

---

## 操作入口

**开局设置页**：游戏模式（年龄 / 无限）→ 规则版本（101 / 202）→ 玩家人数（2—6）→ 玩家名称 → 「显示对手财务明细」「快速动画」两个开关。

**顶栏**：`☰` 菜单 · 轮次/年龄胶囊 · `🔄` 重置游戏 · 主题切换 · 规则速查

**抽屉菜单**：财务报表 · 玩家一览 · 规则速查 · 信用贷/还款 · 玩家间交易 · **📊 本局复盘报告** · 切换主题 · **🏳️ 主动认输** · 重新开始

**右侧面板四个标签页**：财务（实时收入支出表 + 资产负债表）· 日志 · 规则 · 设置

**主操作区**：屏幕上任何时刻只有一个主操作 —— 未移动时是「掷骰子（N 粒）」，卡片结算中置灰为「处理卡片中…」，已移动且结算完则升为「结束回合 · 轮到 X」；正上方常驻回合状态条。

**键盘**：`空格` 掷骰 / 结束回合，`Esc` 关闭弹层。

---

## 目录结构

```
CashflowGame/
├── index.html              页面骨架：顶栏 / 三栏布局 / 开局页 / 弹层宿主 / 抽屉
├── css/
│   ├── base.css            设计系统：设计令牌 + 基础层 + 通用组件（363 行）
│   └── game.css            游戏布局：棋盘 / 席位卡 / 财务面板 / 复盘报告（472 行）
└── js/
    ├── data-careers.js     职业卡 12 张 + 收支科目中文名 + 玩家配色 + 银行参数
    ├── data-board.js       内圈 24 格 / 财务自由圈 24 格 / 梦想 / 企业 / 事件 / 组合卡 / 标的
    ├── data-cards-101.js   101 牌堆：小额理财 14 / 大额置业 12 / 行情政策 16 / 意外支出 12
    ├── data-cards-202.js   202 牌堆：杠杆交易 16 / 大额现金流 10 / 行情政策 42 / 意外支出 10
    ├── engine.js           游戏引擎：纯逻辑、零 DOM 依赖
    ├── engine-actions.js   玩家操作：买卡 / 卖出 / 贷款 / 期权 / 做空 / 交易 / 出圈 / 买断
    ├── ui-core.js          通用 UI：主题、弹层、Toast、抽屉、开局设置、财务报表渲染
    ├── ui-game.js          主界面：棋盘、席位、四个面板、回合流程、存档、复盘触发
    ├── ui-pending.js       卡片结算弹层 + 卡面渲染
    ├── ui-summary.js       游戏结束「整体复盘报告」
    └── main.js             启动引导
```

---

## 架构说明

### 分层与依赖方向

```
数据层  data-*.js          ← 纯数据，只往 window 上挂常量
   ↓
逻辑层  engine.js          ← 纯函数引擎，不碰 DOM；只依赖数据层
        engine-actions.js  ← 操作层，读写引擎状态；只依赖引擎
   ↓
表现层  ui-core.js         ← 通用 UI 原子（弹层 / Toast / 表单 / 报表渲染）
        ui-pending.js      ← 卡片结算弹层
        ui-summary.js      ← 复盘报告
        ui-game.js         ← 主界面与回合流程（唯一持有 Game 状态的地方）
   ↓
引导层  main.js            ← 绑定启动，无业务逻辑
```

**引擎与 UI 完全解耦**：`engine.js` 内部没有任何 `document` / `window` 调用，可以单独在 Node 里 `eval` 起来跑对局（本项目的自动化验证就是这么做的）。

### 加载顺序（`index.html` 中不可调换）

```
data-careers → data-board → data-cards-101 → data-cards-202
  → engine → engine-actions
  → ui-core → ui-game → ui-pending → ui-summary
  → main
```

各文件都是 IIFE，只向 `window` 暴露一个命名空间：

| 命名空间 | 说明 |
|---|---|
| `Engine` | 引擎全部能力（财务推导、移动结算、破产、胜负、复盘采集…） |
| `Act` | 玩家操作函数 |
| `UI` | 通用 UI 原子 + `Setup` 开局配置对象 |
| `UiGame` | 主界面（含 `Game` 状态与 `startGame`） |
| `UiPending` | 卡片结算弹层（`showPending` / `face`） |
| `UiSummary` | 复盘报告（`openSummary` 等） |

### ⚠️ 界面与逻辑之间的硬契约

`engine` 通过**节点 ID 与 class 名**反向被 UI 绑定（例如 `.pcard__grid`、`.space--here`、`#paneFinance`、`#btnRollLabel`）。
**改类名或 ID 会静默失效**（不报错、只是不更新），动手前先 grep 一遍：

```bash
grep -rn "pcard__grid\|space--here\|paneFinance" js/ css/
```

---

## 数据模型

### 玩家对象（`newPlayer`）

```js
{
  id, seat, name, color, icon, job, salary, children, cash,
  liabs:  { home, school, car, credit, bank, other, extraPay },   // 负债（extraPay = 每月额外固定支出）
  assets: { stocks, realEstate, business, ftBusiness, savings, funds, lands, collectibles },
  pos, ftPos, inFT,                      // 内圈位置 / 财务自由圈位置 / 是否已出圈
  ftBase, ftGain,                        // 出圈时锁定的被动收入 / 财务自由圈累计企业现金流
  charityTurns, skipTurns,               // 公益加成剩余轮数 / 暂停轮数
  dreamIdx, dreamOwned, options, shorts, franchise,
  turnsPlayed, out, outReason,
  stats, track, milestones,              // 复盘数据（见下）
  escaped, escapeRound, escapePassive, reportShown
}
```

**财务是实时推导的**：`Engine.finance(p)` 每次调用都从 `job` + `liabs` + `assets` 重新算出收入支出表与被动收入，不做缓存，因此任何操作后立即生效。

### 职业卡（`data-careers.js`，12 张）

```js
{ id:'doctor', name:'三甲医院医生', ico:'🩺', salary:13200,
  taxes, home, school, car, credit, retail, other,   // 各项月度支出
  perChild, savings,                                  // 每个孩子的支出 / 起始储蓄
  liab:{ home, school, car, credit } }                // 初始负债
```

职业：三甲医院医生 / 民航机长 / 执业律师 / 软件工程师 / 企业中层管理 / 小学教师 / 护士 / 民警 / 公司文员 / 货运司机 / 汽修技师 / 小区保安。

### 卡片：三类字段结构（**不要混用**）

> 这是本项目最容易踩的坑：**投资卡与行情卡共用 `kind` 名，字段却完全不同**。渲染前必须先按牌堆分流，再按 `kind` 细分，否则会读到 `undefined` 渲染出 `$NaN`。

**① 投资卡**（`DECK_SMALL` / `DECK_BIG` / `DECK_CAPGAIN` / `DECK_CASHFLOW`）—— 可买标的

| `kind` | 关键字段 |
|---|---|
| `stock` | `symbol` `price` `min` `max` `range` |
| `realestate` | `nm` `dp`（首付）`cost`（总价）`cf`（月现金流）`rent` `joint`（202 可联合购买） |
| `business` | `nm` `cost` `cf` `risky` |
| `savings` | `nm` `cost` `interest` |
| `land` | `nm` `cost`（等待行情报价） |
| `collectible` | `nm` `price` `min` `max`（`unit` 为可按单位买入） |
| `option` / `straddle` | `symbol` `dir`（call/put）`strike` `premium` |

**② 行情政策卡**（`DECK_MARKET_101` / `DECK_MARKET_202`）—— 报价 / 事件，**没有 `cost` 与 `cf`**

| `kind` | 关键字段 |
|---|---|
| `stock` | `symbol` `price` |
| `realestate` / `collectible` / `land` | `prop`（标的）`price` |
| `business` | `rate`（按购入价的倍率收购） |
| `savings` | `rate`（按本金比例兑现） |
| `rentDelta` | `pct`（全体出租房产租金浮动，202 专用） |
| `disaster` | `target`（受灾标的，资产归零） |
| `doodadLink` | 市场真空期（本轮无报价） |

**③ 意外支出卡**（`DECK_DOODAD_101` / `DECK_DOODAD_202`）—— **连 `kind` 都没有**

```js
{ id, nm, cost, extraPay?, note }   // extraPay = 此后每月固定增加的支出
```

### 棋盘（`data-board.js`）

两个 24 格环形跑道，在 7×7 的 CSS 网格上排布（外环 24 格 = 49 格减去中央 5×5 区域）。`RING_POS` 给出每格的行列坐标，渲染时写成内联样式；CSS 侧用 `--g`（格距）与 `--col = (100% − 6×g) / 7` 保证每格严格对齐。

| 内圈「老鼠赛跑」24 格 | 数量 | 财务自由圈 24 格 | 数量 |
|---|---|---|---|
| 起点 | 1 | 起点 | 1 |
| 投资机会格 | 8 | 现金流日 | 8 |
| 发薪日 | 3 | 企业投资格 | 6 |
| 市场行情格 | 4 | 梦想格 | 6 |
| 意外支出格 | 3 | 税务稽查 | 1 |
| 添丁格 | 2 | 离婚析产 | 1 |
| 公益捐赠格 | 2 | 官司赔偿 | 1 |
| 裁员失业格 | 1 | | |

### 牌堆规模（共 132 张）

| 牌堆 | 变量 | 张数 | 适用 |
|---|---|---|---|
| 小额理财 | `DECK_SMALL` | 14 | 101 |
| 大额置业 | `DECK_BIG` | 12 | 101 |
| 杠杆交易 | `DECK_CAPGAIN` | 16 | 202 |
| 大额现金流 | `DECK_CASHFLOW` | 10 | 202 |
| 行情政策（101） | `DECK_MARKET_101` | 16 | 101 |
| 行情政策（202） | `DECK_MARKET_202` | 42 | 202（抽满 25 张重洗） |
| 意外支出（101） | `DECK_DOODAD_101` | 12 | 101 |
| 意外支出（202） | `DECK_DOODAD_202` | 10 | 202 |

牌堆为 `{ draw, disc, total }`，抽空后自动把弃牌堆洗回。

---

## 关键常量

| 常量 | 值 | 位置 |
|---|---|---|
| `BANK.loanRate` | `0.01`（信用贷月息 1%，年化约 12%） | `data-careers.js` |
| `SELL_RATE` | `0.8`（主动变卖按账面 80% 急售） | `engine.js` |
| `BANK_RATE` | `0.5`（破产清算按账面 50% 收购） | `engine.js` |
| 出圈资金 | 被动收入 × 100 | `engine-actions.escapeRatRace` |
| 企业达标线 | `ftGain >= 50000` | `engine-actions` |
| 买断价格 | 资产账面 × 1.5 | `engine-actions.buyout` |
| 特许经营 | 首付 = 企业成本 × 20%，额外现金流 = 原现金流 × 50% | `engine-actions.openFranchise` |
| 期权有效期 | 3 回合（`turnNo + 3`） | `engine-actions.buyDeal` |
| 公益捐赠 | 总收入的 10%，换 2 轮可选骰子数 | `engine.resolveSpace` / `doCharity` |
| 添丁上限 | 3 个 | `engine-actions.addBaby` |
| `AGE_START` / `AGE_END` | `20` / `65`（共 45 轮） | `data-board.js` |
| `RING_LEN` | `24` | `engine.js` |
| 两融做空标的 | `SHORTABLE = ['600666','300999']` | `data-board.js` |

**唯一支付原语**：`Engine.payCash(p, amount)` —— 现金不足时**拒绝扣款并返回差额**，从机制上保证现金永不为负。所有强制支出都必须走它。

---

## 存档与复盘数据

### 本地存档

| key | 内容 | 说明 |
|---|---|---|
| `cf_save_v1` | `{ v, at, rolled, boardView, g }` | 整局状态（含牌堆与弃牌堆，刷新后卡序不丢）；日志瘦身至最近 80 条，实测约 14KB |
| `cf_cfg_v1` | 上次的开局配置 | 规则 / 模式 / 人数 / 玩家名 / 两个开关 |
| `cf_theme` | `light` \| `dark` | 主题偏好（默认深色） |

- **写入时机**：状态变化统一收敛到 `updateActions()`，在那里做 180ms 合并落盘；另外在 `beforeunload` / `pagehide` / 页面隐藏时强制落盘一次。
- **读取**：`boot()` 里绑定完成后调 `tryRestore()` —— 有档直接续玩并提示，无档停在开局页。
- **重置**：`UiGame.resetGame()` 是**唯一**回到开始页的入口（顶栏重置按钮 / 抽屉「重新开始」/ 设置面板 / 胜负页「再来一局」四个入口都收敛到它），会清存档、清内存对局，并做二次确认。
- **降级**：所有 `localStorage` 读写都包在 `try/catch` 里，隐私模式或配额超限时静默跳过，不影响对局。

### 复盘数据采集（`engine.js`）

| 字段 | 内容 |
|---|---|
| `p.stats` | 决策计数：`dealsSeen` / `dealsBought` / `dealsPassed` / `dealsSold` / `investTotal` / `cfGained` / `loans` / `loanTotal` / `repaid` / `marketSells` / `donations` / `forcedCount` / `forcedTotal` / `liquidations` / `ftBusinesses` / `buyouts` / `dreams` / 三个 `peak*` |
| `p.track` | 每完成一整轮为所有玩家拍的快照 `{ round, cash, passive, cf, net }`，上限 60 条 |
| `p.milestones` | 关键决策节点 `{ round, text, kind }`，上限 60 条 |

采集接口：`Engine.initTrack / bump / milestone / trackRound`。埋点铺在引擎与操作层的 21 个动作上。
**旧存档兼容**：`initTrack` 会补齐缺失字段，`track` 为空时报告里的走势图降级为提示文案。

`UiSummary.openSummary(pid)` 输出九个分区：评级徽标 + 身份结局 / 总评 / 6 张关键指标卡 / 出圈进度 / 五维表现 / 财富走势（内联 SVG 折线）/ 关键决策时间线 / 出圈诊断建议（≤5 条）/ 下一局行动清单。

**触发规则统一为「出局即出复盘」**：破产与主动认输立刻弹出该玩家报告；本局结束时（退休结算 / 获胜 / 全员出局）由战绩页提供入口；菜单里可随时查看。

---

## 设计系统

Apple 简洁风格，全部令牌集中在 `css/base.css` 的 `:root` 与 `html[data-theme]` 两处。

| 类别 | 浅色 | 深色 |
|---|---|---|
| 页面底 / 卡片 | `#f5f5f7` / `#ffffff` | `#000000` / `#1c1c1e` |
| 主文字 / 次级文字 | `#1d1d1f` / `#6e6e73` | `#f5f5f7` / `#98989d` |
| 强调色 | `#0071e3` | `#0a84ff` |
| 功能色 | 绿 `#34c759` 红 `#ff3b30` 橙 `#ff9500` 紫 `#af52de` 青 `#5ac8fa` | 对应深色变体 |
| 圆角 | `--r-xs 6` / `--r-s 10` / `--r-m 14` / `--r-l 20` / `--r-xl 26` / `--r-pill 980` | 同 |
| 动效 | `--ease cubic-bezier(.32,.72,0,1)`，按压 `scale(.965)`，180—360ms | 同 |
| 分层 | 仅 3 级投影 + 1px 发丝分隔线；顶栏与操作坞用 `backdrop-filter: blur(20px) saturate(180%)` | 同 |

命名约定：令牌层（`--on-surface` / `--sep` / `--accent`）→ 基础层（Reset / Typography）→ 组件层（`.btn` / `.cardface` / `.rowlist` / `.segmented` / `.pick`）。
另保留了一批 **旧令牌别名**（`--primary` / `--primary-container` / `--secondary-container` / `--outline-v`），因为 JS 里有内联引用，改名会静默失效。

约定：**行内边距由「行」自己提供，分组容器不加内边距**（`.rowlist > * { padding-left/right: 14px }` 是兜底）。

---

## 本地开发与验证

没有测试框架，验证方式是「**语法校验 + 无头浏览器驱动真实交互**」。

### 1. 语法校验

```bash
for f in js/*.js; do node --check "$f" && echo "OK $f"; done
```

### 2. 无头浏览器驱动脚本（本项目的主要验证手段）

原理：把一段探针脚本注入 `index.html` 的副本，用无头 Chrome 跑真实点击，最后把结果写进一个 `<pre id="DIAG">`，再从 `--dump-dom` 里抽取。

```bash
cat > __probe.js <<'EOF'
window.addEventListener('load', function(){
  setTimeout(function(){
    window.UI.setTheme('dark');
    window.startGame({rule:'101', mode:'age', count:4, names:['P1','P2','P3','P4'], showAll:true});
    setInterval(function(){
      /* 1) 有弹层时，先把弹层推到底 */
      var mh = document.getElementById('modalHost');
      if(!mh.hidden){
        var pick = document.querySelector('#modal .pick:not([disabled])');
        if(pick){ pick.click(); return; }                 /* 牌堆选择器没有 foot 按钮，必须单独处理 */
        var btns = document.querySelectorAll('#modal .modal__foot button');
        for(var i=0;i<btns.length;i++){
          var b = btns[i];
          if(b.disabled) continue;
          if(b.hasAttribute('data-ok') || b.hasAttribute('data-pass') || b.classList.contains('btn--primary')){ b.click(); return; }
        }
        return;
      }
      /* 2) 没弹层时按回合推进：结束回合 → 掷骰 */
      var end = document.getElementById('btnEndTurn');
      if(!end.hidden){ end.click(); return; }
      var roll = document.getElementById('btnRoll');
      if(!roll.disabled){ roll.click(); }
    }, 120);
    /* 3) 到点把状态写进 #DIAG 供 dump-dom 抽取 */
    setTimeout(function(){
      var g = window.Game.g;
      var d = document.createElement('pre'); d.id = 'DIAG';
      d.textContent = '第 ' + g.round + ' 轮 / ' + window.Engine.ageOf(g) + ' 岁 · '
        + document.getElementById('turnState').textContent;
      document.body.appendChild(d);
    }, 15000);
  }, 300);
});
EOF

python3 - <<'PY'
h = open('index.html', encoding='utf-8').read()
open('__probe.html', 'w', encoding='utf-8').write(h.replace('</body>', '<script src="__probe.js"></script>\n</body>'))
PY

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --disable-gpu --allow-file-access-from-files \
  --window-size=1440,900 --virtual-time-budget=30000 --dump-dom \
  "file://$PWD/__probe.html" 2>/dev/null \
| python3 -c "import sys,re,html; d=sys.stdin.read(); m=re.search(r'<pre id=\"DIAG\">(.*?)</pre>', d, re.S); print(html.unescape(m.group(1)) if m else 'NO DIAG')"

rm -f __probe.js __probe.html        # ⚠️ 验证完必须清理，别把临时文件留在仓库里
```

**驱动脚本的三个必踩坑**（都已在实践中遇到）：

1. **牌堆选择器没有 `foot` 按钮**（`.pick` 直接放在 modal body 里），必须单独处理，否则脚本会在第一步静默卡死、空转到超时。
2. **主按钮可能全被禁用**（例如现金不足时的公益捐赠），要加「点任意可用按钮 / 关闭弹层」的兜底分支。
3. **别用固定 `setTimeout` 对齐时序**，改写成「**等条件成立 → 执行动作**」的状态驱动，否则掷骰动画一慢就错位。

另外：`--user-data-dir` 复用 profile 做跨进程 `localStorage` 测试会让无头 Chrome 直接挂掉（exit 137）；需要验证「刷新后恢复」时，改为**单次加载内模拟刷新**（清空 `Game` 内存态 → 再调一次 `tryRestore()`），等价且稳定。

### 3. 引擎可以脱离浏览器跑

`engine.js` 与 `data-*.js` 都不依赖 DOM，可以直接在 Node 里 `eval` 起来做数据审计：

```bash
node -e "
const fs=require('fs'); global.window={};
for (const f of ['data-careers.js','data-board.js','data-cards-101.js','data-cards-202.js','engine.js'])
  eval(fs.readFileSync('js/'+f,'utf8'));
console.log('牌堆总量', ['DECK_SMALL','DECK_BIG','DECK_CAPGAIN','DECK_CASHFLOW','DECK_MARKET_101','DECK_MARKET_202','DECK_DOODAD_101','DECK_DOODAD_202']
  .reduce((s,k)=>s+window[k].length,0));
"
```

---

## 已知约束

这些都是当前实现里真实存在的边界，动手改之前建议先读一遍：

1. **数值是「对局平衡标定」，不等于现实**。金额量级沿用原版 1:1 映射为人民币，只调整了语义上明显脱离国内的项（信贷利率、支出科目、资产类型）。所以会看到「三甲医院医生月薪 ¥13,200」这类偏保守的数字；按真实收入/房价重算全表会连带影响出圈门槛与企业投资额，需要单独验证一轮平衡性。
2. **UI 与逻辑靠 ID / class 名硬契约绑定**，改类名不会报错，只会静默失效。
3. **202 的「破产后跳过回合 + 借贷限制」实际不生效** —— 因为当前规则是「破产即出局」，惩罚没有作用对象，仅保留在规则文案里。
4. **界面文案含 emoji**（📊 / 🏆 / 💀 等）。如果要按设计规范统一成 SVG 图标，需要做一轮图标替换。
5. **移动端是响应式降级**，不是独立设计：右栏下移、棋盘压缩、弹层转为底部 Sheet，未做专门的触控优化。
6. **无自动化测试框架**，回归依赖无头浏览器脚本，脚本需要自行清理（临时文件形如 `__*.js` / `__*.html`）。
7. **`localStorage` 在隐私模式或配额超限时会静默降级**，此时刷新会回到开局页 —— 这是有意为之（不影响对局），但排查「进度丢了」时先确认这一点。
8. **棋盘坐标**依赖 CSS 的 7×7 网格与 `--g` / `--col` 计算，改棋盘尺寸时要同步检查 `RING_POS` 与 `game.css` 中 `.board` / `.board-center` 的公式。

---

## 设计稿

复盘报告界面另有一份画布设计稿（780 宽单屏，浅色 Apple 风），可与实现对照：
`https://ardot.tencent.com/file/727420559668814`

> 注意：画布规范禁止在文本节点里使用 emoji，设计稿中把实现里的 📊 / 🏆 / 💀 换成了 SVG 图标或纯文字标签。
