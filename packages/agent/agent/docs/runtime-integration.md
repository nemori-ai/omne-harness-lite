# Agent 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { AgentRuntime, AgentDirectory, AgentInstanceHost, Evidence } from '../index.js'
import type { Outcome } from '@omne-harness/kernel-basis'

/** @owner packages/agent/agent */
export abstract class AgentRuntimeService<P> extends Service implements AgentRuntime<P> {
  static readonly provide = 'agentRuntime'
  constructor(ctx: Context) { super(ctx, AgentRuntimeService.provide) }
  abstract readonly activate: AgentRuntime<P>['activate']
  abstract readonly reconcile: AgentRuntime<P>['reconcile']
  abstract readonly yield: AgentRuntime<P>['yield']
  abstract readonly instances: AgentRuntime<P>['instances']
}
export const agentRuntimeKey = AgentRuntimeService.provide

export type AgentPublication = Extract<Awaited<ReturnType<AgentInstanceHost<never>['publish']>>, { ok: unknown }>['ok']
export type AgentRegistrationInput<P> = Readonly<{
  publication: Parameters<AgentInstanceHost<P>['publish']>
  authority: Evidence
}>
export type AgentRegistrationFailure =
  | Readonly<{ kind: 'denied' | 'stale-publication' | 'conflict' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export type AgentRegistration = Readonly<{
  receipt: AgentPublication
  release(): Promise<Readonly<{ removed: boolean }>>
}>
export interface AgentPublicationAuthority<P> {
  check(input: AgentRegistrationInput<P>): Outcome<void, AgentRegistrationFailure>
}
/** @owner packages/agent/agent */
export declare class AgentInstancesService<P> extends Service implements AgentDirectory<P> {
  static readonly provide = 'agentInstances'
  constructor(ctx: Context, authority: AgentPublicationAuthority<P>)
  readonly connect: AgentDirectory<P>['connect']
  register(input: AgentRegistrationInput<P>): Promise<Outcome<AgentRegistration, AgentRegistrationFailure>>
}
export const agentInstancesKey = AgentInstancesService.provide
```

定义入口将 Context 的 `agentRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 登记输入与撤除协议

AgentInstancesService 是包含 register 实现的具体服务，上面只给其声明。提供者插件静态 inject `agentPublicationAuthority`，用当前 Context 和该能力构造服务。PublicationAuthority 属于本域消费接缝，具体适配器核原领域权威；不是任意调用者可实现后传入的准入回调。authority 是当前受信宿主取得的原实例资格证据，含租户、工作身份、实例和代次，不能仅以 token 或 handle.instance 自证。

register 的 publication 逐项复用根 publish 参数。authority.check 核证据来源、当前发布资格、handle 身份及调用 fiber 所属宿主；核权失败返回 denied，原实例已被替换返回 stale-publication，不能取得源返回 unavailable。check 是同步最终核验，与 effect 内目录写入在同一不可让出的本地动作中完成；当前资格变更沿同一排序域生效。需要异步获取的证明由宿主提前准备，但此处仍核当前发布代次。不能提供同步当前核验的适配器返回 unavailable，不先放行再异步补核。调用 fiber 已退出时不再登记。根操作仍逐次核业务权限，登记从不授发起权。

目录在成功的 caller-fiber effect 内生成不可猜测的 registration token，回执复用本域 publish 结果。相同 fiber、相同原实例和同一 handle 对象重复登记认回同一 receipt/release；同身份但 handle 或资格内容不同返回 conflict。其他 fiber 不共享原贡献，未撤的原绑定与新登记冲突。只有旧贡献已撤且新发布资格成立时才登记后继，不以覆盖 Map 的方式接管。键为显式租户与原工作身份；Agent 额外包含 Session/Run，来自核验的 authority，不从 Context 推导。

宿主 publish 在对应实例 fiber 内调用 register，成功后向根消费者返回 receipt。宿主 withdraw 按 receipt.registration 定位自己持有的原贡献，调用 release；它不接受另一个宿主的 token。release 只条件撤除自己的目录项，不取消原工作，重复调用 removed=false；fiber 自动 disposer 使用同一幂等撤除。晚到旧 release 比较 token，不能删除后继。宿主内部持有这一个原 contribution 的释放资源，不另建需要用户手动清理的贡献者清单。纯根宿主的其他失败沿原 Reply；登记 conflict 映射 invalid(field='publication')，stale-publication 映射 stale-advance，denied/unavailable 保留原类别和安全诊断。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 候选键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| sessionWork | SessionService | Session | 推进与保管必需；消费Session定义入口，不复制服务定义 |
| modelRuntime | ModelRuntime | Model | 模型阶段局部必需；失去只保留原等待/未知，不造新call |
| toolRuntime | ToolRuntime | Tool | 工具阶段局部必需；Query与控制仍按原事实恢复 |
| agentAdoptions | AgentAdoptions | Agent | 解释原位置/换代必需；缺精确版本不能套最新 |
| agentConditions | CurrentConditions | Agent | 下一步所需阶段必需；当前条件与旧采用分开 |
| agentRequests | RequestPreparation | Agent | 请求/压缩阶段局部必需；消费Context实际拥有者语义 |
| agentExtensions | ExtensionBindings | Agent | 经过阶段局部必需；普通缺席/系统准入缺席按已定不同策略 |
| agentHumans | HumanDecisions | Agent | 出卡/认回阶段局部必需；HITL拥有卡与唯一答复 |
| agentMaterials | AgentMaterials | Agent | 消费保管/读取必需；不能只存在Agent fiber内存 |
| agentReads | RegisteredReads | Agent | 具名外读阶段局部必需；不暴露任意网络/脚本 |
| agentInstances | AgentInstancesService | Agent | 具体目录Service；Agent贡献撤除不控制Model/Tool贡献 |
| agentPublicationAuthority | AgentPublicationAuthority | Agent 定义入口 | 目录必需；核当前宿主、原实例资格及authority来源，不能只核字符串相同 |
| agentInstanceHost | AgentInstanceHost | Agent | 保留/启动/登记宿主必需；reserve不授予Session推进权 |
| agentClock | AgentClock | Agent | 退避等待阶段必需；不决定Run终态 |

Agent核心的原位置解释、Session交还和材料保管服务保持可独立取得。模型、工具、请求、扩展和人的决定分别通过局部阶段适配器在需要时inject。缺席时保存原位置或按已定缺失策略收束，不把不存在的能力伪装为实现。计划换代先保存checkpoint并经Session.release/reload撤旧资格；非计划卸载停止新动作，当前恢复者依法认回。调用方退出不传播Model/Tool取消。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

observerBufferBytes 为正整数，reconciliationDelayMs、denialBackoffMs 为非负整数。AgentDefinition、扩展采用、当前模式和Session身份不写进配置树；连续否决不新增次数上限。

定义入口唯一声明 `agent/instance-retired`，载荷为tenant、SessionId、RunId、AgentInstanceId、原因。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

Agent消费者与三个运行实例宿主按共同图组合。Runtime Context/Request Context/HITL的完整服务定义若以后成为各原拥有者的公共接缝，应在同一采用中将本消费投影适配到该定义，不能保留两个含义相同的权威服务面。当前这些Agent端口拥有者是实际消费形状的Agent成员，未授予外域业务写权。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
