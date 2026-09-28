# RT9 的精确消费者传播（candidate）

本版在 D-101 已接受 RT8 上只切换 MR8，并明确 S-17/S-33/S-36/S-54 的时序投影。十三操作、tokenMargin、计量保证和其余当前链原样继承；不引入兼容层。

| 消费者 | 影响与边界 | owner 与完成条件 |
|---|---|---|
| model-response 数据实现与所有响应读写方 | 根 Timing.sentAt 可 null，限 interrupted；Pending 仍实际 Instant；保留真实已知值，更新纯校验与公开类型 | core/response owner，MR8 Schema、纯判定正反验收 |
| runtime 的锚点结算、撤除与 reconcile | 无可用实际时刻时诚实 null；已确认锚点、旧工作停止、权威完整前缀仍先成立 | runtime owner，H1～H7 真实恢复与零 HTTP，含完整原批认回 |
| 公开 invokeModel 与 transport | 结果仍是实际发送时刻；cancelledBeforeSend 无结果时序；不把可空持久 Timing 直接用于公开函数结果 | runtime/transport owner，独立面与服务面隔离回归 |
| 共同日志 codec、账目及消费者 UI | 不猜时间，不据 null 放行重发，不将用量费用归零；原精确已知值保留 | codec/runtime/demo owner，保存后 reopen 与显示未知 |
| MS6 / MP6 / Directory5 / LC6 | 未改其拥有的字段、判定或承诺，继续原精确消费，不因坐标字符串连锁升版 | 原 owner；本次无改动 |
| loop-extension-runner/v5 | 只实质消费 MR7 S-10/S-14/S-36，不接收根 ModelResponse Schema 或 Timing；这些条款不变 | 不需要后继版；实际实现若私下依赖根响应旧值域，须修其越界依赖，不由此推升全部规格 |

现有完整原批不得被新候选覆盖；已受理任务的耐久义务及授权/实际停止仍沿 RT8。v8 全部计量正反义务继承；v9 新 RecoveryTiming 模型与 H1～H7 只增加相称恢复证据，不代证旧模型、网络行为或实现。
