# 验证脚本

核对日期：2026-09-28。本项目无需 npm 安装：31 个 Node 验证脚本可直接运行；`browser-behavior.js` 是浏览器探针，不能直接用 Node 执行。

本次旧档修复验证已重新运行全部 31 个 Node 脚本并通过，14 个运行资源的内容版本检查也通过。

## Node 回归

从仓库根目录运行全部 Node 脚本，任意失败即停止：

```bash
for f in test/*.js; do
  [ "$f" = "test/browser-behavior.js" ] && continue
  node "$f" || exit 1
done
```

也可按改动范围运行相关脚本。涉及共享账本、贷款、时间或存档时，需同时检查调用方与长局；参数变化还要重跑平衡核验。脚本的断言数量不是覆盖率，不将旧版本数量累加成当前证据。

| 脚本 | 主要覆盖 |
|---|---|
| [career-cashflow-scan.js](career-cashflow-scan.js) | 全职业、年龄阶段的基础现金流扫描 |
| [lifecycle-regression.js](lifecycle-regression.js) | 多人长局中的现金、数值、待处理事件与精力不变式 |
| [consumption-tier.js](consumption-tier.js) | 消费档次、意外支出、金额锁定和实际扣款 |
| [solo-mode.js](solo-mode.js) | 单人退休、合作差异、成就评级和完整人生 |
| [time-unit.js](time-unit.js) | 一年十二个月、贷款期数和年度摊还 |
| [payday-trigger.js](payday-trigger.js) | 内外圈路径、发薪密度、跨格与各玩家独立计龄 |
| [payday-settlement.js](payday-settlement.js) | 一次结一年、跨退休与终龄、缺口和旧档幂等 |
| [price-calibration.js](price-calibration.js) | 价格字段、卡面备注与标定保护 |
| [life-baseline-credit.js](life-baseline-credit.js) | 生活基准、自由圈账本与收入授信 |
| [market-valuation.js](market-valuation.js) | 周期估值、折旧、多头借贷、退休与长局 |
| [escape-difficulty.js](escape-difficulty.js) | 回报参数、严格出圈门槛及固定策略难度 |
| [property-sales.js](property-sales.js) | 共有份额出售、筛选列表后的持仓定位 |
| [collateral-appraisal.js](collateral-appraisal.js) | 逐项抵押成本、估值、融资、待购资产排除 |
| [asset-version.js](asset-version.js) | 静态资源内容版本、启动完整性与入口同步 |
| [asset-transactions.js](asset-transactions.js) | 共享报价、稳定身份、项目融资、挂牌买回和转让 |
| [family-lifecycle.js](family-lifecycle.js) | 子女成年、缴费年数、退休医疗及历史兼容 |
| [operating-differences.js](operating-differences.js) | 规模维护、经营折旧、机构合同与拒绝路径 |
| [living-budget.js](living-budget.js) | 生活费独立于月供、自然结清与提前还款 |
| [portfolio-financing.js](portfolio-financing.js) | 初始组合融资、出售还本、混合旧债与迁移 |
| [player-transfers.js](player-transfers.js) | 股票与企业买方成本、新身份、使用年数与重复交易 |
| [rule-presentation.js](rule-presentation.js) | 规则展示、严格门槛、破产和复盘文本 |
| [savings-redemption.js](savings-redemption.js) | 不同本金逐笔兑付、报价校验、旧档和失败不改账 |
| [fast-track-income.js](fast-track-income.js) | 自由圈按当前持仓分红、企业与出圈奖励分开 |
| [save-recovery.js](save-recovery.js) | 备份格式、容量、导入校验、存储失败和回滚 |
| [random-state.js](random-state.js) | 骰子与洗牌连续性、动画中断恢复和旧档随机迁移 |
| [balance-audit.js](balance-audit.js) | 报价对象可达、首付收益、共有结算及审计可复现 |
| [wealth-history.js](wealth-history.js) | 财富采样、首点保留、裁剪、峰值和旧档 |
| [health-recovery.js](health-recovery.js) | 强制休养不循环续期、恢复行动与再次过劳 |
| [rental-cashflow.js](rental-cashflow.js) | 毛租金连续变化、固定利息、纯资本房产及自由圈复盘 |
| [legacy-repair.js](legacy-repair.js) | 旧档固定随机、家庭和融资核对、凭据恢复、现金、挂牌、历史归档及修正失败保护 |
| [loan-cashflow.js](loan-cashflow.js) | 六类借还、净现金流、尾款、年中结清、年度缺口与预览 |

## 浏览器行为

[browser-behavior.js](browser-behavior.js) 覆盖 A—AC 组实际按钮、弹层、财务重绘、贷款返回、存档恢复、自动续局和结算流程。浏览器探针继续验证保存失败、自动迁移与动画续接，并确认所有手动备份和恢复入口均已移除。具体断言数以本次运行输出为准。

探针会创建、修改和覆盖测试对局。**只在临时副本及独立浏览器配置中运行，不要注入正在玩的页面**。以下 macOS 示例需要已安装 Chrome 与 Python 3；其他平台调整 Chrome 路径即可：

```bash
python3 - <<'PYCODE'
from pathlib import Path
import html, os, re, shutil, subprocess, tempfile
root = Path.cwd()
chrome = os.environ.get('CHROME_TEST_BIN', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
with tempfile.TemporaryDirectory(prefix='cashflow-browser-') as folder:
    tmp = Path(folder)
    for name in ('js', 'css', 'test'):
        shutil.copytree(root / name, tmp / name)
    page = (root / 'index.html').read_text()
    probe = '<script src="test/browser-behavior.js"></script>'
    (tmp / 'index.html').write_text(page.replace('</body>', probe + '</body>'))
    result = subprocess.run([
        chrome, '--headless=new', '--disable-gpu',
        '--allow-file-access-from-files', '--window-size=1440,900',
        '--user-data-dir=' + str(tmp / 'profile'),
        '--virtual-time-budget=60000', '--dump-dom',
        (tmp / 'index.html').as_uri()
    ], capture_output=True, text=True, timeout=120, check=True)
    match = re.search(r'<pre[^>]*id="DIAG"[^>]*>(.*?)</pre>', result.stdout, re.S)
    if not match:
        raise SystemExit('未取得 DIAG，不能判为通过；检查浏览器启动与页面错误')
    report = html.unescape(match.group(1))
    print(report)
    if any(flag in report for flag in ('❌', '⛔', '⚠️')):
        raise SystemExit(1)
PYCODE
```

若本机 Chrome 启动超时，可通过 `CHROME_TEST_BIN` 指定独立的 `chrome-headless-shell` 可执行文件。`DIAG` 缺失、未捕获异常或状态机卡住均不能当作通过；匹配时允许元素附带其他属性。浏览器探针与 Node 回归互补，不能只看页面截图判断交易正确。

## 资源和数值核验

```bash
node tools/version-assets.js --check
node tools/audit-balance.js --out /tmp/cashflow-balance.json
```

修改运行资源后执行 `node tools/version-assets.js`，再检查摘要。标定工具可能改写数据，不应为了运行测试而在工作树中反复放大价格；涉及写入的标定回归使用临时副本。

288 个情景的当前方法、结果与边界见 [游戏平衡核验](../docs/游戏平衡核验.md)，工具说明见 [投资回报标定](../docs/出圈门槛与投资回报标定.md)。功能入口见 [文档索引](../docs/README.md)。
