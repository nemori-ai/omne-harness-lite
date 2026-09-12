---
kind: research
id: R-subagent-requirement-sources
scope: PF-004 完整继承授权下的 omne-next sub-agent 要求、关联约束与来源差异
---

# Sub-agent 要求的继承来源与范围

[PF-004 正文](../requirements/product/agent/PF-004-subagent-delegation-and-supervision.md) · [研究索引](README.md)

2026-09-12 用户明确完整继承 `omne-next/omne_harness` 的相关全部要求。
本次核对该仓库干净检出的提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`。
所有下列来源固定该提交；文中 current / committed-future 是来源接受范围，
不表示本项目或原系统已经实现、验证或交付。确认依据归 PF-004，此页拥有来源
映射和观察记录，不另行批准设计。

## 核心要求的完整继承

这四份是完整产品要求范围，不是可选参考摘要。Statement、Acceptance、有效
Amendment 及适用边界一起读取；旧条款遇有效修订按修订范围解释。实现现状表和
delivery 状态保持证据身份，不作为功能范围裁剪依据。

| 来源要求 | 当时的接受范围 | PF-004 对应 |
|---|---|---|
| [授权派发与结果回收][delegation] | Accepted · current，2026-07-31；全文产品条款、三种关系、权限继承及 AC-1～9 | C1～C5：合法目标、独立 child、耐久身份、前后台回收、实时权限上限、结构化并发和明确拒绝 |
| [Owner 查看子树与终止后代][oversight] | Accepted · current，2026-07-31；Statement、观察控制边界及 AC-1～7 | C6：根会话目录、完整嵌套树、状态/事件/报告、任意后代终止、稳定真实结果和授权审计 |
| [定时 handoff 与 master 结果回流][scheduled] | Accepted · committed-future，2026-08-04；全部产品条款、AC-1～8 与 2026-08-11 对齐说明 | C7：耐久计划、目标版本、到点重查、唯一工作、重叠策略、结果新触发与人类控制 |
| [Agent 自建定时派发与分级同意][authoring] | Accepted · committed-future，2026-08-11；全部产品条款、AC-1～12 与 2026-08-27 amendment / AC-13 | C8：命令级授权、会话/持续范围、读取/修改/取消、owner 监督、撤权阻塞、recurrence 全集、未来工作上限及草稿转正 |

核心条款共有 37 个源 AC（9 + 7 + 8 + 13）。此计数用于核对来源覆盖，不是
37 个测试已经通过，也不替代正文中的非 AC 条款与补充。

## 已批准业务补充的核对

核心文件引用的 [ADR-055][adr55] 还保存明确的业务裁决。以下可无歧义映射到
sub-agent 产品行为的补充随完整继承登记；旧类名、事件总线、边界上下文、表、
Python 工具基类和 wire 字段保持原系统设计身份。

[ADR-008][adr8] §2.2～2.6 补充 `delegate` / `spawn` 均可前后台执行，以及
`spawn` 的一次性上下文 seed、之后独立追加的行为（C2）。
[ADR-072][adr72] 的 2026-08-03 amendment 明确跨轮查询、消息、撤回及后代读
沿同一发起会话保持，不能被“当前这张派发单”的临时锚点误拒绝（C3）。

| 章节 / 修订 | 继承的产品含义 | 对应 |
|---|---|---|
| §2.2、2026-08-05 capacity amendment | 可配置的并发子数、树深、累计派发总数；服从部署与租户容量层级 | C5、C9 |
| §2.10、2026-07-30 目录 pull amendment | 发起能力显式声明，官方 master 模板默认提供；目标可接受的关系另行声明；目录 push 与 pull 并存 | C1 |
| 2026-07-28 回流业务流程与 pending message；2026-07-30 三种派发报告要求 | 完整任务和报告预期送达；master 自行判断报告，可查子树事实或在合法 delegate 关系补充消息；完成通知同时考虑生命周期与未处理消息 | C1～C3 |
| 2026-07-29 read_state tail-first amendment | 默认从最近页开始，页内因果正序，可显式正向审计；游标不可混用方向；读前验证严格子树权限 | C3、C4 |
| 2026-07-30 目录分页 amendment | 分页、总数/剩余量、下一页提示；按已声明派发类型过滤，多类型为 any-of，先过滤后分页，非法类型及变更过滤器后复用游标明确拒绝；不自动排序推荐目标 | C1 |

## 关联要求的适用部分

“全部相关要求”还包括下列要求在 sub-agent 场景中的义务。这不是把每份相邻
能力的全部业务场景都并进 PF-004；它们有各自的主题，后续独立登记时应迁移
正文拥有关系并保留本项引用。以下列出的章节范围随本轮授权继承，不降为可选建议。

| 来源 | 本次关联范围与源接受状态 | 对应 |
|---|---|---|
| [受治理能力发现与调用][official] | Accepted · current；acting logical Agent、live admission、OHC-AC-12～14 中 sub-agent 实时权限、恢复重算与审计部分 | C1、C3、C4 |
| [设备能力使用授权][device] | Accepted · current；dispatch-scoped delegated authority 例外及其持续授权边界 | C4 |
| [Session sandbox 生命周期][sandbox] | Accepted · current；Outcome、sub-agent relation：child 独立申请，不共享或转移 sandbox / 凭据租约 | C4 |
| [设备授权与使用历史][device-history] | Accepted · current；Statement、AC-3/4 中实际 child、委托 lineage 和历史授权依据的显示 | C4、C6 |
| [容量层级与过载安全][capacity] | Accepted · current；Hierarchical quota、工作类别、过载保护、AC-5 中派发计数、继承与恢复连续性 | C5、C9 |
| [计量资源与支出预算][budget] | Accepted · committed-future；Metering、Admission 与 AC-5～7 中 master 因果树归因、child 不逃逸预算及三类门分别判定 | C9 |
| [同节点 worker 与在飞工作接续][takeover] | Accepted · current；“副作用、lineage 与清理边界”中父子关系、join obligation 和实时委托权限在恢复后保持 | C3～C5 |
| [Session/Run 控制][run-control] | Accepted · current；控制传播范围、AC-5 及 2026-09-09 amendment：脱离的后代工作与当前 Run 的工具调用区别对待 | C5、C6；与 PF-003 的边界 |
| [Blueprint 组合、激活与 readiness][blueprint] | Accepted · current；sub-agent 所适用的 Blueprint 组合和生命周期、更新/回滚、权限、幂等与引用影响 | C1、C10 |
| [Agent 资产与自定义 Agent 管理旅程][asset-journey] | Accepted · current；定义/运行实例及正式 sub-agent role 区分、生命周期影响与不自动授予派发权限 | C10 |
| [会话 Blueprint 版本接续][version] | Accepted · committed-future；Immutable child and lineage、Permission and execution isolation 中版本 lineage 与派发区别、已受理工作快照和每个 child 独立演进 | C3、C10 |
| [默认 Agent 选择][default-agent] | Accepted · current；既有 master/sub-agent reference 和 session 不随默认值重绑 | C10 |
| [根用户会话目录与生命周期][session-directory] | Accepted · current；目录范围和 AC-4 中 sub-agent 不进入顶层列表 | C6 |
| [人类请求、耐久等待与因果接续][hitl] | Accepted · current；各 sub-agent/Run 可独立等待、owner 作答和因果接续；2026-09-08 amendment 的多个请求并存、独立定位/结算/恢复 | C11；正文现由 [PF-005](../requirements/product/agent/PF-005-agent-initiated-human-input-and-approval.md) 拥有 |
| [工具执行状态][tool-standing] | Accepted · committed-future；Scope 中派发调用的状态与 child 自己的工具调用归属不同 | C11；PF-003 拥有通用工具观察要求 |
| [定时结果发布与主题归档][publication] | Accepted · committed-future；定时 sub-agent 结果的 audience/attention/archive、原始报告与 master 交付物分层、回流及发布/归档真实结果 | C7、C11 |
| [资产候选的隔离评价][evaluation] | Accepted · committed-future；Producer cannot own the judge、AC-1/2：自派 child 属 producer 控制范围，不能充当独立 evaluator 或修改其控制面 | C11 |
| [独立演进批准与安全激活][promotion] | Accepted · committed-future；producer 自派 sub-agent 不获得 promotion authority，执行中的 sub-agent 调用不热换定义 | C10、C11 |
| [Harness 受治理自演化约束][self-evolution] | Accepted · committed-future；independent authority 和同一 master lineage 的控制/写权限边界 | C11 |

## 来源差异与未决范围

- **人类控制按后续明确范围继承。** ADR-055 §2.3 的早期说法涵盖暂停、恢复
  及全部人类干预回流；2026-07-30 ADR-072 §2.1 明确只提供终止，排除执行过程
  干预，2026-07-31 核心 human oversight requirement 再确认读取与终止，并把
  pause/resume、消息注入与指令修改列为未批准扩展。PF-004.C6 按这个后续明确
  产品范围继承，旧 ADR 的较宽表述保留为历史差异，不能反向覆盖当前范围。
- **目录旧文存在滞后。** [Advertisement 契约][advertisement] 仍有“无 filter /
  无分页”的旧描述，ADR-055 后续修订明确取代该句。本次按取代范围登记分页
  与类型过滤；选型权仍属于 master。目录分页不意味着 human 完整树也采用相同
  分页或深度参数。
- **人类属主与 agent 世系授权不能混用。** ADR-072 的 2026-08-27 amendment
  为没有 caller order 的人类公开调用增加真实属主检查，不能伪造 agent 祖先锚点；
  agent 侧仍须验证其合法后代范围。源核心要求以根会话 owner 及完整树描述产品
  范围，后续设计须对齐这一范围与公开入口的属主判断，不能照抄早期“仅一道门”
  的实现建议，也不能据此放开跨 owner 或租户访问。
- **晚到结果的历史空白已有窄范围要求。** Scheduled handoff requirement 已确认
  terminal result 必须成为原 master 的新 trigger；不能沿旧 ADR 的开放问题
  把此能力留为未确认。它也不把所有普通 handoff 都改成定时计划。
- **草稿修订与等待数量读取最新补充。** 2026-08-27 允许 Agent 自行修订/取消
  自己的草稿，已激活计划保持原确认门；2026-09-08 已取消单 Run 仅一个人类
  blocking request 的旧限制。不能只复制文件开头的早期表述。
- **未接受或来源之外的扩展。** [Delegate inbox 消费轮次提案][inbox-proposal]
  的候选设计、第三方 harness 的独立集成方案、旧数据库和传输选择不自动接受。
  来源已有的精确产品政策与其实现形态应分别映射；若需改变已确认政策，须明确
  记录需求变更，不能以“本项目重做设计”为由无声删除。

## 核对方法与证据边界

从 requirements 能力索引及 capability-map 出发，检索 capabilities、quality、
constraints 与 intake 中的 `sub-agent` / `subagent` / `sub_agent`、中文同义词
及 `delegate` / `handoff` / `spawn` / `dispatch`，再沿核心要求追到 ADR-008、
ADR-055、ADR-072、dispatch invariants、advertisement 和相关接口说明。
检索匹配不直接等于纳入：仅举例、排除项、能力族标签和未接受 intake 与具有
实际产品义务的正文分开核对。源码和测试路径只作来源中的实现线索，本轮未运行
原系统，也未独立重验其交付声称。

本次对本页链接的源文件做 Git blob 与检出内容的逐字节一致性核对，固定链接用于
复查来源条款；Git 提交身份用于定位内容，日期不作为可信时间戳。
后续发现遗漏的已授权要求应补充映射，不因本页清单规模有限而视为排除；新增
上游承诺的持续继承政策仍归 [SYS-CONTINUITY](../requirements/system/omne-next-continuity.md)。

[delegation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-authorized-subagent-delegation-and-result-return.md
[oversight]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-owner-scoped-subagent-lineage-read-and-termination.md
[scheduled]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md
[authoring]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md
[adr55]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-055-subagent-dispatch-mechanism-and-control-plane.md
[adr8]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-008-agent-dispatch-and-instance-lifecycle-model.md
[adr72]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-072-subagent-session-web-read-surface-and-lifecycle-control.md
[official]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/governed-official-harness-capability-discovery-and-invocation.md
[device]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-consented-device-capability-use.md
[sandbox]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-authorized-session-sandbox-acquire-use-release.md
[device-history]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-scoped-device-authorization-and-capability-use-history-read.md
[capacity]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/quality/profile-scoped-capacity-hierarchical-quota-and-overload-safety.md
[budget]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-governed-metered-resource-and-spend-budget.md
[takeover]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-same-node-worker-and-in-flight-logical-work-takeover.md
[run-control]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-authorized-session-run-control-and-truthful-outcome.md
[blueprint]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-acquired-or-forked-agent-blueprint-composition-activation-and-readiness.md
[asset-journey]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/first-party-agent-asset-and-custom-agent-management-journey.md
[version]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-governed-blueprint-version-session-continuation.md
[default-agent]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/user-default-agent-selection-and-effective-resolution.md
[session-directory]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-user-chat-session-creation-directory-and-lifecycle-management.md
[hitl]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-initiated-human-input-request-durable-wait-and-causal-continuation.md
[tool-standing]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-tool-execution-standing-and-location-transparency.md
[publication]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md
[evaluation]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-isolated-tamper-resistant-agent-asset-candidate-evaluation.md
[promotion]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/agent-definition-independent-agent-evolution-promotion-safe-activation-and-rollback.md
[self-evolution]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/constraints/governed-harness-development-self-evolution-lifecycle.md
[advertisement]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/interfaces/sub-agent-advertisement-contract.md
[inbox-proposal]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/proposed/ADR-090-delegate-inbox-consumption-rounds.md
