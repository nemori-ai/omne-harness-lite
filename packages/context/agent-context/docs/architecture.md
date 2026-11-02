# 内部架构

本文件说明本包怎样兑现 [SPEC.md](../SPEC.md)：包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由。它引用组级与系统级约束，不另立公共规则。

## 模块与依赖

| 模块                    | 内容                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `src/account-outlet.ts` | 出站工厂、目标解析器类型、缺席解析器                                                          |
| `src/records.ts`        | 规范文本与摘要、记录键的铸造与读取                                                            |
| `src/materials.ts`      | 材料库：读取记录、最近读取与计划三张有界表                                                    |
| `src/staging.ts`        | 暂存表与组读口                                                                                |
| `src/translate.ts`      | 端口与 Request Context 之间的纯翻译：第五组、失败映射、第六组与步骤结果的读口类型及第一波实现 |
| `src/model-context.ts`  | `agentModelContext` 的工厂                                                                    |
| `src/requests.ts`       | `agentRequests` 的工厂与登记表                                                                |
| `src/cordis.ts`         | 两个插件：`AgentAccountOutletProvider` 与 `AgentContextProvider`。根入口不导入 Cordis         |

| 依赖                                                         | 用途                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `agent-contract`                                             | 三个出口的端口、Agent 的 `Failure` 与证据类型                                                                 |
| `agent-cordis-contract/cordis`（仅绑定）                     | 三个抽象服务                                                                                                  |
| `request-context-contract`                                   | 组装调用、来源集合、组读口、结局与失败的类型；收件口与账目事实                                                |
| `request-context-cordis-contract`                            | K-RQ 部件的类型；`./cordis` 的键 `requestContext`、`contextAccountingInbox`、`contextHolderSources`（仅绑定） |
| `request-context`（仅绑定）                                  | 转换件结果读口 `createAbsentConversionResults`（CX-10）                                                       |
| `runtime-context-contract`                                   | 读者面、读取结果、资格交接的类型                                                                              |
| `runtime-context-cordis-contract/cordis`（仅绑定）           | 键 `runtimeContext`、`runtimeContextReaderEligibility`                                                        |
| `model-contract`、`model-cordis-contract/cordis`             | 准备资源与固定请求的类型、调用引用的解码；键 `modelRequestPreparation`（仅绑定）                              |
| `message`、`json-text`、`operation-result`、`legal-identity` | 条目引用、JSON 值、结果构造、租户文本与相等                                                                   |

这个包是 Context 组里唯一导入 Agent 契约的成员。适配器放在任何一个现有 Context 成员里，都会让该成员依赖 Agent 契约，违反[组架构](../../docs/architecture.md)里 Context 契约不依赖 agent-contract 的方向。本包不导入 session-adapters：会话侧部件经 K-RQ 的键到达。

## 状态与资源

| 状态      | 拥有者                 | 寿命                                       |
| --------- | ---------------------- | ------------------------------------------ |
| 材料库    | 上下文插件的实例       | 插件 fiber 结束时结束全部读者并清空        |
| 暂存表    | `agentRequests` 的工厂 | 每项只在一次操作内存在，`finally` 删除     |
| 登记表    | `agentRequests` 的工厂 | `close()` 撤除全部句柄。登记失败的项不留下 |
| K-RQ 租借 | 上下文插件的 fiber     | fiber 结束即结束，持有者随后拉取结算       |

## 关键机制与理由

- 先核租户再解析目标。调用的租户不是访问的租户时，不问解析器、不问收件口，别的租户得不到作用域状态的任何信息。第二步同理：本包证据的记录键带租户，在任何下游调用之前比对。
- 解析器作为工厂参数。账目属于哪个目标，`AgentAccountHandoff` 没有字段回答，调用身份里也没有作用域。本波没有提供者，所以插件传缺席解析器，`deliver` 答 `unavailable('scope-unresolved')`。这是显式的缺口，不伪造成功，也不从文本猜作用域（[ACCT-TARGET](../SPEC.md#已知限制)）。
- 出站无状态。重试、待办与回执的保管在接收方；出站缓存回执会让一次成功的答复遮住后来的收件口状态。
- 收件口抛出时答 `unknown`，不答 `unavailable`：写入可能已经发生，`unknown` 才表达这一点。
- 出站插件同时 `inject` `requestContext` 与 `contextAccountingInbox`。后者就是出站用的收件口，前者表达「同一 `request-context` 行」的装配事实，使出站与窗口占用读同一份状态。
- 两个第二步的服务在一个插件里。读取交出的证据要在准备时解析到同一实例的材料，所以两者共用一个材料库，同生同灭。
- 记录键自描述，材料不耐久。重启后材料没有了，但 `read` 仍能从键里读出 execution，判断已采用的覆盖属于哪个 execution。块材料的值不进入证据，不写进 Agent 的 checkpoint。
- 暂存表代替「每次调用登记一次」。Request Context 按目标登记来源集合，组读口按调用读值。本包在一次操作内把值放进暂存表，组读口按候选身份取，所以一个登记服务全部调用，调用的输入不进入登记。
- 令牌带登记代次。同一组值在新登记下得到新令牌，Request Context 的缓存不会把上一代的派生结果当成这一代的。
- 登记懒执行，失败不记下。本包收到调用才知道目标，第一次调用时登记。授权或冲突的答复可能随时间改变，所以下一次调用再登记，不缓存失败。
- 结算按拉取进行。插件取租借时交出结算函数，持有者在租借结束时调用它。结算函数撤除全部登记并等各代结算，持有者因此在借用方的操作结束之后才关读口。
- 第六组与步骤结果以读口参数进入工厂。本波没有它们的来源契约，插件传第一波的实现，测试可以注入读口来走完压缩路径（[COMPACTION-PATH](../SPEC.md#已知限制)）。

## 验证与维护

验证资源在 `tests/`，场景见 [SPEC 的持续验证](../SPEC.md#持续验证)。依赖键、端口形状或字段对应变化时，同步插件的 `inject`、SPEC 的映射表与 `tests/`。X-3 的键交付时，把 `MODEL_PREPARATION_RESOURCES` 换成 model-cordis-contract 导出的键常量（[X3-KEY](../SPEC.md#已知限制)）。
