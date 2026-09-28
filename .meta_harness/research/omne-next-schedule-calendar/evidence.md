# 可复核的来源与观察

## 共同取证条件

- 日期：2026-09-27。
- 上游本地只读检出：`/data/qiwei/repos/omne-next`。
- 上游精确版本：`6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`；开始时 `git status --short` 为空。
- 固定来源校验：本包 57 个去重后的上游文件链接均能在该修订取回；
  本轮读取的工作区字节与 `git show <SHA>:<path>` 逐文件相等，结束复核时上游 HEAD 未变、状态仍干净。
- 本项目对照基线：`edee5bb7d4dfaff32a25df46c4faf95fcb81f117`。
- 取得方式：`rg --files` / `rg -n` 定位，逐节读取本地原文，核对后续 amendment；
  核心实现状态另读源码，未把 subagent 转述作为证据，本轮未派子代理。
- 来源立场：均为上游项目自有档案。访谈里的用户原话和需求文件对会话原话的记载分开看；
  后者不是本轮拿到的原始聊天日志。国别调查仅复核其记录与局限，不复现历史网络实测。
- 环境边界：不运行上游服务/测试，不访问第三方政府、日历或产品网站；
  本轮没有真网成功、跨进程正确性、实时数据准确性或发布完成的验证声明。
- 固定修订链接用于定位原文，私有仓库需要权限；本地 `git show` 不依赖 GitHub 可访问性。

复核示例（将路径换成下方链接的仓内路径）：

```bash
git -C /data/qiwei/repos/omne-next show 6263fed545e48ad9efb5714f3fe76a7c1a0af1b5:omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md
git -C /data/qiwei/repos/omne-next diff 6263fed545e48ad9efb5714f3fe76a7c1a0af1b5 -- omne_harness
```

各 E 记录共享上述版本、日期、取得方式和静态范围；语义位置是复核主入口，
行号只辅助定位。文档描述与代码不一致时保留两方，未执行的测试不记通过。

## E01 本项目原定计划与边界

- 消费：K1、K10 与本轮详细报告的本项目对接表。
- 来源：[product 编号预留](../../design/product/README.md#已排定尚未开题的编号)；
  [PF-020 边界](../../design/product/PF-020-workspace/design.md)；
  [PF-014 §9.1](../../design/product/PF-014-inbound-intake-and-queueing/design.md#91-有几类来源的能力还没开题)；
  [PF-015 会话归档](../../design/product/PF-015-session-lifecycle-and-ownership/design.md#会话归档)。
  这些相对链接跟随工作区；复核本轮必须取共同条件中的本项目固定修订。
- 实际观察：PF-021 尚未开题；PF-020 不拥有日程交付流程；PF-014 已留定时输入去处，
  明列日程主体、到期和错过语义缺口；PF-015 rev 13 不做会话删除，归档可撤销但工作不自动恢复。
- 检索：`rg -n -i 'pf-021|日程和日历|日程与日历' .meta_harness/design .meta_harness/research`。
  旧 research/legacy_backup 中 PF-021 的多机器含义仅用于消歧，未作为现行依据。
- 支持范围：本轮设计起点，不证明本项目已存在日程能力。词表索引未命中 Schedule/Calendar/日程/日历，
  是当前索引的检索结果；本轮未创设词条或对象。

## E02 最初诉求与产品请求

- 消费：K2，以及详细报告的时间线与场景表。
- 原文：
- [R1 访谈](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/interview/2026-05-20/R1-vision-and-users.md)：§2.9 的 Q9/A：后台调度触发应完整调起 agent 完成工作；HP-2 是随后访谈者的蒸馏。
- [R2 访谈](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/interview/2026-05-21/R2-event-storming.md)：§2.1 的 A1：早期选择 data plane 经 inbound 的完整协议，允许用 mock 驱动；这是早期前提。
- [ADR-033](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-033-cron-schedule-placement-three-way-split.md)：Status/Source 与 §1.1–1.4：2026-06-23 真日程管理诉求、旧 omne_job 退役后的职责变化；三分归宿属上游设计。
- [定时窗口请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/owner-scheduled-windows-with-due-idempotency-and-missed-truth.md)：disposition=partially-accepted，G5 宿主关机错过无完整 owner；原请求 revision 238afe426445a72a24bd627925f17341bd015260。
- [agent 起草请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/agent-drafted-schedule-activation-by-owner.md)：2026-08-27，两份修正案承接起草/转正；原请求 revision fff48d566add18700fbb3a2e5686f2fc657c9844。
- [原子改期请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/atomic-schedule-re-plan-with-lineage.md)：同轮 accepted-as-amendment，仍把后继业务身份策略留在设计轴。
- [纯提醒请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/reminder-only-schedule-without-agent-execution.md)：accepted-as-new-requirement；区分通知与执行。
- [异常主动通知请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/owner-notice-on-schedule-missed-blocked-or-invalidated.md)：受阻/恢复/失效已接；missed 来源受 G5 门控。
- [长事务检查点请求回执](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/product-consumer-requests/omne_harness_product_personal_edition/long-horizon-affair-checkpoints-bounded-probing-and-self-wake.md)：五个操作映射既有 owner，目标结构/进度知识归认知侧；末尾零实现总括与源码不符，见 E12。
- 支持范围：读到的是上游保存的原话、蒸馏和请求回执，不是当前会话对这些条款再次批准。
  回执所引产品子项目原件未在本轮逐份追读；不能把回执摘要当完整产品原文。
- 后续核对：请求 revision 不变而 receipt 变化时，分别复核请求内容与 provider 接受范围。

## E03 管理一次性与修正案

- 消费：K3、K4。
- [基础管理与修正案](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-scoped-schedule-management-and-due-window-idempotency.md)：§承诺范围、AC-1–9、2026-08-27 Amendment 与 AC-10–14。
- [一次性预定](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-one-shot-scheduled-work-and-terminal-completion.md)：S-1–S-3、AC-2 的 2026-08-13 裁决、AC-3/4、尚未承诺部分。
- 实际观察：基础 actor 是已证明身份的直接用户，创建失败无半状态、读写隔离；
  去重仅承诺同一计划同一窗口至多接受一次，不承诺下游副作用 exactly-once。
  amendment 新增耐久草稿与原子替换；改名/工作内容仍原地修订。
  once 默认不可运行时作废，可选等待恢复，永久身份失效不受选项覆盖。
- 反面与局限：一次性执行不终结（如卡死）时的额外超时兜底在 AC-2 明列未裁；
  amendment 不要求直接用户创建一律先起草；上游 current baseline 不等于 amendment 已实现。

## E04 时间表达日历叠加与修正链

- 消费：K4、K5。
- [确定性非线性重复](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-owner-scoped-deterministic-nonlinear-schedule-recurrence.md)：表达/预览/有限边界、AC-1–7；AC-3 需结合 E06 的后续范围界定。
- [版本化业务日历感知](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-versioned-business-calendar-aware-schedule.md)：版本采用、碰撞、次数/截止、AC-1–7；供应排除项的 2026-08-19 澄清。
- [表达力设计](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/scheduling-expressiveness.md)：§2–4、§7；旧表和 dated 订正共存，不只读取首张图。
- [ADR-101](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-101-schedule-dst-semantics-unification.md)：DST 单一语义与 §8 explicit/follow 范围界定；存量 UTC 迁移锚未推翻。
- [ADR-104](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-104-calendar-overlay-construction-semantics.md)：D-2 有界合并、D-5 once×overlay 拒绝、D-6 次数/截止/skip；§10 故障渲染分流。
- 实际观察：时间规则算术与国家日历数据正交；跳过不计数，平移合并后计一次。
  once×overlay 无上游承诺，构造时明确拒绝。早期把日历数学放 resolver 的描述，
  后来被“resolver 只取快照、纯解析循环处理全部数学”细化。
- 支持范围：只记录上游如何区分承诺与实现约束；库、接口和纯函数分层不成为本项目选型。
  cron 兼容与存量 UTC 是上游已有数据前提，本项目没有相同存量的自动兼容义务。

## E05 Agent 未来工作与系统订阅

- 消费：K2、K3、K9。
- [定时派发与回流](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-scheduled-subagent-handoff-and-master-result-return.md)：actor/target、耐久 intent、唯一派发、overlap 与结果新 trigger。
- [agent 表达面与同意](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-agent-scheduled-dispatch-authoring-and-graded-consent.md)：分级授权、撤权、三条路径；2026-08-27 Amendment/AC-13 对默认确认的落点修正。
- [同会话自唤醒](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/runtime-agent-scheduled-self-wake-and-session-continuation.md)：同一工作/因果链、不需逐次确认、释放资源、人类停止与 loop guard 不豁免。
- [系统 Schedule 订阅](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-system-schedule-subscription-and-per-subscriber-occurrence.md)：SUB-1/2、EXE-1/2/3；系统 feature 与平台维护作业边界。
- 实际观察：派给自己也指使用同 Blueprint 开独立 Session，不等于自唤醒；
  默认 skip_if_running，显式允许并行仍受配额约束。系统订阅幂等身份含 subscriber，
  可不可关闭由各 feature 决定，但不可关闭仍必须可见。
- 代价与局限：agent 自建 standing work 配额只承诺有上限，单位/分层未裁；
  ordinary subagent 无权凭临时委托建立超出其生命周期的 standing work。
  用户计划的一般代理 CRUD 不由这些条款自动开放。
- 已观察文内滞后：订阅需求类型表仍写 agent 表达面“尚未取得批准”，
  同修订下独立 authoring 需求已 Accepted；不能跨文件忽略后者。

## E06 环境跟随与固定绑定的范围变化

- 消费：K5。
- [用户生效环境与日程跟随](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/user-effective-environment-and-schedule-follow.md)：原话 provenance、UAC-1–7、dated 澄清。
- [ADR-108](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-108-user-effective-environment-follow-for-schedules.md)：D-1–7，§4 OQ-1–7；§8 环境自愈不补触发。
- [环境跟随机制设计](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/user-effective-environment-and-schedule-follow.md)：后续对照入口；本轮结论主要取需求和 ADR 的明确裁决，不以机制正文另定政策。
- 实际观察：一个用户在一个时刻一份生效环境（时区+日历），follow 行采用可追溯绑定事实；
  不在算术中直读不断变化的设置。explicit 不受变更影响；follow⇒follow_latest。
  用户可写入时区/日历不自洽组合，相关日程明确受阻，不静默修正用户设置。
- 支持范围：后续范围界定足以解释早期固定时区与当前 follow 默认的差异；
  本轮没有证明上游所有旧文都完成回填，也没有验证时区自动检测链路。
- 代价与局限：收敛窗内旧环境的已接受结果是可解释历史，不保证设置写入瞬间全体同步；
  无日历不代选、日历时区不一致不猜测。

## E07 依赖派发回流与结果处分

- 消费：K6、K9。
- [依赖 standing](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-dependency-standing-recovery-and-terminal-invalidation.md)：两状态轴、recoverable/terminal、最终准入、历史与 owner 可见性；former identities 仅兼容入口。
- [ADR-114](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-114-schedule-dependency-standing-two-tier-ontology-and-declaration-surface.md)：D-1/2/3 两类依赖与三族首期；D-5 第二道闸；D-6 非权威呈报。
- [定时工作端到端旅程](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/subsystems/cross-subsystem/scheduled-work-dependency-and-result-disposition.md)：主旅程、两层依赖、第二道准入闸章节及失败与重复。
- [结果发布与主题归档](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/owner-scheduled-result-publication-and-thematic-archive.md)：三根策略轴、四种 outcome、不可静默改投与结果原件保留。
- [ADR-079](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-079-scheduled-result-publication-and-thematic-archive-authority.md)：Accepted 2026-08-06；四种 standing、归档 ontology 不由 harness 内联。
- 实际观察：权威暂不可读须拒绝；恢复同一关系与换成相似对象不同。
  State 依赖设计交付范围明确是第一道闸+第二道闸契约，第二道闸执行位置归 E25；
  跨边界旅程不允许转发前近似代替派发前重读。
- 支持范围：本轮核对规范性文字及部分生产适配器，未验证跨进程故障竞态。
  上游“删除 originating Session”的前提不适用于本项目 PF-015。

## E08 提醒与主动通知

- 消费：K2、K8 的边界及 K10。
- [纯提醒](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-reminder-only-schedule-notification-without-execution.md)：承诺范围、RM-AC-1–5：耐久通知、零执行、错过不补发；不承诺 snooze/第三方同步。
- [standing 变迁通知](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-standing-transition-owner-notice.md)：来源/内容/同因折叠、SN-AC-1–4；missed 明确受 G5 前提门控。
- 实际观察：纯提醒不形成执行侧 accepted scheduled trigger，不产生 Session/Run 或执行预算；
  通知内容来自计划。受阻、恢复、永久失效由系统产生通知，不能靠 agent 事后补说。
- 支持范围：这些是上游 committed-future 产品承诺。通知耐久真相的其他路由和完整生命周期
  本轮未全面审计；不能推出通知渠道已可用，也不能推出 missed 的完整政策已经闭合。

## E09 日程观测与日历知识读面

- 消费：K7。
- [日程观测/账本/agenda](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-schedule-observability-execution-ledger-and-agenda-read-surface.md)：承诺与 OBS-AC-1–11；S13/S14 对关联/去重处置的门控。
- [日历知识查询](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-business-calendar-knowledge-read-and-resolution-surface.md)：目录、日判定、工作日算术、预览、生效日历；CAL-AC-1–9。
- [读面设计](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/subsystems/state/schedule-calendar-web-surface.md)：§1–3 同引擎/版本、关联 id、§5 D1–6/W1–5、§7 S13–15。
- 实际观察：预览支持 inline 或已存计划引用；过去 agenda 回填实际账本，
  请求展示时区不改变日程自身的日历判定。超限报错不截断冒充完整。
  默认读取预算约 3000 tokens 与宽档 cap 是两回事，具体数值是上游历史取舍。
- 代价与局限：系统不得给好/坏的价值判词；有分页并未消除应用层全量列表扫描；
  owner 读面以 user/agent/tenant 三轴判权，同租户并不自动授予他人历史读权。
  这些精确轴是上游设计事实，不能直接替本项目决定组织共享语义。

## E10 数据供应首装与国别研究

- 消费：K8。
- [业务日历供应需求](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/state-business-calendar-data-supply-and-versioned-publication.md)：周期/地平线、版本、校验、首批范围、Day-0 与 AC-8–11；含授权前置条件后续取消记录。
- [供应设计](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/business-calendar-data-supply.md)：§1 当前状态与 §2–3 横向模型；版本发布与消费采用分工；旧状态冲突见 E12。
- [ADR-109](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/accepted/ADR-109-day0-calendar-provisioning-load-guarantee.md)：Day-0 设计来源入口；本轮取其配套需求的已批准全文和首装源码，不凭 ADR 头部零实现概括当前。
- [ADR-110 候选](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/adrs/proposed/ADR-110-kr-sg-sa-calendar-expansion-design-rulings.md)：Status 与 §0：韩新沙未来意向/本期不做/要求落设计，不等于设计获批。
- [数据源调研包](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/business-calendar-source-research/README.md)：两批材料、原始 dossier 与二阶综合区分、共同血统残余风险；本轮未重放其网络实测。
- [中国 dossier](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/business-calendar-source-research/cn-calendar-source-dossier.md)：§9 残余风险：静默过期、年度安排后续修订、共同变化、许可未决等历史记录。
- [日本 dossier](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/business-calendar-source-research/jp-calendar-source-dossier.md)：§9 残余风险/未确证：静默旧数据、格式改动、规则变化、覆盖边界及更新节律的推断性质。
- [美国 dossier](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/intake/business-calendar-source-research/us-calendar-source-dossier.md)：§9–10：临时行政令时效、半日无法表达、联邦适用边界、仍未核得的原件与外部条款。
- 实际观察：供应需求已批准中日美、二维地平线、可追溯出处、不可变版本与离线首装。
  新国家要求不改国家无关核心；共享装配清单追加不等于核心逻辑改写。
- 支持范围：研究包里的法律、许可、政府发布行为均为历史研究转述，
  本轮不作新的法律结论或当前数据可靠性判断。未沿其“推荐组合”替本项目选供应商。
- 代价与不适用：国家公共供应不等于租户可编辑日历；half-day、州级等精细语义未被首批
  全量承诺。算法支持或测试第四国的样例，不证明第二批国家日历已作为产品供给。

## E11 实现台账与源码静态核对

- 消费：K3、K7、K10。
- [State 实现台账](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/traceability/subsystems/state/realization-matrix.md)：Accepted requirement alignment、E75/E76 行、R-A3 运行时真网与证据局限。
- [Schedule 状态](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/domain/value_objects.py)：ScheduleStatus 的七个成员（约 574–615 行），无 draft/replaced。
- [Schedule 聚合](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/domain/schedule.py)：create 签名/构造约束、INV-SCH-20、一次性执行状态；未见草稿转正/替换命令。
- [管理应用](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/application/services/schedule_command.py)：ScheduleCreateCommand 与 ScheduleCommandUseCase：create/pause/resume/disable/update；无提醒 kind。
- [到期处理](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/application/services/schedule_ticker.py)：ScheduledTriggerForwardPort 与 _forward_port.forward 的执行转发路径。
- [执行账本模型](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/application/read_models/schedule_execution_ledger.py)：ScheduleExecutionLedgerRow 的 session_id: None、dispatch_order_id: None；S13 文档门控。
- [列表查询](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/application/services/schedule_list_query.py)：list_all：repository.list_all → _ordered_matches → _slice_page；total=len(matches)。
- [日历首装](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/omne_harness_state/application/services/calendar_provisioning.py)：seed / refresh：先种子，后尽力更新，刷新异常日志与取消传播。
- [单机可达适配器](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_single_node/omne_harness_single_node/schedule_ticker_ports.py)：AlwaysReachableDeviceAdapter.is_reachable 恒 True；注释声明单机只用 fleet scope。
- [agenda 测试](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/tests/unit/application/test_schedule_agenda_query.py)：四种前瞻处置、过去/未来同窗口、时区、扫描/行数上界等实名测试存在。
- [预览测试](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/tests/unit/application/test_schedule_preview_query.py)：test_preview_slots_are_the_resolver_chain_the_due_scan_would_walk 与引用式等价测试存在。
- [环境重评测试](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/tests/unit/application/test_schedule_environment_reconciliation.py)：test_the_heal_binds_the_first_slot_after_recovery_not_a_missed_one 等；只核文件，不记通过。
- [首装测试](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/tests/unit/application/test_calendar_provisioning.py)：seed、坏包、刷新失败、取消传播的测试存在。
- [账本测试](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_state/tests/unit/application/test_schedule_execution_ledger_query.py)：实际处置、派生受阻窗、scope、拒绝截断等实名测试存在。
- [消费侧 e2e](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/tests/e2e/test_w2_schedule_calendar_e2e.py)：provenance 与最终有限槽事实断言均为普通回归；
  `test_final_bounded_occurrence_lands_a_fired_fact` 的 xfail 已移除，类说明记 2026-08-26 修复；本轮不运行。
- [运行时供应真网 e2e](https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/tests/e2e/test_w2_calendar_supply_runtime_leg_realnet.py)：R-A3 所指 opt-in 载体，本轮只核存在；历史真网数值仍属台账。
- 本轮实际观察：以上源码形态、方法/字段与文件存在。E75 日历查询和日程部分查询有实现落点；
  E76 所需生命周期/纯提醒在已读状态机与命令面未出现。此为定域静态证据，
  不是穷尽全仓证明“不存在任何可能实现”。
- 上游台账记录（本轮未重跑）：依赖机制测试有替身/进程范围限制；第二道闸未落；
  E75 的执行关联与去重处置仍门控；R-A3 曾有运行时真网取证，但不是持续可用保证；
  有限重复最后一次 fired 事实在旧 AC-7 行仍登记缺陷，但当期 e2e 已无 xfail 装饰器，
  明言该缺陷已修，聚合 `ScheduleFinalSlotFired` 发射落点也存在（约 1806 行）。
  本轮能确认旧“仍待修”读法不宜沿用，不能据静态检查宣称回归当前运行通过。
- 支持范围：可据此否定“全是零实现”与“已完整交付”两个总括。
  不能据测试名称或台账绿字宣称本轮通过验收。

## E12 冲突与未发现项的证据强度

- 消费：K1、K5、K8、K10 与详细报告的问题清单。
- 冲突来源均在 E01–E11；这是本轮对同一修订内材料的比较，不在这里修上游正文。

| 对照 | 本轮读数 | 能得出的结论 |
|---|---|---|
| 非线性需求 AC-3 vs ADR-101 §8 / ADR-108 | 前者仍以固定时区表述；后者明确限定 explicit 并引入 follow | 属有后续裁决的范围变化；读需求须带后续范围限定 |
| authoring 初版 vs 2026-08-27 Amendment | 原先建立需确认；后续起草命令不等现场确认，转正才生效 | 不能用初版确认措辞否定异步草稿 |
| long-horizon intake 的“均零实现” vs 聚合/读面/台账 | once 和 recurrence 的源码、状态与查询均有 | intake 状态概括过宽，不是没能力的证据 |
| 供应设计 §1 “运行时至今从未真网” vs State 台账 R-A3 | 后者记两组合根、真实存储、ticker 驱动的 opt-in 取证 | 较后历史记录存在，旧零实测断言不可继续使用；本轮不重证历史数值 |
| State 台账旧 AC-7 缺陷行 vs 消费侧 e2e/聚合 | 最终有限槽回归已无 xfail，说明记已修；有 ScheduleFinalSlotFired 发射点 | 旧未修快照不能作当前结论；测试通过仍须实际运行 |
| 订阅需求“agent 表达面尚未批准” vs authoring Accepted | 同日后续独立 owner 明确获批 | 批准轴不能由旁边过时摘要覆盖 |
| 旧系统依赖需求的 Session 删除 vs PF-015 | 本项目明确没有会话删除 | 这是跨项目模型差异，研究不能自裁新系统归档对日程的后果 |
| 提醒 RM-AC-4 与 notice/intake 的 G5 | 提醒已明确 missed 不补发，但总 missed 处置仍无 owner | 局部已批规则与全局缺口并存，不能一句“沿既有策略”当全覆盖 |

检索负面范围：已在核心 Schedule/Calendar requirements、上述 intake、表达力/环境/
供应/读面/跨系统设计及 ADR-110 范围声明中核对。未发现会议邀请、参会人协同、
全天事项、个人手填事件及第三方双向日历同步的已批准完整条款；
纯提醒需求明确排除第三方同步。这只能说“本轮材料没有支持”，不是全仓不存在的形式证明。

后续复核触发：上游新增 amendment、新需求身份、E25/E68/E76 交付或本项目 PF-021 产品定稿。
任何这些变化都要重新区分需求范围、接受、实现、实际运行四个层次。
