# Tool 的 Cordis 集成

本页消费[根操作契约](../../tool-contract/docs/public-api.md)，规定 Tool 独有的服务定义、依赖、登记协议与通知。具体插件的装配、作者装载与阶段换代归 tool-host-local 的 Cordis 集成（`tool-host-local/docs/cordis.md`）。设计已接受，提供者尚未实现。共同约束归 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)，加载成功不表示业务就绪。

## 服务定义与入口

`@omne-harness/tool-cordis-contract` 的 `./cordis`（`src/cordis.ts`）唯一拥有下列抽象门面及表中本域接缝的服务定义。它依赖纯契约包 `@omne-harness/tool-contract` 的类型，不依赖任何 Tool 实现。单机宿主 `@omne-harness/tool-host-local` 的 `./cordis` 发布限定名具体提供者，并继承这些定义。编写 Cordis 插件的消费者依赖本包与契约包，不依赖实现包。下列代码给出 [src/cordis.ts](../src/cordis.ts) 中这些定义的公开形状，源码是唯一定义；该文件还给出其余服务定义类、18 个键常量和事件增补。[RFC-0012](../../../../docs/rfcs/RFC-0012-tool-dynamics.md) 采用的两个键 `toolContributionAuthority`、`toolGenerations` 与事件 `binding-changed` 尚未进入源码。ToolInstancesService 的登记与查询尚未实现，实现前两者返回具名失败。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRuntime, ToolDirectory, ToolInstanceHost, DurableEvidence, ToolBindings, ToolBindingRegistry } from '@omne-harness/tool-contract'
import type { Outcome } from '@omne-harness/operation-result'

/** @owner packages/tool/tool-contract */
export abstract class ToolRuntimeService<P, B extends ContentBlock> extends Service implements ToolRuntime<P, B> {
  static readonly provide = 'toolRuntime'
  constructor(ctx: Context) { super(ctx, ToolRuntimeService.provide) }
  abstract readonly invoke: ToolRuntime<P, B>['invoke']
  abstract readonly inspect: ToolRuntime<P, B>['inspect']
  abstract readonly queries: ToolRuntime<P, B>['queries']
  abstract readonly commands: ToolRuntime<P, B>['commands']
  abstract readonly instances: ToolRuntime<P, B>['instances']
  abstract readonly content: ToolRuntime<P, B>['content']
  abstract readonly catalog: ToolRuntime<P, B>['catalog']
}
export const toolRuntimeKey = ToolRuntimeService.provide

export type ToolPublication = Extract<Awaited<ReturnType<ToolInstanceHost<never>['publish']>>, { ok: unknown }>['ok']
export type ToolRegistrationInput<P> = Readonly<{
  publication: Parameters<ToolInstanceHost<P>['publish']>
  authority: DurableEvidence
}>
export type ToolRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type ToolRegistration = Readonly<{
  receipt: ToolPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>
export interface ToolPublicationAuthority<P> {
  check(input: ToolRegistrationInput<P>): Outcome<void, ToolRegistrationFailure>
}
/** @owner packages/tool/tool-contract */
export declare class ToolInstancesService<P> extends Service implements ToolDirectory<P> {
  static readonly provide = 'toolInstances'
  constructor(ctx: Context, authority: ToolPublicationAuthority<P>)
  readonly connect: ToolDirectory<P>['connect']
  register(input: ToolRegistrationInput<P>): Promise<Outcome<ToolRegistration, ToolRegistrationFailure>>
}
export const toolInstancesKey = ToolInstancesService.provide

/** @owner packages/tool/tool-contract */
export abstract class ToolBindingsService<P, B extends ContentBlock, E> extends Service implements ToolBindings<P, B, E>, ToolBindingRegistry<P, E, B> {
  static readonly provide = 'toolBindings'
  constructor(ctx: Context) { super(ctx, ToolBindingsService.provide) }
  abstract readonly inspect: ToolBindings<P, B, E>['inspect']
  abstract readonly resolve: ToolBindings<P, B, E>['resolve']
  abstract readonly recover: ToolBindings<P, B, E>['recover']
  abstract readonly register: ToolBindingRegistry<P, E, B>['register']
}
export const toolBindingsKey = ToolBindingsService.provide
```

本包 `./cordis` 将 Context 的 `toolRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者从本包 `./cordis` 导入键常量，提供者选择归应用装配。

## 登记输入与撤除协议

本节前四段是实例目录 `ToolInstancesService` 的登记协议，绑定登记表的登记输入另见[下文](#绑定登记表的登记输入)。

ToolInstancesService 是包含 register 实现的具体服务，上面只给其声明。提供者插件静态 inject `toolPublicationAuthority`，用当前 Context 和该能力构造服务。PublicationAuthority 属于本域消费接缝，具体适配器核原领域权威；不是任意调用者可实现后传入的准入回调。authority 是当前受信宿主取得的原实例资格证据，含租户、工作身份、实例和代次，不能仅以 token 或 handle.instance 自证。

register 的 publication 逐项复用根 publish 参数。authority.check 核证据来源、当前发布资格、handle 身份及调用 fiber 所属宿主；核权失败返回 denied，原实例已被替换返回 stale-publication，不能取得源返回 unavailable。check 是同步最终核验，与 effect 内目录写入在同一不可让出的本地动作中完成；当前资格变更沿同一排序域生效。需要异步获取的证明由宿主提前准备，但此处仍核当前发布代次。不能提供同步当前核验的适配器返回 unavailable，不先放行再异步补核。调用 fiber 已退出时不再登记。根操作仍逐次核业务权限，登记从不授发起权。

目录在成功的 caller-fiber effect 内生成不可猜测的 registration token，回执复用本域 publish 结果。相同 fiber、相同原实例和同一 handle 对象重复登记认回同一 receipt/release；同身份但 handle 或资格内容不同返回 conflict。其他 fiber 不共享原贡献，未撤的原绑定与新登记冲突。只有旧贡献已撤且新发布资格成立时才登记后继，不以覆盖 Map 的方式接管。键为显式租户与原工作身份；调用方另有的外部关联也进入键，来自核验的 authority，不从 Context 推导。

宿主 publish 在对应实例 fiber 内调用 register，成功后向根消费者返回 receipt。宿主 withdraw 按 receipt.registration 定位自己持有的原贡献，调用 release；它不接受另一个宿主的 token。release 只条件撤除自己的目录项，不取消原工作，重复调用 removed=false；fiber 自动 disposer 使用同一幂等撤除。晚到旧 release 比较 token，不能删除后继。宿主内部持有这一个原 contribution 的释放资源，不另建需要宿主调用方手动清理的贡献者清单。纯根宿主的其他失败沿原 Reply；登记 conflict 映射 invalid(field='publication')，stale-publication 映射 stale-instance，denied/unavailable 保留原类别和安全诊断。

### 绑定登记表的登记输入

`ToolBindingsService.register` 实现 `ToolBindingRegistry.register`。它接收 `ToolLoadedRegistration` 与 `ToolAuthority { layer, asset, holding, publication }`，返回 `Outcome<ToolContribution, ToolContributionFailure>`。登记键是（来源层，能力身份，资产版本）。`toolContributionAuthority` 核验 `ToolAuthority` 的来源，来源层只取自核验结果。登记者的 `Access.tenant` 只用来核它在该层的登记资格。同键的认回、conflict、后继、晚到 release 与并发首次登记沿契约的 [G7](../../tool-contract/SPEC.md#342-契约缺口决定)。`resolve` 的选取规则、失败集合、draining 与回退顺序归契约的 [G7](../../tool-contract/SPEC.md#342-契约缺口决定) 与 [ToolBindingRegistry 段](../../tool-contract/SPEC.md#p15-配置声明与合法装载)，本页不重述。

作者插件 fiber 在插件体内登记，登记以该 fiber 的 `ctx.effect` 配对。fiber 撤除时，effect 撤除登记。G7 套件的输入是 `ToolAuthority`。实例目录的输入 `ToolRegistrationInput` 与登记语义套件不变。

### 换代协调者契约

`toolGenerations` 是 Tool 宿主的 Service，也是 `ctx.plugin` 句柄的唯一持有者。它有三个动词。每个动词都向目标态收敛，可以重复调用。

- `ensureLoaded({ authority, access })`：返回 `Outcome<{ key, state: 'loaded' | 'recognized' }, ToolLoadFailure>`。调用方是装配协调者，在采用点带本租户的 `Access` 调用；它不是系统作用域操作。步骤按顺序：`toolContributionAuthority.verify(authority)`（失败为 `denied` 或 `invalid`）；读资产的实现引用与包 digest（缺失为 `missing`）；核 digest（不符为 `rejected`）；动态 import 实现包（抛错或导出不合 `ToolImplementationModule` 为 `rejected`）；在长期宿主插件的 ctx 下 `ctx.plugin` 作者插件，config 为 `{ authority, construction, settings }`；插件体 `contributeTool` 经 `toolGenerations.loaderFor(authority)` 取得受信 `ToolLoader`，调用 `load` 与 `toolBindings.register`。同键已装、digest 相同且非 draining 时认回，state 为 `recognized`；同键 draining 时返回 `draining`。`load` 或 `register` 失败时协调者 dispose 该 fiber，不保留没有贡献的 ACTIVE fiber。失败映射：`ToolLoader.load` 的确定性拒绝（资产 name 与定义 name 不一致、注册投影与契约不符、配置值不合法）为 `rejected`，它的设置读取不可用或必需服务缺席为 `unavailable`；`register` 的 `invalid` 为 `rejected`，`conflict`、`denied`、`unavailable` 原样返回。`missing` 与 `rejected` 是耐久失败，协调者把它们铸造为 Tool 的 `DurableEvidence` 交采用点判定；`unavailable` 是暂时失败，不构成证据；`denied`、`conflict`、`draining` 不是失败证据，采用点按契约[采用点判定](../../tool-contract/SPEC.md#采用点判定)的说明处理。import 之前先核来源：授权前不运行不可信模块的初始化。
- `unload({ key })`：在登记表的本地排序域里先 `close(key)`，再经 `ToolResidencyReader.referencing({ scope: 'system', key })` 读会话引用。引用不可读（`unavailable`）时 `reopen(key)` 并返回 `retained`，不能证明无引用就不撤除。有未归档会话引用、且没有同形 serving 替代时，`reopen(key)` 并返回 `retained`。否则按下列顺序做五步。
  1. 保持 draining。新 Run 与回退路由不再选它，记下该键的请求仍可解析到它。
  2. 等在途调用收场。
  3. 按 [P09](../../tool-contract/SPEC.md#p09-账目恢复与退出) 交接。
  4. release 贡献。
  5. dispose 作者插件 fiber。
- `sweep()`：系统作用域操作。恢复后按保留义务重装未归档会话记下的键：authority 取自该会话采用依据记下的 `ToolAuthority`，以 `{ scope: 'system' }` 调用 `ensureLoaded`，`toolContributionAuthority.verify` 仍核来源，`admits` 对系统作用域按 IC-18 例外不核登记资格；重装失败按 `ensureLoaded` 的失败集合记录，等采用点判定，不在 sweep 里判冻结。对无引用、且不再是任何胜出者的贡献调用 `unload`。

`unload` 做完五步返回 `released`。任一步未完成时返回 `draining`。再调用一次时，它从未完成的那一步继续。按键排空与交接依赖 P09 的 `inspectDrain({ executor })` 范围。该范围交付之前，有在途调用时协调者停在 `draining`。

保留义务：有未归档会话引用、且没有同形 serving 替代的贡献，协调者不 dispose。引用从会话事实派生，协调者不建账。已归档但在途 Run 未收场的会话也算引用。包字节保留，同一 digest 可以重新 import。同形 serving 替代的定义归契约的 [ToolBindingRegistry 段](../../tool-contract/SPEC.md#p15-配置声明与合法装载)。

驻留端口由本包定义服务键，Session 提供实现：

| 服务键 | 形状 | 缺席时 |
| --- | --- | --- |
| toolResidencyReader | `referencing({ scope: 'system', key })` 返回 `Outcome<Page<{ session, tenant, workspace, shape }>, unavailable>`，分页，不返回正文；不用 `Access<P>`，是 IC-18 的系统作用域例外 | `unload` 与 `sweep` 返回 `retained` |
| toolResidencyActions | `freeze({ session, cause: 'tool-shape-lost', evidence })` 返回 `Outcome<Receipt, denied | invalid | unavailable>`；`session` 是带租户的会话引用 `{ tenant, id }`，形状与 Session 契约一致；幂等，会话已冻结时返回原回执。输入带租户，不属于系统作用域例外 | 显式 reload 的冻结判定不能交付，采用点返回 `unavailable`，不派发 Run |

协调者的 inject 是 `toolBindings`、`toolContributionAuthority`、`toolResidencyReader`、`toolResidencyActions`。作者插件 fiber 挂在长期宿主插件的 ctx 下，不挂在协调者 fiber 下；协调者因提供者换代重跑时不撤除它们，从登记表 `snapshot()` 重建句柄表。

`unload` 与 `sweep` 是系统作用域操作。冻结判定只在采用点由 `planAdoption` 产出，交付路径见契约的[采用点判定](../../tool-contract/SPEC.md#采用点判定)。

替换是对新版本调用 `ensureLoaded`。旧版本在引用归零后由 `unload` 或 `sweep` 收走。不存在原地替换。突然失依赖不经协调者：Cordis 撤除 fiber 时，effect 撤除登记，会话按 R3 或回退路由处理，在途调用保持 unknown。规则依据见 [RFC-0012](../../../../docs/rfcs/RFC-0012-tool-dynamics.md#加载卸载替换与换代协调者)。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 服务键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| toolCommands | ToolCommands | Tool | 必需，原调用/队列/交付权威；失败不变空队列或未执行 |
| toolBindings | ToolBindings | Tool | 准备/执行局部必需；固定原executor，不把当前新版替换已启动调用；按登记键持有作者插件 fiber 的贡献 |
| toolEnvironments | ToolEnvironment | Tool | 准备及安全resume局部必需；环境失败不降为宿主直接执行 |
| toolDecisions | ToolDecisionBridge | Tool | 原等待答复阶段局部必需；缺失保持等待，不造默认答案 |
| toolInstances | ToolInstancesService | Tool | 具体目录Service；本Tool实例贡献fiber拥有登记 |
| toolPublicationAuthority | ToolPublicationAuthority | `tool-cordis-contract/cordis` | 目录必需；核当前宿主、原实例资格及authority来源，不能只核字符串相同 |
| toolContributionAuthority | 绑定登记的来源核验（verify、admits，同步） | `tool-cordis-contract/cordis` | 绑定登记表必需；核 ToolAuthority 的来源并给出来源层，核登记者在该层的登记资格，不以 Access.tenant 定来源层；缺席时 register 返回 unavailable |
| toolResidencyReader | 会话引用读取（referencing） | `tool-cordis-contract/cordis`，Session 提供 | 协调者必需；系统作用域，缺席时 unload 与 sweep 返回 retained |
| toolResidencyActions | 冻结判定交付（freeze） | `tool-cordis-contract/cordis`，Session 提供 | 显式 reload 采用点必需；缺席时该采用点不派发 Run |
| toolInstanceHost | ToolInstanceHost | Tool | 独立宿主必需；原事实/控制可经门面处理，无活体仍可查 |
| toolClock | ToolClock | Tool | 计时执行段必需；恢复沿具名持续时间来源，不能重新计满 |
| toolResultPolicy | ResultPolicy | Tool | 结果处理必需；固定B及版本，缺失保留原输出与明确失败，不重做效果 |
| toolReads | ToolReads | Tool | 持久读取，门面必需；无活体也可查 |
| toolCatalog | ToolCatalog | Tool | 定义及用法；当前消费方档案必须核验 |
| toolStartAuthority | ToolStartAuthority | Tool | 启动阶段必需；跨拥有者失效共排序 |
| toolResourceResponses | ToolResourceResponses | Tool | 资源应答阶段局部必需 |
| toolOutputCustody | ToolOutputCustody | Tool | 原输出与附件保管阶段必需 |
| toolChildren | ToolChildren | Tool | 程序执行方组合阶段必需；父程序退出后由scanPending/loadRecovery驱动child和program-fence待办 |
| toolAccounts | ToolAccounts | Tool | 按组织或租户读取执行账，独立授权 |
| toolOffloader | ToolOffloader | Tool | 单结果卸载适配，不覆盖原结果 |
| toolGenerations | 换代协调者（ensureLoaded、unload、sweep） | Tool | Tool 宿主的 Service，唯一持有 ctx.plugin 句柄；按会话引用保留贡献，契约见[换代协调者契约](#换代协调者契约)；不进入 Agent 宿主的 inject |

Tool 门面只把 Commands/Reads 作为持久操作的静态必需依赖。Catalog 与 Directory 由稳定窄代理在每次调用时 ctx.get 当前服务，接受缺席并返回明确 unavailable；不把取得的服务缓存进门面或长期宿主。根工厂仍消费非空的具名端口，不知道 Cordis Context。准备、环境、Ask 决定与结果策略在各自阶段取得，持续执行保持原合法绑定直到原收场或安全交接。调用方退出不撤这些资源，提供者失效不自动再次 start/resume。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

`programmable` 属于每个工具的定义，`invocation` 属于每次调用的固定输入，两者都不是 ToolConfiguration 或 Cordis 插件配置。toolBindings 保留合法定义上的原声明，toolCommands 的准入适配器核验可信调用来源及当前许可。脚本桥接只暴露经该准入边界的窄调用能力，不向脚本注入 ToolCommands、executor、来源签发能力或 Cordis Context。外部脚本环境及动作桥接方接入时也须兑现此边界，具体提供者未验证前不能声称防绕过已成立。

## 配置、通知和撤除

### 调用许可变化与 Cordis 效应撤除

脚本桥接的可调用入口属于可撤除的运行期贡献。注册表服务沿 IC-13 用调用方 fiber 的 effect 配对登记与条件撤除，不另建手动维护的贡献者清单。提供者撤除或换代时，局部 inject 可以结束相应桥接资源；重新装配只重建合法入口，不重放原工具调用。Tool 的执行宿主保持独立，不能为了关闭某个脚本入口而卸载整个 Tool runtime。

`programmable` 是定义数据。同一服务实例内的数据变化不自动触发 Cordis inject 重跑，声明变化由原定义采用与准入路径处理。桥接同步更新可调用集合，已取得的旧入口仍须经过当前准入。不能把“注册表已删除”当作全部旧句柄失效或全部排队动作已停止的证明。

Cordis 撤除的是登记、监听和具名可释放资源。`startRejection`、启动是否发生、结果交付与释放责任是跨重启仍须成立的 Tool 事实，按 [SPEC](../../tool-contract/SPEC.md#342-值定义和固定请求)保存，不放进 effect 闭包，也不让 disposer 改写业务终局。需要先停止准入、结清或交接、再撤资源时，由具名协调者显式等待；多个 effect 的卸载不提供这种完成顺序。外部操作已发出或结果未知时，撤除不能声称回滚。

上述机制沿固定采用的 Cordis 4.0.4 核对。[调用方 effect 归属](../../../../.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md)、[提供者换代与插件重跑](../../../../.meta_harness/design/basis/cordis/plugin-body-reruns-on-provider-change.md)及[释放顺序与持久事实的边界](../../../../.meta_harness/design/basis/cordis/effect-disposal-concurrent-not-ordered.md)分别拥有机制依据；业务兑现仍须由 Tool 提供者验证。

### 配置与变更通知

authorBufferBytes、authorBufferItems、authorWaitHistoryBytes、authorWaitHistoryItems、processBatchBytes、observerBufferBytes、resultPageBytes 为正安全整数；processBatchDelayMs、reconciliationDelayMs 为非负安全整数。作者输出容量覆盖 P11 的在途内容、累计状态及记录数量，不能只限制观察者缓冲。并发、前台时限、转后台偏好来自每次固定请求及治理设置，不从插件树中的租户推导，不在此私配一套覆盖值。

本包 `./cordis` 唯一声明 `tool-cordis-contract/call-changed`，载荷为tenant、ToolCallId、ToolRevision。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。事件先按显式身份过滤，数据动作再核权。RFC-0012 另增通知事件 `tool-cordis-contract/binding-changed`，载荷为登记键（来源层含组织或租户标识、能力身份、资产版本）与 `change: registered | draining | released`，`@mode parallel`；不带正文、凭据或模块路径。发送者捕获监听失败并保留登记结果；遗漏由采用点读取 `snapshot()` 补齐。事件先按显式身份过滤，跨租户只可见官方层与本组织层的键。

等待、前后台、名额及全文保留均属Tool业务事实，不以Fiber状态判断。register撤除不会释放并发名额、给Ask填答案或删除delivery。迟到全文沿recordLateResult产生独立结果版本。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本包至少验证根入口无 Cordis、本包 `./cordis` 不引任何 Tool 实现、每个键只取自一个定义类的静态 provide。依赖的实际撤除范围、旧引用拒绝及当前身份核验归继承这些定义的插件，见 tool-host-local 的验证义务（`tool-host-local/docs/cordis.md#验证义务`）。

普通 toolRuntime.invoke 消费来源 resolve 的原子关联，不暴露无键调用身份分配服务。装配者显式配对来源的 authority/guard，当前主体每次重核。公开 control 每次是新 operation，旧 unknown 的操作引用独立查询；此契约定义不提供生产来源或控制状态机。
