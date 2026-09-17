# 来源、确认与变化

| 可恢复输入 | 确认与迁入范围 | 对应正文定位 | 尚未确认的解释 |
|---|---|---|---|
| `docs/requirements/product/agent/PF-004-subagent-delegation-and-supervision.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`；SHA-256 `6c2724ea26903563ac225a285540a0b4f4981fbaecf475202257ab913d500579`；`# PF-004：Sub-agent 派发、协作与监督` | 保持源文件中已确认条款、显式边界和未决项；本次仅改变知识归属与链接表达 | [requirements.md](requirements.md)：`PF-004.C1`、`PF-004.C2`、`PF-004.C3`、`PF-004.C4`、`PF-004.C5`、`PF-004.C6`、`PF-004.C7`、`PF-004.C8`、`PF-004.C9`、`PF-004.C10`、`PF-004.C11` | 正文列出的待澄清、待设计和未采用范围继续保持原状态 |
| 当前用户明确输入（2026-09-16）；上游 `omne-next/omne_harness` @ `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5` 的 [ADR-007](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-007-external-agent-harness-integration.md) 与 [ADR-008 §2.7](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-008-agent-dispatch-and-instance-lifecycle-model.md) | 继承 `third_party_harness_agent` 的外部 target / continuation actor 语义及显式可接受派发关系；用户确认本项目以 ACP 统一控制外部 harness（含已协商的 remote control）。上游 host shell/CLI 载体是其实现选择，不迁入本项目。 | [requirements.md](requirements.md#第三方-harness-agent)：`PF-004.C12` | 外部 target 登记、授权、会话关联、恢复、远程访问安全、能力映射、provider/assembly 与验证仍待专项设计；ACP 不等于已协商这些能力。 |

## 本轮变化

| 新基线 | 变化 | 受影响消费者 | 仍待闭合 |
|---|---|---|---|
| `omne-harness-lite-design-2026-09-15` | 等价整理为自包含 topic；身份和条款不变，没有接受新政策 | 能力覆盖、精确规格、提供者和装配的后续拥有者 | 由各纵线提交条款级覆盖及引用映射，并由集成阶段核对 |
| `omne-harness-lite-design-2026-09-15` + 2026-09-16 用户输入 | 新增 `PF-004.C12`：第三方 Harness Agent 的外部性、显式关系与 ACP-only 控制约束；不把上游 shell/CLI 实现选择当作本项目设计 | PF-004 覆盖分析、外部 target/ACP provider、授权与监督组合、远程访问边界 | 从 C12 到能力、语言无关契约、provider、assembly 和验证的逐条覆盖；不能仅凭一个 ACP adapter 宣称闭合 |

若后续发现语义差异，必须回到有权接受者；本记录不能把迁移评审升级成新需求确认。
