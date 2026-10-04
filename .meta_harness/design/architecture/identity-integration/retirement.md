# 装配代际的有序收尾

本机制补齐首轮 Choice 的 C1～C3，以及第二轮的双面准入和注册续步缺口。
本页的 r5 结构修订已由 [限定设计采用](../../record/decisions/identity-integration-design/decision.md) 接续，产品尚未实现。
Cordis 不提供跨消费者排空屏障，也不向 dispose 调用者传播 effect 清理失败。
不能以 plugin 注入图或逆序调用 dispose 代替下面的资源责任。
已运行的[探针与有限枚举](../../record/evidence/2026-10-04-probe-identity-lifecycle/README.md)
只支持所述机制前提，不代替实际业务组合。

## 责任与采用范围

`core/assembly-lifecycle` 拥有纯关闭协调协议、实现及 `./cordis` 绑定。
这是装配资源协议，不增加业务状态、产品对象或新的持久记录。
协调器不重新实现 Cordis 的服务发现、注入或插件状态机，只决定何时允许资源真正 close。

每次宿主 boot 或 CLI 应用装配创建一个协调器。它预先知道本次装配的有序行集合。
依赖提供者必须排在其消费者之前。实际 inject 对应不到该顺序或声明外资源时，装配失败。
资源 close 顺序为行的逆序，不能动态拓扑猜测。共享 runtime 多面为同一行。
外部资源服务在行集合外由装配拥有，等行集合全部收场后才释放。

同一协调器只接纳一个装配代际。不在运行期原地更换树配置，也不在原槽位重跑业务提供者。
任一管理行被撤除、失败或试图第二次 apply，都请求整个代际收尾。
可控替换为：关闭旧代际准入→实际收尾→处置失败→重新建立代际和提供者。
同一进程可以建立后继代际，但不能让新代继承旧 guard、开闸资格、快照票据或回调。
这保留提供者可替换，不承诺本次替换期间无停机。

独立纯函数仍由调用方显式拥有。未加入协调器的独立 Cordis 绑定沿原前提：
装配必须先停止并排空消费者，再关闭依赖。该模式不宣称任意强制撤除有跨组件排空保证。
真实 tenancy-host 与 CLI 必须采用协调器，不能退回该前提逃避组合验收。

## 公共形状

根的协议不含 Cordis 类型：

```ts
type CloseResult = { readonly kind: 'closed' }
  | { readonly kind: 'failed'; readonly codes: readonly ('setup' | 'close')[] }
interface OwnedWork {
  readonly ready: Promise<void>
  close(): Promise<void>
}
interface LifetimeRegistration {
  readonly closed: Promise<CloseResult>
  requestStop(): void
}
interface AssemblyLifetimePort {
  isCurrent(): boolean
  register(work: OwnedWork): LifetimeRegistration
}
interface AssemblyLifetime {
  readonly ids: readonly string[]
  readonly closed: Promise<AssemblyCloseReport>
  isPristine(): boolean
  tryClaim(): boolean
  isCurrent(): boolean
  port(id: string): AssemblyLifetimePort
  close(): Promise<AssemblyCloseReport>
}
interface AssemblyCloseReport {
  readonly complete: boolean
  readonly assemblyErrors: readonly ('assembly-stop-failed'
    | 'assembly-protocol-failed' | 'assembly-fiber-dispose-failed'
    | 'assembly-port-dispose-failed')[]
  readonly rows: readonly { readonly id: string; readonly result: CloseResult }[]
}
```

每行一个 AssemblyLifetimePort。唯一 Service `AssemblyLifetimeService` 的键为 `assemblyLifetime`，
标 `@owner packages/core/assembly-lifecycle`，精确 implements AssemblyLifetimePort。
它只暴露 isCurrent/register，不暴露整体协调器的 ids、port、close 或 closed。
装配为每行单独 isolate **这个服务键**，其他业务服务的可见性保持原样。
调用方不传任意 row id，行身份由装配提供的端口固定，不能串报另一行完成。
该隔离只用于路由关闭责任，不是租户授权。

协调器的根工厂 `createAssemblyLifetime(ids: readonly string[], onStopping: () => void): AssemblyLifetime`
校验非空且唯一的 id 集合，返回固定的每行 port 和整体 close。未知 id 拒绝为使用错误，不建立新槽位。
ids 为输入的不可变副本。协调器拥有一次性的控制接管位，初始未接管。
isPristine 当且仅当未接管、尚无登记且未请求停止；它只是观察，不作为互斥操作。
tryClaim 同步原子地检查 isPristine，成立则置为已接管并返回 true，否则返回 false，状态不变。
接管不可释放或复用。手写装配和 loader 都必须先成功接管，才开始登记或安装资源。
未接管时 register 拒绝使用错误且不创建资源。接管后仍只有原控制拥有者可安排整体关闭。
close 重复调用返回同一 Promise；返回完整报告，既记录 setup 失败也记录 close 失败。
整体 closed 是同一 Promise，未请求停止时不完成，使 loader 能观察自动依赖撤除后的实际收尾。
isCurrent 初始为 true，第一个停止请求同步置为 false，且永不恢复。
端口读取同一不可逆状态，不依赖监听、业务 close 或 onStopping 回调成功。
onStopping 仅通知宿主状态变化，不是关闭资格的唯一动作，不承担等待和资源释放，不可异步。
它失败时继续收尾并记 assembly-stop-failed，不能恢复资格或中止剩余关闭。
AssemblyCloseReport.complete 只在所有已登记资源都静止且 setup/close/onStopping 无失败时为 true。
它不表示 fiber 已撤完、宿主 guard 已核对或业务结果均成功。
协调器只产生 assembly-stop-failed；树取得其报告后继续等 fiber 及端口撤完，
以新的完整报告合并协议/fiber/端口错误，绝不改写已经返回的协调器报告。
树的 closed/dispose 返回后一报告；宿主最后另核 guard 和完成回调。
任何一步仍未结束就不能报告宿主关闭完成。

## 注册、部分启动与关闭算法

1. 插件在任何资源副作用之前登记本代 OwnedWork。ready 先由本次 setup 的 deferred 占位。
   close 闭包能够处理已获取的任意资源前缀，且不吞异常。setup 成功/失败分别完成 ready。
   登记 effect 失败或 setup 尚未开始就取消时，也必须拒绝 ready 并 requestStop，不能遗留永不完成的占位。
2. 一个槽位只允许一次 register。第二次 register 或关闭后 register 拒绝，
   同步使整个协调器进入 stopping；不得先新建资源再检测第二次登记。
3. 绑定在登记的同一调用方 fiber 上安装一个 effect。effect 不直接 close 资源：
   它同步调用 requestStop，再等待本行 registration.closed。
4. 第一个停止请求先将阶段置为 stopping，使协调器及全部端口 isCurrent 恒 false，
   再调用 onStopping，并立即启动独立的逆序关闭任务。
   **该任务不得等待 fiber.dispose 才执行 OwnedWork.close。**否则 effect 与关闭任务互相等待。
5. 对每行，先等 ready 真正完成，再调用本行 close。即使 ready 失败，仍调用 close 收尾。
   记录两处原始异常的安全分类，完成该行 closed，再进入前一行。
6. 全部资源处理后才按逆序 dispose Cordis 行 handle，最后撤资源端口 fiber。
   先前因自动依赖卸载而等待 closed 的 effect 此时已能完成，不形成循环等待。
7. close 的兑现和拒绝都必须发生在该行全部业务工作真正静止之后。它可以报告资源释放失败，
   不能提前拒绝后留下仍在跑的工作。能够确认静止的关闭失败记录后继续处理剩余行；
   不能确认静止则保持未完成，不虚构 Promise 已结束。超时不合成 closed，仍保留责任并报告 stopping。
   未结束的行不能跳过后假称整体完成。未知是否释放的失败阻止后继代际启动。

协调器从实际 OwnedWork.close 取得结果，故 Cordis 吞 effect 异常不再影响资源关闭报告。
primary setup failure、close failure 和宿主确认失败分别保留，不把其中任意一个覆盖成另一个。
对外诊断不带原异常文本/秘密，受控内部原始证据仍按原保密责任保存。

register 的 effect 表达调用方撤除请求。撤除立即移除其在役资格，
但尚未完成的资源责任由协调器保留到 closed；不能因注销登记把在途工作忘掉。
这是关闭责任台账，不是业务注册表或持久恢复日志。

## 为什么能保护尚未交给依赖的后半程

CG 在网络等待中、CLS 尚无 CAS 时撤除 CLS fiber：其 effect 请求整个装配停止，
但不 close CLS 引擎。协调器先调用后装的 CG.close，停止新输入/use，等待原网络和本地 CAS。
CG 捕获的旧 CLS 纯面仍活着，能够完成本地结算。CG 完成后才调用 CLS.close。
Service 从发现表消失不关闭纯引擎，不能在 Service 清理中另留一个抢先关闭 effect。

AI 等待 scrypt 时撤除 SQL fiber 同理：SQL 的物理 close 等 entry/注册/组织/AI 完整工作收场。
已开始 ordinary operation 仍按原提交边界结束。注册停止后不交下一步，晚完成仍由旧调用观察。
协调器不迁移旧请求到新服务，也不以取消推断外部效果没发生。

注册纯工厂保留显式 `isActive: () => boolean` 依赖，并与自身 close 设置的存活位共同检查。
managed binding 传入的谓词同时检查本 fiber 的原在役资格、绑定代际位和 lifetime.isCurrent()。
每次原 AR2 步骤交接及 await 后的原检查位置都使用该谓词，不等到轮到注册 close 才失活。
因此入口 close 等待注册时，步骤①或②的晚结果仍被观察，但不能交下一步。
独立调用者传入自己的资格谓词，close 同样关闭自身资格并等待已交出的步骤。
这个续步保护只应用于原 AR2 要求的交接点，不能粗略套到 SQL/CLS/AI 每个内部方法。
后者仍须接受已准入上层工作必要的后半程调用，直到逆序收尾轮到本行。

若操作系统或后端在协调器之外实际失效，原 unavailable/未知提交及副作用责任继续适用。
这不是正常撤除，不承诺故障期间成功完成。不得把内部代码提前 close 造成的故障归为环境失败。
拥有资源的代码只可通过登记的 close 关闭；启动前缀失败同样交给登记的收尾过程。

## 开闸的代际约束

宿主开放资格属于这个协调器的单一代际，包含单次 SQL 属主及单次入口。
EntryOpeningSignal 改为 `wait(): Promise<void>` 与 `isOpen(): boolean`，由宿主唯一实例实现。
isOpen 为本代已完成确认且 lifetime.isCurrent()，由实际状态求值，不依赖事件更新缓存。
wait 只在本代全就绪、guard.confirm 完成且仍 current 后兑现。
停止时尚未兑现的 wait 及停止后新 wait 均以具名 EntryOpeningStopped 拒绝。
已兑现的 Promise 不会被撤销，但不能作为新的开放凭据。宿主立即观察拒绝，不产生未处理拒绝。
客户端面与运维面都注入同一个 EntryOpening，在新网络请求准入处直接检查 isOpen。
运维操作开始前也重验原共同开放条件；serving/stopped 仍提供通知和状态观察，但不独占准入控制。
两面持有纯信号引用，监听已经撤掉、末行 helper 关闭长期等待时也必须立即拒绝新请求。
此检查不依赖治理服务，不改变运维隔离边界，也不取消已经接纳的业务或维护工作。

每次 apply 首先 register。旧槽位试图重跑，在任何打开数据库/端口前就被拒绝，
因此不能把同一 guard 附着到新属主，也不能由旧信号开启新入口。
新的 boot 必须创建新的协调器、slots、guard 和 EntryOpeningSignal，并重新执行确认。
本机制禁止自动把原代际失败当作“重跑已经恢复”，不改变原升级确认后的不可回滚事实。

## 插件树与手写装配如何接入

正式树只接受声明静态元数据 `assemblyLifecycle: 1` 的 Cordis 导出。
该值声明提供者遵守先登记、单代、唯一 close 的协议，不能仅靠标记证明其正确。
没有元数据的插件在任何 apply 前被拒绝。第三方插件须有明确拥有资源的适配后才能进入树。
声明但未登记、重复登记、未完成 ready 或不释放工作，分别成为启动失败、阻断或停止未完成。
未登记副作用使真实资源静止不可确认时，树 ready 拒绝但 closed 不得虚报完成。
不允许拿“普通 Cordis 插件也能加载”降低树的关闭承诺。

T2 先实现并验证协调器与相关资源绑定，手写 tenancy-host 清单先使用它。
T3 的 CLI 装配用同一机制安排 storage 工厂→CLS→transport→CG 的资源次序。
T4 的数据树只替换清单来源与加载解析，不再首次引入跨用例排空责任。
仅需局部函数的使用者不加载 Cordis，也不被迫建立插件树。

## 证明义务与代价

正控须在真实 Cordis 上强制撤除 provider：观察旧消费者在网络/scrypt 后半程仍可访问活的依赖，
完整消费者收场先于依赖 close。负控恢复原直接 effect.close 必须复现提前关闭。
双关闭失败要在报告中同时可见。部分 setup、停止中重跑、未兑现/已兑现开闸、重复 close 均须覆盖。
两面监听先撤而业务/末行 helper 未完、onStopping 抛错、注册步骤①/②迟到，分别保留正负控。
有限状态模型检查：不先于消费者释放、只有本代 confirmed 可以开放、失败不误报 complete、无闭环等待。
现有有限枚举只覆盖前三项安全条件；无循环等待由明确依赖关系和真实交错取证，不以状态数冒充活性证明。
进展依赖 ready/已接纳业务/close 最终返回；不宣称能强迫失去响应的外部工作结束。

代价是受管理绑定必须登记完整关闭过程，替换需要整个装配代际静止。
本次不采用每个业务调用携带跨服务租约，也不实现任意局部热替换调度。
若未来要求局部零停机替换，必须重新设计资格、租约和提交责任，不能从本候选推断已具备。
