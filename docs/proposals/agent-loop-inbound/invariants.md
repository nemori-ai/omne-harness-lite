# 循环与 Inbound 的不变式

[提案索引](README.md) · [Loop](loop.md) · [Inbound](inbound.md)

按[需求推导性质](../../architecture-guide/assurance/invariants.md#从目标与需求推导性质)：
安全不变式说"永远不会"，进展不变式说"最终会"。每条标明来源（沿用已接受契约
或本次提出）、保护点与证据义务。证据列中的 TLA+ 指本提案接受时应随规格发布的
形式模型；未执行的证据分别保留，不表述为已证明。

## 安全不变式

### 会话与执行权

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| I-1 | 一个 Session 同一时刻至多一个活动驱动占位 `(SessionRef, RunRef, epoch)`；非终态 Run 可以有多个（interrupted、waiting 都算非终态），但持有占位的只有一个 | 沿用 SR-08/09，本次收紧措辞 | session-run 权威在共同提交内裁决（U-1） | TLA+ 状态谓词；并发取批/恢复冲突测试 |
| I-2 | 一个 Session 同一时刻至多一个已发布的 live-agent 实例；旧代际句柄对新 Run 无效 | 沿用 live-agent v1 AR-4/AR-8 | AgentRegistry | 已有 Runtime.tla |
| I-3 | Loop 只能以有效 epoch 提交任何推进；epoch 失效后的迟到提交被拒绝并作为隔离证据保留 | 沿用 SR-12、CC-04、TL-08 | 每次共同提交核对 epoch | TLA+ 动作前提；迟到提交注入测试 |
| I-4 | 一个 Run 的模型选择、输入批次、Step 切点建立后不可变；变更只能产生新 Run 或新 Step | 沿用 SR-08、PF-023.C2 | Run 状态权威 | 结构检查 + 场景 |

### 队列与 Run 启动

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| I-5 | 一个 Run 恰有一个启动依据：一批连续用户文本、一条 slash command、一项 trigger；三者互斥，不混批 | 本次提出（U-7），细化 SR-06/07 | `takeBatch` / `takeCommand` / `takeTrigger` 同一门 | TLA+：Run.basis 类型封闭 |
| I-6 | 队列项的 `withdraw` 只对 `queued/held` 成立；`taken` 后返回当前事实与所属 RunRef，不改变 Run。已取批输入不再出现在队列；未取批输入不进入任何模型上下文 | 沿用 SR-03/05/06，本次按 U-8 明确 | 队列权威 | 场景测试 |
| I-7 | 运行中的 Run 不接收新的用户输入；新输入只能进队列，或经 `interrupt_then_run` 使旧 Run 收口后开新 Run | 沿用 SR-04/11，本次按 U-6 写成不变式 | E1 只在 Run 开始读队列 | TLA+：Step 切点只来自启动依据或接续 |

### Step 与调用

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| I-8 | 同一 Step 内多次模型 attempt 的输入切点相同；改变内容即新 Step | 沿用 SR-08、MC-06 | E3 | TLA+ |
| I-9 | Step 收束当且仅当批内不存在 `executing_foreground` 与 `admitted_pending_start` | 本次提出（封闭词表，U-3） | E5 | TLA+ 动作前提；六种状态组合测试 |
| I-10 | 每个已准入调用在任何时刻恰有一个执行 owner；Run 只持有前台等待关系；detach 不改变 call/attempt 身份 | 沿用 TL-07/10 | 工具能力 | 场景 |
| I-11 | 调用结果写回模型历史的顺序等于模型发出的顺序，与完成顺序无关；完成顺序单独记录 | 沿用 SR-09，本次引为循环不变式 | E5 | 并发完成乱序测试 |
| I-12 | 未派发即被取消的调用得到合成终态；不存在无结局的调用 | 沿用 PF-013.C4、TL-09 | E7 | 收口场景 |

### Inbound

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| I-13 | 每个 arrival 恰被裁决一次意图，且裁决与目标 Run 的终态转移在同一协调域全序；`continuation` 意图只指向裁决时非终态的 Run | 本次提出 | Inbound 短提交 | TLA+：`∀a: a.intent = continuation ⇒ a.observedRun.state ∉ terminal` |
| I-14 | Run 结算时不存在指向它的未消费 `continuation`；结算前一律转换为 trigger 并记录 | 本次提出，落实 SR-09 | E8 | TLA+ 动作前提 |
| I-15 | `(source, dedupKey)` 相同的到达只有一条 arrival；重投返回原项 | 沿用 CC-05、PF-002.C9、PF-011.C9 | Inbound 受理 | 重放测试 |
| I-16 | `context` 意图的 arrival 永不创建 Run、永不唤醒 waiting 的 Run | 沿用 PF-002.C8 | 裁决表 | 结构检查 |
| I-17 | 每类来源的未消费 arrival 数量有界；满时拒绝并记录，不覆盖已受理项 | 沿用 SR-04、PF-002.C9、PF-011.C9 | 受理 | 容量测试 |

### 恢复

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| I-18 | `decide` 是已提交事实的纯函数：相同事实前缀必得相同意图；恢复重跑不会产生第二次模型请求或第二次工具派发 | 本次提出，核心 | Loop 设计 | TLA+ refinement；每个安全边界前后各注入一次崩溃 |
| I-19 | 恢复只从已提交前缀重建驱动位置（projection），不读运行时对象；可能已发出的请求先核实原 attempt，unknown 不重发 | 沿用 SR-14、CC-06 | E0 | 恢复场景 |
| I-20 | `decide` 产生的每次共同提交的 operationId 从事实前缀确定地派生（`f(RunRef, stepId, intentKind, ordinal)`）；恢复重跑与崩溃前那次提交使用同一 operationId，由 CC-03/DR-02 去重认回 | 本次提出，I-18 的成立条件 | Loop 的意图到提交映射 | TLA+：同一前缀 ⇒ 同一 operationId；崩溃后重跑的去重测试 |
| I-21 | E0 进入 `decide` 前，Session 不存在 `accepted` 而未 `classified` 的 arrival | 本次提出 | E0 第 3 步 | 恢复场景：受理后裁决前崩溃 |

## 进展不变式

| 编号 | 陈述 | 来源 | 说明 |
|---|---|---|---|
| P-1 | Run 处于 waiting 且存在就绪接续时，最终会开新 Step（若执行权有效且无阻塞） | 本次提出，落实 SR-09 | 防"有答复但不接续"；要求 E6 的订阅不丢事件 |
| P-2 | Session 无活动占位且队列有合格项时，最终会开新 Run | 本次提出 | 防饿死；受 I-17 有界和 SR-07 让行次数约束 |
| P-3 | 收口最终以 `interrupted / cancelled / stopping(隔离未证实)` 之一结束，不停留在无记录的中间态 | 沿用 SR-10/12 | unknown 允许长期存在，但必须可见 |
| P-4 | 没有就绪接续时 Loop 不发出模型请求 | 沿用 SR-09 | 对应 SYS-LONG-RUNNING 的成本约束 |

## 证据义务

- 本次提出的 I-5、I-9、I-13、I-14、I-18、I-20、I-21 与 P-1、P-2 是接受本提案前
  必须有形式模型覆盖的条目；其余沿用条目由所属契约的既有证据承担，本提案只需核对
  适用性。
- 恢复证据须按 [Loop](loop.md) 的崩溃窗口表逐窗口注入崩溃，核对判定与表一致；
  模型流式前缀不可恢复、同进程前台工具 unknown 两项作为已接受局限写入验证边界。
- 全部测试证据在实现阶段按验证规范给出；本提案接受不等于这些性质已被证明。
