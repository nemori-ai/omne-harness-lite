# Agent 通用实现的行为边界

根入口导出 `createAgentRuntime`、通用评估器 `agentEvaluator`、它写入的 checkpoint 的 schema 采用 `agentCheckpointSchema` 与构造类型。工厂的设计已由[技术接受与产品采用决定](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204)接受。工厂的创建校验、四个面的访问守卫与 `invoke` 的 Loop 正常路径骨架已实现，I0 输入批与 I1 请求准备、不可用读取的 W0 保存、真实 cannot-fit 的 F1 出口已实现。F1 新建候选从注入的 AgentClock.now 取时；失败保留原准备与续点，不写候选；同一已形成候选重试不再次取时。其他操作本体及剩余 Loop 节点的精确语义与失败分支尚未实现，实际支持范围见[成员 README](README_ZH.md#支持范围)。运行契约的接受范围以 [公共 SPEC](../agent-contract/SPEC.md) 为准。

## 兑现责任

实现须完整兑现公共操作与失败语义，不在此复制公共状态机或结果形状。配置与注入能力聚合由 [构造入口](docs/public-api.md) 拥有，机制及尚缺设计见 [内部架构](docs/architecture/README.md)。

## 资源与替换

通过显式依赖取得外部能力，不导入 Cordis 或固定本地提供者。业务身份作为操作输入，不以 Context 或插件配置替代。替换和退出保留未完成责任，不能把依赖丢失或 disposer 完成报告成业务成功。

## 验证

当前测试核对构造、访问守卫、正常路径、输入承接、请求准备、原操作认回与一次等待保存。测试使用脚本化 Model 与非耐久内存 Journal，不证明真实提供者或完整恢复。needs-compaction 按 #513 revision 2 保存原结果并返回 unsupported，压缩路径与相应 F1 结果留给 4.5。精确范围与限制见成员 README 与 tests/README。
