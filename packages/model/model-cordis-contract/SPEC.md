# Model Cordis 契约规格

服务定义与登记协议已接受并已全部落地：根入口的八个登记类型，`./cordis` 的十七个 Service 定义（含凭据服务；转换目录 `ModelConvertersService` 与实例目录 `ModelInstancesService` 是具体服务）、对应的 Context 增补和事件 `model-cordis-contract/call-changed`。共同 Model 业务行为归[纯领域契约](../model-contract/SPEC.md)，共同内核保证归[IC 约定](../../../docs/architecture/cordis-integration-conventions.md)。定义自有登记状态不授予业务执行权限。

## 登记输入与撤除协议

ModelInstancesService 是包含 register 实现的具体服务，唯一归 model-cordis-contract，精确形状见[公开接口设计](docs/public-api.md)。model-host-local 的装载插件静态 inject `modelPublicationAuthority`，用当前 Context 和该能力构造服务；不复制类或服务键。PublicationAuthority 属于本域消费接缝，具体适配器核原领域权威；不是任意调用者可实现后传入的准入回调。authority 是当前受信宿主取得的原实例资格证据，含租户、调用身份、实例和代次，不能仅以 token 或 handle.instance 自证。

register 的 publication 逐项复用根 publish 参数。authority.check 核证据来源、当前发布资格、handle 身份及调用 fiber 所属宿主；核权失败返回 denied，原实例已被替换返回 stale-publication，不能取得源返回 unavailable。check 是同步最终核验，与 effect 内目录写入在同一不可让出的本地动作中完成；当前资格变更沿同一排序域生效。需要异步获取的证明由宿主提前准备，但此处仍核当前发布代次。不能提供同步当前核验的适配器返回 unavailable，不先放行再异步补核。调用 fiber 已退出时不再登记。根操作仍逐次核业务权限，登记从不授发起权。

目录在成功的 caller-fiber effect 内生成不可猜测的 registration token，回执复用本域 publish 结果。相同 fiber、相同原实例和同一 handle 对象重复登记认回同一 receipt/release；同身份但 handle 或资格内容不同返回 conflict。其他 fiber 不共享原贡献，未撤的原绑定与新登记冲突。只有旧贡献已撤且新发布资格成立时才登记后继，不以覆盖 Map 的方式接管。键为显式租户与原 `ModelCallId`（取自 publication 的 `ExecutionRef`，由 authority 核验），不从 Context 推导。

宿主 publish 在对应实例 fiber 内调用 register，成功后向根消费者返回 receipt。宿主 withdraw 按 receipt.registration 定位自己持有的原贡献，调用 release；它不接受另一个宿主的 token。release 只条件撤除自己的目录项，不取消原调用，重复调用 removed=false；fiber 自动 disposer 使用同一幂等撤除。晚到旧 release 比较 token，不能删除后继。宿主内部持有这一个原 contribution 的释放资源，不另建需要调用方手动清理的贡献者清单。纯根宿主的其他失败沿原 Reply；登记 conflict 映射 invalid(field='publication')，stale-publication 映射 stale-instance，denied/unavailable 保留原类别和安全诊断。

两个目录的 `register` 在返回形状上偏离 [IC-13](../../../docs/architecture/cordis-integration-conventions.md#ic-13)：IC-13 写的是 `register()` 返回撤除函数，这里返回带 `release` 的 `Outcome`。理由是登记要在同一不可让出的动作里核资格并判定冲突，两者都可能失败，失败必须作为值返回，撤除函数装不下；`release` 的结果还要说明是否撤除，以及提供者的钩子是否失败。IC-13 的其余部分照做：登记经 `this.ctx.effect` 落在调用方 fiber，fiber 卸载时的撤除由该 effect 兑现，不另记「谁登记了什么」；`release` 与 effect 的撤除函数共用同一幂等撤除。是否把 IC-13 的措辞改成允许这种形状，由 IC 约定的拥有者裁定。

## 实例目录的行为

目录按显式租户与 `ModelCallId` 存一项。键文本取自租户的解析码和调用身份，租户 A 的调用不会出现在租户 B 下。`connect` 只按这个键返回登记的 handle（同一对象）或 `no-live-route`；它不核主体，不授发布权，根操作仍逐次核业务权限。不是由身份解析器产生的租户没有键：`register` 返回 `invalid`，`connect` 返回 `invalid`（`field='tenant'`），不当作缺席回答。

认回要求同一 fiber、同一租户与调用、相同的实例与代次、同一 handle 对象、内容相同的 authority 证据。任何一项不同都返回 `conflict`，不覆盖。登记时目录保存自己的一份身份与证据副本，调用方事后改动传入的对象不影响认回。authority 的 `check` 抛出时，`register` 的 Promise 拒绝，不登记。

`release` 先按 token 条件撤除目录项，再移除 fiber 上的 effect，返回的 `removed` 说明这次调用是否撤除了目录项。fiber 卸载先撤除时，之后的 `release` 返回 `removed=false`。目录从不调用 handle，撤除不取消原调用。

调用 fiber 已退出时的两条失败路径与转换目录相同，见[转换目录的未决项](#转换目录的未决项)第 1 项。

## 实例目录的未决项

1. 登记失败到根 `ModelFailure` 的映射。`register` 返回 `ModelRegistrationFailure` 的原类别。上文把 `conflict → invalid(field='publication')`、`stale-publication → stale-instance`、`denied` 与 `unavailable` 保留类别写在宿主 publish 一侧，页面没有承接这项映射的函数。`stale-instance` 需要 `ModelInstanceId`，`denied` 需要 `action`，`unavailable` 需要 `dependency`，登记失败都不带这些字段，所以映射只能在持有 publication 与依赖名的宿主里做。目录不做这项映射，也没有测试固定它。

## 配置、通知和撤除

定义入口唯一声明 `model-cordis-contract/call-changed`，载荷为tenant、ModelCallId、Revision。JSDoc写`@mode parallel`及每项`@param`。该事件由 `ModelRuntimeService` 的提供者，在提交调用的新修订之后发出；消费者只订阅，不发出。通知不带消息正文、凭据或附件地址；发送者捕获监听失败，保留原提交结果，由权威扫描恢复通知遗漏。监听者先按显式身份过滤，数据动作再核权。

运行实例登记的贡献权限只交受信宿主。目录register验证原实例资格和token，在调用方fiber的effect中增加并条件撤除；connect不授发布权。计划卸载先完成业务交接再dispose；依赖突然消失时保留未知，不用自动撤登记声称外部效果被撤回。

## 转换目录的登记与资源

转换目录的贡献键为 ConverterKey，贡献含固定 converter adoption 及对象。系统插件静态注入目录定义键，在 caller-fiber effect 内登记；目录同步核系统贡献资格、键格式和同键占用，命中冲突不覆盖旧件。键格式见[转换目录的键与查询输入](#转换目录的键与查询输入)。登记回执持有不可猜测 token 和幂等 release。释放只撤除同 token 的贡献，晚到旧 disposer 不删除后继。具体媒体类型优先于模态的顺序在 acquire 内实现，消费者不自己遍历注册表。

一次 acquire 捕获原贡献和资源使用权，后继注册不替换已取得 converter。计划撤除先停止新 acquire，再等待本贡献的在途操作释放。突然撤除必须使在途操作明确结束或由提供者保留资源到释放，不能返回不存在而启用另一转换件。转换完成形成的数据交由消息拥有者保存，不受插件 disposer 撤除；仅临时资源归原 acquire 清理。

系统转换登记是装配扩展，不是租户资产注册。根 ModelConverterCatalog 仅提供 acquire，普通消费者不能 register。登记协议、权限令牌形状及实际 Cordis effect、状态与释放随 model-cordis-contract 的唯一具体定义实现并验证；model-host-local 另验证装载与业务组合，不在本页伪造新的业务授权来源。



## 凭据服务

`ModelCredentialService` 是抽象定义，键是 `modelCredential`，只有 `present` 与 `resolve` 两个抽象成员，形状取自 model-contract 的 `CredentialPort`。定义不持有端口，不保存秘密，不选择保管实现。诊断读取与保管管理不在服务上。实现不得把自己的端口或保管者放在服务实例上：Cordis 把实例的全部属性交给任何能读 `ctx.modelCredential` 的插件，TypeScript 的 `private` 不是运行时边界，`#private` 字段经 Cordis 代理读取会失败。实现把端口放进构造时创建的闭包。model-host-local 的 `./cordis` 中的 `LocalCredentialPlugin` 这样封住保管者，由真实 Cordis 测试核对。

未决：服务不核验调用方资格。`SendFace` 的 `authorized` 与 `official`，以及引用里的 `tenant`，都由调用方自报。反例：同一 isolate 的任意插件调用 `resolve({ id, tenant: 租户 B, purpose: MODEL_SEND }, { authorized: true, official: false })`，就能取得租户 B 的凭据值。依赖装配须只把该服务交给受信的发送边界，目前没有拥有者强制这一点。本规格不解决这一项，也不把转发当作授权证明。

## 验证边界

转换目录、实例目录和抽象服务由真实 Cordis 4.0.4 的测试核对（见[验证说明](verification/README.md#转换目录测试)与[实例目录测试](verification/README.md#实例目录测试)）。[验证场景](verification/README.md#model-cordis-持续验证)中目录以外的义务仍是后继实现义务。公开方法的形状不能证明授权、持久提交或资源交接完成。

## 转换贡献的注册裁定

ModelConverterRegistrationInput 的 key 与 adoption 必须和实际 converter 一致。ModelConverterAuthority 在登记的同一不可让出动作中核系统来源、当前权限和调用 fiber。失败复用 ModelRegistrationFailure，不能登记后补核。相同 fiber、key、采用和对象重复登记认回同一 token 与 release；同键其他贡献返回 conflict，不覆盖。

register 经 this.ctx.effect 绑定调用方寿命。release 先按 token 退休该贡献并阻止新 acquire，再等旧租约释放后报告完成；重复释放认回同一关闭结果。退役期间该键返回 unavailable，不能被解释为从未登记而绕过转换。后继贡献可在旧件退出公开取得位置后登记，但已取得租约仍指向原件。晚到旧 release 只能删除自身退役记录，不能删除后继。

目录只管理贡献及借用计数，converter 的实际资源由贡献提供者拥有。计划退出必须先退休再排空后关闭；突然依赖失去时在途操作按明确失败收场并释放，不能给不存在的资源返回成功。释放异常保留未结清责任并上报，不能依赖 Cordis 卸载异常传播来证明结果。

acquire 出借的是对登记转换件的包装，包装对象的 `adoption` 与登记的相同，消费者按 `adoption` 认转换件，不按对象身份。包装对象的 `convert` 把调用交给登记的转换件。登记者的 fiber 卸载（突然撤除）时，在途的 `convert`，以及之后在旧租约上发起的 `convert`，都以 `unavailable` 结束，登记转换件收到的 signal 同时被取消，调用不会落到别的转换件上。计划撤除（`release`）不取消 signal：在途调用照常完成，退休等租约归还。

登记输入可带 `release` 钩子，提供者用它归还自己的资源。目录在最后一个租约归还之后调用一次，作为登记输入的方法调用；钩子运行期间该键继续返回 unavailable，钩子完成后才报告关闭完成。登记者 fiber 卸载引起的撤除同样调用钩子，不等钩子完成，也不让 fiber 卸载挂起。没有在途租约时，钩子在 Cordis 运行撤除函数时同步开始：钩子函数体的同步部分在撤除函数的调用栈里运行，`fiber.dispose()` 返回时它已开始；有在途租约时，钩子在最后一个租约归还时开始。目录不给钩子设时限：钩子永不完成时，该键一直返回 unavailable，`release()` 一直挂起，提供者的资源也不会被目录当作已归还。钩子抛出或拒绝时，`release` 返回 `{ removed: true, failure }`：`failure` 是 `unavailable`，诊断文字固定，不含提供者的错误文本。目录仍把该贡献撤离，之后每次 `release` 返回同一结果，不再调用钩子，也不替提供者重试；未归还资源的责任留在提供者与登记者手里，由这个结果报告。fiber 卸载引起的失败由之后的 `release` 取得。

## 转换目录的键与查询输入

键与查询输入的词表和文法归 [`@omne-harness/modality`](../../common/modality/SPEC.md#判定媒体类型)，目录不另立一套。目录按精确相等匹配键，不规范化，也不替调用方规范化。

登记：媒体类型键必须是规范形式（`isCanonicalMediaType` 为真：小写 `type/subtype`，无参数与空白）。模态键必须是该成员的四种模态之一（`judgeModality`），含 `video`。不合格的键使登记返回 `{ kind: 'invalid', reason }`，与 adoption 不一致的拒绝同一形式；`reason` 说明是媒体类型键不规范还是模态键未知。被拒的登记不进入目录，不在调用方 fiber 上留 effect，不影响已登记的贡献，也不占用该键，之后合格的同名登记不冲突。

查询：`acquire` 的 `mediaType` 必须是规范形式，`modality` 必须是 `null` 或四种模态之一，否则返回 `invalid`，`field` 为 `mediaType` 或 `modality`，不查找转换件，不出借租约。规范形式由调用方经 `judgeMediaType` 取得，目录不接受大小写不同或带参数的形式当作同一键。

## 转换目录的未决项

下列各项的现行条文不足以决定行为。目录按所写方式处理。第 1 项的两条路径与授权方抛出，对两个目录都有测试固定；第 2、3 项有测试固定；其余没有。

1. 调用 fiber 已退出时的登记，转换目录与实例目录相同。两条路径都不登记，失败方式不同：经注入的 `ctx.modelConverters`（或 `ctx.modelInstances`）读取时，Cordis 代理在目录代码运行之前同步抛出（inactive context），`register` 不会被调用；经先前捕获的引用或 `ctx.get` 调用时，`ctx.effect` 抛出 `INACTIVE_EFFECT`，`register` 的 Promise 以该错误拒绝。两条路径都没有对应的 `ModelRegistrationFailure` 类别。授权方 `check` 抛出的错误同样使 Promise 拒绝，不登记。
2. 授权方与键格式的询问顺序。条文只写目录同步核「系统贡献资格、键格式和同键占用」，没有给先后。目录先问授权方，再核 adoption 一致，再核键格式，最后核同键占用。所以未获授权的调用者不论键是否合格，都只得到授权方的答案，目录不借键格式的拒绝向它透露什么；只有授权方放行后才返回键格式的 `invalid`。有测试固定。
3. 旧件退役期间的同键后继。「退役期间该键返回 unavailable」与「后继贡献可在旧件退出公开取得位置后登记」有两种读法。目录取这一种：旧件一退役就退出公开取得位置，后继可立即登记，`acquire` 取后继；只有退役件独占该键时，`acquire` 才返回 unavailable。另一种读法是旧件排空后才可登记，那时同键的登记在排空前返回 `conflict`。
4. 目录服务自己的 fiber 卸载之后，消费者手里的旧引用。旧引用的 `acquire` 与 `register` 仍按原状态工作，目录没有使它们失败；实例目录的 `connect` 与 `register` 按同一方式构造，没有另外处理。[IC-9](../../../docs/architecture/cordis-integration-conventions.md#ic-9) 要求提供者写明换代时如何处置已持有的旧引用，本节条文没有写。
5. 租约不随取得方的 fiber 撤除。消费者的 fiber 在 `release()` 之前被卸载时，租约仍计在原件上，原件的退役排空永不完成，该键持续返回 unavailable。目录没有取得方 fiber 的通道；[验证说明](verification/README.md)已披露。

## 服务消费与宿主绑定

服务类、键和 Context/Events 的完整形状由 [public-api](docs/public-api.md#完整服务定义与类型增补)唯一拥有。业务提供者继承对应抽象 Service，不复制键。Context 的 unknown 主体在可信入口解析，租户继续显式传入。注册权威为宿主提供的能力，不是调用方可传入任意准入回调。

ModelDriverHost 的绑定是领域提供者与本域执行宿主的装配操作，不通过普通 runtime Service 暴露 driver。实际 host 按领域协议提供本地绑定，再以 ModelInstanceHostService 供领域算法使用。未完成绑定不能公开受理。静态键注入与生命周期组合由宿主装配设计维护。
