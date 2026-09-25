# slash-command 验证与证据

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

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-040 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
