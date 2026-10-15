# Model 主干契约的消费与反例

本页配合[运行契约候选](runtime-contract.md)，状态同为候选。以下是消费协议、有限状态检查和后继实现的验证输入，不代表生产 runtime 已存在。普通 TypeScript 示例只检查接口能否接合，不代替实际资格、耐久或网络证据。

## 独立执行与托管独立调用

独立程序先准备 FixedModelRequest 和显式 ModelTransport，再消费 executeModel 返回的事实。它不创建 Session、Run 或 attempt，不获得自动重试、保管和 ACK。请求含有托管附件或凭据时，传输适配器继续满足原资源访问规则。

prepare 拒绝不支持的表示时，流以 not-started/rejected 交回原 unsupported，start 不发生。start 前取消返回 not-started/cancelled；开始之后 signal 只请求停止。收到真实停止确认才得到 ended/interrupted，失联则得到 ended/failed，完成与取消竞争时保留实际 completed。上述独立结果没有伪造的托管控制身份。

托管独立程序先登记自己的 consumer owner、work、position 和 purpose。它用当前主体、明确租户、原 call、受理 operation、固定 request 与容量调用 admit。成功之后即使暂时找不到活体，也只用原 admission 查询事实。commit-unknown 同样只按原身份认回；不得换 call 再发。

受理 operation、读取 operation 和 ACK operation 必须分别固定，各自重试复用。实例 ID 只用于核对活体，不代替 call。主体、租户或结果版本缺失属于边界拒绝，不靠零值或默认 Session 补齐。

| 路径 | 观察及责任 |
| --- | --- |
| admit 成功、目录 live | 观察特定实例，原执行者保存内容并收场 |
| admit 成功、目录 no-live-route | 查询原调用；恢复宿主接续持久任务，消费者不创建替代调用 |
| admit commit-unknown | 查询原 operation；无法确认仍保留未知及原身份 |
| inspect not-accepted | 仅在 Storage 已排除原受理后，按原 operation 重新提交相同输入 |
| 原输入改变 | 使用新的明确业务调用；旧 call 配新参数必须 conflict |
| 只取消 observe | 该观察结束；原 Model 继续保存、重试、收场及记账 |

## 先处理后确认

1. 消费者等待整调用 settled。单个 dispatch 失败并不满足这个条件。
2. beginRead 取得首页和实际 read，后续按页读取。每页仍检查当前资格。
3. 消费者完成本用途的处理，可靠保存处理结果及完成事实，形成可验证的 DurableEvidence。
4. 消费者以原结果版本和 processed 证据调用 acknowledge。无需额外永久保留原全文。
5. 若 ACK 回执未知，查询原操作或以相同 ACK 身份和证据重复确认。不能重新领取 Model 全文来猜 ACK 是否生效。
6. Model 续做清理。消费者从自己的完成记录继续。

处理失败且未形成完成记录时，不得伪造证据。Model 继续保管。Run 是否结束与 ACK 是否合格分别判断。

## 先保管后确认

1. 消费者在原 consumer 位置可靠保存所需内容或独立可恢复引用，同时保存原 call、结果版本、用途、待交付责任及保留条件。
2. 保存不得仅指向 Model 即将释放的唯一副本。临时文件名和进程内句柄不满足可恢复条件。
3. retained 证据由其 owner 可核验的记录给出。Model 在当前承接资格下核验后提交 ACK 及清理任务。
4. 消费者崩溃后从自己的原位置继续处理。Model 的 ACK 回执丢失不要求复制第二份结果，也不恢复已获准清理的生产侧读取。

两条路径均允许真实失败或中断结果被依法处理后确认。业务已取消时由当前合格承接者处理原责任，不要求已撤权的旧主体回来同意。

## 竞争与恢复场景

| 初始条件与交错 | 合同要求的结果 | 事实拥有者与后继责任 |
| --- | --- | --- |
| 受理提交成功，schedule 前崩溃 | recover 按显式租户 scanPending，loadRecovery 取原请求/主体引用/容量/操作，再依法 claim | ModelCommands 保有待办；宿主不靠缓存或 Agent 存活 |
| 资格检查后归档，随后欲 start | 归档 R 与发送 S 在同一围栏排序；R 先则拒发，S 先则保留在途和控制 | Session/authorization 参加适用守卫；send 边界守住实际发起 |
| 首片语音到达，preserve 前崩溃 | 已持久 receive-window 为 uncertain；不能以没有已保存内容重发 | 当前恢复者排除旧执行者并核实窗口，无法还原则 runtime-lost |
| 策略决定已保存，应答丢失 | 查询原操作和 loadRecovery，沿原决定继续，不再次运行策略 | Model 决定记录与 dispatch 原身份 |
| 首内容已保存后断流 | 真实部分与原因保留，不生成第二份逻辑回复 | Model 原结果和消费者原位置 |
| beginRead 先提交、ACK 后提交 | 已开始的读受保护；新的 beginRead 返回 acknowledged | Model 读登记与清理；实际撤权仍可以结束读 |
| ACK 先提交、beginRead 后到 | 禁止新完整领取，不伪装未找到 | Model 返回确认与清理状态 |
| ACK 成功、清理失败且消费者退出 | ACK 不回滚，任务保留原因并由 Model 恢复续做 | Model 清理拥有者，不依赖消费者重确认 |
| 未知写与 ACK 竞争 | ACK 可成立，但清理保留未核实写的责任，不报告 released | 提供者查询原写并保护所涉内容 |
| 旧实例排除、后继 claim 后收到费用 | recordLateFact 验证原 dispatch、可信来源及事件，补原账 | 独立事实通道，不授旧实例推进权 |
| Session 归档后撤销归档，原响应晚到 | Model 保存实际结果；旧取消业务不复活，不自动创建后继 Run | Model 保管，Session/原消费者裁定业务去向 |
| 旧实例撤除晚于后继发布 | withdraw 仅移除同 registration/instance 的贡献 | 本域目录；原调用事实持续可查 |

这些序列要求提供者验证最末受保护动作的资格。把检查移到工厂构造、缓存 allowed，或仅依赖撤权通知，均不能满足竞争场景。

## 类型消费检查

临时检查从本成员 runtime-contract.md 的全部 TypeScript 代码块直接提取声明，不维护一份手工缩减的替代接口。使用仓库实际 kernel-basis、legal-identity、content-block、message、json-text 和 call-account 根类型，开启 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 及 noEmit。

正例检查独立函数不需要 Session、托管受理/原查询/目录/读取/processed ACK 可以连接、提供者具有恢复入口。负例检查缺少租户、混用 instance 与 call、使用未验证操作字符串、普通消费者发布实例、裸 saved 布尔代替交接证据、伪造独立函数 Session 参数和调用者越权访问 quiesce 均不能通过类型检查。

这些正例使用声明的消费者持久完成函数，不实现它，不能据此声称其 DurableEvidence 为真。类型检查也不能证明不同 operation 的字符串不同、主体当前有权或附件已耐久；这些是运行边界与协议的验证责任。探针脚本和原始输出随 #342 的过程证据交接，当前不新增生产导出。

## 有限状态模型

ModelHandoff 模型从一个已可靠受理的调用开始，枚举发送、撤权、首内容、收场、消费者保存、读取、ACK、结束写及清理的交错。发送次数和读取次数各限为二，单次至多一个真实读取。撤权与发送各为原子动作，因此模型验证的是所提出的围栏协议，不证明某个网络或数据库实现真的提供该原子性。

安全性质为确认必须已有消费者耐久责任、清理不能截断真实读/未完写、ACK 后不能新增读、撤权后不能新增发送、首内容后不能重新发送。清理进展性质只在 EndRead、CloseWrites、Cleanup 弱公平的前提下成立。这些前提表示读写实际能收口且清理持续得到执行；永久设备故障和永久未交接责任不在该进展结论中。

FirstContent 模型另行区分已接收内容、已保存内容和打开的 receive-window。已接收是验证用的事实观察，不是恢复者可以读取的内存。恢复者只能依据持久窗口与内容状态判断。模型检查“已收到首内容后不得重新生成”，并检验只看 durable=false 的错误恢复会产生反例。

检查必须同时运行正确模型和移除守卫的变体。ModelHandoff 的四个变体分别去掉撤权发送守卫、ACK 后新读守卫、清理读保护、消费者保管前提，均应得到对应不变量反例。FirstContent 的错误变体忽略窗口，应得到 NoRegeneration 反例。能查出这些错误，只说明模型及所检查性质对这些故障敏感。

模型不覆盖真实 Storage Worker、断电、可信身份来源、所有参与者跨进程围栏、供应商行为、内容引用耐久、原操作摘要、网络取消、Cordis 或无限多调用。生产提供者必须用同一场景取得相应实现证据。有限状态枚举不冒充无限状态证明，独立模型审阅与四成员组合核对继续进入 W6。
