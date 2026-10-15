# Tool 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolRuntime } from '../index.js'

/** @owner packages/tool/tool */
export abstract class ToolRuntimeService<P, B extends ContentBlock> extends Service implements ToolRuntime<P, B> {
  static readonly provide = 'toolRuntime'
  constructor(ctx: Context) { super(ctx, ToolRuntimeService.provide) }
  abstract readonly inspect: ToolRuntime<P, B>['inspect']
  abstract readonly admit: ToolRuntime<P, B>['admit']
  abstract readonly lookup: ToolRuntime<P, B>['lookup']
  abstract readonly queryOperation: ToolRuntime<P, B>['queryOperation']
  abstract readonly control: ToolRuntime<P, B>['control']
  abstract readonly acceptDecision: ToolRuntime<P, B>['acceptDecision']
  abstract readonly readResult: ToolRuntime<P, B>['readResult']
  abstract readonly releaseDelivery: ToolRuntime<P, B>['releaseDelivery']
  abstract readonly account: ToolRuntime<P, B>['account']
  abstract readonly instances: ToolRuntime<P, B>['instances']
}
export const toolRuntimeKey = ToolRuntimeService.provide
```

定义入口将 Context 的 `toolRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 候选键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| toolCommands | ToolCommands | Tool | 必需，原调用/队列/交付权威；失败不变空队列或未执行 |
| toolBindings | ToolBindings | Tool | 准备/执行局部必需；固定原executor，不把当前新版替换已启动调用 |
| toolEnvironments | ToolEnvironment | Tool | 准备及安全resume局部必需；环境失败不降为宿主直接执行 |
| toolDecisions | ToolDecisionBridge | Tool | 原等待答复阶段局部必需；缺失保持等待，不造默认答案 |
| toolInstances | ToolDirectory + register | Tool | 具体目录Service；本Tool实例贡献fiber拥有登记 |
| toolInstanceHost | ToolInstanceHost | Tool | 独立宿主必需；原事实/控制可经门面处理，无活体仍可查 |
| toolClock | ToolClock | Tool | 计时执行段必需；恢复沿具名持续时间来源，不能重新计满 |
| toolResultPolicy | ResultPolicy | Tool | 结果处理必需；固定B及版本，缺失保留原输出与明确失败，不重做效果 |

Tool 门面以 commands、目录及必要结果读能力维护原事实和控制。准备、环境、Ask决定与结果策略分别在实际阶段取得；纯工厂获得的是满足根接口的具名阶段适配器，其内部使用局部inject和明确缺席结果。持续执行持有原合法执行者/环境直到原收场或安全checkpoint交接，Agent退出不撤这些资源。Tool提供者自身失去依赖仍须保存未知及实际效果，重载不自动再次start/resume。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

processBatchBytes、observerBufferBytes、resultPageBytes 为正整数；processBatchDelayMs、reconciliationDelayMs 为非负整数。并发、前台时限、转后台偏好来自每次固定请求及治理设置，不从插件树中的租户推导，不在此私配一套覆盖值。

定义入口唯一声明 `tool/call-changed`，载荷为tenant、ToolCallId、ToolRevision。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

等待、前后台、名额及全文保留均属Tool业务事实，不以Fiber状态判断。register撤除不会释放并发名额、给Ask填答案或删除delivery。迟到全文沿recordLateResult产生独立结果版本。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；query不授发布权。Session无实例登记时此段不适用。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
