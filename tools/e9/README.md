# E9 长会话记录工具

本工具为 #979 r2 的 E9 设施保存原始记录、导出离线曲线，并比较完整中位数窗口。采用 `perf-baseline.md` §4.4、§5 和波 2 线包成果 A。它是独立 Node 工具，不新增 workspace 依赖。

```sh
node tools/e9/cli.mjs run --root <检出绝对路径> --out <新归档目录> [--threshold 1.5]
node tools/e9/cli.mjs compare --before <前次归档> --after <本次归档>
node tools/e9/cli.mjs selftest --out tmp/e9-selftest-<本次名字>
node --test tools/e9/*.test.mjs
```

Node 要求沿项目 `engines.node`，至少 24。工具没有编译与独立类型检查入口。运行输出目录必须新建，已有归档拒绝覆盖。

`run` 通过目标检出的 `scripts/with-test-slot.mjs` 持有运行名额。包装进程有 120 秒时限，产品探针有 60 秒时限，普通命令有 30 秒时限。超时会杀本次子进程树。Windows 使用 `taskkill /PID /T /F`。POSIX 使用独立进程组。原始退出码、超时及清理结果保留在进程记录中。

当前 `run` 是等待产品能力的探针。缺少应用 `dist/bin.js` 时记录缺构建等件。有构建时经真实 `serve`、真实 SQLite、公开 CLI 走注册、登录与建会话。它复用目标检出 `tools/joint-a/support.mjs` 的纯 `operatorLayer` 配置工厂，不修改联调脚本。状态文件在归档的 `product-state/`，CLI 登录状态在 `cli-home/`，应把整个归档保留在本机任务证据区。过程文件不是可公开分享的性能报告。

固定延迟模型/工具的公开安装映射、实际执行计数及 round-complete 观察尚未获准。当前探针不发输入、不调用真实模型或工具，不把命令接纳当作完成轮次。构建缺失与产品能力缺失分别记录，不能以合成运行替换真实链路。

## 记录与判定

归档有 `summary.json`、`rounds.jsonl`、`curves.svg` 与 `curves.html`。产品探针另写 `processes.json`。曲线无需网络，点的悬浮文本写出轮次、段名和绝对毫秒值。缺测不画点，原因保留在 JSONL。

每轮的 `round` 从 1 连续编号，`logEntries` 为实际累计日志条数。`endToEnd`、`ownOverhead`、四个 `stages` 及 `fsync` 用两种形状表达：

```json
{ "state": "measured", "value": 12.5, "unit": "ms", "source": "实际观察来源" }
```

```json
{ "state": "unmeasured", "reason": "实际缺测原因" }
```

`stages` 的键为 `sessionIO`、`projectionInterpretation`、`requestAssembly`、`agentProgression`。fsync 单位为 `count`。毫秒必须有限且非负，次数与累计条数不得用估计替代。`driveRounds` 接收提供一轮完整观察的异步函数，最多驱动 200 轮，达到 10000 条后不再启动下一轮。该入口当前只有合成设施测试，真实产品适配仍等件。

中位数门只使用第 11 至 30 轮、第 181 至 200 轮的 `ownOverhead`。后窗中位数除以前窗，结果不超过阈值时该门通过。初值为 1.5，来源为 R2-D1 第 5 条。参数必须有限且为正数。缺轮、缺测、前窗中位数为零或比值超出数值范围时等件，不输出 NaN 或 null 伪值。重复轮号、错误单位和非法测量是输入错误。

中位数门的 `pass` 只表示这一门通过。DP1 的四段与 fsync 观察、DP2 的逐段增长规则尚未批准，所以 E9 总结论当前只会是 `blocked` 或 `fail`。合成自检明确标记 `synthetic`，不能据此给产品性能结论。

`compare` 重算摘要并核对原始记录。它检查工作负载、平台及 OS 版本、Node 版本、核数和持有名额状态，并要求两份完整的实测中位数窗口。SHA 可以不同，比较结果列出两端完整 SHA。比较范围只覆盖自有开销中位数，不覆盖尚未批准的四段与 fsync。不同取数方法、延迟定义或运行环境须反映在工作负载元数据中。

命令退出码为通过或合成自检通过 `0`、已发现失败或输入档案损坏 `1`、命令参数错误 `2`、等件或不可比 `3`。中位数失败优先于等件。

## 维护边界

DP1、DP2 只在任务 tmp 留候选，由父会话安排独立评审并报 Reduce。新方法获准后再接事件采集、实际外部等待排除与逐段负控。本目录不写产品埋点、不改 E9 阈值、不把 E9 加入准入。
