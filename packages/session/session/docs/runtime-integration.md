# Session 的 Cordis 集成候选

本页消费[根操作候选](runtime-contract.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `./cordis-definition` 唯一拥有下列抽象门面及表中本域接缝的服务定义，`./cordis` 的限定名具体提供者继承它。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionService } from '../index.js'

/** @owner packages/session/session */
export abstract class SessionWorkService<P> extends Service implements SessionService<P> {
  static readonly provide = 'sessionWork'
  constructor(ctx: Context) { super(ctx, SessionWorkService.provide) }
  abstract readonly work: SessionService<P>['work']
  abstract readonly management: SessionService<P>['management']
  abstract readonly reconciliation: SessionService<P>['reconciliation']
  abstract readonly history: SessionService<P>['history']
}
export const sessionWorkKey = SessionWorkService.provide
```

定义入口将 Context 的 `sessionWork` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 依赖与定义拥有者

表中每个本域键对应根契约中同名操作端口的唯一抽象Service定义，类命名为端口名加Service；静态provide只在定义类声明，导出键取自它。目录采用含register逻辑的具体Service，不用抽象接口冒充登记机制。跨域行引用原定义拥有者，不在本成员再声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 候选键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| sessionTransactions | SessionTransactionPort | Session | 权威读/写必需；同提交参加者和原操作认回归真实提供者 |
| sessionIdentity | SessionIdentityBridge | Session | 变更阶段必需；读接口由transaction port独立核权，不靠可见性授权 |
| sessionEvidence | SessionEvidenceBridge | Session | 依命令局部必需；缺某采用源仅阻止需要它的命令，完整参加者集合仍必需 |
| sessionClock | SessionClock | Session | 空闲取证/等待阶段必需；原时间来源与连续性不能由宿主墙钟替代 |
| sessionIdleInput | SessionIdleInput | Session | 空闲维护/裁定阶段必需；完整源范围及同提交参加者，缺席不阻断无关操作 |
| sessionContextInput | SessionContextInput | Session | 创建/声明/推进采用阶段必需；消费Runtime Context原决定和当前条件 |
| sessionNotifier | SessionNotifier | Session | 可选，不在inject；每次提交后现取，缺席/失败不回滚提交 |

Session 没有每会话根Context或实例目录。长期服务与恢复协调者服务全部显式tenant/session操作。门面权威读依赖transactions；身份和证据准备按命令在子fiber取得，核心读与已有控制核对不因无关资产源撤除全站停机。纯工厂依然得到完整identity/evidence/clock/idle/context接口，局部缺失映射为相应命令失败，不把必要guard当可选。notifier.current在调用点解析当前sessionNotifier。

每个实际插件的inject使用定义键常量数组字面量。局部阶段适配器由本域提供者实现，方法在所需子fiber内取能力，等待依赖与业务等人分开；阶段结束释放该子fiber。公开纯工厂不接收Cordis Context，适配器负责把阶段失败变为根契约的精确结果。服务换代不能把旧在途对象悄悄换成新对象。

## 配置、通知和撤除

maximumPageBytes、maximumPendingPage 为正整数，reconciliationDelayMs 为非负整数。分页容量不改变逻辑输入批界；会话模式、工作区、自动归档政策属于具名管理操作及原事实，不是Cordis配置层。

定义入口唯一声明 `session/work-committed`，载荷为tenant、SessionId、SessionRevision、原提交source。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

Session的控制先经原子操作形成逻辑事实及传播责任，再由当前恢复协调者联系Model/Tool。不能用事件监听调用成功代替共同提交，不能把所有领域对象作为Session子插件。

Session 不登记运行实例。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 验证义务

本成员实现至少验证根入口无Cordis、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。
