# W1 公开包消费者与依赖图验证（2026-09-26）

本 run 登记已发生的 worker 多轮运行和主调度独立 HUB 运行。HUB 构建、类型检查、测试均退出 0：外层 **12/12、零跳过**，其中公开消费者／类型／依赖图 10 项，SQLite 套件有效性自测 2 项。公开消费者另起真实 Node，固定 **14 个子场景全部通过**；错误预期控制仅 `w1.kernel.outcome-public` 断言失败，其余 13 项通过。子场景不叠加到 Vitest 的 12 项统计。

这里只记录五包本轮公开入口和依赖边界的具体覆盖；具名类型全表、三个 opaque 品牌互赋负例尚待后续实际运行。用户最终接受、租户准入、所有 JSON 跳点、实际时钟和提交路径都没有因本 run 闭合。已封存的 foundation 与 model-profile run 未改写。

## 实际执行与输入

| 执行 | 输入与状态 | 实际命令与结果 | 原始结果 |
|---|---|---|---|
| HUB 环境准备 | cwd `/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery`，起点 `e0b6c212f6209583997f9edd3316205e718c7947`（合入工具 `5140574b`）；lock 当时未提交，实际内容由 `dc431fdf68a45309a26ded3548b53c52c341a5f1` 恢复 | `pnpm install --ignore-scripts`，退出 0；不是 frozen 安装 | [install log](raw/hub/tmp__core-delivery__w1-public-consumers-install.log) |
| HUB 独立集成 | 同 cwd；Node v24.18.0、pnpm 10.28.1、TypeScript 6.0.3、Vitest 4.1.11、Cordis 4.0.4、Kysely 0.29.6、SQLite 3.53.1。测试 05:50:29 启动，5.67 秒。期间 `ddc03da3` 只改 asset-model／tool 的设计与验证文档；五产品包、storage-sql、core-verification 与本次根配置无变化 | 依次 `pnpm --filter @omne-harness-lite/core-verification... run build`（7 个成员）、`pnpm --filter @omne-harness-lite/core-verification run typecheck`、`pnpm --filter @omne-harness-lite/core-verification run test`；外层独立 exec 退出 0，4 文件、12 项通过、无类型错误。运行结束后 `dc431fdf` 提交同 lock 内容 | [完整 HUB log](raw/hub/tmp__core-delivery__w1-public-consumers-hub.log) |
| Worker 最终公开覆盖 | 初始基线 `19864896`；最后公开测试记录 HEAD `f1b5e7e2`，工具改动当时尚未提交，之后由 `5140574bab69a109df60141fc62a893216fbf9ab` 保存。consumer JS SHA `2a2a6d414f7bd1b909da9762619f9cd7d01e9eeaffabe66865111890dcda7c1c` 与 HUB 实际执行字节相同 | build／typecheck 通过；最终公开部分 10/10、零跳过；早期 `test-results-final.json` 的总 10 项采用较早 10 子场景版本，不能当成最终 14 子场景加 storage 的 12 项 | [metadata](raw/worker/tmp__w1-public-consumers__metadata.json)、[最终公开 JSON](raw/worker/tmp__w1-public-consumers__test-results-public-closure.json)、[最终公开 log](raw/worker/tmp__w1-public-consumers__test-public-closure.log) |

五产品的 worker 源码最后路径提交分别为 kernel `1a229204`、identity `efe73eb5`、offer `5b3014f8`、storage `a6188ce9`、content `44b84525`。HUB 的 offer 已含 `3a8b2117` 日历解析修正；HUB 输入逐文件绑定到合入树，不能把 worker 的旧 offer 输入替换到 HUB 运行上。本轮公开测试没有穷尽 formatter／历法边界，后续 parser 包测试不在本 run 预先登记。

采用 `data.identity-values`／`data.offer-expiry`／`data.content-blocks` v1；kernel 与 storage 没有独立契约，按各已接受 design 与 D-025／D-026 读取。三份实际 Schema 副本、规范原件与 frozen hash 相同。输入的原路径、采用 revision、SHA 与平坦快照对应见 [audit.json](audit.json)。lock 的实际 SHA 也在那里逐字节登记；不声称 HEAD clean。

## 正常运行与有效性

正常 Node 从五包 root exports 解析到 `dist/index.js`；执行代码只消费 root 与批准的 `./testing`／`./schema` 入口，不使用 src alias 或 Vitest 产品转换。运行时还断言未经导出的 `src/index.ts` 子路径被 Node 拒绝。三份公开 Schema hash 由外层与 frozen 表独立核对。[正常 report](raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)、[execution](raw/hub/tmp__w1-public-consumers__normal-afySRP__execution.json) 保存真实 root 解析、脚本 hash、cwd、退出码；`runtime-cases.tsv` 仅为导航，原 JSON 不改写。

错误预期只把 Outcome 期望值 42 改成 0，产品代码不变。外层核固定 14 IDs 全部出现、仅目标失败、具体 `AssertionError` 同时含 42 与 0、进程退出 1、无信号／超时；它检出一个代表性的错误 oracle，不证明任意产品错误都会红。[完整 negative report](raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)、[execution](raw/hub/tmp__w1-public-consumers__negative-WagReR__execution.json) 与 stdout／stderr 分别保留。

SQLite 两子进程复用真实公开 `openStorage` 与同一一致性套件，临时文件 WAL、单主机；[正常 19/19](raw/hub/tmp__core-verification__enabled-QbVPiM__report.json)，[关闭实际写连接外键并读回确认后 17 通过、仅 C-11/C-12 断言失败](raw/hub/tmp__core-verification__disabled-kS68SN__report.json)。失败是期望 `ReferenceViolation` 却收到 undefined，不能用普通非零退出代替目标失败。fixture／execution 保存输入、SQLite 版本、信号与超时；父测试删除私有数据库，留下原结果。未运行 PostgreSQL、断电或跨进程持久协议。

## 失败原文与可恢复范围

Worker 原始依赖检查 **9 通过、1 失败**完整保留：[JSON](raw/worker/tmp__w1-public-consumers__test-results-dependencies.json)、[log](raw/worker/tmp__w1-public-consumers__test-dependencies.log)。基线映射对整个 storage 节点都写 Kysely types，但批准的 conformance 套件实际需要运行时 `sql`。调度明确采用 `e6c9d66a7468d79ad010c240e30a620e40afb5ad` 映射澄清后，才修正批准子路径的期望；根协议期待没有放宽，[当时精确 design 快照](raw/worker/tmp__w1-public-consumers__storage-design-e6c9d66a.md.original.txt)原样保存。依赖图检查覆盖 root source／声明／JS 与 testing／conformance 子路径，不等于一般 resolver 或整个仓库依赖隔离证明。

首次 typecheck 的 report record 收窄错误也保留在 [原 log](raw/worker/tmp__w1-public-consumers__typecheck-first.log)，但当时完整源码快照未保存；只登记失败观察，不声称可完全重放。其他多轮原结果全部保存，早期 10 子场景版本按当时范围读取。

主树保存的 **185 份 worker 原件**逐个匹配原 `SHA256SUMS.json`，外部 root verification 另存；归档使用平坦文件名，原路径由 audit 映射，不修改任何原文。worker 140 条配置／源码登记 hash 均与 `5140574b` 的 git 字节匹配；120 条构建产物登记 hash 中 117 条匹配保留的 HUB 构建字节。旧 offer 的 `time.js`、`time.js.map`、`time.d.ts.map` 三个构建原件未保留，不能用已修正 HUB 字节冒充，准确旧 hash 和缺失范围保留在 audit。HUB 真实执行的五 root、consumer JS 与 kernel／storage 图输入按当次 report hash 再核；合入源码／配置另外保存，可以恢复本次命令输入，不把未记录的中间构建 hash 伪装为运行时采集。

[SHA256.json](SHA256.json) 绑定本 run 全部原文、输入与导航；交付前分别核工作树字节、git blob 与干净 git archive，不以 ignored 文件留在本树作为交付。对应条款、test ID 与范围见 [coverage.md](coverage.md)。有限测试与类型反例分别陈述，不构成形式证明或最终接受。
