# Agent 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { AgentRuntime } from '../index.js'

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
```

定义入口将 Context 的 `agentRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

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
| agentInstances | AgentDirectory + register | Agent | 具体目录Service；Agent贡献撤除不控制Model/Tool贡献 |
| agentInstanceHost | AgentInstanceHost | Agent | 保留/启动/登记宿主必需；reserve不授予Session推进权 |
| agentClock | AgentClock | Agent | 退避等待阶段必需；不决定Run终态 |

Agent核心的原位置解释、Session交还和材料保管服务保持可独立取得。模型、工具、请求、扩展和人的决定分别通过局部阶段适配器在需要时inject。缺席时保存原位置或按已定缺失策略收束，不把不存在的能力伪装为实现。计划换代先保存checkpoint并经Session.release/reload撤旧资格；非计划卸载停止新动作，当前恢复者依法认回。调用方退出不传播Model/Tool取消。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

observerBufferBytes 为正整数，reconciliationDelayMs、denialBackoffMs 为非负整数。AgentDefinition、扩展采用、当前模式和Session身份不写进配置树；连续否决不新增次数上限。

定义入口唯一声明 `agent/instance-retired`，载荷为tenant、SessionId、RunId、AgentInstanceId、原因。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

Agent消费者与三个运行实例宿主按共同图组合。Runtime Context/Request Context/HITL的完整服务定义若以后成为各原拥有者的公共接缝，应在同一采用中将本消费投影适配到该定义，不能保留两个含义相同的权威服务面。当前这些Agent端口拥有者是实际消费形状的Agent成员，未授予外域业务写权。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；query不授发布权。Session无实例登记时此段不适用。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
