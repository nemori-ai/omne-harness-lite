# Model 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { ModelRuntime } from '../index.js'

/** @owner packages/model/model */
export abstract class ModelRuntimeService<P> extends Service implements ModelRuntime<P> {
  static readonly provide = 'modelRuntime'
  constructor(ctx: Context) { super(ctx, ModelRuntimeService.provide) }
  abstract readonly calls: ModelRuntime<P>['calls']
  abstract readonly consumption: ModelRuntime<P>['consumption']
  abstract readonly instances: ModelRuntime<P>['instances']
}
export const modelRuntimeKey = ModelRuntimeService.provide
```

定义入口将 Context 的 `modelRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 候选键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| modelCommands | ModelCommands | Model | 必需，API与执行共享原调用/保管权威；失去时不新受理/发送，旧结果保管不能假成功 |
| modelSendBoundary | ModelSendBoundary | Model | 执行段必需；固定采用及实际S围栏，缺席不影响已有事实查询 |
| modelRetryPolicy | ModelRetryPolicy | Model | 策略阶段局部必需；由稳定适配器在子fiber取得，缺失按根协议不再试，不能卸载原结果查询 |
| modelInstances | ModelDirectory + register | Model | 具体目录Service；查询与受信贡献分开，登记归Model实例fiber |
| modelInstanceHost | ModelInstanceHost | Model | 执行宿主必需；捕获自身Context调度，不使用Agent调用方Context |
| modelClock | ModelClock | Model | 执行/清理等待必需；失去时保持未完责任，不伪造经过时间 |

Model 门面仅以 commands 和目录维持受理/查询/控制/ACK。执行段在本域宿主取得 send、clock 及恢复能力；重试阶段另取当前策略。纯根工厂的必需 retry 参数由具名局部阶段适配器兑现，不能传 undefined。适配器在阶段依赖缺席时返回根协议的明确不可用，已有调用仍可查询、取消和保管。策略退出不能删除已持久决定或重新花费内部调用。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

outputBatchBytes、observerBufferBytes、resultPageBytes、readIdleMs 为正整数；outputBatchDelayMs、retryBackoffMs、cleanupRetryMs 为非负整数。一次已取得read沿原期限，不因配置换代缩短。

定义入口唯一声明 `model/call-changed`，载荷为tenant、ModelCallId、Revision。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

凭据接缝沿 #279 的独立采用及其服务定义，不在本页重复定义 CredentialPort 键或修改 docs/cordis.md。发送围栏在可信内部按当前资格调用凭据解析，factory/tenant选择不由ctx推断。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；query不授发布权。Session无实例登记时此段不适用。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
