# Model Cordis 契约规格

本包已初始化为模板骨架，服务定义与登记协议已接受，实际导出和登记实现尚未完成。共同 Model 业务行为归[纯领域契约](../model-contract/SPEC.md)，共同内核保证归[IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。定义自有登记状态不授予业务执行权限。

## 登记输入与撤除协议

ModelInstancesService 是包含 register 实现的具体服务，唯一归 model-cordis-contract，精确形状见[公开接口设计](docs/public-api.md)。model-host-local 的装载插件静态 inject `modelPublicationAuthority`，用当前 Context 和该能力构造服务；不复制类或服务键。PublicationAuthority 属于本域消费接缝，具体适配器核原领域权威；不是任意调用者可实现后传入的准入回调。authority 是当前受信宿主取得的原实例资格证据，含租户、调用身份、实例和代次，不能仅以 token 或 handle.instance 自证。

register 的 publication 逐项复用根 publish 参数。authority.check 核证据来源、当前发布资格、handle 身份及调用 fiber 所属宿主；核权失败返回 denied，原实例已被替换返回 stale-publication，不能取得源返回 unavailable。check 是同步最终核验，与 effect 内目录写入在同一不可让出的本地动作中完成；当前资格变更沿同一排序域生效。需要异步获取的证明由宿主提前准备，但此处仍核当前发布代次。不能提供同步当前核验的适配器返回 unavailable，不先放行再异步补核。调用 fiber 已退出时不再登记。根操作仍逐次核业务权限，登记从不授发起权。

目录在成功的 caller-fiber effect 内生成不可猜测的 registration token，回执复用本域 publish 结果。相同 fiber、相同原实例和同一 handle 对象重复登记认回同一 receipt/release；同身份但 handle 或资格内容不同返回 conflict。其他 fiber 不共享原贡献，未撤的原绑定与新登记冲突。只有旧贡献已撤且新发布资格成立时才登记后继，不以覆盖 Map 的方式接管。键为显式租户与原 `ModelCallId`（取自 publication 的 `ExecutionRef`，由 authority 核验），不从 Context 推导。

宿主 publish 在对应实例 fiber 内调用 register，成功后向根消费者返回 receipt。宿主 withdraw 按 receipt.registration 定位自己持有的原贡献，调用 release；它不接受另一个宿主的 token。release 只条件撤除自己的目录项，不取消原调用，重复调用 removed=false；fiber 自动 disposer 使用同一幂等撤除。晚到旧 release 比较 token，不能删除后继。宿主内部持有这一个原 contribution 的释放资源，不另建需要调用方手动清理的贡献者清单。纯根宿主的其他失败沿原 Reply；登记 conflict 映射 invalid(field='publication')，stale-publication 映射 stale-instance，denied/unavailable 保留原类别和安全诊断。

## 配置、通知和撤除

定义入口唯一声明 `model-cordis-contract/call-changed`，载荷为tenant、ModelCallId、Revision。JSDoc写`@mode parallel`及每项`@param`。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。监听者先按显式身份过滤，数据动作再核权。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 转换目录的登记与资源

转换目录的贡献键为 ConverterKey，贡献含固定 converter adoption 及对象。系统插件静态注入目录定义键，在 caller-fiber effect 内登记；目录同步核系统贡献资格、键格式和同键占用，命中冲突不覆盖旧件。登记回执持有不可猜测 token 和幂等 release。释放只撤除同 token 的贡献，晚到旧 disposer 不删除后继。具体媒体类型优先于模态的顺序在 acquire 内实现，消费者不自己遍历注册表。

一次 acquire 捕获原贡献和资源使用权，后继注册不替换已取得 converter。计划撤除先停止新 acquire，再等待本贡献的在途操作释放。突然撤除必须使在途操作明确结束或由提供者保留资源到释放，不能返回不存在而启用另一转换件。转换完成形成的数据交由消息拥有者保存，不受插件 disposer 撤除；仅临时资源归原 acquire 清理。

系统转换登记是装配扩展，不是租户资产注册。根 ModelConverterCatalog 仅提供 acquire，普通消费者不能 register。登记协议、权限令牌形状及实际 Cordis effect、状态与释放随 model-cordis-contract 的唯一具体定义实现并验证；model-host-local 另验证装载与业务组合，不在本页伪造新的业务授权来源。



## 验证边界

抽象服务和定义自有具体目录的[唯一形状](docs/public-api.md)尚未导出；[验证场景](verification/scenarios.md)是后继实现义务。公开方法的形状不能证明授权、持久提交或资源交接完成。

## 转换贡献的注册裁定

ModelConverterRegistrationInput 的 key 与 adoption 必须和实际 converter 一致。ModelConverterAuthority 在登记的同一不可让出动作中核系统来源、当前权限和调用 fiber。失败复用 ModelRegistrationFailure，不能登记后补核。相同 fiber、key、采用和对象重复登记认回同一 token 与 release；同键其他贡献返回 conflict，不覆盖。

register 经 this.ctx.effect 绑定调用方寿命。release 先按 token 退休该贡献并阻止新 acquire，再等旧租约释放后报告完成；重复释放认回同一关闭结果。退役期间该键返回 unavailable，不能被解释为从未登记而绕过转换。后继贡献可在旧件退出公开取得位置后登记，但已取得租约仍指向原件。晚到旧 release 只能删除自身退役记录，不能删除后继。

目录只管理贡献及借用计数，converter 的实际资源由贡献提供者拥有。计划退出必须先退休再排空后关闭；突然依赖失去时在途操作按明确失败收场并释放，不能给不存在的资源返回成功。释放异常保留未结清责任并上报，不能依赖 Cordis 卸载异常传播来证明结果。

## 服务消费与宿主绑定

服务类、键和 Context/Events 的完整形状由 [public-api](docs/public-api.md#完整服务定义与类型增补)唯一拥有。业务提供者继承对应抽象 Service，不复制键。Context 的 unknown 主体在可信入口解析，租户继续显式传入。注册权威为宿主提供的能力，不是调用方可传入任意准入回调。

ModelDriverHost 的绑定是领域提供者与本域执行宿主的装配操作，不通过普通 runtime Service 暴露 driver。实际 host 按领域协议提供本地绑定，再以 ModelInstanceHostService 供领域算法使用。未完成绑定不能公开受理。静态键注入与生命周期组合由宿主装配设计维护。
