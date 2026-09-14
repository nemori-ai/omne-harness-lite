---
name: spec-maintenance
description: >
  Author and evolve omne-harness-lite specifications and their links to provider
  designs, consumers and verification. Use when adding or revising contracts,
  schemas or formal models, evaluating missing spec artifacts, handing a design
  to implementation, or propagating semantic or implementation-mapping changes.
  Ordinary implementation fixes that preserve these relationships need only the
  existing contract and relevant checks.
---

# 维护承诺与兑现之间的对应

让下一位设计者、实施者和审阅者能够确定：现在承诺什么、由谁兑现、消费哪一版、
哪些判断已有证据，以及变化后哪些责任仍未完成。本 skill 提供维护判断与导航，
不另定义规格格式、接受权限或完成状态。

## 先找到变化的含义

从[规格维护规范](../../../docs/maintenance/spec-maintenance.md)进入，结合实际
需求、采用版本和变化判断本次拥有者。不要从“要改的是 Markdown、类型还是模型”
推断它的语义地位。

| 当前问题 | 应查的拥有者 |
|---|---|
| 身份、数据、行为或跨能力承诺是什么？ | [catalog](../../../spec/catalog.json)的精确身份、版本和接受依据；缺少有效契约时沿提案继续设计 |
| 具体插件、服务键、注入与资源如何兑现承诺？ | [组织规范](../../../docs/maintenance/organization.md#当前实现设计的归属)所指的包/应用当前设计及公共源码 |
| 修改会不会覆盖已发布规范或改变消费者？ | [版本规则](../../../docs/maintenance/versioning.md)及[变更传播](../../../docs/maintenance/spec-maintenance.md#变更沿依赖传播) |
| 没有模型、只有 contract.md，是否足够？ | [契约描述要点](../../../docs/architecture-guide/reference/contract-description.md)、[覆盖说明](../../../docs/maintenance/verification.md#覆盖的发现入口) |
| 设计是否足以交给下一项实施？ | [设计就绪](../../../docs/maintenance/spec-maintenance.md#设计就绪与实施入口)，按本次消费者依赖判断 |

同一变更可能同时影响多个拥有者，先明确对应关系再修改；共享数据沿其权威定义
引用，包内类型或校验实现不成为另一套契约。具体 Cordis 行为用
[cordis-authoritative-docs](../cordis-authoritative-docs/SKILL.md)核对采用版本，
不拿通用映射指南冒充本项目提供者已经完成的设计。

## 以语义充分性决定工件，以证据范围判断覆盖

先能解释能力的目的、消费者、必要状态与完整动作，再选择表达工具。规范正文、
数据形状、行为模型、结构模型和场景各有用途，不要求每项能力拥有同样的文件。
一份充分的 contract.md 可以是当前合理起点；该判断不等于已经形式化或实现。

检查局部操作的合法性之外，沿真实触发追踪跨能力交接，特别看拒绝、失败、撤除
和恢复改变责任的位置。前一方交出工作后谁负责下一步，接收不成功时谁收口，
必须能从所属契约解释；工具、技能或应用不能暗中补造这段业务政策。

新增工件要解决明确的表达或验证问题。已有模型只覆盖部分条款时保留其适用
范围，未覆盖部分说明缺口；不要为了让“覆盖完整”成立而放宽条款、增加空模型
或把上游测试移作本项目的实现证据。

## 维护语义与实现设计的双向联系

缺少服务键与缺少依赖失效政策是不同问题。前者可能只需补齐提供者设计；后者
若确实不在已有契约中，则是语义缺口。不能因缺一张映射表就升级全部 spec，
也不能以“只是框架细节”为由绕过授权、所有权、失败或状态演化的变化。

当前正文有稳定入口，采用对象有可识别版本。设计交接应引用精确契约、所需
提供者/装配快照和实际证据；仅给出一个会变化的 plan 路径不足以固定接口。
技术选择还需研究时使用 [implementation-planning](../implementation-planning/SKILL.md)，
边界或保证变化则使用 [architecture-design](../architecture-design/SKILL.md)。

进入实施的判断针对受依赖部分。核心责任未定时指出缺口、负责产物、受影响
消费者与闭合时点，暂停依赖它的实施；已明确范围内的内部实现选择仍可自主推进。
不要把语义接受、提供者可实施、装配明确和真实验证合并为一个“完成”。

## 变更的代价由实际影响决定

识别哪些规格、提供者、公共接口、应用和证据消费了被改动的含义，检索只作为
线索，再以责任和真实组合核对。新版本不自动升级消费者；未迁移、仍适用或因
新要求不再适用的部分应可辨认。只重做受影响验证，不因存在依赖链就全部重审。

冻结边界包括已发布版本里的规范正文、Schema、模型和规范场景；即使只是补充
模型，也不能直接写进旧版后重算哈希。版本目录外的运行结果与可变覆盖说明可以
更新，但不能借“验证附件”在外面建立另一份规范。发布时沿既有规则保持接受
依据、精确引用、catalog、冻结记录与导航一致。

公共服务键、事件或接口的变化即使没有改变业务语义，也要解释消费者迁移；
不能只跑提供者测试。旧证据仍保留原版本与假设，不将失效结果继续投影成当前
通过。实现违反已接受契约时优先修复实现，反例挑战契约前提时再回到设计依据。

## 交付可接续的事实

把长期语义、当前实现设计、施工安排与验证证据放回各自正文，更新必要的双向
导航；历史提案和工作树交接保留原修订、接受范围与来源。按后续真实消费补齐
历史缺口，不批量创建空文档或借迁移宣布旧能力已实现。

交付应能辨认本次改变的承诺或映射、精确消费关系、实际验证及仍待完成的义务。
规范成立、审阅通过和产品交付分别报告。满足本次维护范围后停止扩展；普通
错链或局部实现修复不因加载本 skill 而需要新的决定、完整形式模型或发布流程。
