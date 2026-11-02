# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用仓库的 IC 约定，不在本文件复制。

## 集成入口

`./cordis` 导出两个插件、X-3 的键名常量 `MODEL_PREPARATION_RESOURCES` 与材料容量初值 `DEFAULT_MATERIAL_CAPACITY`。

`AgentAccountOutletProvider` 继承 `agent-cordis-contract` 的 `AgentAccountOutletService`，提供键 `agentAccountOutlet`。

| 项       | 内容                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `inject` | `requestContext`、`contextAccountingInbox`。两键由 `request-context` 行在同一 fiber 提供（装配页 `agent-account-outlet` 行） |
| 配置     | `sender`：采用身份。不合的配置使加载失败（标准 schema），不回退默认值                                                        |
| 提供     | `agentAccountOutlet`                                                                                                         |
| 事件     | 无                                                                                                                           |

`AgentContextProvider` 继承 `RequestPreparationService`，提供 `agentRequests`，并在同一 fiber 里提供 `agentModelContext`。

| 项       | 内容                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inject` | `requestContext`、`contextHolderSources`（K-RQ）、`runtimeContextReaderEligibility`（K-RC）、`runtimeContext`（`{ consumer: 'model' }`）、`modelRequestPreparation`、`modelPreparationResources`（X-3，按键名） |
| 配置     | `owner`（采用身份）、`resultCapacity`（三项十进制文本）、可选的 `materials`（正安全整数，默认 256）。不合的配置使加载失败                                                                                       |
| 提供     | `agentRequests`、`agentModelContext`                                                                                                                                                                            |
| 事件     | 无                                                                                                                                                                                                              |

IC-19 的装配给与协议给分类写在 SPEC 的[组合与验证](../SPEC.md#组合与验证)。

## 生命周期与清理

出站插件：

- 启动：两键都在时构造，取得收件口，本波传缺席解析器。任一缺席时停在 `PENDING`，不提供键。
- 撤除：fiber 结束时键消失，`closed` 置真。仍被持有的旧引用答 `unavailable(outlet-closed)`。出站没有资源，不需要 `settled`。
- 收件口的提供者换代：Cordis 重跑插件体，新实例取得新的收件口。
- 已经交给收件口的事实不因撤除而撤回；收件口自己的结果由账目投影与接收方负责。

上下文插件：

- 启动：六键都在时构造。创建材料库，在本 fiber 上取一次 K-RQ 租借（IC-13：租借是借用方 fiber 的 effect），交出的结算函数是 `agentRequests` 的 `close()`。任一键缺席时停在 `PENDING`，两个键都不提供，不登记半套。
- 运行：第一次调用某个目标时，经 `requestContext.register` 登记来源集合。登记是本 fiber 的 effect。
- 撤除：fiber 结束时两个键消失。租借结束，持有者拉取结算：`close()` 撤除全部登记，等各代结算。持有者在结算结束之后才关读口。材料库结束全部读者并清空。仍被持有的旧引用答 `unavailable(agent-context-closed)`。
- 任一依赖的提供者换代：Cordis 重跑插件体，新实例取新的租借，新调用重新登记。材料在新实例里为空，下一次读取做完整读取。
- X-3 的 Cordis 定义还没有交付。插件按键名注入，值按 model-contract 的 `ModelPreparationResources` 使用（[X3-KEY](../SPEC.md#已知限制)）。
