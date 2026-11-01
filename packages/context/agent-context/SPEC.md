# @omne-harness/agent-context 行为规格

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。

本文件现在只写第一步：`agentAccountOutlet` 出站。第二步（`agentRequests`、`agentModelContext`、来源集合登记、会话侧部件）等 K-RQ、K-RC 的形状交付后落字，现在没有实现，也没有条款。

## 范围与依据

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拥有者     | 本包拥有 Agent 账目出站（AG-17）译成 Request Context 账目事实的行为。出站端口 `AgentAccountOutlet` 归 [agent-contract](../../agent/agent-contract/SPEC.md)，服务键与抽象服务归 [agent-cordis-contract](../../agent/agent-cordis-contract/README.md)，收件口与事实形状归 [request-context-contract](../request-context-contract/SPEC.md)，账目投影归 [request-context](../request-context/SPEC.md) |
| 依据       | 设计候选 GATE-859 r2 的 3.4.3、3.7、3.8 与第 11 节，及其决策记录（[#502 评论 6561777147](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561777147)）。装配页的 `agent-account-outlet` 行：必需 `requestContext`、`contextAccountingInbox`。共同集成规则见 [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)                                        |
| 采用范围   | 出站插件、工厂与缺席解析器。账目初始化与账目目标解析延到波 B，Reduce 已确认（[#502 评论 6561732444](https://github.com/nemori-ai/omne-harness-lite/issues/502#issuecomment-6561732444)），见[已知限制](#已知限制)                                                                                                                                                                                 |
| 不属于本包 | 契约成员与 `AccountingInboxProvider` 不改。`AgentAccountHandoff` 没有作用域字段，加字段属于 agent-contract 的公开类型，不在本包                                                                                                                                                                                                                                                                   |

## 结果与不变量

### 账目出站

<a id="outlet"></a>`createAgentAccountOutlet({ inbox, sender, resolveTarget })` 返回 `AgentAccountOutlet`。`deliver({ access, handoff })` 按下列次序处理，每一步失败就停，后面的步骤不执行：

| 步骤    | 条件                                      | 结果                                                                    | 之后的调用                 |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------- |
| 1. 租户 | `handoff.call` 解不出来：格式不合         | `invalid`，`field` 为 `handoff.call`，`reason` 为 `reference-malformed` | 无                         |
| 1. 租户 | `handoff.call` 的租户不是 `access.tenant` | `denied`                                                                | 不调用解析器，不调用收件口 |
| 2. 目标 | 解析器抛出异常                            | `unavailable`，诊断 `scope-resolver-failed`                             | 不调用收件口               |
| 2. 目标 | 解析器答 `null`                           | `unavailable`，诊断 `scope-unresolved`（[ACCT-TARGET](#已知限制)）      | 不调用收件口               |
| 2. 目标 | 解析器给出的目标不属于调用的租户          | `denied`                                                                | 不调用收件口               |
| 3. 投递 | 收件口答复                                | 按名映射，见下                                                          | 恰好一次 `receive`         |
| 3. 投递 | 收件口抛出异常                            | `unknown`。写入可能已经发生，接收方保留账目待办，以同一交接重试         | 无                         |

先核租户，所以别的租户的调用得不到任何关于作用域状态的信息。

<a id="outlet-fact"></a>交给收件口的事实：

| `ReceivedAccountFact` 字段         | 来源                                      |
| ---------------------------------- | ----------------------------------------- |
| `kind`                             | 常量 `account`                            |
| `origin.producer`                  | 常量 `model`                              |
| `origin.sender`                    | 工厂参数 `sender`，插件配置给出的采用身份 |
| `origin.resultVersion`             | `handoff.resultVersion`，原样             |
| `call`                             | 解码 `handoff.call` 得到的租户与调用      |
| `dispatch`、`account`、`committed` | `handoff` 同名字段，原样                  |
| `target`                           | 解析器给出的 `{ tenant, scope }`          |

<a id="outlet-map"></a>收件口结果按名映射：`received`（含 `duplicate`、`superseded`）到 `received`；`denied` 到 `denied`；`conflict` 到 `conflict`；`invalid` 到 `invalid`（`field`、`reason` 原样）；`unknown` 到 `unknown`；`unavailable` 到 `unavailable`（诊断原样）。不新增类别，不把一类改成另一类。

<a id="outlet-nokeep"></a>出站不缓存回执，不吞账目，不重试。重试归接收方（Agent 对 `unknown`、`unavailable` 以同一交接重试）。`received` 不是清理 Journal 条目的依据。

### 账目目标解析器

<a id="target-resolver"></a>解析器是工厂参数，类型是 `AccountTargetResolver`：入参是 `access` 与解码后的调用，出参是目标或 `null`。解析器不从调用或执行的文本猜作用域。`absentAccountTarget` 总是答 `null`。

### 出站插件

<a id="outlet-plugin"></a>`./cordis` 的 `AgentAccountOutletProvider` 继承 `AgentAccountOutletService`，提供 `agentAccountOutlet`。

- 只 `inject` `requestContext` 与 `contextAccountingInbox`。两键由 `request-context` 行在同一 fiber 提供，所以两者同生同灭。任一缺席时插件停在 `PENDING`，不提供键。
- 配置只有 `sender`（采用身份：`owner`、`name`、`revision`、`digest`，都是文本）。不合的配置使加载失败，不回退默认值。
- 本波插件传入 `absentAccountTarget`。真实装配里 `deliver` 总是答 `unavailable('scope-unresolved')`，账目不会被收下（[ACCT-INIT](#已知限制)、[ACCT-TARGET](#已知限制)）。
- 插件的 fiber 结束后，仍被持有的旧引用的 `deliver` 答 `unavailable`，诊断 `outlet-closed`，不调用收件口，不答成功。

## 所有权、失败与生命周期

| 对象                     | 拥有者与寿命                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 出站工厂的返回值         | 无状态。不持有账目、回执或重试计划                                                                                                                                                              |
| 收件口、`requestContext` | `request-context` 行。出站只在构造时取得收件口，不拥有它。收件口的提供者换代时，Cordis 重跑出站插件体                                                                                           |
| 账目的耐久事实           | 结果接收方（Model 一侧）的日志。出站失败、`unavailable` 与 `unknown` 都不丢它                                                                                                                   |
| 账目投影的目标淘汰       | `request-context`，见其 [淘汰（CX-11）](../request-context/SPEC.md#cx-11)。淘汰不确认事实，所以淘汰后的 `receive` 为 `uninitialized`，经出站变成 `unavailable('uninitialized')`，接收方保留待办 |

失败只用端口已有的类别。依赖缺席是 `PENDING`，不是失败；取消不适用，`deliver` 只有一次收件调用，不持有可取消的资源。

## 组合与验证

IC-19 分类（「协议给」不论部署都由契约协议兑现，「装配给」靠同一进程成立）：

| 保证                       | 类别   | 现在靠什么兑现                                    |
| -------------------------- | ------ | ------------------------------------------------- |
| 租户不符零下游调用         | 协议给 | `deliver` 的第一步                                |
| 幂等与冲突检测             | 协议给 | 收件口的键（租户、调用、dispatch、修订）（RQ-14） |
| 窗口占用与收账读同一份状态 | 装配给 | 两键由 `request-context` 行在同一 fiber 提供      |

### 已知限制

| 名称              | 内容                                                                                                                                                                                          | 触发条件（到时重新设计）                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACCT-INIT         | 本波没有成员初始化账目投影。真实装配里出站得不到 `received`，接收方待办累积，恢复时从 `received` 条目重放。这与 IP-CX-11 证据栏「每轮 Model 结果接收时账目出站得 `received`」不同，本波不兑现 | 窗口占用块（CX-12）进入装配，或 Journal 重放进入范围。到时一起回答：谁证明空快照完整，系统恢复授权由谁持有，初始化放在出站插件、`request-context` 行还是作用域创建方 |
| ACCT-TARGET       | 出站不解析账目目标，答 `scope-unresolved`                                                                                                                                                     | 与 ACCT-INIT 同时。候选：K-RQ 加一个按调用身份解析目标的部件（加性）。备选是给 `AgentAccountHandoff` 加字段，那是改 agent-contract 的公开类型，需契约拥有者裁定      |
| ACCT-EVICT-ACTIVE | 仍在使用的目标可能在两次操作之间被淘汰，之后 `usage` 返回 `uninitialized`，直到再次重建。出站不发起重建                                                                                       | 与 ACCT-INIT 同时，设计 `usage` 路径上的重建发起者。见 [request-context 的淘汰后果](../request-context/SPEC.md#cx-11-observable)                                     |

### 持续验证

| 场景                                                                                        | 必须检查的结果                                                                                                                                                                    | 位置                           |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 出站符合性套件（`@omne-harness/agent-contract/testing` 的 `agentAccountOutletConformance`） | 每个用例通过。出站接真实的账目投影，目标已由空重放重建                                                                                                                            | `tests/account-outlet.spec.ts` |
| 缺席解析器                                                                                  | `unavailable('scope-unresolved')`，收件口零调用，两次交付答复相同；把答复改成成功用例变红                                                                                         | 同上                           |
| 租户                                                                                        | 租户不符先答 `denied`，解析器与收件口零调用；缺席解析器下也先答 `denied`；解析器给出别的租户的目标答 `denied`                                                                     | 同上                           |
| 事实字段                                                                                    | 逐项等于上表，解析器收到访问与解码后的调用，恰好问一次                                                                                                                            | 同上                           |
| 结果映射                                                                                    | 八种收件结果各映射到上表；收件口抛出答 `unknown`；解析器抛出答 `scope-resolver-failed`；不缓存、不重试                                                                            | 同上                           |
| 组合                                                                                        | 收账之后 `usage` 为 `actual`；目标未重建时答 `uninitialized`                                                                                                                      | 同上                           |
| 真实 Cordis 4.0.4                                                                           | 缺依赖停在 `PENDING`，提供者换代或撤除后回到 `PENDING`，停止后键消失、旧引用答 `outlet-closed`，不合的配置加载失败；真实装配上 `deliver` 答 `scope-unresolved`，不得是 `received` | `tests/cordis-entry.spec.ts`   |
| 入口                                                                                        | 根入口只导出工厂与缺席解析器，不含 Cordis 值；`./cordis` 只导出插件类                                                                                                             | `tests/public-entry.spec.ts`   |

不覆盖：账目投影在真实装配里的初始化与投递（ACCT-INIT、ACCT-TARGET）；真实 Model 一侧的结果接收方；跨进程行为；两键的提供者以同一 fiber 提供这一事实只由 `request-context-cordis` 的测试证明，本包的测试用它的真实提供者装配，但不能分别证明每个 `inject` 键各自的必要性。
