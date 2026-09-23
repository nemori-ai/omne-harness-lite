# 模型请求运行时

**会话据点上，一个会话怎样选模型、每一次[模型调用](../../../ubiquitous_language/terms/execution-and-outcome.md#ul-model-call--一次模型调用--model-call)怎样发出、怎样收场、停机之后怎样对账。**
它拥有选中模型的切换、有效模型的四步求值、合法目标集合与展示列表、一次调用的状态与每一次发出、三类事实的发出守卫、两个耐久锚点、中断、恢复对账、成因分类、凭据现取与脱敏，以及系统自带的默认重试件。

**它不拥有**档案与凭据（`capability.model-profile-directory` v1，中心侧）、响应体与账的形状（`data.model-response`、`data.call-accounts`）、拓展件的执行（`capability.loop-extension-runner`）、模态投影的判定函数（`capability.modality-projection`）、上下文组装与会话日志本身。
**上交条目、中断提醒、回复消息的写入归 loop**——本契约把带回复的响应体交回，由调用方与消息同一提交写下。

- **契约坐标**：`(omne-harness-lite-design-2026-09-15, capability.model-request-runtime, 1)`
- **状态**：`candidate`（2026-09-23 起草）——未经独立评审、未接受、未冻结
- **catalog 映射**：已登记为 candidate。`family=capabilities`、`topic=model-request-runtime`、
  `contract_path=spec/capabilities/model-request-runtime/v1/contract.md`；`resources` 另含 `v1/examples.md`、`v1/formal/README.md`、`v1/formal/Invocation.tla` 与十份配置；
  依赖十项，消费 clauses 取自[契约 S-4 的被消费面表](v1/contract.md#s-4-依赖方向与被消费的面)。
  **四份并行契约与块 A 作用域求值尚不在 catalog**，本契约对它们的消费只按名引用（[G-14](v1/contract.md#十二已知缺口)）
- **formal-tasks 映射**：两个任务——`model-request-runtime-v1-invocation`（`Invocation.cfg`）与 `model-request-runtime-v1-invocation-no-fallback`（`Invocation_NoFallback.cfg`），本机 TLC 退出 0、无反例；
  八份否定与可达性配置**按设计不登记**（它们预期出反例），执行结果在[验证入口](verification.md)
- **提供者／装配映射**：尚无

## 准入核对

- **独立责任**：一次调用的发出、收场与恢复住在据点、跟着 agent runtime 生灭；它的变化原因（上游行为、传输、首 token 与停机规则）与中心侧档案目录不同，消费者也不同（loop、拓展件、交付面的切换与停止）。
- **稳定身份与版本**：首版 v1，候选。
- **依赖**：两份已接受（`data.identity-values`、`data.offer-expiry`），其余候选——候选依赖改动时本契约须重核；[G-1](v1/contract.md#十二已知缺口) 列出了本契约要求 `data.model-response` 与 `data.call-accounts` 对齐的各项。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 本候选版本精确承诺什么 | [版本化契约](v1/contract.md) |
| 各条路径走通是什么样、每个失败值的反例 | [规范实例](v1/examples.md) |
| 行为模型表达了什么、每条断言对应哪条条款、吸收了什么 | [formal 入口](v1/formal/README.md) |
| 哪些条款有怎样的证据，哪些仍缺 | [验证与覆盖](verification.md) |
| 还有哪些没定、等谁裁 | [已知缺口](v1/contract.md#十二已知缺口) |

## 版本包

`v1/` 是候选版本目录。发布（接受并冻结）之后规范正文、实例与模型不可原地覆盖，修改发布新版本；执行记录留在版本目录外（[验证入口](verification.md)）。
