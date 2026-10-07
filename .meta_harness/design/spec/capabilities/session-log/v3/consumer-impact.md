# SL3 精确消费者传播

本表是候选迁移义务，依据 D-081，没有修改、接受或重新绑定任何消费者。新条件是公开面变化，`append` 的三参数调用不能静默当四参数调用。表中其他契约是**消费者侧核对输入**，不是 SL 解释这些业务载荷的规范依赖；catalog 不因此登反方向依赖。

## 当前已登记的消费坐标

同 baseline `omne-harness-lite-design-2026-09-15`。以下六条消费关系逐项从当前 catalog 读取，均钉 SL2。

| 当前消费者 | 精确消费 SL2 clauses | SL3 对应与处理 | owner／闭合证据 |
|---|---|---|---|
| [model-request-runtime v3](../../model-request-runtime/v3/contract.md) | S-6/S-8/S-10/S-13/S-14/S-17/S-19/S-22/S-23 | 同号保留；新增 S-32～S-36 必须显式消费。RT3 S-7/S-8/S-17/S-33/S-38 的 SL2 依赖不能原地改；主线须发布新版本或裁定精确等价的合法消费演进 | runtime owner；独立规格评审、采用、全响应写方迁移与真实交错验收 |
| [model-request-runtime v2](../../model-request-runtime/v2/contract.md) | S-6/S-8/S-10/S-13/S-14/S-17/S-19 | 历史精确采用继续保留；不能作为新准确 late 组合的完成依据 | 当前装配 owner 明示旧实例停止或保留的范围 |
| [loop-extension-runner v3](../../loop-extension-runner/v3/contract.md) | S-8/S-9/S-10 | 旧判重、读键、栅栏含义不变。若接 SL3，所有追加显式选 condition；普通结论可由该 owner 明确选 unconditional，不自动决定 | runner owner；接口／提供者投影及实际带 fence 追加测试 |
| [loop-extension-runner v2](../../loop-extension-runner/v2/contract.md) | S-8/S-9/S-10 | 未迁移则继续旧采用；不可隐式改到 SL3 | 装配 owner 核实没有混用面 |
| [tool-execution-runtime v2](../../tool-execution-runtime/v2/contract.md) | S-3/S-6/S-8/S-17 | 出站批判重与整批持久保留；若接 SL3 须显式 condition，不在本轮扩大工具 SQL／费用协调 | tools owner；实际排空、丢回执和重启认回 |
| [run-attempt-facts v2](../../run-attempt-facts/v2/contract.md) | S-10/S-11/S-13 | 读面含义不变。S-6/G-2 的假值可过期仍然成立；其布尔结果不替代 SL3 S-34 的完整前缀 | facts owner；不能把 RAF 假值与另一次 tail 拼为写入许可 |

同名方法或保留旧 clauses 的语义不足以证明实现可混用；调用面、实参选择、作用域、旧实例及持久恢复须由实际装配逐项闭合。

## 模型响应写方：每条路径都进入条件保护

准确 late 的既有业务权威为 [model-response v4 S-35](../../../data/model-response/v4/contract.md)、[call-accounts v2 S-39](../../../data/call-accounts/v2/contract.md)；模型结算、整批与未知恢复由 RT3 S-17/S-33/S-38 约束。这些业务保证保持，SL3 不拥有其解释。

| 实际路径／当前条款 | 迁移后的必要动作与边界 | 验收可观察结果 |
|---|---|---|
| 正常无回复响应：RT3 S-17/S-29/S-30 | 同一合法完整前缀中识别原发出 attempt 和 Run 状态，构造整批，unfenced + tailEquals | 边界先到 ⇒ 尾冲突、重读后准确 late；响应先到 ⇒ 后续边界不改旧值 |
| 用户／宿主中断：RT3 S-31 | 中断意图的推进写仍按自己的 fence；已发响应结算独立走新条件，不把冲突变为故障重发 | 用户中断归属与原因不变；响应不丢、不重发 |
| release／宿主撤除：RT3 S-32/S-36 | 保留实际资源停止和旧追加任务收束；撤除结算与回复方争同一 ResponseId | 先到者原值保留，败方不留下孤立消息；没有无人收口的追加 |
| settleReply：RT3 S-49 | vetoed／consumed 由 runtime 条件提交；不伪称回复已 persisted | 已提交原响应不可覆盖；冲突仅重建未提交批 |
| reconcile：RT3 S-33 | 按原发出 attempt 判 late；条目壳可以归新的恢复尝试，不能拿壳替换原发出事实；unknown opened 的既有前提继续 | 新旧壳不同仍判对 late；未实际停止旧写者前缺席读不能关闭 unknown |
| 独立 reply_pending 回复提交方：RT3 S-17/S-38 | 消息与 persisted 响应以同一 tailEquals 整批 unfenced 提交，稳定 MessageId/ResponseId 和共同键保持 | 任意一键撞上 ⇒ 整批零写；两者反向竞争均可认回原完整批 |
| 无 Run 的调用及公共 invokeModel | 不增加 late；SL 条件不使公共独立函数依赖日志。若某 durable 消费者采用条件，由它明示 | 独立函数边界保持；无 Run 不伪造 Run/attempt/late |

所有路径共享三项恢复原则：先认回原完整业务批；拒绝仅否定本次写，不否定旧未知；重试／退避／超时／争用预算由消费者具名配置，不从 SL3 的模型常量取生产默认。

## 同一权威顺序中的其余写方

| 写方 | 必须进入什么范围 | 不由本次决定什么 |
|---|---|---|
| 真实尝试启动方，以及任一首次引入更大 attempt 壳的写方 | 同一会话权威提交域，完整前缀能观察其真实壳；尝试开始前置沿旧 owner | 完整 Run 状态机、attempt 初始生成政策 |
| Run 正常完成、失败、取消及强停后会话治理代写方 | 真实终结进入同一日志顺序，消费者用原 owner 的认法识别 | 终结记录正式表示；本轮验收驱动只识别自己实际生产的记录 |
| dispatched/opened/intent/调用 ended 写方 | 同一日志提交域；新条件不能削弱原 fence、opened 先于可见或实际停止保证 | 调用 ended 不是 Run 终结；禁止二者混用 |
| runner、入站、普通消息与其他 Run 写方 | 全部追加改变同一实际尾，即使与本次模型调用无关 | 不要求它们新增协调条目，也不自动要求每次用 tailEquals |

## 提供者、装配和证据的传播

| 产物／现有精确输入 | 后续修改责任 | 尚未闭合 |
|---|---|---|
| [session-log-jsonl 现行入口](../../../../realization/packages/session/session-log-jsonl/README.md)／[v2 候选](../../../../realization/packages/session/session-log-jsonl/v2-design.md) | 日志 owner 发布明确 SL3 采用的投影：共同实际提交对象、尾判定与批次写入、恢复读取、旧 owner 交接 | 本版 binding 数为 0；JSONL IO、杀进程、旧 writer 静止、跨实例互斥未验证；G2-6 多值响应头未解决 |
| [model-request-runtime v3 投影](../../../../realization/packages/model/model-request-runtime/v3-design.md) L-4/L-5、Q-1～Q-4 | runtime owner 更新精确消费、全部结算写方、共同键、原 attempt 与完整前缀来源；采用须跟随新 runtime 规范 | 不能仅改一个 helper 或正常路径便声称全部覆盖；旧 SL2 充分性由 D-081 取代的范围仍待真实兑现 |
| 回复生产者／主验收装配 | 装配 owner 核实所有直接响应写入路径迁移，未迁移旧写者真实停止；授权前缀读取与租户保持 | 生产 Run 终结认法未定；测试驱动不得关闭完整 Agent Loop 缺口 |
| 行为模型与真实验收 | 后续独立验证者运行本包配置、负控及真实进程／文件／同批竞争 | 本次只有起草和结构检查；旧有限脚本或 SL2 模型结果不等于 SL3 已执行 |

本表不产生新增能力、Schema、消费者版本号或源码授权。只有相关规格、provider 映射、装配与证据分别达到其要求时，才可关闭对应纵线阻断；其他独立纯函数工作不必等待完整 Run 产品。
