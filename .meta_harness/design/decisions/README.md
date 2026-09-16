# 决定

本家族拥有已发生的接受选择、理由、范围与取代关系。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 已发生接受、需要形成长期记录时，从本地 [topic 模板包](.templates/topic/README.md) 复制为 `<topic>/`；包内为入口和 `decision.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 尚未接受的决定文案留在来源提案中，不作为本家族的实际主题；决定至少引用一份来源提案或研究，并能定位有权者实际接受的修订与范围。

## 准入门槛与停止条件

- 必须能定位接受者/权限、日期或记录、精确修订、接受范围、保留前提与取代关系。
- 缺少实际接受就停在 proposal；部分接受只记录该部分，不能把待实现、待验证或 reviewer 建议并入决定。

命名、裁剪与跨家族引用遵循 [信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

### 设计治理与知识流

- [D-001：设计知识与规格体系](documentation-system/README.md)
- [D-002：决定权威与因果复议](decision-authority/README.md)
- [D-003：防御指导与开发模型评估](defensive-evaluation/README.md)
- [D-004：系统目标与产品要求作为设计基础](requirements-foundation/README.md)

### 运行时边界与来源采用

- [D-005：以受管能力构成 Agent 运行时](agent-runtime/README.md)
- [D-006：DSH 核心来源的定向复用](dsh-core-adoption/README.md)
- [D-007：独立状态权威与受管附着](runtime-composition/README.md)

### 实现组织与工程观测

- [D-009：按能力族和真实职责组织产品包](package-organization/README.md)
- [D-010：共享诊断设施与真实边界观测](shared-diagnostics/README.md)
- [D-011：诊断目录的共同所有权](diagnostics-directory-ownership/README.md)，精确取代 D-010 的目录责任部分

D-008 的来源决定同时覆盖后来被 D-012～D-015 拆分、修订并由 E 并发协议继续收敛的广泛能力集合。
在最终 catalog、联合评审与精确采用快照锁定前，不把它压缩成一个会误导当前消费者的新 topic；其来源坐标与
暂缓原因保存在本次 I 任务 inventory。D-012～D-015 同理由最终 I adoption 阶段按精确当前范围整理。

本节只导航实际迁入的决定信息包，不形成第二份接受状态清单。

判断方法按需读 [手册对应页](../../agents/skills/harness-design-handbook/canonical/references/design-decisions.md)。
返回 [系统设计链](../README.md)。
