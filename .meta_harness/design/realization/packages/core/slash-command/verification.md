## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 15 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# slash-command 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.slash-command/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/slash-command` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**408 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 13 项 core-local、2 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

契约侧的证据义务权威在 [`spec/data/slash-command/verification.md`](../../../../spec/data/slash-command/verification.md#证据义务)（V-1～V-6、SC-1～SC-6）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～3、6 节逐行；第 4 节每行的值与固定命令集、第 5 节实例也过一遍；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 判定用例集 | examples 第 4 节五十行，本语言这一份实现逐行跑通（交付面人读、机读、受理面三种调用形态） | 未开始 | 本节点；另一种语言的实现另跑 |
| V-3 拒绝值的具名与优先级 | 第 1、5、6 节每个拒绝行逐字相同 | 未开始 | 本节点 |
| V-6 中的 SC-3、SC-4、SC-6 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |
| V-4 消费者走查 | CS-1～CS-7 结构化走查 | 未开始 | 本节点与交付面、受理面、注册表、求值节点共同走查 |

**不在本节点**：V-5（跨进程，本版装配下多半无法演练——单机同一份实现不构成两处实现）；SC-1、SC-2、SC-5。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **识别的「空白」依赖 identity-values 补导出**（SLC-1，实现期事项）。owner：identity-values 节点落包时。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
