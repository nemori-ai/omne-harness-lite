# M2 契约骨架

[English](README.md)

## 职责与状态

`@omne-harness/m2-contract-skeleton` 是 M1 首次联合验收（G1）的私有验证应用（CS）。它在一个进程内连通 M2 首条租户路径：创建租户、登录、创建会话、提交第一次请求、Session 把请求交给 Agent、Agent 经 Request Context 组装并调用 Model、回复写入 Session 日志、从历史读到回复。它只使用契约成员的公开导出及其 `./testing` 替身。

路径报告把 H01 至 H08 每一跳给成 `verified`、`failed` 或 `gap`。只有八跳全部 `verified` 时，`fullPath` 才是 `complete`。本版在替身上八跳全部 `verified`，`fullPath` 为 `complete`。报告另列下文五个非阻断的残余缺口。应用没有生产命令或部署角色。[SPEC.md](SPEC.md) 拥有报告行为与详细缺口清单。

## 使用

在仓库根目录通过共享测试槽执行。先构建应用声明的依赖闭包，再运行检查。

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` 选择快速用例，`test:slow` 选择有界超时用例，`test` 运行两层。命令成功但没有选中用例时，不证明本应用行为通过。

`src/index.ts` 导出 `runContractSkeleton(inputs)`。调用方传入路径依赖与 Model 义务套件的主体。[first-path-doubles.ts](tests/first-path-doubles.ts) 用 `./testing` 替身构建它们。函数返回逐跳观察、场景结果、残余缺口、结构诊断、`checksPassed` 与 `fullPath`，不写标准输出，也不做耐久写入。

## 契约

路径调用 [public-contract](../../packages/access/public-contract/SPEC.md) 的治理编解码、[identity](../../packages/identity/identity/SPEC.md) 的操作、[Session 契约](../../packages/session/session-contract/SPEC.md)的事务端口、[Agent](../../packages/agent/agent/SPEC.md) 运行时与 [Request Context](../../packages/context/request-context-contract/SPEC.md) 的组装。Model 义务来自 `@omne-harness/model-contract/conformance`。`src/` 只导入根入口与 `./conformance` 入口，所有 `./testing` 替身都在测试里接入。替身清单见[公开依赖](SPEC.md#public-dependencies)。

路径证明这些公开入口能为同一租户按次序连通，并证明每一跳交接的值形状。替身不证明持久性、跨进程主体来源、同一事务域的共同提交或真实供应商行为。`checksPassed` 只描述一次调用内的检查；外部测试与 QA 保留各自的结论。

## 设计

[path.ts](src/path.ts) 经调用方传入的端口执行各跳，并为每跳记录安全的证据标签。某一跳失败时路径停止，其后各跳报告 `not-reached`。应用拥有两座桥：Agent 消息交接提交到 Session，Agent 请求准备经 Request Context 组装。[path-report.ts](src/path-report.ts) 把观察转成跳点状态，并保留缺失与重复诊断。

残余缺口写明连通路径不包含的部分。只有阻断缺口使跳点保持 `gap`：

| 缺口 | 阻断 | 承接者 | 摘要 |
| --- | --- | --- | --- |
| [GAP-SESSION-WIRE](SPEC.md#gap-session-wire) | 否 | [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685) | 没有会话线上编解码，路径直接调用 Session 端口。 |
| [GAP-SESSION-COORDINATOR](SPEC.md#gap-session-coordinator) | 否 | [#536](https://github.com/nemori-ai/omne-harness-lite/issues/536)、[#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | 没有 Session 的面、推进适配与 Session 一侧的交接，由本应用排定调用次序。 |
| [GAP-RUN-COMPLETED](SPEC.md#gap-run-completed) | 否 | [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | 本路径上 Session 不能形成 completed 的 Run 终态。 |
| [GAP-AGENT-CONTEXT](SPEC.md#gap-agent-context) | 否 | [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542)、[#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) | 没有 Agent 一侧的 Context 适配；Request Context 取得租约后，由本应用的桥固定请求。 |
| [GAP-RECEIVE-SURFACE](SPEC.md#gap-receive-surface) | 否 | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502)、[#673](https://github.com/nemori-ai/omne-harness-lite/issues/673) | 测试装配已接公开 Model pusher、独立接收方和共同提交内存 Journal；H06 最终接收与账目接线验收仍在本次迁移之外。 |

## 配置与运行

需要 Node.js 24 或更高版本，以及仓库冻结的工作区依赖。没有环境配置、网络服务、凭据、数据库或后台进程。路径最多等待 2000 个事件循环轮次取得 Agent 回复。Model 义务套件每个操作的界限是 500 ms，测试设置 15 秒的外层上限。

## 验证

[测试](tests)在替身上运行连通路径。它们检查每跳已连通、Request Context 取得并释放了 Model 准备租约、历史中的回复带有 Model 回复文本、其他租户读不到该会话。它们还检查：identity 拒绝登录、Session 登录门没有登录确认、Session 证据桥不可用、Model 不结算、历史没有回复时，路径都停在负责的那一跳。报告测试检查跳点、场景与义务的缺失、重复和未执行。报告不含凭据、登录证明、消息正文或供应商原始错误。

这些测试在受控输入下证明连通。它们不证明耐久的 identity 提供者、耐久的 Session 存储、真实 Model 供应商、HTTP 接入或完整的 M2 部署。独立验收归仓库交付流程。

## 维护

在退出之前，本应用由 integration 交付线维护。供给契约变化时，消费已采用的变化，并更新 [SPEC.md](SPEC.md) 的跳点与缺口各节。按[退出规则](SPEC.md#maintenance-and-exit)，首条租户路径的应用成员经插件树通过同样的验收后，删除本成员。执行日志与评审证据留在任务 `tmp/`。
