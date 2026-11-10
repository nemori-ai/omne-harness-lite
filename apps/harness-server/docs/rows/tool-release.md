# 发行内置 Tool：清单、来源权威与两行

本页说明发行自带的五个作者 `Shell`、`Files`、`Tools`、`TodoItems` 与 `Web` 怎样进入登记表。它覆盖发行清单、两个入口对象
`toolContributionAuthority` 与 `toolReleaseRegistrant`，以及 `tool-host`、`tool-bindings` 两行。
系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
接口事实归 L-TOOL 的契约成员：[Tool Cordis 契约](../../../../packages/tool/tool-cordis-contract/docs/cordis.md)
与 [tool-host-local](../../../../packages/tool/tool-host-local/SPEC.md)。本页依据 Reduce 裁定 R2-D60、R2-D63、
R2-D66、R2-D68（含补充）与 B3-T2a 简报，只写 A 段。

## 发行清单

[`config/tool-release.json`](../../config/tool-release.json) 是不可变的发行清单。它含 `Shell`、`Files`、`Tools`、`TodoItems`
与 `Web` 五条。[`scripts/tool-release.mjs`](../../scripts/tool-release.mjs) 生成和核对它。构成规则只在
[清单模块](../../src/entry/tool-release-manifest.ts)里，脚本与启动快照都调用它。

每条写清这些内容：

- `asset`：名字与采用。采用的拥有者是 `@omne-harness/harness-server`，`revision` 是本成员的包版本，
  `digest` 是名字与固定模块的规范化摘要。
- `module`：`@omne-harness/tool-definitions` 的固定导出（`shellToolModule`、`filesToolModule`），作者的
  executor 采用，以及包产物的总摘要。
- `construction`：运维者层必须给的构造字段名。值不在清单里。
- `settings`：设置采用。`digest` 是作者名与构造字段名的摘要。
- `definition`：作者定义的规范化摘要。脚本用两组不同的探针构造值推导定义；两次不等时脚本报错退出。
  所以定义不依赖运维者的值。探针值不写进清单，也不是发行默认值。
- `holding` 与 `publication`：都是 `{ owner, record, revision, digest }`。`record` 定位清单内这一条，例如
  `tool-release.json#Shell/holding`。`revision` 是发行代次，`digest` 是这一条规范化内容的摘要。

顶层另有三项：

- `artifacts`：tool-definitions 的 `package.json` 与 `dist` 下全部文件，各自的 sha256，加一个总摘要。
- `consumer`：发行确认的文本消费者材料。它声明消费者只读写文本、不读附件，`capabilities` 与
  `attachmentAccess` 两项证据定位清单内的这份声明，`conversion` 为 null。全仓还没有生产的
  `ToolConsumerProfile` 来源，所以由发行清单声明这份材料（R2-D79 认可）。
- `generation`：发行代次，是除证据外全部内容的规范化摘要。

`check` 重新计算整份清单，再与磁盘文本逐字节比较。产物变了、条目被手改、只改了格式，都退出 1，并逐项写出
差异。用法错误或读不到构建产物时退出 2。改了 tool-definitions 或本成员版本后，先构建，再运行 `write`。

## 启动快照与来源权威

两个入口对象共用一份按运行读取的状态。注册表中登记者排在权威之前，两者都排在 `principalIssuer` 之后。

启动时，入口读清单，按包产物清单重算已安装 tool-definitions 的摘要。产物全等后才 import 固定说明符
`@omne-harness/tool-definitions`，再按同一规则重建整份清单。规范化后全等时，快照受信并带当前发行代次。
读不到、形状不对、产物不等、重建不等，快照都是 `unavailable`。快照不可用不让启动失败，但此后两个方法都答
`unavailable`。这时入口在 Cordis 记录器 `tool-release` 上打一条 warn，写明固定的原因短语（例如
`artifacts differ from the manifest`、`manifest differs from its recomputation`、`manifest unreadable`）。日志只是
观察，不改变失败关闭。`serve` 在根上登记的导出器导出到 warn 级别，这条 warn 作为 `log` 记录写到 stdout（R2-D253）。

快照只从刚核对过的包根 import：直接 import `<包根>/dist/index.js` 的文件 URL，不经包名解析，所以解析条件
（例如 `--conditions=source`）换不成未核对的源码。这个入口文件必须在包产物清单里。

`verify(authority)` 是同步的：

- 快照不可用时答 `unavailable`。
- `layer` 不恰好是 `{ kind: 'official' }`，或资产名不在清单里，答 `denied`。
- 资产采用的四项、`holding` 与 `publication` 的四个字段与清单不全等，或两项证据的代次不是当前代次，答 `invalid`。
- 全等时返回从快照构造的冻结值，不返回调用方的对象。只有这里铸 `VerifiedAuthority`。

`admits(access, layer)` 也是同步的：

- 快照不可用或登记者还没安装时答 `unavailable`。
- `layer` 不是官方层答 `denied`。
- 只接受本运行签发的登记者对象本身，租户必须等于发行登记租户，登记者绑定的代次必须是当前代次。别的主体，
  包括 `toolResidencyPrincipal` 与登记者主体的副本，都答 `denied`。

`toolReleaseRegistrant` 是入口签发的系统主体，组件名 `toolReleaseRegistrant`，签发方式与
`toolResidencyPrincipal` 相同。登记者的登记是系统作用域登记，不属于任何用户租户。`Access` 的形状需要租户，
所以登记者带一个发行登记租户：组织与账户标识全为零，真实标识不会生成它。这个租户只为满足形状，不代表任何用户，
也不授予任何租户资格；`admits` 同时核主体对象本身，所以同名租户也冒充不了登记者（R2-D79 认可）。登记者不在
维护授予表里，登记官方贡献只经 `admits` 放行。

## `tool-host` 行

`toolHostRow` 用 `createLocalToolHostPlugin` 提供 `toolGenerations`，与 `tool-residency` 成对装载。
配置只有运维者层的 `construction`：`Shell` 需要 `resultMaxBytes`、`executable`、`argsPrefix`、`cwd`、`env`，
`Files` 需要 `resultMaxBytes`，可选 `cwd`（工作区根，与 `Shell` 的 `cwd` 取同一个值；相对路径按它解析，R2-D290）。
`Tools` 需要 `resultMaxBytes`、`outputModalities`，`TodoItems` 需要 `resultMaxBytes`，`Web` 需要 `resultMaxBytes`、
`maxSearchResults`。发行层的行配置是空对象。

- `source.resolve` 只从受信快照取固定模块、配置与上下文。它不按调用参数 import。资产不在快照里答 `denied`。
  运维者层缺这个作者的值、登记者不在、快照不可用，都答 `unavailable`。`context.access` 是登记者，
  `context.services` 是空对象，因为五个作者都没有声明宿主服务。它们要的端口由 `tool-bindings` 行在每次调用时附着。
- `loaderFor` 把模块绑到清单的固定模块：交来的模块 executor 四项与清单不等时答 `invalid`；交给 loader 的始终是
  快照里的固定模块，调用方给的 `createAuthor` 不会运行。contributeTool 会把固定模块包一层再交来，所以这里按清单
  换回固定模块，不要求同一对象。`schemas` 另核 `loaded.executor` 与清单全等。
- 内层 loader 用 `createLocalToolLoader`。`settings` 核对设置采用与清单全等，再交运维者层的构造值。
  `schemas` 先核 `loaded.definition` 的规范化摘要与清单全等，不等答 `invalid`。然后履行非空 environment
  声明的义务（R2-D80，取代 R2-D79 的过渡做法）：采用不是 `environmentNeedAdoption` 时答 `invalid`；声明值写成
  JSON 文本再按入口给的读取上限读回，读不回答 `invalid`；然后经公共模块 `@omne-harness/schema-provider` 的
  `validate` 校验，schema 是执行环境契约公开的 `environmentNeedSchemaRef`。判定 `invalid` 对应 `invalid`；
  `refused`、`unavailable`、`cancelled` 或 provider 抛出对应 `unavailable`。只有 `valid` 才通过。
  provider 实例与预算由入口给出（`src/entry/schema-domain.ts`，预算各项的来源写在该文件头注释）；行装载时建
  一个 provider，行 fiber 撤除时关闭，之后的检查答 `refused` 即不可用。`ReleaseAuthorOptions` 的
  `schemaProvider` 与 `environmentNeed` 只在测试里换。生产路径只有这一条，没有直接调用 Standard Schema 的路径。
- `recordRejection` 返回被拒绝的 Promise。协调者把它转成 `unavailable`，不伪造永久 `rejected`。

## `tool-bindings` 行

`toolBindingsRow` 用 `createLocalToolBindingsPlugin`。一个插件、一个 fiber 提供两个服务：类静态提供的
`toolBindings`，以及构造时注册的 `toolCatalog`。行撤除时两个服务一起退出。

`availability.judge` 只取已核来源：

- 快照不可用、`principalVerifier` 不在、主体没有通过核验、不是 Session 工作主体、租户与调用不一致，都答
  `unavailable`。
- 定义不是官方层，或名字与规范化摘要不与清单条目相等，`qualification` 为 `denied`，三项兼容都为 false。
- 消费者材料的三项证据必须与清单确认的文本消费者全等。陌生材料答 `unavailable`。
- `dependencies` 逐项报告 environment 声明的 facility。执行环境注册表（`executionEnvironment`）与 Tool 环境适配
  （`toolEnvironments`）此刻都在场时报 `true`，任一不在报 `false`（R2-D79 第 3 条）。这只说明设施的装配在场，
  不核宿主提供者的前提。前提不满足时，放置答 `unavailable`。
- `inputCompatible`、`outputCompatible`、`attachmentsReadable` 按固定定义与确认的文本消费者能力判断。

运行时三项（B 段）：

- `authority` 是窄代理，每次调用现取当前 `toolStartAuthority`，只认契约服务定义的实例。提供者是 `tool-records`
  行装的 bundle records 插件，本行不建第二个启动协调器。
- `scope`、`settle` 是 Tool 运行时组同一个 bundle 的 `authorExecution.scope` 与 `authorExecution.settle`。
  每次调用读本次运行的 bundle。bundle 还没建好时，`scope` 抛出 `unavailable`，作者不会运行；`settle` 答
  `unavailable`。bundle 与五行见 [Tool 运行时组](tool-runtime.md)。

发行行 `toolHostRow` 装好后，按发行清单预装五个作者：系统作用域调用 `ensureLoaded`，作者闭包的登记者是
`toolReleaseRegistrant`（R2-D79 第 4 条）。租户的采用点只读已装的作者。预装不成功只在 Cordis 记录器
`tool-host` 上记一条 warn，写明作者名与失败种类。Catalog 里没有这个作者，调用答不可用，不放行。

## 具名缺件与已知限制

- **耐久拒绝记录，波 3**：本波没有拒绝记录仓。
- **生产的消费者档案来源，波 3**：全仓没有生产的 `ToolConsumerProfile` 来源，「已确认的文本消费者」暂由发行
  清单声明。生产来源由 L-TOOL 在波 3 给出（R2-D79）。
- **官方作者只能由登记者装载**：租户访问调 `ensureLoaded` 时 `admits` 答 `denied`。发行行在启动时预装五个作者，
  `adoption-sources` 只读已装的作者（R2-D79）。
- **设施依赖只核装配在场**：`dependencies` 不核宿主提供者的前提（例如 Linux 用户管理器、Windows 的 shell）。
- **产物核对不覆盖依赖包**：只核 tool-definitions 自己的 `package.json` 与 `dist`，不核它依赖的包。
- **核对与 import 之间有改写窗口**：快照先核产物摘要，再 import 模块。两步之间磁盘上的改写不在保护范围内。
- **CRLF 的 `package.json` 让快照不可用**：检出把 tool-definitions 的 `package.json` 换成 CRLF 时，摘要与清单
  不等，快照不可用，所有核验答 `unavailable`。

## 持续验证

- [来源权威与快照](../../tests/entry/tool-release.spec.ts)：每个字段的改动、非官方层、未知资产、快照不可用、
  登记者以外的主体、代次不符、产物翻转一个字节、手改清单、executor 漂移。
- [tool-host](../../tests/rows/tool-host/release-host.spec.ts)：真实 Cordis 下按生产路径（真实
  `environmentNeedSchemaRef` 经 schema-provider）首装两作者、篡改产物、缺运维者值、schema 加载失败或 provider 已关闭时失败关闭、租户访问被拒、
  来源不按参数 import、定义与设置不符、拒绝记录，以及 environment 声明合法通过、改坏一个字段与未知采用答 `invalid`。
- [tool-bindings](../../tests/rows/tool-bindings/release-bindings.spec.ts)：可用性各分支、启动权威代理、
  bundle 未建时的 scope 与 settle、建好后交给 bundle、一个 fiber 两个服务。
- [清单脚本](../../tests/tool-release-script.spec.ts)：一致、产物不符、手改条目、只改格式、用法错误。

这些用例证明发行来源与登记链路。作者执行与 Tool 运行时的组合用例见 [Tool 运行时组](tool-runtime.md)。
