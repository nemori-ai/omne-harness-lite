# 工具执行运行时

**承载[工具执行](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)的那一项能力**：
接一批已放行的调用、依次起执行者、收场、落账、把结果落成对的那种消息；前台／后台与等待是两个维度，中断不是失败；
绑会话不绑 agent runtime；停机不重来——恢复时找不到的执行一律落「失败·异常中断」。
**本能力的提供者是一条 fiber，即宿主协程——名字里的「运行时」指它**（统一语言冲突 C-31：叫 runtime 的必须是协程）。

> **「工具执行运行时」没有词条**：词表把单次执行自己的运行时并进了[工具执行](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-tool-execution--工具执行--tool-execution)，
> 承载全部执行、产品正文里「在工具执行运行时里找得到／找不到」的这一项能力本身没有词条。目录名是施工账本定的契约身份。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.tool-execution-runtime, 1)`
- **状态**：`candidate`（2026-09-23 起草），**未经独立评审、未接受、未冻结**
- **catalog 映射**：已登记为 `candidate`；`family=capabilities`、`topic=tool-execution-runtime`、
  `contract_path=spec/capabilities/tool-execution-runtime/v1/contract.md`；`resources` 含契约、`examples.md`、`formal/` 下的模型、八个配置与入口页；
  依赖十三项（`data.content-blocks`、`data.call-accounts`、`data.messages`、`data.tool-definition`、`data.loop-extension`、`data.offer-expiry`、`data.identity-values`、
  `data.arrival-events`、`capability.stream-assembly`、`capability.tool-admission`、`capability.asset-registry`、`capability.loop-extension-runner`、`capability.mcp-bridge`，均 v1；
  后六项在 2026-09-24 整批对齐补登），clauses 取自[契约 S-4](v1/contract.md#s-4-依赖方向与被消费的面)
- **formal-tasks 映射**：两个任务——`tool-execution-runtime-v1-execution`（`Execution.tla` ＋ `Execution.cfg`，安全性质）与
  `tool-execution-runtime-v1-execution-progress`（同一模型 ＋ `ExecutionProgress.cfg`，进展性质）。
  **六个有效性核对配置不登记**：它们期望失败，与该清单的语义相反。执行结果在[验证入口](verification.md)
- **提供者/装配映射**：尚无

## 准入核对

| 准入问题 | 答 |
|---|---|
| 语义拥有者 | 本契约。执行记录的状态与收场、结果落成哪种消息的判断、恢复扫描——**它们被「同一次执行的收场只写一次、与它的消息不得只成一半」绑在一起**：正常交回、中断、转后台、等待到点、取消运行、归档、恢复几路竞争同一行 |
| 为什么是 capability 而不是 data | 每个操作都有前置、失败集合与提交点；它还持有活体与在途状态这类不持久的东西 |
| 为什么不并进 agent loop | 工具执行的宿主是会话，agent runtime 的宿主是运行；回收 agent runtime 不影响任何一次执行（PF-006 §6.5），取消语义也不同（PF-012 §6.13）——放在一起就得在一个服务里维护两套寿命 |
| 为什么不并进注册表或放行判断 | 注册表拥有「这次尝试里有什么、可不可用」，放行判断拥有「准不准」；本契约拥有「准了之后怎么跑、怎么收场」。三者失效事件不同 |
| 精确依赖 | 见上；**依赖单向**：本契约 → 数据契约与并行的能力契约；agent loop、`BkgJobs()`、归档流程、插队处置、卸载判定读本契约 |
| 接受状态 | 未接受 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [v1 契约](v1/contract.md) |
| 十四个操作各自的前置、提交点、失败集合与缺席默认 | [契约第四节](v1/contract.md#四操作) |
| 六种收场各从哪来、落什么；占位原因怎么取 | [契约 S-9](v1/contract.md#s-9-两个收场)、[S-10](v1/contract.md#s-10-占位原因) |
| 结果落成 ToolMessage 还是提醒；与执行记录怎样不只成一半 | [契约 S-19](v1/contract.md#s-19-送达) |
| 停机之后怎么恢复、为什么不重来 | [契约 S-20](v1/contract.md#s-20-恢复扫描与停机不重来) |
| 单机给的哪些保证，跨进程后要由协议重新兑现 | [契约 S-46](v1/contract.md#s-46-装配给的保证-vs-协议须给的保证) |
| 走通的路径与每个失败值的反例 | [examples](v1/examples.md) |
| 哪些条款映射到模型、模型盖不到什么 | [formal 入口](v1/formal/README.md) |
| 哪些证据义务已触发、两源已知失败情形对到哪条义务 | [验证与覆盖](verification.md) |
| 哪些事还没人裁 | [契约第十二节](v1/contract.md#十二已知缺口) |

## 版本包

`v1/` 含 `contract.md`、`examples.md` 与 `formal/`。**不建 Schema**：线上形状归把这些操作送过进程边界的那份 composition，
值类型引用 `data.content-blocks`、`data.call-accounts`、`data.messages`、`data.tool-definition`、`data.loop-extension`、`data.offer-expiry`、`data.identity-values`。
**建 `formal/`**：六路收场竞争同一行、送达与记录跨停机不只成一半、恢复扫描与在跑的执行交错，每条保护都配了一个去掉它就被反驳的核对。

本入口不代替唯一 catalog；推荐版本不会自动升级消费者。返回[能力契约](../README.md)。
