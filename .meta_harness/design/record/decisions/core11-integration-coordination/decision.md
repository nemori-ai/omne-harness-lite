# D-070 · PR11 整合与技术选择承接

2026-09-27，主线按用户明确“自己设计和架构，交 Sol xhigh 实际编程，再负责验收 review，决定是否接受”的授权，接受[整合候选 B](../../proposals/content-blocks-implementation-seams/core11-integration.md)，候选 SHA256 `0c487a3caea0ee6ea7e13a6324efa09ec48512eaf5b7be0f2d4c23661af57089`。这是技术采用与历史引用消歧，不增加产品政策或契约版本。独立 architecture-reviewer 支持 B；spec-reviewer 指出的 JSON 输入域表达歧义在当前映射与中英文包说明补清，冻结 CB3 不变。具体意见及最终复核追加在来源提案 review。

## 精确身份与取代范围

整合的两侧为本支 `7b755ac65f63208f0362288f5dad40318b109ec3` 与上游 `d4eaf7673bc161bf22f6682385151e080d3323ae`。下表路径均相对 `.meta_harness/design/record/decisions/`，原提交、路径、原编号共同识别历史记录；不再以一个裸编号指向两个决定。

| 来源 | 原路径与编号 | 本次范围 |
| --- | --- | --- |
| 上游 d4eaf767 | `core-formatter-adoption/`，D-067 | 现行 D-067 唯一所指；原文不变 |
| 上游 d4eaf767 | `core-implementation-spec-reconciliation/`，D-068 | 现行 D-068 唯一所指；八个 core 显式采用3；原文不变 |
| 上游 d4eaf767 | `skill-yaml-key-resolution/`，D-069 | 现行 D-069 唯一所指；原文不变 |
| 本支 7b755ac6 | `governance-docker-deployment-adoption/`，合并前本支 D-067 | 由本决定“Docker R4”节承接；旧原文、provider-snapshot 与 PF017 projection/v6 留档 |
| 本支 7b755ac6 | `content-blocks-seams-adoption/`，合并前本支 D-068 | I-B 由本决定“生产者铸号”节承接；N-A 由“当前 CB 提供者”节取代；旧原文、provider-snapshot 与 PF009 projection/v1 留档 |

原记录未被重编号、改写或删除，旧运行也不改标为新包或新契约验收。新导航以本决定具体节为现行依据；精确旧输入与当前映射摘要见 [coordination-snapshot.json](coordination-snapshot.json)。

## Docker R4

承接本支原 Docker 技术采用全部 R4 范围与实施门，包括固定版本、单一 Engine 自动重启、应用排空、宿主维护 timer、路径隔离和停服真实退出核对。原节点快照 SHA256 为 `677bbc4d145c44a8c8b52c0d8aa9de83a3fab120ebd912d7d05b6d07b2b26ff8`，理由、代价与性质仍指[原决定](../governance-docker-deployment-adoption/decision.md)及其快照。当前 docker.md 只更新本协调入口，不以本决定改变停止协议。R5 仍是候选，须独立接受；I1 实验与 I2 spoke 结果不提升为最终 Docker 制品验收。

## 生产者铸号

继续采用原 R2 [铸号责任协调及 pi 数字表示](../../proposals/content-blocks-implementation-seams/design.md#铸号责任协调)的 I-B，原设计 SHA256 `2dde0ba100823fcfa6dc4f763760e0893d42c2a78395059ae0ad6632ff37feda`，完整快照保留在[原 provider-snapshot](../content-blocks-seams-adoption/provider-snapshot.json)。普通新消息、工具侧新块、派生块沿用随机生成器；pi 的 b 加索引与确定性 CallId 例外保留。精确三元组 UTF8/ECMAScript JSON.stringify 编码、无上界整数规范串与生成责任仍沿该 R2，不把上游数字外壳变化改成数值域收窄。当前公开 `jsonNumberSource` 可以承接无损数字读取；等值写法的规范化仍是 pi T-13 待实施义务。

继续限定取代 D-060 M44／D-062 节点的“所有生产者共用生成器”普遍陈述；接收词法与消息／会话唯一性不变。pi 非法 target 入口收口、CallId 登记判重与恢复、D-019 比较门继续保留，不许可完整 pi 入口开工。确定性哈希不能替代会话唯一保证。

## 当前 CB 提供者

整体采用上游 d4eaf767 的 `packages/core/content-blocks` 与真实 core 消费者，不混用两套 LosslessNumber 品牌或拼接同名文件。原 N-A 私有四类数值桥及其额外“非 JSON 值不先于具名拒绝”提供者选择全部退役为历史；原旧实现195项与独立QA只支持原输入，不作为 CB3 验收。

当前入口先复制支持的 JSON 表示（含本模块真正 LosslessNumber／OpaqueJson 的表示恢复），失败先 malformed；成功后才在全树按 `data.content-blocks/v3#S-26` 具名次序判定。普通 getter／toJSON 不求值不等于 Proxy trap 无用户代码。该解释在 realization 与公开说明一致，不变更 CB3 的 JSON 交换域。

采用理由是上游已提供真实多包消费者需要的公开数值代数及精确 Schema 桥；继续旧私有桥须重做接口，双实现又没有独立消费者责任。原选择 N-B 的成本判断不再约束当前提供者。上游已有通用桥与消费者的实际完成范围按各节点及整合测试看待，撤销本支旧“其余 core 一概尚缺数值映射”的阻断概括；不声称每跳写读、持久性、恢复或工具作者 Schema 的完整产品路径已验证。

## 验证与消费界限

整合保留上游 catalog、consumer-impact、354 份冻结资源；本支原319份资源逐件不变。24个外部消费者继续精确采用2，MRR2／TER2不自动迁移。新纯模块公开面不是新的跨进程契约，也不新增 Cordis 原语或存储对象。现行 core 节点的版本3采用由上游 D-068 负责，本决定不替代它。

接受技术整合不等于接受整个里程碑。主线负责整合构建、类型、实际包测试、设计导航和快照一致性；原失败环境与纠正后的运行分别保留。Docker 最终组合、Agent 链路及 Fable 总体评审继续按原计划完成；本决定不替上游验收者签署新的总体交付。
