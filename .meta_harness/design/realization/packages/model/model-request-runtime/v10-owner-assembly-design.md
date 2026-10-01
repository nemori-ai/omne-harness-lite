# 十三操作共享 owner 的具体装配接续

2026-09-28，candidate，待窄评与技术采用；新增绑定0。只精化D-100已采用 [v7](v7-current-design.md) 的调用容器、P-2组合、关闭及宿主责任，不变更RT8操作或产品边界；估算政策另沿 [v9](v9-token-estimate-design.md)。

## 公共实现与服务组合

根工厂 `createModelRuntime(construction)` 组合A选择/读取、B新建/发出/控制、C回复结算/恢复，返回 `{service,close}`；十三操作共享同一 `CallContainerStore`、会话绑定及原invocation，不各建owner。公开组合仍可不经Cordis消费。

`CallContainerStore.waitReserve` 只在本进程串行化一调用的短操作，采用显式 `reservationWaitPolicy:{maxWaitersPerCall,timeoutMs}`，两项正有限整数；计时由注入scheduler所有。订阅先于占用检查，释放唤醒后重判；取消/满/超时沿unavailable。不得把durable settlement重试预算挪作排队默认，不锁住整个流以阻塞interrupt。

`reservation.attachInvocation(original)` 只允许本次reservation绑定原锚定句柄、禁止覆盖；结束短reservation不结束调用。`updateRequest` 仅供RT8 S28明确许可的resumable更新：相同会话/调用/原host、ready且无unknown责任，owned copy新messages/tools/report等当次请求；精确lease、原binding不替换，在途不得改。后续实际dispatch仍重跑所有门。

关闭只在原 `invocation.close()` 与共同coordinator/任务实际停止、未知追加权威认回之后，归还精确lease一次。unavailable保持所有引用，不缓存成永久终态；并发close共享一次正在进行的尝试，已released保持幂等。宿主可在实际阻断事实消除后再close，无隐藏重发或新的预算默认。

## 统一组合的全部调用收口（可独立采用的实现面）

一份 `RuntimeConstruction.calls` 只由一个组合实例拥有；宿主不能把同一 store 给两个独立关闭者。`CallContainerStore.close()` 同步关闭该 store 的新 reservation 与 insert/attach/replace/update 准入，唤醒等待者，然后向已拥有的全部容器启动原 `container.close()`；不因其中一个 unavailable 跳过其他容器。`reserve` 增加明确 `closed` 分支，`waitReserve` 在 store 已关时直接 unavailable，释放已有 reservation 及移除确已 released 的容器仍合法。关闭之后没有新的延迟工厂被调用；若 openCall 正在取得资源，后续 insert 失败，由原 openCall 的 finally 归还未移交 lease。

store 保留仍未确认释放的容器、在途 reservation 和等待任务；本次任一容器未 released、reservation 尚未归还、timer 尚未 stopped，都返回 unavailable，不伪造整组成功。所有已 released 容器可自本地表去除；其持有的历史仍在 SL3。同一时刻并发 close 共享一次尝试；仅全体 released 可记为最终释放，unavailable/抛错清掉本次等待缓存以允许后续重试，绝不重新开放准入。关闭并不清空 unknown、改写日志或释放一个尚未停的 lease。此处不替代下一节所述跨日志换代交接。

`createModelRuntime` 在调用十三方法前同步登记本实例的在途 Promise，并在 finally 解除。close 先同步关全部新业务操作的准入，给 openCall/dispatch/dispatchAgain 返回既有 runtimeStopped，其余操作返回既有 unavailable；此时独立公共构件的消费者仍自行持有其 owner，不能借它绕过已关闭服务。随后同时请求 A 读面、B 三组合件以及 calls store 停止；逐一等其实际停止结果，等已登记的方法终局，重新检查这一过程中归还的容器/登记。单项异常记录结构化诊断并保留整个组合 owner；不通过 Promise.all 的首个 rejection 丢掉其他收口结果。

组合仅当所有组件和 store 均 released、在途操作集合为空才返回 released；否则 unavailable，宿主继续持有。并发 close/重试规则与 store 一致。已关闭的服务不能用于认回业务；原组件 close 内只允许原责任的停止、权威全前缀认回和释放，不复活业务入口。L1 永久撤除的认回仍是下述未采用端口缺口，不能用这份统一组合增量声称解决。

组成件工厂当前为同步、无 I/O 构造；组合先创建一个真实可重试关闭的 owner，再创建/发布各方法。宿主若在 construct 中自行取得资源，则必须在第一项取得之前持有该 owner，并以同一 close 处理部分失败；插件得到结果之前的异常不能委托给插件接手。

验收新增：两个 session 同 callId 的所有容器都会被停止；一容器 unknown 时其他容器仍实际释放且 unknown 引用保留；close 与等待 reservation/迟到 insert/replace factory 竞争零新发；在途 openCall 未移交 lease 由其 finally 唯一归还；A/B 组件第一次 unavailable 后实际认回再 close 可 released；并发 close 与部分构造失败不重复释放、不遗失 owner。本增量尚未经过独立复评，不据此开工新增 store/组合端口。

## P-2宿主留责与Cordis装卸

`createModelRuntimePlugin({construct})` 必需依赖及服务键沿v7。`construct()` 每次装载创建组合，并**在返回前由应用宿主持有**其owner，返回 `{service,owner:{close,release}}`。host owner的close执行原组合close；release只解除宿主保留集合的引用，不代替关闭资源。

一项组合effect撤除先关闭新调用/发出准入，再await owner.close。只有明确 `{released:true}` 后才恰一次owner.release；unavailable或抛错记录诊断且不release。Cordis fiber可消失，宿主的持有继续有效；宿主随后在旧工作真实停止、可认回时重试close，或按既有恢复流程承接。不能以logger代替留责、不能寄望effect之外的垃圾回收完成交接。构造部分失败也必须走同一owner收口；服务发布失败不跳过宿主保留。

宿主保留集合是进程内资源owner集合，不是第二本日志、恢复真相或新通用注册服务；进程崩溃后仍只沿SL3权威日志恢复。最小demo由bootstrap作用域真实持有该集合、随资源关闭重试未释放owner；公共插件的文档消费者必须同样提供实际持有，不给空release回调冒验收。

## 恢复和诊断边界

`RuntimeRecoveryAccess.enter(input)` 是真实动作端口：宿主先关闭旧准入并使旧网络、门、读写者实际停止，取得唯一重承载/恢复权后才交 `{scope:{binding,owner,close}}`。无此事实只返回unavailable；不能接收两个Run布尔量或一个已停止标志。scope.close等待本次恢复自己的工作真实停止后解除恢复准入。withRun真实Run解释与runner结论源仍按既有gap另行交付。

`RuntimeConstruction.diagnostic` 必须接宿主真实结构化诊断sink，沿既有来源脱敏、sink异常隔离和身份范围。不以会话日志取代系统诊断；无新增数据库对象。同提交要求仍是v7的同一会话日志对象、尾比较/判重/fence/整批追加，不由本地reservation提供。

## 验收义务

1. 短reservation释放唤醒无丢信号、取消/容量/超时有界；stream期间interrupt可进入。
2. ready续接更新实际新messages/tools，原lease/binding不变；在途/跨调用/unknown拒绝更新。
3. close首次unavailable保留原owner和lease，原任务停止后再次close一次释放；并发close不重复；未知写者未消除一直保留且零重写。
4. 真Cordis Context依赖撤除后，fiber消失而宿主仍能定位未释放owner；停止条件达成后宿主重试成功并唯一release；构造/发布失败同样不泄漏责任。
5. 实际宿主日志恢复拒绝未停止旧写者、同前缀读写/原批认回；恢复没有plan/send。受控recovery host只能证明算法，不等于demo真实承接。
6. 系统诊断sink实际收到范围和脱敏后的失败；sink抛错不改变已提交结果。

实际实现与各项组合证据分别验收；本页不关闭sentAt恢复表达缺口，不声称十三操作或整个P-2已完成。
