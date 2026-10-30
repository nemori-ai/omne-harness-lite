# M2 契约骨架

[English](README.md)

## 职责与状态

`@omne-harness/m2-contract-skeleton` 是 M1 首次联合验收（G1）的私有验证应用（CS），也是 M1.5 关闭门 [H3](https://github.com/nemori-ai/omne-harness-lite/issues/783)（CS v2）的证据。它在一个进程内连通 M2 租户路径：创建租户、登录、经会话编解码创建会话、提交第一次请求、Session 把请求交给 Agent、Agent 经 Request Context 组装并调用 Model、Model 把结果推送给宿主接收方、回复写入 Session 日志、从历史读到回复。之后它驱动后续轮次，并探测工具往返、Agent 实例重装配与推理回放。它只使用契约成员的公开导出及其 `./testing` 替身。

路径报告给 H01 至 H13 每一跳一个状态：`verified`、`failed` 或 `gap`。只有十三跳全部 `verified` 时，`fullPath` 才是 `complete`。在采用基线上的状态：H01 至 H08 在替身上全部 `verified`。H09 至 H13 处于 `gap` 状态。路径到达了 H09 至 H12，并记下上游公开入口在哪里使每一跳停下。默认存储不探测 H13。H13 记为具名缺口，其背后的上游事实由单独的测试固定（GAP-SESSION-LOG-TARGETS）。`fullPath` 为 `incomplete`。报告另列下文十个残余缺口，其中五个阻断。按 [H3 裁定](https://github.com/nemori-ai/omne-harness-lite/issues/783#issuecomment-6515275392)，五个阻断残余缺口转 M2（[#784](https://github.com/nemori-ai/omne-harness-lite/issues/784)），仍为阻断。H09 至 H13 的验收在 M2 的首条租户路径上接续。应用没有生产命令或部署角色。[SPEC.md](SPEC.md) 拥有报告行为与残余缺口的详细清单。

## 使用

在仓库根目录通过共享测试槽执行。先构建应用声明的依赖闭包，再运行检查。

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` 选择快速用例，`test:slow` 选择有界超时用例，`test` 运行两层。命令成功但没有选中用例时，不证明本应用行为通过。

`src/index.ts` 导出 `runContractSkeleton(inputs)`。调用方传入路径依赖、Model 义务套件的主体，以及它所接各插件树行的实现声明表。[first-path-doubles.ts](tests/first-path-doubles.ts) 用 `./testing` 替身构建它们，提供两种 Session 存储：`contract-memory`（默认）与 `session-log`（[#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) 的同日志提供者）。函数返回带行与实现声明的逐跳观察、场景结果、残余缺口、结构诊断、`checksPassed` 与 `fullPath`，不写标准输出，也不做耐久写入。

## 契约

路径调用 [public-contract](../../packages/access/public-contract/SPEC.md) 的治理与会话编解码、[identity](../../packages/identity/identity/SPEC.md) 的操作、带注入访问检查的 [Session 契约](../../packages/session/session-contract/SPEC.md)事务端口、[Agent](../../packages/agent/agent/SPEC.md) 运行时与宿主接收方、[Request Context](../../packages/context/request-context-contract/SPEC.md) 的组装，以及 [Model 契约](../../packages/model/model-contract/SPEC.md)的结果推送。Model 义务来自 `@omne-harness/model-contract/conformance`。`src/` 只导入根入口与 `./conformance` 入口，所有 `./testing` 替身都在测试里接入，包括 [session-adapters](../../packages/session/session-adapters/SPEC.md) 的同日志 Journal。替身清单见[公开依赖](SPEC.md#public-dependencies)。

路径证明这些公开入口能为同一租户按次序连通，并证明每一跳交接的值形状。未连通的探测证明它停在哪里：哪一个公开入口拒绝、失败种类是什么，或 Agent 日志显示的 loop 位置。替身不证明持久性、跨进程主体来源、同一事务域的共同提交或真实供应商行为。`checksPassed` 只描述一次调用内的检查。外部测试与 QA 保留各自的结论。

## 设计

[path.ts](src/path.ts) 经调用方传入的端口执行各跳，并为每跳记录安全的证据标签。H01 至 H04 中任一跳未连通时路径停止，其后各跳报告 `not-reached`。H04 之后一并读取 H05 至 H07。然后在主会话上执行 H13、H09 与 H08。探测 H10、H11、H12 只在 H07 连通时运行。每个探测在自己的会话里运行，记下第一处公开拒绝，不在本应用里补造被拒绝的行为。应用拥有两座桥：Agent 消息交接提交到 Session，Agent 请求准备经 Request Context 组装。[path-report.ts](src/path-report.ts) 把观察转成跳点状态，记录每跳经过的插件树行及其实现声明，并保留缺失与重复诊断。

残余缺口写明连通路径不包含的部分。只有阻断残余缺口使跳点保持 `gap` 状态。承接者只列开放的卡。没有开放实现卡的残余缺口写 M2 里程碑卡 [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784)。

| 缺口 | 阻断 | 承接者 | 跳 | 摘要 |
| --- | --- | --- | --- | --- |
| [GAP-SESSION-WIRE](SPEC.md#gap-session-wire) | 否 | [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784) | H03、H04、H08 | 会话编解码在进程内运行。映射线上会话标识与识别登录的服务端接入归 M2。 |
| [GAP-SESSION-COORDINATOR](SPEC.md#gap-session-coordinator) | 否 | [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784) | H04、H07、H09 | 没有 Session 的面、推进适配与 Session 一侧的交接，由本应用排定调用次序。 |
| [GAP-RUN-COMPLETED](SPEC.md#gap-run-completed) | 否 | [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784) | H07 | 本路径上 Session 不能形成 completed 的 Run 终态。 |
| [GAP-AGENT-CONTEXT](SPEC.md#gap-agent-context) | 否 | [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542) | H05 | 没有 Agent 一侧的 Context 适配。Request Context 取得租约后，由本应用的桥固定请求。 |
| [GAP-RECEIVE-SURFACE](SPEC.md#gap-receive-surface) | 否 | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)、[#795](https://github.com/nemori-ai/omne-harness-lite/issues/795) | H06 | H06 经公开 pusher 与宿主接收方连通。Model ACK 在 Session 一侧的记账仍是具名偏离 `MODEL-ACK-ARRIVAL`。 |
| [GAP-SECOND-RUN](SPEC.md#gap-second-run) | 是 | [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784)、[#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) | H09 | Session 以 `run-active` 拒绝第二个 Run，Agent 对 `input.submit` 答 `unavailable`。 |
| [GAP-TOOL-LOOP](SPEC.md#gap-tool-loop) | 是 | [#520](https://github.com/nemori-ai/omne-harness-lite/issues/520)、[#524](https://github.com/nemori-ai/omne-harness-lite/issues/524)、[#525](https://github.com/nemori-ai/omne-harness-lite/issues/525)、[#526](https://github.com/nemori-ai/omne-harness-lite/issues/526)、[#528](https://github.com/nemori-ai/omne-harness-lite/issues/528) | H10 | Agent loop 带着工具调用回复停在 I4，没有发起 Tool 调用。 |
| [GAP-AGENT-REASSEMBLY](SPEC.md#gap-agent-reassembly) | 是 | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)、[#784](https://github.com/nemori-ai/omne-harness-lite/issues/784) | H11 | `quiesce`、`detach` 与 `resume` 返回 `unavailable`。没有公开入口提供 server entry 的观察路径，重装配后观察是否连续无法观察。 |
| [GAP-REASONING-REPLAY](SPEC.md#gap-reasoning-replay) | 是 | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) | H12 | Agent loop 在 M6 持有带推理部件的已接收结果，不交出回复。 |
| [GAP-SESSION-LOG-TARGETS](SPEC.md#gap-session-log-targets) | 是 | [#784](https://github.com/nemori-ai/omne-harness-lite/issues/784) | H13 | 同日志提供者不暴露 Model 接收目标，无法在 Session 日志上建立接收方。 |

## 配置与运行

需要 Node.js 24 或更高版本，以及仓库冻结的工作区依赖。没有环境配置、网络服务、凭据、数据库或后台进程。路径对每一次 Agent 回复最多等待 2000 个事件循环轮次。Model 义务套件每个操作的界限是 500 ms，测试设置 15 秒的外层上限。

## 验证

[测试](tests)在替身上运行连通路径。它们检查第一轮每跳已连通、会话编解码承载了创建、发送与读历史三种消息、Request Context 取得并释放了 Model 准备租约、历史中的回复带有 Model 回复文本、其他租户读不到该会话。它们检查 Session 访问检查为 `undefined` 时 H03 保持 pending、不构建 Session 存储，检查拒绝时停在 H03。它们还检查：identity 拒绝登录、Session 登录门没有登录确认、Session 证据桥不可用、Session 拒绝交接、Model 不结算、历史没有回复时，路径都停在负责的那一跳。它们检查 H09 至 H13 停在哪里、哪一个公开入口拒绝，并检查证据只在路径观察到拒绝时才写出拒绝。它们固定阻断残余缺口背后的上游事实：Agent 的面尚未实现、同日志提供者没有接收目标、脚本 Model 生产者拒绝密封的 `reasoning_state` 部件。它们还检查 `session-log` 存储连通 H13 并停在 H06，以及 Tool 替身在 [#791](https://github.com/nemori-ai/omne-harness-lite/issues/791) 的替身里执行一次文件读、一次文件写和一条命令。报告测试检查跳点、场景与义务的缺失、重复和未执行，以及每一行的实现声明。报告不含凭据、登录证明、消息正文或供应商原始错误。

这些测试在受控输入下证明连通。它们不证明耐久的 identity 提供者、耐久的 Session 存储、真实 Model 供应商、HTTP 接入或完整的 M2 部署。独立验收归仓库交付流程。

## 维护

在退出之前，本应用由 integration 交付线维护。供给契约变化时，消费已采用的变化，并更新 [SPEC.md](SPEC.md) 的跳点与缺口各节。按[退出规则](SPEC.md#maintenance-and-exit)，首条租户路径的应用成员经插件树通过同样的验收（H01 至 H13）后，删除本成员。执行日志与评审证据留在任务 `tmp/`。
