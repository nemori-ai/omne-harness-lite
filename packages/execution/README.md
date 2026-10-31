# 执行环境能力组

## 责任与范围

本组承载两块能力。Execution Environment 是执行落点与设施的资源域：回答动作实际落在哪里、那里能用什么、留下的东西能活多久与现在是否还在。它不回答允不允许做这个动作、该落哪一层、工具做了什么。它只认通用角色（主体加租户的访问身份、不透明作用域引用、不透明原调用身份、请求身份、集成方、提供者、维护者），不导入任何会话、工具或授权类型。图像成员只接收完整图像字节和调用方传入的预算，不选择落点，不提供隔离。

系统责任归[系统页 Execution Environment](../../docs/architecture/runtime/execution-environment.md)，领域责任与事实拥有者归[领域页](../../docs/domains/execution-environments/README.md)，产品规则归[产品正文](../../.meta_harness/design/product/execution-environments/design.md)。本组拥有成员分解、公开依赖方向、组内协作导航与组合验证责任。

## 成员与依赖

Execution Environment 按纯契约、Cordis 服务定义、机制实现、Service 实现四段切分，与 `packages/` 下其他按这四段切分的组同构。四个成员由模板生成，公开承诺归各自 `SPEC.md`。四个成员都有源码与包测试：契约成员有类型、设施声明、八个操作参数 schema、六个结果 schema、纯函数与可复用契约套件；Cordis 定义成员有模板方法与受保护钩子、服务键及真实 Cordis 机制读数测试；机制成员有登记表；Service 实现成员有 Service、插件与宿主 `files` 提供者。

| 成员 | 变体 | 责任 |
| --- | --- | --- |
| [execution-environment-contract](execution-environment-contract/README.md) | module | 访问身份、绑定层、连续性、环境要求、落点、获取、采用记录、租约、受管资源；四个需要端口（资源账本、设施守卫、恢复授权、环境授权）与可信绑定来源的使用约定；设施协议与 `files`、`command`、`terminal` 三个设施的形状；工具环境声明的 schema 与采用身份；两条块声明 |
| [execution-environment-cordis-contract](execution-environment-cordis-contract/README.md) | service-contract | 唯一 Cordis 服务定义 `executionEnvironment`、intercept 配置类型；恢复入口（`recoverOwned`、`releaseScope` 与恢复查询）在同一服务上 |
| [execution-environment](execution-environment/README.md) | module | 不含 Cordis 的登记表机制：提供者与设施表、按允许绑定顺序匹配、获取状态与槽（租户加获取键）、租约视图与逐操作门、恢复编排 |
| [execution-environment-host-local](execution-environment-host-local/README.md) | service-provider | Service 实现与撤除保留；宿主 `files` 提供者（读取、查看、写入与关闭四项操作）；`command`、`terminal` 的宿主机制只有设计，没有实现 |
| [image](image/README.md) | module | 图像预算、打开、编码与关闭；公开入口是 `imageBudget`、`open` 与句柄上的 encode 和 close |

依赖方向：`execution-environment-cordis-contract` 与 `execution-environment` 各自只依赖 `execution-environment-contract`；`execution-environment-host-local` 依赖这三个成员。契约成员依赖 `runtime-context-contract`（作用域引用与块声明类型）、`legal-identity`、`operation-result`、`json-text`、`schema-provider`；不依赖 Tool、Session、授权的契约，它们依赖本组。图像成员与 Execution Environment 没有交接。精确依赖图见[组架构](docs/architecture.md)。

## 关键协作

集成方（工具宿主、独立调用者）经契约的 `ExecutionEnvironment` 操作取落点、租约与设施；提供者经 `ProviderRegistrations` 登记并撤除；维护者经同一服务的恢复入口结算作用域资源，用恢复查询读原获取的状态；观察者经 Runtime Context 读 `execution.placement` 与 `execution.host-facts`。跨成员流程与按读者的阅读路径归[组协作入口](docs/key-flows.md)。单成员流程归各成员 `docs/flows.md`。许可、终局与采用记录的耐久提交由集成方的账本兑现，本组成员只给材料。

## 组合验证

契约成员的验证覆盖纯函数、导出面与 schema。宿主 `files` 四项操作的授权核对、关闭失败处置、结果四态与登记匹配在 `-host-local` 与 `execution-environment` 的包测试里有回归，运行记录见各成员 `SPEC.md`。跨成员性质（许可先于首个外部效果、释放 `pending` 的认回、作用域释放后的恢复）由集成方与本组成员联合验证，当前没有真实集成方，没有运行证据。图像成员的预算、拒绝、编码和关闭由该成员自己的 SPEC 验证，命令是 `pnpm --filter @omne-harness/image test`。mock、图与结构通过不证明真实组合保证。

## 维护

公开承诺改契约成员的 `SPEC.md` 与 `docs/`，机制改 `execution-environment`，装配与宿主机制改 `-host-local`；新增提供者（沙箱）是新的 `service-provider` 成员，登记到同一个登记表，不改契约，也不是新的 Service 实现。新增成员或改依赖方向同步[包组织](../../docs/package-organization.md)、本页与 `documentation.json`。新建实现先核对[成员文档规范](../../docs/member-documentation.md)和[包创建入口](../../docs/development.md#创建和整改产品包)。具名维护者由负责人指定。
