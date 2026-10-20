# Session 的 Cordis 集成候选

本页消费[根操作候选](../../session-contract/docs/public-api.md)，尚未技术接受或实现。共同生命周期、事件、树和IC对账归[四成员集成](../../../../docs/architecture/runtime/runtime-contract-integration.md)。本页只确定本成员独有的定义和依赖；不以加载成功宣称业务就绪。

## 服务定义与入口

候选 `@omne-harness/session-cordis-contract/cordis` 唯一拥有下列抽象门面及表中本域接缝的服务定义。具体插件由 [session-cordis](../../session-cordis/docs/cordis.md) 提供。根接口尚未导出，因此代码是未来声明形状，不是当前可导入示例。实现不得复制方法形状，索引类型随根契约同步。

```ts
import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionService } from '@omne-harness/session-contract'

/** @owner packages/session/session-cordis-contract */
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

## 配置、通知和撤除

定义入口唯一声明 `session-cordis-contract/work-committed`，载荷为tenant、SessionId、SessionRevision、原提交source。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。会话事件先按显式身份过滤，数据动作再核权。

## 验证义务

本成员实现至少验证根入口不加载绑定、定义入口不引具体提供者、静态键唯一、必需/局部/可选依赖的实际撤除范围、旧引用拒绝及当前身份核验。当前真实4.0.4探针仅支持共同页所列机制，根操作的持久性、跨进程、外部效果和业务接受须另由实际提供者证明。


具体注入、阶段 fiber 与卸载交接由 [session-cordis](../../session-cordis/docs/cordis.md) 拥有。
