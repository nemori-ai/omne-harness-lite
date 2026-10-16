# Model Cordis 定义与消费

本成员拥有唯一定义入口与定义自有登记表，根及 ./cordis 当前均为空导出。具体业务插件和宿主接续由[装配设计](../../model/docs/cordis.md)拥有。

## 服务定义与入口

目标 `@omne-harness/model-cordis-contract/cordis` 唯一拥有下列服务定义、键和增补；`@omne-harness/model-host-local/cordis` 的具体提供者继承它。纯领域类型从 model-contract 导入。两个契约包已初始化为骨架，声明仍未实现；model-host-local 尚未建立。实现不得复制方法形状，索引类型随唯一契约同步。

精确声明见 [public-api](public-api.md#服务定义与入口)。

model-cordis-contract 的根只导出纯类型，Cordis 值和增补仅在 ./cordis；安装该包明确带入 Cordis。业务操作使用抽象 Service；实例与转换目录保留定义自有的具体登记逻辑，限 IC-3 允许的范围。业务插件及阶段适配器归 model-host-local；可复用领域执行归不依赖 Cordis 的 model。

定义入口将 Context 的 `modelRuntime` 增补为这一抽象类，主体类型由装配的可信身份适配器专化，运行时仍核验输入。接口同形不证明授权。具体插件不得再次ctx.provide这个键。消费者导入定义入口的键常量，提供者选择归应用装配。

## 依赖与定义拥有者

表中本域键的定义拥有者统一为 model-cordis-contract，操作类型引用 model-contract；类命名为端口名加 Service，静态 provide 只在定义类声明，导出键取自它。目录采用定义自有的具体 Service，不用 TypeScript interface 冒充登记机制；model-host-local 负责装载并参加组合验证。跨域行引用原定义拥有者，不重复声明同键。后继实现需逐项生成服务/依赖图核对这一设计，当前表不冒称源码事实。

| 服务键 | 根操作形状 | 定义拥有者 | 必需性及责任 |
| --- | --- | --- | --- |
| modelCommands | ModelCommands | Model | 必需，API与执行共享原调用/保管权威；失去时不新受理/发送，旧结果保管不能假成功 |
| modelSendBoundary | ModelSendBoundary | Model | 执行段必需；固定采用及实际S围栏，缺席不影响已有事实查询 |
| modelRetryPolicy | ModelRetryPolicy | Model | 策略阶段局部必需；由稳定适配器在子fiber取得，缺失按根协议不再试，不能卸载原结果查询 |
| modelInstances | ModelInstancesService | Model | 具体目录 Service；宿主负责装载，查询与受信贡献分开，登记归Model实例fiber |
| modelPublicationAuthority | ModelPublicationAuthority | Model 定义入口 | 目录必需；核当前宿主、原实例资格及authority来源，不能只核字符串相同 |
| modelInstanceHost | ModelInstanceHost | Model | 执行宿主必需；捕获自身Context调度，不使用Agent调用方Context |
| modelHostAuthority | ModelHostAuthority | Model | 宿主必需；从原事实与当前可信资格构造 drive 输入 |
| modelClock | ModelClock | Model | 执行/清理等待必需；失去时保持未完责任，不伪造经过时间 |

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
