# call-accounts 验证与证据

契约侧的证据义务权威在 [`spec/data/call-accounts/verification.md`](../../../../spec/data/call-accounts/verification.md#证据义务)（V-1～V-9、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 形状校验 | `examples.md` 第 1～8 节正反实例逐条过包内校验；包内 Schema 副本与 spec 逐字节相同 | 未开始 | 本节点：包内测试，CI 跑过、结果登记进 record/evidence 即闭合 |
| V-2 拒绝值与判定次序 | 同一批反例逐字得「契约判定」一列，含 `malformed` 组合约束那一半 | 未开始 | 本节点 |
| 契约 G-9 的闭合条件（精确十进制） | `0.1 + 0.2 = 0.3`；超 17 位有效数字的金额经读、加、写不丢位——**一条会在丢位时失败的测试** | 未开始；依赖 content-blocks 的严格无损读写 | 本节点 |
| V-5、V-6 补账与汇总 | `effectiveCost`、`summarize` 对 examples 第 9 节手算逐项相等；平局、孤立补账、重复的账三种失败 | 未开始 | 本节点（求值那一半）；「核原响应体的字节」那一半归补账的写入者 |
| V-10 中 SC-2、SC-3 的类型面 | 见 [design](design.md#静态检查义务怎么承载) | 未开始；规则不存在 | 本节点提出形式，`tools/ts-checks` 落规则 |

**不在本节点**：V-3、V-4、V-7、V-8（要运行时、节流方、组装的真实演练）、V-9 其余各行（装配选型声明）；SC-1、SC-4。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提「本包源码不 import `@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包」**规则尚无**（候选，本批十五个 `core` 纯模块共用一条，owner `tools/ts-checks`）。

## 实际执行

尚无。源码不存在。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **精度的端到端证据缺一半**：模块内测试证不了每一跳都走了无损读写（content-blocks CB-2）。owner：主线分派。

## 独立评审

N1：无发现——2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行），无阻断、无应修、无建议（批的结论见 [D-060 §八 N-28](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）。
