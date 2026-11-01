# Cordis 集成

本文件说明本包的 Cordis 集成：适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任。绑定只从 `src/cordis.ts` 导出。共同集成规则引用仓库的 IC 约定，不在本文件复制。

## 集成入口

`./cordis` 导出 `AgentAccountOutletProvider`，继承 `agent-cordis-contract` 的 `AgentAccountOutletService`，提供键 `agentAccountOutlet`。

| 项       | 内容                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `inject` | `requestContext`、`contextAccountingInbox`。两键由 `request-context` 行在同一 fiber 提供（装配页 `agent-account-outlet` 行） |
| 配置     | `sender`：采用身份。不合的配置使加载失败（标准 schema），不回退默认值                                                        |
| 提供     | `agentAccountOutlet`                                                                                                         |
| 事件     | 无                                                                                                                           |

IC-19 的装配给与协议给分类写在 SPEC 的[组合与验证](../SPEC.md#组合与验证)。

## 生命周期与清理

- 启动：两键都在时构造，取得收件口，本波传缺席解析器。任一缺席时停在 `PENDING`，不提供键。
- 撤除：fiber 结束时键消失，`closed` 置真。仍被持有的旧引用答 `unavailable(outlet-closed)`。出站没有资源，不需要 `settled`。
- 收件口的提供者换代：Cordis 重跑插件体，新实例取得新的收件口。
- 已经交给收件口的事实不因撤除而撤回；收件口自己的结果由账目投影与接收方负责。
