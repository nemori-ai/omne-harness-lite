# RT6 的精确消费者传播（candidate）

从 D-090 已接受 RT5 演进，保留十三服务操作与公开函数、取消/实际停止、头事实、凭据、首内容强门、SL3 late/完整批/未知恢复。新增输入限制门和两份共享数据投影；候选未接受，不自动升级旧消费者。

| 消费者/输入 | 精确变化 | 负责产物及完成条件 |
|---|---|---|
| MP4、Directory4 | 完整 snapshot 的 cap/inputConstraints/upstreamInputLimits；绑定后不得读目录补值；新目录值须通过 MP4 全值规则 | profile/directory owner；S-8/S-9/S-27/S-32/S-33 与 Directory4 原读面，新旧格式显式分发 |
| MS5 | 每条已出门保留完整 MP4 snapshot；不在 messages 增 retry 来源字段 | messages、runtime/codec owner；ModelCallDispatchedRecord 原身份/绑定/参数/锚点不变 |
| MR6 | S-39 PendingModelResponse 拥有完整未处分投影，禁止 disposition/late；S-40 快照与历史版本 | response、runtime 与全部响应写方；S29先交完整事实，S17/S49显式处分后构造，persisted批仍同提交 |
| LC5 | S-42 Conclusion.modelCallId、S-43 FailureSubject.retryConclusions，S14/S30/S32原结论权威 | LC/runner/runtime owner；按同一会话调用日志序完整原值，不裁剪或隐计数 |
| runner4 | 写失败维所有 Conclusion 时明确 modelCallId；原最终结论回放、主体完整透传 | runner owner；缺关联不得新写，未发出的已给结论保留，自定义件不冒充默认计次 |
| 公开 invokeModel、plan/send | S74每次最终输入计量，公开面不能绕开；固定计划与实际发送一致 | runtime/transport owner；真实 token计量证据、严格base64、完整UTF8请求、可变输入与伪计划负控 |
| 服务 dispatch/dispatchAgain/续接 | 锚点前同一门；新三拒绝均无新HTTP/锚点/响应/终结，历史不抹除 | runtime owner；重新规划新消息工具，旧快照缺cap拒发，原时限/凭据/守卫顺序不变 |
| 全部回复写方及共同codec | 分开 Pending/ModelResponse；历史版本继续旧读/结算，新发送显式新快照 | codec/loop/写方与主线；旧字段不回填，原ResponseId/MessageId/共同键认完整批，不默认处分或late |
| session-log v3/Run owner | 条目壳/同次完整前缀/尾比较/整批/实际停止原义不变 | 日志/Run owner；G-28生产Run认法仍未定，G-29/G-30真实链不因候选关闭 |
| 其他十二依赖 | 仍精确采用 RT5 原版本；CB3新实质消费S10/S23，MR6/LC5新增条款见S4 | 各原owner；无自动资产/身份/消息其他政策升级 |

切换继续先完成精确采用与共同codec，再停旧准入、实际收束旧写方，按原恢复时机权威读回；已有原合法批优先。不能在不知道旧追加结果时换新ID或重发模型，也不能靠新检查把旧记录回写成新快照。

新增形式工件范围与前提见[formal](formal/README.md#v6-新增行为义务未运行)；四继承模型十九配置逐字相同，新模型不证明实际计量或生产Run识别。TLC/Alloy未运行；规范场景与真实IO均未开始，见[验证入口](../verification.md#v6-候选变化与证据)。

G-32候选批集成，G-33计量和材料证据，G-34历史codec，G-35真实重试源链与全部继承缺口保留。任何不能满足的事实保持明确失败/owner，不伪造默认值。
