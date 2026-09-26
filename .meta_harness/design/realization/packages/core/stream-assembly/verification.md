# stream-assembly 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/stream-assembly/verification.md`](../../../../spec/capabilities/stream-assembly/verification.md#证据义务)（V-1～V-7、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**；宿主前提（V-6）归两个宿主节点，跨进程（V-7）本版装配下无法演练。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 行为模型（P-1、P-7；[S-30](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-30-本版选用的形式工件)） | TLC 跑登记的 `Assembly.cfg`；三个变异配置各给出反例 | **模型侧齐**：主配置在 run `2026-09-25-formal-assets-runtimes` 里退出 0（已绑，见 [bindings](bindings.yaml)）；三个变异配置在 run `2026-09-25-validity-stream-assembly` 里全部退出 12、找到反例（M54） | 模型侧已对着可复查的原件；实现侧不在 V-1，归 V-2、V-3 |
| V-2 一致性用例（examples 第 2～8 节） | 每串事件交给实现，快照与结算逐项等于手算；第 5 节每行逐字得同一失败值、状态不变；第 7 节 7d 两行（M36 严格解析） | 未开始（源码不存在；机读用例集也没有，见 design [SA-3](design.md#实施缺口与消费者影响)） | 本节点：包内测试，落包并在 CI 跑过、结果登记进 record/evidence 即闭合 |
| V-3 性质测试（P-7 实现侧、P-12） | 随机切分、随机合并同一内容，结算的块相等；随机的砍，汇总满足 `data.call-accounts/v2#S-15` 三式与 `merged + cut + byReason.frame_too_long ≤ emitted` | 未开始 | 本节点 |
| V-4 规范场景 S-31～S-39 | 真实的到达装配实现上逐条演练；S-34、S-35、S-38 同时是 P-2～P-6 的证据 | 未开始。S-32 的后一半（不执行、回 `failed`）不在本节点，归工具执行运行时 | 本节点 |
| V-5 消费者路径走查 CS-1～CS-4 | 结构化走查；宿主节点落地后升级为演练 | 未开始 | 本节点与两个宿主节点共同走查 |
| SC-1～SC-4 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始。SC-2 的时钟那一半由现有 `no-wall-clock` 规则在包落地后覆盖；其余规则不存在 | 本节点提出规则形式，`tools/ts-checks` 落规则，并各带一条「故意违反就失败」的自测 |

义务从契约条款与本节点声称兑现的范围产生，不从已有测试反推。**受阻项**：V-2 受阻于机读用例集（SA-3）；SC-1、SC-2 的白名单那一半受阻于规则不存在。

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；这一面成立的静态前提即 SC-2 那条 import 白名单（候选；`@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包都在白名单之外），**规则尚无**（owner `tools/ts-checks`）。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) · `stream-assembly-v2-assembly` | HUB 提交 `1667ea4c`；`Assembly.tla` ＋ `Assembly.cfg`（`Indices = {0, 1}`，`Frags = {"a", "b"}`，`MaxEvents = 6`，`Mutation = "none"`），`-workers 1`，死锁检查关闭，无公平性 | **退出 0、无反例**：871519 个状态、826411 个不同状态、深度 9、1 分 05 秒 | 同目录 `stream-assembly-v2-assembly/output/` 的 TLC 原始日志，输入快照带 `SHA256SUMS` |
| [`2026-09-25-validity-stream-assembly`](../../../../record/evidence/2026-09-25-validity-stream-assembly/README.md) · 三份变异配置（有效性核对，不是 formal task） | HUB 提交 `0ea85c0b`；同一份 `Assembly.tla`，`Assembly_OrderByClose`／`Assembly_ReplaceAsAppend`／`Assembly_OneShotCloseFirst` 三份配置，常量与规模同主配置 | **三份全部退出 12、按预期找到反例**：`BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted` 各被推翻 | 同目录三个子目录的 `output/tlc.log`，输入快照带 `SHA256SUMS` |

**有限检查不写成无条件证明。**这次运行只说：在上述常量下，模型里九个不变量无反例，其中作证据的只有 `BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted`；
其余六个按构造成立，不作证据；变异那次只说「把装配规则改错任一处，对应不变量会红」，即主配置的无反例不是模型空转。两次都**不说**实现符合契约——本节点没有源码，也没有任何一条实现侧的测试。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

与 [bindings.yaml](bindings.yaml) 顶部注释一致：

- **实现侧一条证据也没有**：S-4～S-27 的每一条在实现上都未证；两条 formal 绑定只证模型语义。owner：本节点（V-2、V-3、V-4）。
- **模型盖不到的条款**（契约 [`formal/README`](../../../../spec/capabilities/stream-assembly/v2/formal/README.md)「盖不到什么」）：参数解析与解析不了（S-10、S-11）、被砍过的调用落成半截（S-12）、砍的汇总与 `emitted`（S-13、S-14）、快照（S-7、S-20）、首个内容（S-16）、表示层判定与次序（S-24、S-25）、被拒不改状态（P-9）——证据形式都是规范场景、一致性用例或性质测试，**都未开始**。
- **S-10 第 3 条的严格解析（M36）**：契约 examples 第 7 节已补 7d 两行（重复键 ⇒ 解析不了的那一种、封口被接受、不是 `malformed`；`9007199254740993` 原样交出），随 V-2 一并跑，**未开始**。契约侧的行为模型不含解析与数值（本轮未重跑 TLC），这一条只有一致性用例一种证据形式。owner：本节点。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点范围外 1，无阻断、无应修；主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M54（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 范围外 | 两条绑定（S-6 P-1、S-27 P-7）的有效性前提是三份变异配置给得出反例，那次运行的原始输出未入 record/evidence，只有契约 verification 的文字记录 | 按 M54：主线把三份变异配置跑成证据 run `2026-09-25-validity-stream-assembly`（全部退出 12）；两条绑定的 `assumptions` 改指这个 run | bindings.yaml 顶部注释与两条的有效性前提那一项；本页 V-1 行、「实际执行」第二行；覆盖缺口删去原「变异配置未入库」一条 |
