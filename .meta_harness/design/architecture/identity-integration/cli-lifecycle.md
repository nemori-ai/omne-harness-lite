# CLI 关闭失败与终端恢复的精确投影修正

状态：已限定采用，产品及独立验收仍待。修正 client-integration 的 CLI 收尾投影及 managed CG 的拒绝转换。
原工厂、Schema、绑定名称与Config不变。managed CG 新增一个具名关闭观察资源，坐标在下节明确。本页只接受设计，不表示产品交付。
依据：CQ1 S10（D049采用）、CQ2 S10/S11（D051采用）、CG2 S11、retirement 的 OwnedWork 完成前提。
原公开 CG.close 的拒绝没有新增例外，即使另有“看起来已结束”的读数也不能主动撤 CLS。

## 区分关闭尝试、静止许可和整体完成

公共 CG.close 的成功是 CG 静止许可。抛出/拒绝只报告 client-close-failed，不产生静止许可。
managed CG 绑定对同一纯实例保存一次关闭尝试。公共 Service.close 观察此尝试的原成功/拒绝。
绑定登记的 OwnedWork.close 则只在该尝试成功后完成；尝试失败时保持未完成，保留借入 transport/CLS，记录稳定无秘密的关闭缺陷。
不得把原拒绝原样交协调器当作一条已经静止的失败行。没有超时放行、重试 close、移交到新代际或强行退出。
公开 close 的正常 Promise、错误身份和业务结果不改变；新职责属于 managed 绑定，独立调用仍由原拥有者遵守 CQ/CG 收尾条件。

这不新增一套业务工作计数。关闭许可仅从原完整 close 的成功观察取得。
公开 close 与登记 close 共用同一次尝试；后者不再触发第二次关闭计算。
如果尝试拒绝，旧尝试不会后来变成成功；本代保持 stopping，所保留资源只能由原责任方保有，不伪报 closed。

## 关闭尝试的具名观察通路

core/governance-client-operations 的纯根新增资源接口 `ClientCloseObservation { observe(attempt: Promise<void>): void }`。
其 `./cordis` 新增抽象 `GovernanceClientCloseObserver extends Service implements ClientCloseObservation`，
唯一键 `governanceClientCloseObserver`，常量 `GOVERNANCE_CLIENT_CLOSE_OBSERVER_SERVICE` 由 static provide 派生。
这是装配的运行观察资源，不是新增业务操作或持久对象；不进 JSON Config。

managedGovernanceClientOperationsPlugin 必需注入该键，以及原 clientLocalState、governanceTransport、assemblyLifetime。
缺席保持 PENDING，不静默丢弃关闭错误。独立绑定不注入此资源；独立用户仍从公开 close 取得结果。
应用在 CG 行加载前安装此行私有的观察 Service；它只同步保存一次 Promise 并立即接管其成功/拒绝观察。
重复 observe 为使用错误，拒绝发生在第二次 CG 创建之前。资源没有关闭权，不参与停止政策，也不保存错误内容作公开诊断。

绑定在同步 apply 建立稳定 deferred 关闭尝试，并预先接管其拒绝，随后按原 startAssemblyWork 登记。
在已登记 setup 的第一步调用 observer.observe(deferred.promise)，成功后才能创建纯 CG，再公开 Service。
公共 Service.close 与 OwnedWork.close 触发同一 attempt 函数；它同步登记为已开始，再调用纯实例.close，转发兑现/拒绝到上述 deferred。
没有实例的合法关闭前缀正常兑现；纯实例已创建则不能凭 Service 尚不可发现而跳过它。
OwnedWork 仍对该 deferred 的拒绝保持 pending，但应用持有原 deferred，故能报告缺陷而不释放 CLS。

登记失败/effect安装失败/setup尚未开始停止时，纯 CG 尚未创建；若 observer.observe 自身失败，也不能继续创建 CG。
已登记的这些前缀由原 ready/行关闭结果观察；CG尚未登记的前缀按下节的停止屏障确认，不虚构行关闭回执。
setup 在纯实例创建后、Service公开前失败时，原尝试仍经已建立的 observer 通路交付，覆盖 C-CLI-1。
观察者错误保留为启动缺陷；回调失败不会让已创建工作失去拥有者，因为分配严格在观察者接管之后。

## CLI/TUI 句柄及输入拥有者

应用装配同步建立句柄，异步 setup 由句柄的 ready 观察。句柄必须先于任何资源副作用可取得，以便启动失败也能执行原输入/终端收场。
它是 apps/cli 私有接口，不新增公共 CG 操作。控制/表示模块只消费公共 CG 和这个应用接口。

- ready 只有在四行 ready/ACTIVE 通过后交付客户端。失败保留原安全打开分类及完整清理责任。
- requestStop 同步请求同一装配停止，并通过同一次 CG 关闭尝试停止新动作/取消输入；不等待本地状态关闭才关闭 CG。
- clientStopped 独立观察 CG 静止许可：成功才能允许应用恢复终端；CG close 缺陷可立即拒绝并使应用报告70，但整个装配 closed 仍未完成。
- releasePresentation 只由输入/输出/终端拥有者在原 CQ 收场步骤实际结束后调用，幂等。CLI 文件输入已由完整 CG 关闭覆盖；TUI必须先等输入帧/普通输出，再尝试恢复终端。恢复抛错但已实际结束时按原 input-restore-failed 记录，然后允许原 CLS 释放；永不结束时不允许放行。
- closed 是原 AssemblyCloseReport，供应用观察所有允许释放资源的真实结果；不能用 clientStopped 的拒绝替它伪造一份完成报告。

应用在 CG 关闭缺陷分支保留原报告、稳定诊断及70，不恢复终端、不放行表示门、不等待不可能成立的完整 closed；这正是原 CQ 的“报告缺陷但不宣称静止”。自然进程结束不是资源完成证据。
CG 未曾创建的启动失败仍需先完成原终端处理再释放已打开 CLS。若 CG 已登记但未公开，装配继续观察该实际前缀，不能只凭 ctx.get 不到服务就断言没有工作。

## 启动前缀的完整观察分支

应用私有 CG AssemblyLifetimeService 端口的 register 委托原 port.register；返回成功后同步保存该 receipt，期间没有 await，也不执行用户回调。
该端口只属于本代这一 CG 行。startAssemblyWork 保证登记成功之前不运行 setup；纯 CG 的分配只能发生在该 setup 中。
应用创建 lifetime 时安装 onStopping 回调。此回调发生在原 lifetime 已同步 current=false 之后；之后所有 register 都拒绝，loader 的每次继续也检查 isCurrent。
因此 onStopping 是装载停止的实际屏障。应用在屏障之后读取其登记记录；此时记录缺席且未来不能登记，才可断言本代没有且不会创建 CG。
这沿用现有协调器的 current/register 规则，不增加行状态协议，也不依赖 ctx.get 缺席或整体 closed。

| 停止屏障后的实际记录 | clientStopped 的确定行为 |
|---|---|
| 无 CG receipt | 立即成功确认本代没有 CG 工作；保留原 ready 启动失败分类，不报告 client-close-failed |
| 有 receipt，但尚无 observe | 等该 CG receipt.closed；该行排空后若观察仍缺席，确认未分配CG并成功；若期间observe已发生，则采用所交付原尝试结果 |
| 已 observe | 观察稳定原 close Promise；成功表示静止，拒绝报告client-close-failed，不许可恢复/CLS释放 |

observer.observe 同步发生后，应用立即接管原尝试结果，不必等仍可能永久pending的 receipt.closed。
等待 receipt 的分支与 observe 后来的到达竞速，不能先 await receipt 再查询 observer；后者会再次遗漏未公开实例的close拒绝。
未停止时 clientStopped 不因暂时无 receipt 提前成功。loader 的 setup/缺依赖失败先调用同一 requestStop，才能采用屏障结果。
CG 为最后业务行，它的真实 receipt.closed 不等待 CLS 表示门；没有 CG receipt 的分支也不等待 transport/CLS 或整体 closed。
等待中的 CG setup 若永不结束，clientStopped 可以保持未完成；这是已有实际工作进展前提，不以假成功越过。

## 表示收场如何接入既有协调器

四业务行顺序仍为 storage 工厂→CLS→transport→CG，不再创建第二个协调器。
应用提供给 CLS 的 AssemblyLifetimeService 端口在登记时包装该行的 close：先等待应用的表示收场许可，再调用原 OwnedWork.close。
该包装只延后应用所拥有的依赖释放，不提前结束业务，不把运行对象塞入 Config。
应用按下表观察 clientStopped。CLS、transport 的释放错误不会撤销 CG 已静止事实。
前缀 setup 失败也经过同一表示门。应用必须持有同步句柄，不能在一个等待完整清理的 open Promise 失败后才取得恢复控制。
若 CG 失败或表示收场未结束，CLS 行不能完成，整体保持 stopping。没有“finally 一律放行”的路径。

## 比较与验收

直接转发任意 CG 拒绝会提前撤 CLS，不采用。
新增公共 CG 业务操作/第二工作台账会增加无必要的业务协议，不采用。原行协议不能传递被保留为 pending 的原拒绝，因此补一个有明确拥有者和建立次序的只观察资源；不扩展所有 OwnedWork 行。
采用原 close 成功许可，加 managed 拒绝保留和应用表示收场门；只有本应用拥有恢复责任。

必需反例：CG网络仍在途时 close 立即拒绝/同步抛错；应用诊断70且原报告不变，transport/CLS不关闭、TUI不恢复、装配closed未完成。
必需正例：CG迟到CAS/查证实际结束后才能恢复；恢复实际结束后才开始CLS.close；CLS.close失败仍保持已发生恢复并报告state-close-failed。
另覆盖观察资源缺席/重复observe/observe失败、CG已创建但未公开时setup与close双失败，以及未登记/已登记但未observe/observe已发生三类启动前缀（CLS失败、transport失败、CG部分setup）、重复停止、输入/输出/恢复长期未完成、恢复实际抛错，及真实强撤CLS。
原 CQ1/CQ2 两组形式资源须实际运行并保留原有限前提；模型没有覆盖关闭异常，不能替代拒绝故障驱动。

采用依据见限定修正决定。原业务条款和未迁义务仍有效。
