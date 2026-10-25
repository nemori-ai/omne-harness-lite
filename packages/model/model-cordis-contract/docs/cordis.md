# Model Cordis 定义与消费

本成员拥有唯一定义入口与定义自有登记表。根入口只导出八个登记类型；./cordis 导出抽象 Service 定义、实例目录、转换目录和增补，名单见 [public-api](public-api.md)。具体业务插件和宿主接续由[装配设计](../../model/docs/cordis.md)拥有。

## 服务定义与入口

目标 `@omne-harness/model-cordis-contract/cordis` 唯一拥有下列服务定义、键和增补；`@omne-harness/model-host-local/cordis` 的具体提供者继承它。纯领域类型从 model-contract 导入。十五个抽象 Service（含凭据）、实例目录和转换目录已全部落地。model-host-local 目前只有凭据插件。实现不得复制方法形状，索引类型随唯一契约同步。

精确声明见 [public-api](public-api.md#服务定义与入口)。

凭据的 ModelCredentialService、modelCredential 键和 Context 增补已在本定义入口的 [`./cordis`](public-api.md#凭据服务定义)落地，是唯一定义。服务键为 `modelCredential`，是抽象定义，只有 `present` 与 `resolve`，诊断读取不在服务上。定义不持有端口；实现不得把端口或保管者放在服务实例上，须放进闭包，model-host-local 的 `./cordis` 中的 `LocalCredentialPlugin` 这样封住它。定义引用 model-contract 的凭据操作类型，不导入 model。`LocalCredentialPlugin` 在 model-host-local 的 `./cordis` 继承这个定义。model 不依赖本包。服务不核验调用方资格：`SendFace` 的授权字段和引用里的 `tenant` 都由调用方自报，同一 isolate 的任意插件可以请求另一租户的凭据。这一项在 [SPEC](../SPEC.md#凭据服务)登记为未决。

model-cordis-contract 的根只导出纯类型，Cordis 值和增补仅在 ./cordis；安装该包明确带入 Cordis。./cordis 的实例目录与转换目录在运行时调用 kernel-basis `./cordis` 的 [`registerInCallerFiber`](../../../assembly/kernel-basis/SPEC.md#调用方-fiber-登记辅助)，所以安装该包也带入 `@omne-harness/kernel-basis`。业务操作使用抽象 Service；实例与转换目录保留定义自有的具体登记逻辑，限 IC-3 允许的范围。业务插件及阶段适配器归 model-host-local；可复用领域执行归不依赖 Cordis 的 model。

定义入口将 Context 的 `modelRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 目录的 Cordis 事实

下列事实对应 Cordis 4.0.4，两个目录（`ModelInstancesService` 与 `ModelConvertersService`）相同。前四项由真实 Context 的测试核对，第五项来自 Cordis 源码（fiber.ts 中 effect 的 `wrapper.then`），没有测试。

- `register` 是实例上的普通函数，不是箭头函数。插件经 `ctx.modelInstances` 或 `ctx.modelConverters` 调用时，Cordis 把 `this.ctx` 换成调用方的 Context，所以 `this.ctx.effect` 登记的撤除函数落在调用方 fiber 上，调用方 fiber 卸载即撤除该登记。箭头函数和闭包里捕获的 `this` 看到的是目录自己的 Context，不能用来登记。
- 目录的状态在构造函数建立的闭包里，不在实例上。Cordis 把实例的全部属性交给任何能读 `ctx.modelInstances` 或 `ctx.modelConverters` 的插件，实例上只有两个操作（实例目录是 `connect` 与 `register`，转换目录是 `acquire` 与 `register`），以及 Service 基类的 `ctx` 与 `name`，另有 Cordis 自己放的 `Symbol(cordis.tracker)`。
- 调用方 fiber 卸载时，撤除函数只退役或撤除登记，不等待，也不抛出：Cordis 并发运行各撤除函数，只记录抛出的错误。转换目录的租约释放归显式的 `release()`，等待租约会使 fiber 卸载在持有者不释放时无限挂起；提供者的释放钩子同样不被等待：没有在途租约时，钩子的同步部分在撤除函数的调用栈里开始，撤除函数不等它完成。钩子永不完成时，该键一直返回 unavailable，`release()` 一直挂起，见 [SPEC](../SPEC.md#转换贡献的注册裁定)。
- `release()` 自己先改登记状态，再调用 `ctx.effect` 返回的撤除函数。后者同步运行目录的撤除函数，所以撤除函数看到状态已不是活动，就知道这是有序的释放，不是 fiber 突然卸载。转换目录靠这一点区分：突然卸载取消在途转换的 signal，有序释放不取消。
- `ctx.effect` 返回的撤除函数同时是 thenable。目录不从 `async` 函数直接返回它。

## 依赖与定义拥有者

表中本域键的定义拥有者统一为 model-cordis-contract，操作类型引用 model-contract；类命名为端口名加 Service，静态 provide 只在定义类声明，导出键取自它。目录采用定义自有的具体 Service，不用 TypeScript interface 冒充登记机制；model-host-local 负责装载并参加组合验证。跨域行引用原定义拥有者，不重复声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 服务键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| modelCommands | ModelCommands | Model | 必需，API与执行共享原调用/保管权威；失去时不新受理/发送，旧结果保管不能假成功 |
| modelSendBoundary | ModelSendBoundary | Model | 执行段必需；固定采用及实际S围栏，缺席不影响已有事实查询 |
| modelRetryPolicy | ModelRetryPolicy | Model | 策略阶段局部必需；由稳定适配器在子fiber取得，缺失按根协议不再试，不能卸载原结果查询 |
| modelInstances | ModelInstancesService | Model | 具体目录 Service；宿主负责装载，查询与受信贡献分开，登记归Model实例fiber |
| modelPublicationAuthority | ModelPublicationAuthority | Model 定义入口 | 目录必需；核当前宿主、原实例资格及authority来源，不能只核字符串相同 |
| modelInstanceHost | ModelInstanceHost | Model | 执行宿主必需；捕获自身Context调度，不使用调用方的 Context |
| modelHostAuthority | ModelHostAuthority | Model | 宿主必需；从原事实与当前可信资格构造 drive 输入 |
| modelClock | ModelClock | Model | 执行/清理等待必需；失去时保持未完责任，不伪造经过时间 |
| modelCredential | CredentialPort | Model 定义入口 | 发送边界解析凭据时需要；Context 成员可选，缺席时不发送。不核验调用方资格，见 [SPEC](../SPEC.md#凭据服务) |

## 档案、准备和转换的装配

Model 的全部能力不集中到一个必需依赖集合。下表补足独立消费者的装配。设计定义入口为业务操作提供唯一抽象 Service，为目录提供定义自有的具体 Service；方法类型引用根接口；provide 字符串由定义类拥有，消费者只导入键常量。

| 服务键 | 根端口与定义类 | 直接依赖和生命周期 |
| --- | --- | --- |
| modelDiagnostics | ModelDiagnostics / ModelDiagnosticsService | 独立诊断授权、耐久事实与已接受保留策略；不依赖 runtime 或发送 adapter |
| modelProfiles | ModelProfiles / ModelProfilesService | 档案读取、当前身份/设置及凭据状态元数据适配器；不读取秘密，不依赖 runtime 或供应商网络 |
| modelProfileMaintenance | ModelProfileMaintenance / ModelProfileMaintenanceService | 当前维护资格、档案条件写与操作核实；不因只读列表需求一同注入 |
| modelRequestPreparation | ModelRequestPreparation / ModelRequestPreparationService | 档案采用解析、当前合法性、绑定引用与固定算法目录；不持有秘密 |
| modelMessageConversion | ModelMessageConversion / ModelMessageConversionService | 系统转换目录与来源核验；按准入操作取得局部转换器 |
| modelConverterAuthority | ModelConverterAuthority / ModelConverterAuthorityService | 登记前同步核系统贡献资格，不授业务执行权 |
| modelConverters | ModelConverterCatalog / ModelConvertersService | 定义自有的具体注册服务；宿主装载，系统装配贡献时核当前资格 |

目录为定义自有的具体 Service，其他行为端口为抽象 Service。宿主装载唯一 ModelConvertersService，不复制键或方法签名。这里没有新增 ModelInputMeterService 或每个供应商的全局键。计量和传输适配由提供者按固定 adoption 取得，具体算法作为依赖注入。新增算法不扩大普通消费者权限。源实现接管时须生成实际服务图核对本表，不能把表当已经存在的声明。
