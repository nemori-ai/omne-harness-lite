# Context 能力组

## 责任与范围

本组承载两块支撑能力。Runtime Context 是作用域内共享数据的供给中介与合并协议：按当前资格供给块的当前值与变化，核对需要与登记，不拥有任何块的事实。Request Context 是一次模型请求输入的派生计算与装入保证：从历史依据、Runtime Context 读取结果、工具定义与模型档案算出候选输入、装入裁定与压缩计划，不发请求、不固定采用、不保存历史。两块都只认通用角色（作用域持有者、生产者、消费者类、集成方、协调者），不认识任何上层工作流。

系统责任归[系统页 Runtime Context](../../docs/architecture/runtime/runtime-context.md)与[系统页 Request Context](../../docs/architecture/runtime/request-context.md)，领域责任与事实拥有者归[领域页](../../docs/domains/runtime-context/README.md)，产品规则归[产品正文](../../.meta_harness/design/product/runtime-context/design.md)。本组拥有成员分解、公开依赖方向、组内协作导航与组合验证责任。

## 成员与依赖

两块各按纯契约、Cordis 服务定义、机制实现、Service 实现四段切分，与 agent、model、tool 组同构。公开承诺归各成员 `SPEC.md`。Runtime Context 与 Request Context 的纯契约及 Cordis 服务定义已有源码、契约套件和包测试。四个机制与 Service 实现成员仍是模板，没有运行实现。

| 成员 | 变体 | 责任 |
| --- | --- | --- |
| [runtime-context-contract](runtime-context-contract/README.md) | module | 作用域引用、块声明（供给块与状态块）、上下文需要与需要绑定、登记、资格、绑定读者、更新与步提交、变化材料；纯函数与解码 |
| [runtime-context-cordis-contract](runtime-context-cordis-contract/README.md) | service-contract | 唯一 Cordis 服务定义 `runtimeContext`、intercept 配置类型、事件增补 |
| [runtime-context](runtime-context/README.md) | module | 不含 Cordis 的供给机制：登记表、生产者表、需要绑定解析、当前投影、观察链与游标、资格核对、步合并 |
| [runtime-context-cordis](runtime-context-cordis/README.md) | service-provider | Service 实现：一个 isolate 一个服务、作用域为参数、按作用域过滤唤醒、登记即效应 |
| [request-context-contract](request-context-contract/README.md) | module | 组装输入、十一个纯操作（八个单项操作加三个压缩计划操作）、候选与装入裁定、压缩计划、装载布局与锚点常量、历史源与策略端口类型 |
| [request-context-cordis-contract](request-context-cordis-contract/README.md) | service-contract | 唯一 Cordis 服务定义 `requestContext`：提示词贡献登记面与策略选择 |
| [request-context](request-context/README.md) | module | 不含 Cordis 的派生计算：索引、缓存、默认压缩策略、默认表示策略、修剪器 |
| [request-context-cordis](request-context-cordis/README.md) | service-provider | Service 实现：贡献登记表、作用域遮蔽、策略实现选择与配置校验 |

依赖方向：每块内 `*-contract` ← `*-cordis-contract` ← 机制实现 ← `*-cordis`。`request-context-contract` 依赖 `runtime-context-contract` 的读取结果类型与块声明的 `volatility`，不依赖 Runtime Context 的实现或 Cordis 包。两块都不导入 Session、Agent 与 Execution Environment 的契约。Request Context 契约依赖 Model、Tool、内容块与消息成员的公开值。要供给块或读块的成员依赖本组的契约。精确依赖图见[组架构](docs/architecture.md)。

## 关键协作

Runtime Context 的三面（生产者面、持有者面、读者面）与 Request Context 的纯操作经公开契约交接；跨成员流程与按读者的阅读路径归[组协作入口](docs/key-flows.md)。单成员流程归各成员 `docs/flows.md`。登记与步提交是持有者各自单独的提交；压缩转换是持有者与协调者的共同提交，唯一提交点归两方契约，现在尚未裁定：持有者一侧在 [#580](https://github.com/nemori-ai/omne-harness-lite/issues/580)，协调者一侧在 [#558](https://github.com/nemori-ai/omne-harness-lite/issues/558)。本组成员只给材料。

请求组装有两条入口。托管路径：装配了 Cordis 的系统里，协调者一侧的适配器调用服务定义 [request-context-cordis-contract](request-context-cordis-contract/README.md) 的 `assembly(target)`，取得借用该目标已登记来源集合的操作组；来源集合由来源适配者经 `register` 按目标（租户与作用域）登记，贡献从登记面现取，策略在提供者里。独立路径：不装配 Cordis 的调用方用 [request-context-contract](request-context-contract/README.md) 根入口的 `createAssemblyOperations` 绑定自己的来源集合与策略；[request-context](request-context/README.md) 提供来源登记表与账目的工厂（`createContextSourceRegistry`、`createContextAccounting`）。两个 `-cordis` 成员的根入口不导出任何东西。

## 组合验证

契约成员的验证覆盖纯函数与导出面。跨成员性质（一次模型请求的上下文闭环、块变化到模型可见、压缩后重给快照）由持有者、协调者与本组成员联合验证，验证入口随各成员 `verification/` 与真实协调者维护。两块的四个契约成员已有纯操作、契约套件与 Cordis 机制读数测试。四个实现成员没有运行实现；契约测试和模板检查不证明真实持有者、协调者或生产提供者的组合保证。

## 维护

公开承诺改契约成员的 `SPEC.md` 与 `docs/`，机制改实现成员，装配改 `-cordis` 成员；新增成员或改依赖方向同步[包组织](../../docs/package-organization.md)、本页与 `documentation.json`。具名维护者由负责人指定。
