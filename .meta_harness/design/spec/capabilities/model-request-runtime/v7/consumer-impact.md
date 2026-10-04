# RT7 的精确消费者传播（candidate）

从 D-099 已接受 RT6 演进，十三服务操作与公开函数、取消/实际停止、头事实、凭据、首内容强门、SL3 late/完整批/未知恢复、输入限制门、两份共享投影及 S-34 失败重取均保持。只改变精确消费链与旧格式兼容边界；本版仍为候选，当前运行采用者须同步迁移。

| 消费者/输入 | 精确变化 | 负责产物及完成条件 |
|---|---|---|
| MP5、Directory5 | 完整 snapshot 的 cap/inputConstraints/upstreamInputLimits；绑定后不得读目录补值；新目录值须通过 MP5 全值规则 | profile/directory owner；S-8/S-9/S-27/S-32/S-33 与 Directory5 原读面，当前格式精确采用；不提供旧格式入口 |
| MS6 | 每条已出门保留完整 MP5 snapshot；不在 messages 增 retry 来源字段 | messages、runtime/codec owner；ModelCallDispatchedRecord 原身份/绑定/参数/锚点不变 |
| MR7 | S-39 PendingModelResponse 拥有完整未处分投影，禁止 disposition/late；S-40 快照与历史版本 | response、runtime 与全部响应写方；S29先交完整事实，S17/S49显式处分后构造，persisted批仍同提交 |
| LC6 | S-42 Conclusion.modelCallId、S-43 FailureSubject.retryConclusions，S14/S30/S32原结论权威 | LC/runner/runtime owner；按同一会话调用日志序完整原值，不裁剪或隐计数 |
| runner5 | 写失败维所有 Conclusion 时明确 modelCallId；原最终结论回放、主体完整透传 | runner owner；缺关联不得新写，未发出的已给结论保留，自定义件不冒充默认计次 |
| 公开 invokeModel、plan/send | S74每次最终输入计量，公开面不能绕开；固定计划与实际发送一致 | runtime/transport owner；真实 token计量证据、严格base64、完整UTF8请求、可变输入与伪计划负控 |
| readAttempts 及恢复消费者 | S34在awaiting_decision/最新failed时从同一完整前缀必带完整failureSubject；来源恢复后可只读重取，其他状态不附；不可判整体unavailable | runtime/loop调用者；RT7-R5～R8，读取不写、不发、不取凭据、不计次，后续发出仍按实时状态/fence守卫 |
| 服务 dispatch/dispatchAgain/续接 | 锚点前同一门；新三拒绝均无新HTTP/锚点/响应/终结，历史不抹除 | runtime owner；重新规划新消息工具，旧快照缺cap拒发，原时限/凭据/守卫顺序不变 |
| 全部回复写方及共同codec | 分开 Pending/ModelResponse；只消费当前格式，新发送使用当前代际完整快照；不提供旧格式读/结算路径 | codec/loop/写方与主线；旧字段不回填，原ResponseId/MessageId/共同键认完整批，不默认处分或late |
| session-log v3/Run owner | 条目壳/同次完整前缀/尾比较/整批/实际停止原义不变 | 日志/Run owner；G-28生产Run认法仍未定，G-29/G-30真实链不因候选关闭 |
| 其他十二依赖 | 仍精确采用 RT5 原版本；CB3新实质消费S10/S23，MR7/LC6新增条款见S4 | 各原owner；无自动资产/身份/消息其他政策升级 |

当前运行面同步采用本版精确链并删除被替代的旧实现，不建立双轨或过渡 codec，不改写或清空用户旧数据。当前代际已受理调用的写方实际停止、权威认回与未知结果责任照原规则；已有原合法批优先，不能在不知道本代际追加结果时换新 ID 或重发模型，也不能靠新检查回填快照。

前驱新增形式工件的范围与前提见[formal](formal/README.md#v6-新增行为义务)；本版全部模型和配置逐字继承，模型不证明实际计量或生产Run识别。前驱 RT6 的三模型四正六负在原精确输入下已有独立 TLC 结果，证据仍只属于该前驱范围；本版全部模型与配置逐字节继承，本轮未运行 TLC 或 Alloy，当前格式拒绝、规范场景与真实 IO 均未开始，见[验证入口](../verification.md#v7-候选变化与证据)。

G-32候选批集成，G-33计量和材料证据，G-34当前格式采用与拒绝证据，G-35真实重试源链与全部继承缺口保留。任何不能满足的事实保持明确失败/owner，不伪造默认值。
