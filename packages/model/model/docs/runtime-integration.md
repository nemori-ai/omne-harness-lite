# Model 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ModelRuntime, ModelDirectory, ModelInstanceHost, DurableEvidence } from '../index.js'
import type { Outcome } from '@omne-harness/kernel-basis'

/** @owner packages/model/model */
export abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
  static readonly provide = 'modelRuntime'
  constructor(ctx: Context) { super(ctx, ModelRuntimeService.provide) }
  abstract readonly calls: ModelRuntime<P>['calls']
  abstract readonly consumption: ModelRuntime<P>['consumption']
  abstract readonly instances: ModelRuntime<P>['instances']
}
export const modelRuntimeKey = ModelRuntimeService.provide

export type ModelPublication = Extract<Awaited<ReturnType<ModelInstanceHost<never>['publish']>>, { ok: unknown }>['ok']
export type ModelRegistrationInput<P> = Readonly<{
  publication: Parameters<ModelInstanceHost<P>['publish']>
  authority: DurableEvidence
}>
export type ModelRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type ModelRegistration = Readonly<{
  receipt: ModelPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>
export interface ModelPublicationAuthority<P> {
  check(input: ModelRegistrationInput<P>): Outcome<void, ModelRegistrationFailure>
}
/** @owner packages/model/model */
export declare class ModelInstancesService<P> extends Service implements ModelDirectory<P> {
  static readonly provide = 'modelInstances'
  constructor(ctx: Context, authority: ModelPublicationAuthority<P>)
  readonly connect: ModelDirectory<P>['connect']
  register(input: ModelRegistrationInput<P>): Promise<Outcome<ModelRegistration, ModelRegistrationFailure>>
}
export const modelInstancesKey = ModelInstancesService.provide
```

定义入口将 Context 的 `modelRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 登记输入与撤除协议

ModelInstancesService 是包含 register 实现的具体服务，上面只给其声明。提供者插件静态 inject `modelPublicationAuthority`，用当前 Context 和该能力构造服务。PublicationAuthority 属于本域消费接缝，具体适配器核原领域权威；不是任意调用者可实现后传入的准入回调。authority 是当前受信宿主取得的原实例资格证据，含租户、工作身份、实例和代次，不能仅以 token 或 handle.instance 自证。

register 的 publication 逐项复用根 publish 参数。authority.check 核证据来源、当前发布资格、handle 身份及调用 fiber 所属宿主；核权失败返回 denied，原实例已被替换返回 stale-publication，不能取得源返回 unavailable。check 是同步最终核验，与 effect 内目录写入在同一不可让出的本地动作中完成；当前资格变更沿同一排序域生效。需要异步获取的证明由宿主提前准备，但此处仍核当前发布代次。不能提供同步当前核验的适配器返回 unavailable，不先放行再异步补核。调用 fiber 已退出时不再登记。根操作仍逐次核业务权限，登记从不授发起权。

目录在成功的 caller-fiber effect 内生成不可猜测的 registration token，回执复用本域 publish 结果。相同 fiber、相同原实例和同一 handle 对象重复登记认回同一 receipt/release；同身份但 handle 或资格内容不同返回 conflict。其他 fiber 不共享原贡献，未撤的原绑定与新登记冲突。只有旧贡献已撤且新发布资格成立时才登记后继，不以覆盖 Map 的方式接管。键为显式租户与原工作身份；Agent 额外包含 Session/Run，来自核验的 authority，不从 Context 推导。

宿主 publish 在对应实例 fiber 内调用 register，成功后向根消费者返回 receipt。宿主 withdraw 按 receipt.registration 定位自己持有的原贡献，调用 release；它不接受另一个宿主的 token。release 只条件撤除自己的目录项，不取消原工作，重复调用 removed=false；fiber 自动 disposer 使用同一幂等撤除。晚到旧 release 比较 token，不能删除后继。宿主内部持有这一个原 contribution 的释放资源，不另建需要用户手动清理的贡献者清单。纯根宿主的其他失败沿原 Reply；登记 conflict 映射 invalid(field='publication')，stale-publication 映射 stale-instance，denied/unavailable 保留原类别和安全诊断。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 候选键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| modelCommands | ModelCommands | Model | 必需，API与执行共享原调用/保管权威；失去时不新受理/发送，旧结果保管不能假成功 |
| modelSendBoundary | ModelSendBoundary | Model | 执行段必需；固定采用及实际S围栏，缺席不影响已有事实查询 |
| modelRetryPolicy | ModelRetryPolicy | Model | 策略阶段局部必需；由稳定适配器在子fiber取得，缺失按根协议不再试，不能卸载原结果查询 |
| modelInstances | ModelInstancesService | Model | 具体目录Service；查询与受信贡献分开，登记归Model实例fiber |
| modelPublicationAuthority | ModelPublicationAuthority | Model 定义入口 | 目录必需；核当前宿主、原实例资格及authority来源，不能只核字符串相同 |
| modelInstanceHost | ModelInstanceHost | Model | 执行宿主必需；捕获自身Context调度，不使用Agent调用方Context |
| modelClock | ModelClock | Model | 执行/清理等待必需；失去时保持未完责任，不伪造经过时间 |

Model 门面仅以 commands 和目录维持受理/查询/控制/ACK。执行段在本域宿主取得 send、clock 及恢复能力；重试阶段另取当前策略。纯根工厂的必需 retry 参数由具名局部阶段适配器兑现，不能传 undefined。适配器在阶段依赖缺席时返回根协议的明确不可用，已有调用仍可查询、取消和保管。策略退出不能删除已持久决定或重新花费内部调用。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

outputBatchBytes、observerBufferBytes、resultPageBytes、readIdleMs 为正整数；outputBatchDelayMs、retryBackoffMs、cleanupRetryMs 为非负整数。一次已取得read沿原期限，不因配置换代缩短。

定义入口唯一声明 `model/call-changed`，载荷为tenant、ModelCallId、Revision。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

凭据接缝沿 #279 的独立采用及其服务定义，不在本页重复定义 CredentialPort 键或修改 docs/cordis.md。发送围栏在可信内部按当前资格调用凭据解析，factory/tenant选择不由ctx推断。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
