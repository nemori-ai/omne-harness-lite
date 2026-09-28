# RT8 的精确消费者传播（candidate）

从 D-100 已接受 RT7 演进，十三服务操作与公开函数、取消/实际停止、头事实、凭据、首内容强门、SL3 late/完整批/未知恢复、输入限制门、两份共享投影及 S-34 失败重取均保持。只改变 token 准入保证及 MP6 直接语义采用；本版仍为候选，当前运行采用者须同步迁移。

| 消费者/输入 | 精确变化 | 负责产物及完成条件 |
|---|---|---|
| MP6、Directory5 | 完整 snapshot 的 cap/inputConstraints/upstreamInputLimits；绑定后不得读目录补值；目录仍按 MP5 全值与同名数值规则；这些与 MP6 的纯判定相同 | runtime采用MP6 S-8/S-33估算保证；Directory5不升级；现有MP5值结构与本版一致，未引入旧运行格式入口 |
| MS6 | 每条已出门保留完整 MP5 snapshot；不在 messages 增 retry 来源字段 | messages、runtime/codec owner；ModelCallDispatchedRecord 原身份/绑定/参数/锚点不变 |
| MR7 | S-39 PendingModelResponse 拥有完整未处分投影，禁止 disposition/late；S-40 快照与历史版本 | response、runtime 与全部响应写方；S29先交完整事实，S17/S49显式处分后构造，persisted批仍同提交 |
| LC6 | S-42 Conclusion.modelCallId、S-43 FailureSubject.retryConclusions，S14/S30/S32原结论权威 | LC/runner/runtime owner；按同一会话调用日志序完整原值，不裁剪或隐计数 |
| runner5 | 写失败维所有 Conclusion 时明确 modelCallId；原最终结论回放、主体完整透传 | runner owner；缺关联不得新写，未发出的已给结论保留，自定义件不冒充默认计次 |
| 公开 invokeModel、plan/send | S74每次最终输入计量，公开面不能绕开；固定计划与实际发送一致 | runtime/transport owner；有依据 tokenizer估算/准确/上界证据及显式tokenMargin、严格base64、完整UTF8请求、可变输入与伪计划负控 |
| readAttempts 及恢复消费者 | S34在awaiting_decision/最新failed时从同一完整前缀必带完整failureSubject；来源恢复后可只读重取，其他状态不附；不可判整体unavailable | runtime/loop调用者；RT8-R5～R8，读取不写、不发、不取凭据、不计次，后续发出仍按实时状态/fence守卫 |
| 服务 dispatch/dispatchAgain/续接 | 锚点前同一门；新三拒绝均无新HTTP/锚点/响应/终结，历史不抹除 | runtime owner；重新规划新消息工具，旧快照缺cap拒发，原时限/凭据/守卫顺序不变 |
| 全部回复写方及共同codec | 分开 Pending/ModelResponse；只消费当前格式，新发送使用当前代际完整快照；不提供旧格式读/结算路径 | codec/loop/写方与主线；旧字段不回填，原ResponseId/MessageId/共同键认完整批，不默认处分或late |
| session-log v3/Run owner | 条目壳/同次完整前缀/尾比较/整批/实际停止原义不变 | 日志/Run owner；G-28生产Run认法仍未定，G-29/G-30真实链不因候选关闭 |
| 其他十二依赖 | 仍精确采用 RT5 原版本；CB3新实质消费S10/S23，MR7/LC6新增条款见S4 | 各原owner；无自动资产/身份/消息其他政策升级 |

当前运行面同步采用本版精确链并删除被替代的旧实现，不建立双轨或过渡 codec，不改写或清空用户旧数据。当前代际已受理调用的写方实际停止、权威认回与未知结果责任照原规则；已有原合法批优先，不能在不知道本代际追加结果时换新 ID 或重发模型，也不能靠新检查回填快照。

FinalPlan 两正配置及九份负控按本版 S-74 修改；其他六份模型与其配置逐字继承。实际工具证据在[verification](../verification.md#v8-估算计量保证)，真实供给、tokenizer适用依据及网络纵线仍未开始。

## 不升级四个表示消费者的依据

- MS6 S-49：接收方只重验MP5快照形状；S-18/S-33数值关系及复制归写方，最终计量归runtime。
- MR7 S-40：快照接收不重判写方输入门，实际计量证据、固定计划与发送许可归能力。
- LC6 S-14/S-43：保留profile、dispatch绑定和retry历史；它未规定token算法。
- Directory5 S-4/S-36：只执行完整文档、同名有限数值比较、完整读写和时标；S-36第4项明确目录成功不证明实际输入可计量/可发送。

MP6未改变上述合法值域与纯判定。这些契约继续精确引用MP5表示资源，RT8直接采用MP6发送语义，没有七包整链升版，也没有新增旧格式兼容。无实质数据形状冲突；主线负责接受此最小采用组合。

G-32仅保留这两份候选及登记集成；G-33保留真实计量/材料依据，G-34保留当前格式责任，G-35保留真实重试链；G-28等继承owner不变。
