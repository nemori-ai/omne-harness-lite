# D-068：core 规格一致性技术修订范围

状态：技术修订范围已由主调度采用（2026-09-26）；精确八版资源尚未接受与冻结，candidate 完成后须独立 spec-reviewer。依据：用户明确“除了最后总体交付验收要人，其他的可以自行验收（让一个主调度规划者来验收）”，已授权 Implement the plan。源 [固定版本一致性研究](../../../../research/core-spec-conformance-2026-09-26/README.md)、[D060 N32](../mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 与 [实际反例／只读核查](../../evidence/2026-09-26-core-spec-reconciliation/README.md)。此处不代签用户最后总体门，也不把实施反例改写成既有版本已符合。

## 已定表示与范围

保持 N32：非法模型名字不解析参数，封口原样记为完整、`unparseable:true`、`rawArguments` 的调用，由真正工具执行运行时不执行、即刻 failed。N32 在该分支取代较早 M30 的拒增量说法；不改变其它 M30 结论。CB2 的 S12／Schema 与该选择冲突，新 CB3 仅在这一个未解析分支允许 AR BlockHead 原始非空 string 的 tool；正常 arguments 分支仍是 ModelToolName，ModelToolName 全局定义／注册／查找／执行约束保持原字节，不改名、不补值、不将非法调用当可执行。

采用八份 v3 候选：CB、Messages、MR、Loop、TD 六份有表示域／错误结果／规范示例或精确采用变化；AM、AE 两份显式采用新正文端口，避免 AM2 pin2 却仅供应3资源。这不是 D066 行政迁移或“全部无语义变化”。CB S12 形状例外、TD 指定拒绝变化及 SA §5两示例修正必须在差异表直说。

SA 新版保留第25/26行输入，仅把期望改 head_modality_mismatch，依据表示在先；contract P4 和 formal/README P4 不再将两行当索引错误证据，原第4/5行仍承担。模型执行内容与行为不因这两项改变，但新模型资源／配置与现有证据仍须准确标版本，不能重标旧运行。

保持既有2：AR、CA、MP、Skill、MCP、Slash、Connector；identity1、默认OE2及公开OE1 seam。公开旧Schema资源保留原字节及$id，不能以新版内容冒充2。同名业务函数以当前采用承诺为准，不建立旧产品行为兼容层。AR2 保留需取得完整拒绝等同性的实际反例对照；其余保留条款不触达新增分支，实际资源闭包仍要重核。Connector 仅冻结编译资源，不实施其正文提供者。

## 消费者与接受边界

推荐／接受新版本不自动升级任何消费者。主调度仅在独立审阅后发布这八份，再显式升级相应八个当前 core 提供者、矩阵与证据。仍 pin2 的外部运行时（尤其 TER2、MRR2、工具放行与 runner）在迁移清单记 affected、未迁移；不修改其冻结2，不声称其已实现或 N32 完整执行链已闭合。该阶段仍只交 core 包及用户追加两个util，外部 runtime 的真实执行与持久责任沿原 outside-stage IDs。

完整旧输入、所有旧运行及签收不改；本次候选未审完前仅暂停依赖冲突的两个示例／非法名字封口分支，其他实施继续。
