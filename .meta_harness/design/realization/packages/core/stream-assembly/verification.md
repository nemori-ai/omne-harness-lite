# stream-assembly 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/stream-assembly/verification.md`](../../../../spec/capabilities/stream-assembly/verification.md#证据义务)（V-1～V-7、SC-1～SC-4）。
本页只登记**落在本节点上的那一部分**；宿主前提（V-6）归两个宿主节点，跨进程（V-7）本版装配下无法演练。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 行为模型（P-1、P-7；[S-30](../../../../spec/capabilities/stream-assembly/v1/contract.md#s-30-本版选用的形式工件)） | TLC 跑登记的 `Assembly.cfg`；三个变异配置各给出反例 | **部分**：主配置在 run `2026-09-25-formal-assets-runtimes` 里退出 0（已绑，见 [bindings](bindings.yaml)）；三个变异配置的反例只记在契约 verification，原始输出**未登记**进 record/evidence | 主线：把变异配置的那次运行登记成 evidence run，V-1 才对着可复查的原件 |
| V-2 一致性用例（examples 第 2～8 节） | 每串事件交给实现，快照与结算逐项等于手算；第 5 节每行逐字得同一失败值、状态不变 | 未开始（源码不存在；机读用例集也没有，见 design [SA-3](design.md#实施缺口与消费者影响)） | 本节点：包内测试，落包并在 CI 跑过、结果登记进 record/evidence 即闭合 |
| V-3 性质测试（P-7 实现侧、P-12） | 随机切分、随机合并同一内容，结算的块相等；随机的砍，汇总满足 `data.call-accounts/v1#S-15` 三式与 `merged + cut + byReason.frame_too_long ≤ emitted` | 未开始 | 本节点 |
| V-4 规范场景 S-31～S-39 | 真实的到达装配实现上逐条演练；S-34、S-35、S-38 同时是 P-2～P-6 的证据 | 未开始。S-32 的后一半（不执行、回 `failed`）不在本节点，归工具执行运行时 | 本节点 |
| V-5 消费者路径走查 CS-1～CS-4 | 结构化走查；宿主节点落地后升级为演练 | 未开始 | 本节点与两个宿主节点共同走查 |
| SC-1～SC-4 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始。SC-2 的时钟那一半由现有 `no-wall-clock` 规则在包落地后覆盖；其余规则不存在 | 本节点提出规则形式，`tools/ts-checks` 落规则，并各带一条「故意违反就失败」的自测 |

义务从契约条款与本节点声称兑现的范围产生，不从已有测试反推。**受阻项**：V-2 受阻于机读用例集（SA-3）；SC-1、SC-2 的白名单那一半受阻于规则不存在。

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md) · `stream-assembly-v1-assembly` | HUB 提交 `1667ea4c`；`Assembly.tla` ＋ `Assembly.cfg`（`Indices = {0, 1}`，`Frags = {"a", "b"}`，`MaxEvents = 6`，`Mutation = "none"`），`-workers 1`，死锁检查关闭，无公平性 | **退出 0、无反例**：871519 个状态、826411 个不同状态、深度 9、1 分 05 秒 | 同目录 `stream-assembly-v1-assembly/output/` 的 TLC 原始日志，输入快照带 `SHA256SUMS` |

**有限检查不写成无条件证明。**这次运行只说：在上述常量下，模型里九个不变量无反例，其中作证据的只有 `BlockOrderIsOpenOrder`、`SplitInvariance`、`OneShotAccepted`；
其余六个按构造成立，不作证据。它**不说**实现符合契约——本节点没有源码，也没有任何一条实现侧的测试。**通过不提升契约或本节点的任何接受状态。**

## 覆盖缺口

与 [bindings.yaml](bindings.yaml) 顶部注释一致：

- **实现侧一条证据也没有**：S-4～S-27 的每一条在实现上都未证；两条 formal 绑定只证模型语义。owner：本节点（V-2、V-3、V-4）。
- **模型盖不到的条款**（契约 [`formal/README`](../../../../spec/capabilities/stream-assembly/v1/formal/README.md)「盖不到什么」）：参数解析与解析不了（S-10、S-11）、被砍过的调用落成半截（S-12）、砍的汇总与 `emitted`（S-13、S-14）、快照（S-7、S-20）、首个内容（S-16）、表示层判定与次序（S-24、S-25）、被拒不改状态（P-9）——证据形式都是规范场景、一致性用例或性质测试，**都未开始**。
- **变异配置的原始输出未入 record/evidence**：P-1、P-7 两条绑定的有效性前提目前只由契约 verification 的文字记录支撑。owner：主线。
- **S-10 第 3 条的严格解析（M36）没有专门的用例**：examples 若未补「重复键落解析不了」「超出 2^53 的整数原样交出」两行，V-2 盖不到；本节点在包内测试里各补一条，契约 examples 补行之后改为按 examples 跑。owner：本节点（包内）与契约 owner（examples）。
