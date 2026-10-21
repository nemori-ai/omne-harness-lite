# Agent 通用实现的行为边界

根入口导出 `createAgentRuntime`、通用评估器 `agentEvaluator`、它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema` 与构造类型。工厂的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。工厂的创建校验、四个面的访问守卫与 `invoke` 的 Loop 正常路径骨架已实现，其他操作本体、Loop 节点的精确语义与失败分支尚未实现，实际支持范围见[成员 README](README_ZH.md#支持范围)。运行契约的接受范围以 [公共 SPEC](../agent-contract/SPEC.md) 为准。

## 兑现责任

实现须完整兑现公共操作与失败语义，不在此复制公共状态机或结果形状。配置与注入能力聚合由 [构造入口](docs/public-api.md) 拥有，机制及尚缺设计见 [内部架构](docs/architecture/README.md)。

## 资源与替换

通过显式依赖取得外部能力，不导入 Cordis 或固定本地提供者。业务身份作为操作输入，不以 Context 或插件配置替代。替换和退出保留未完成责任，不能把依赖丢失或 disposer 完成报告成业务成功。

## 验证

当前入口测试只检查骨架为空。未来实现需按公共 SPEC 验证行为，并用替代提供者验证构造依赖、失败与资源交还。
