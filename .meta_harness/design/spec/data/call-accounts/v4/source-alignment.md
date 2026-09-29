# ACK后继来源范围对齐（candidate）

以下表继承已接受前驱的实际消费范围；PF-013升级rev17新增§6.19，其他当时revision按原复核范围保留。2026-09-29，依据 topic README revision 与下列实际引用段落核对。本表只覆盖本契约据以写出承诺的范围，不声称整个产品包已被采用；历史裁决原话、日期和当时 rev 保持。未涉及的产品增量由所属 owner 承接，不扩本批实现。

| 当前精确来源 | 本批复核的实际消费范围 | 结论/边界 |
|---|---|---|
| [PF-000 rev 1](../../../../product/PF-000-occurrences-and-record-entries/design.md) | §5.5 条目上的租户/寿命宿主 | CA S-3/S-25 保持；无新条目壳政策 |
| [PF-001 rev 25](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md) | §6.4 隔离、成本归发起租户 | 显式身份、当前资格和成本原归属保持；工作区/official 定义增量不属于本批消费 |
| [PF-002 rev 32](../../../../product/PF-002-assets-settings-and-permissions/design.md) | MCP 凭据：租户层持有、组织无凭据 | CA S-38 仍仅记录已用凭据归属，不实现 OAuth/权限求值 |
| [PF-006 rev 23](../../../../product/PF-006-tools-and-skills/design.md) | §5.4 工具执行账、§5.5 六种收场、前后台及工具结果引用 | CA 工具账值与 MS 工具消息原规则保持；句柄释放不取消执行不由消息/账值新增控制语义，完整 ToolRuntime 外置 |
| [PF-009 rev 9](../../../../product/PF-009-context-message-types/design.md) | §4 消息、§5.5 到达/账一次、§5.6 中断、§5.7 两种组装、§5.8 工具帧、§6.8/6.9/6.16 | 原七种消息及 partial/delivered 区别保持；MS S-9 明确原模型证据与唯一 persisted 消息的合法派生关系 |
| [PF-012 rev 21](../../../../product/PF-012-agent-loop-and-run/design.md) | §5.7 先识别执行自身状态再追补、§5.8 模型回复改写/否决、成本两层与§6.17 I-11 | RT S-33 live 成功只读；S-75/MR S-47 合法首次派生；ready/final 一份账、终结后真实迟到按原归属；其他 Agent 状态机外置 |
| [PF-013 rev 17](../../../../product/PF-013-model-profiles-and-invocation/design.md) | §5 模型选择/失败/凭据/转换、§5.13 独立执行及停机、§6 输入/路由保证 | 原绑定、首内容后不重发、实际费用 unknown 保持；Session 生命周期与消费释放分离、ready 持久化，不扩重试政策 |
| [PF-015 rev 20](../../../../product/PF-015-session-lifecycle-and-ownership/design.md) | §6.12 创建租户、第一件恢复与日志投影、§6.19 函数输入及持久化范围 | 原身份与派生投影无独立事实保持；RT 当前访问/恢复责任显式，MS runtime context 内部结构继续不透明 |

R2 交叉规则按 [technical-choices-r4](../../../../record/proposals/model-runtime-reference-lifecycle/technical-choices-r4.md) 定型为候选；未升级产品包接受状态。具体变更与消费者见 [consumer-impact](consumer-impact.md)。

## 正文实际来源锚点索引

下表由本契约正文现有 design/flows 引用逐项列出；上表结论限这些实际承诺，引用历史 decisions 的当时 rev 不在此重标。

| Topic | 正文实际指向 |
|---|---|
| PF-000 | [无条件带租户身份](../../../../product/PF-000-occurrences-and-record-entries/design.md#55-挂在每条条目上的字段) |
| PF-001 | [成本按租户归属](../../../../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离) |
| PF-002 | [PF-002 rev 18](../../../../product/PF-002-assets-settings-and-permissions/design.md#mcp-凭据一份持有一份静态的或经-oauth-取得的) |
| PF-006 | [PF-006 §5.4](../../../../product/PF-006-tools-and-skills/design.md#每一次执行都留一份账) |
| PF-009 | [PF-009 §6.16](../../../../product/PF-009-context-message-types/design.md#616-砍了要说不许默默丢) · [PF-009 §5.5](../../../../product/PF-009-context-message-types/design.md#到达的过程有它自己的语法) · [对模型的回复与对工具的帧是同一条](../../../../product/PF-009-context-message-types/design.md#帧多了要节流规则就是-616-那一条) · [就是它那条 `ToolInternalMessage` 的到达增量](../../../../product/PF-009-context-message-types/design.md#执行帧就是这条消息的到达增量) · [PF-009 §9.2](../../../../product/PF-009-context-message-types/design.md#收尾之前拼到一半的那份是在途状态不是日志不是消息) |
| PF-012 | [PF-012 §6.16](../../../../product/PF-012-agent-loop-and-run/design.md#616-日志里至少要有这几种-run-相关的条目) · [PF-012 §6.17 I-11](../../../../product/PF-012-agent-loop-and-run/design.md#617-run-这一层的七条不变式) · [PF-012 成本两层](../../../../product/PF-012-agent-loop-and-run/design.md#成本两层缺哪一层都会算错) |
| PF-013 | [PF-013 §5.13](../../../../product/PF-013-model-profiles-and-invocation/design.md#513-模型请求的运行时可以被单独控制而它停了看首-token) · [PF-013 §5.6](../../../../product/PF-013-model-profiles-and-invocation/design.md#56-凭据挂在范围上不挂在档案上) · [PF-013 §6.2](../../../../product/PF-013-model-profiles-and-invocation/design.md#62-凭据挂在范围上档案自己不存) · [试过又失败的那几次是留痕](../../../../product/PF-013-model-profiles-and-invocation/design.md#试过又失败的那几次留痕不进方程) |

## 本版ACK实际消费

PF-013 rev17 §6.19：消费方明确确认与真实处分独立、确认后模型副本自动释放、只读权不授确认、旧ref保持小摘要、unknown责任不丢；精确技术关系来自ack-technical-choices.md revision2及ack-post-confirmation-settlement.md候选增补。未复核/未采用产品包的其他增量，不扩完整Session/Run。
