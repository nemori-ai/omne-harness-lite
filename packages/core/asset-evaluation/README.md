# asset-evaluation

纯求值函数与工作区承载清单值的读入。公开入口是 `@omne-harness-lite/asset-evaluation`，不依赖 Cordis 服务、会话存储或文件读取。

采用依据与当前范围在[实现节点](../../../.meta_harness/design/realization/packages/core/asset-evaluation/README.md)、[技术映射](../../../.meta_harness/design/realization/packages/core/asset-evaluation/design.md)和 [capability.asset-evaluation v3](../../../.meta_harness/design/spec/capabilities/asset-evaluation/v3/contract.md)。D-068 显式采用 AM3、TD3、Loop3，Skill、MCP、Slash 仍采用正文2；四步求值规则及公开输入范围保持原承诺。规格的接受与冻结状态归[身份清单](../../../.meta_harness/design/registry/README.md)。实现交付与最终接受按节点分层状态判断。

`evaluate` 的输入为 `NonConnectorEvaluationInput`；完整 `EvaluationInput` 仍用于输入指纹及未来完整供给边界。`defaultBodyContracts` 装配真实 tool、loop-extension、skill-package、mcp-endpoint、slash-command 五个公开正文端口。`readWorkspaceCarrier` 消费完整清单域，由调用方读取文件、解析正文并补 `since`；本包只处理传入的值。

公开构件还有 `classifyPermissionAssignment`、`boundOf`、`pickWithinBound` 和 `evaluationInputFingerprint`。输出由本次调用持有并冻结，调用方输入保持原有所有权。各条义务和证据入口归[节点 verification](../../../.meta_harness/design/realization/packages/core/asset-evaluation/verification.md)；本目录的测试检验本包实现，不替代装配前提或外部供应的证明。

在 workspace 根运行：

```sh
pnpm --filter @omne-harness-lite/asset-evaluation run build
pnpm --filter @omne-harness-lite/asset-evaluation run typecheck
pnpm --filter @omne-harness-lite/asset-evaluation run test
```
