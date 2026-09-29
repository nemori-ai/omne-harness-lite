# ACK后继来源范围对齐（candidate）

以下表继承已接受前驱的实际消费范围；PF-013升级rev17新增§6.19，其他当时revision按原复核范围保留。2026-09-29，依据 topic README revision 与下列实际引用段落核对。本表只覆盖本契约据以写出承诺的范围，不声称整个产品包已被采用；历史裁决原话、日期和当时 rev 保持。未涉及的产品增量由所属 owner 承接，不扩本批实现。

| 当前精确来源 | 本批复核的实际消费范围 | 结论/边界 |
|---|---|---|
| [PF-001 rev 25](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md) | §6.4 隔离、成本归发起租户 | 显式身份、当前资格和成本原归属保持；工作区/official 定义增量不属于本批消费 |
| [PF-004 rev 20](../../../../product/PF-004-agent-definition-and-assembly/design.md) | §6.6 模型逐请求确定、换模型不重新装配、保留实际生成模型 | 绑定与路由留痕保持；能力绑定/定义热重载规则不由本批裁定 |
| [PF-009 rev 9](../../../../product/PF-009-context-message-types/design.md) | §4 消息、§5.5 到达/账一次、§5.6 中断、§5.7 两种组装、§5.8 工具帧、§6.8/6.9/6.16 | 原七种消息及 partial/delivered 区别保持；MS S-9 明确原模型证据与唯一 persisted 消息的合法派生关系 |
| [PF-010 rev 7](../../../../product/PF-010-context-management-and-assembly/design.md) | 给模型侧两块组装、原消息不擦除及按标注选用 | SystemMessage 不落盘且仅文本保持；本次实际选中表示须核实，原校准不能据派生改写，不定义上下文选择新政策 |
| [PF-011 rev 5](../../../../product/PF-011-off-nominal-handling/design.md) | §5.8 上交只带分类/身份、不复制下层正文，脱敏 | MR 的上交边界保持；不新增补偿或失败分类 |
| [PF-012 rev 21](../../../../product/PF-012-agent-loop-and-run/design.md) | §5.7 先识别执行自身状态再追补、§5.8 模型回复改写/否决、成本两层与§6.17 I-11 | RT S-33 live 成功只读；S-75/MR S-47 合法首次派生；ready/final 一份账、终结后真实迟到按原归属；其他 Agent 状态机外置 |
| [PF-013 rev 17](../../../../product/PF-013-model-profiles-and-invocation/design.md) | §5 模型选择/失败/凭据/转换、§5.13 独立执行及停机、§6 输入/路由保证 | 原绑定、首内容后不重发、实际费用 unknown 保持；Session 生命周期与消费释放分离、ready 持久化，不扩重试政策 |
| [PF-015 rev 20](../../../../product/PF-015-session-lifecycle-and-ownership/design.md) | §6.12 创建租户、第一件恢复与日志投影、§6.19 函数输入及持久化范围 | 原身份与派生投影无独立事实保持；RT 当前访问/恢复责任显式，MS runtime context 内部结构继续不透明 |

R2 交叉规则按 [technical-choices-r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md) 定型为候选；未升级产品包接受状态。具体变更与消费者见 [consumer-impact](consumer-impact.md)。

## 正文实际来源锚点索引

下表由本契约正文现有 design/flows 引用逐项列出；上表结论限这些实际承诺，引用历史 decisions 的当时 rev 不在此重标。

| Topic | 正文实际指向 |
|---|---|
| PF-001 | [成本要能算到发起它的那个租户头上](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| PF-004 | [I-5](../../../../product/PF-004-agent-definition-and-assembly/design.md#61-不变式) · [事后回看不改成当前选的那个](../../../../product/PF-004-agent-definition-and-assembly/design.md#66-模型在每次请求时确定) |
| PF-009 | [PF-009 §5.6](../../../../product/PF-009-context-message-types/design.md#56-流断在半路) · [用户看见了的，会话日志里必须有](../../../../product/PF-009-context-message-types/design.md#69-用户看见了的会话日志里必须有) · [「账只记一次」](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) · [在途状态由运行时持有，失去连续性它就没了](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) |
| PF-010 | [压缩记录](../../../../product/PF-010-context-management-and-assembly/design.md#要求三有压缩记录时边界由压缩记录来定) |
| PF-011 | [PF-011 §5.8](../../../../product/PF-011-off-nominal-handling/design.md#58-上交交的是什么) |
| PF-012 | [必须留下结论](../../../../product/PF-012-agent-loop-and-run/design.md#610-能干预的拓展件必须留下结论) · [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) · [问和答都不进日志](../../../../product/PF-012-agent-loop-and-run/design.md#run-是三样东西的归属单位) · [明细按尝试记、汇总按 Run 算](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) · [PF-012 消息落盘之前的否决](../../../../product/PF-012-agent-loop-and-run/design.md#消息落盘之前的否决按消息是谁产生的分三路) |
| PF-013 | [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#54-三类事实归本层定死其余照状态码) · [同一件事两处登记必然分叉](../../../../product/PF-013-model-profiles-and-invocation/design.md#55-上交交给谁看模型说没说出话) · [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [PF-013 §5.7](../../../../product/PF-013-model-profiles-and-invocation/design.md#57-上交带什么原样带着状态码不翻译它) · [§6.11](../../../../product/PF-013-model-profiles-and-invocation/design.md#611-成因在这个边界上分类不丢进外层按异常形态分) · [§6.12](../../../../product/PF-013-model-profiles-and-invocation/design.md#612-事实判断归本-topic策略归拓展件) · [§6.14](../../../../product/PF-013-model-profiles-and-invocation/design.md#614-上交带的成因是封闭枚举外加一个诚实的兜底状态码另外原样带着) · [PF-013 §6.16](../../../../product/PF-013-model-profiles-and-invocation/design.md#616-错误信息外泄之前要脱敏) · [PF-013 §6.17](../../../../product/PF-013-model-profiles-and-invocation/design.md#617-本-topic-不出现任何时限数值) · [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#停机之后能不能重来只看首-token) · [不是非常态](../../../../product/PF-013-model-profiles-and-invocation/design.md#判据怎么用三个例子) · [已经走到第几家](../../../../product/PF-013-model-profiles-and-invocation/design.md#它看得到什么) · [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#已经开口说话了优先于其余各类) · [§5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#最后一行不再往下细分) · [重试挂件推翻不了](../../../../product/PF-013-model-profiles-and-invocation/design.md#有三件事它改不动) · [PF-013 §4 档案的身份](../../../../product/PF-013-model-profiles-and-invocation/design.md#档案的身份所在范围加路由名) · [PF-013 §4 模型档案](../../../../product/PF-013-model-profiles-and-invocation/design.md#模型档案) · [PF-013 §5.5](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) · [PF-013 §5.4](../../../../product/PF-013-model-profiles-and-invocation/design.md#还有一种没走完它不在这张表里) · [有效模型由两件事决定](../../../../product/PF-013-model-profiles-and-invocation/design.md#选中模型-与-有效模型) · [PF-013 flows §3.2](../../../../product/PF-013-model-profiles-and-invocation/flows.md#32-一次模型调用) |

## 本版ACK实际消费

PF-013 rev17 §6.19：消费方明确确认与真实处分独立、确认后模型副本自动释放、只读权不授确认、旧ref保持小摘要、unknown责任不丢；精确技术关系来自ack-technical-choices.md revision2及ack-post-confirmation-settlement.md候选增补。未复核/未采用产品包的其他增量，不扩完整Session/Run。
