# 发行内置 Tool：清单、来源权威与两行

本页说明发行自带的 `Shell` 与 `Files` 作者怎样进入登记表。它覆盖发行清单、两个入口对象
`toolContributionAuthority` 与 `toolReleaseRegistrant`，以及 `tool-host`、`tool-bindings` 两行。
系统责任归[应用装配](../../../../docs/architecture/runtime/application-assembly.md#插件树)。
接口事实归 L-TOOL 的契约成员：[Tool Cordis 契约](../../../../packages/tool/tool-cordis-contract/docs/cordis.md)
与 [tool-host-local](../../../../packages/tool/tool-host-local/SPEC.md)。本页依据 Reduce 裁定 R2-D60、R2-D63、
R2-D66、R2-D68（含补充）与 B3-T2a 简报，只写 A 段。

## 发行清单

[`config/tool-release.json`](../../config/tool-release.json) 是不可变的发行清单。它只含 `Shell` 与 `Files`
两条。[`scripts/tool-release.mjs`](../../scripts/tool-release.mjs) 生成和核对它。构成规则只在
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
`unavailable`。

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
`Files` 需要 `resultMaxBytes`。发行层的行配置是空对象。

- `source.resolve` 只从受信快照取固定模块、配置与上下文。它不按调用参数 import。资产不在快照里答 `denied`。
  运维者层缺这个作者的值、登记者不在、快照不可用，都答 `unavailable`。`context.access` 是登记者，
  `context.services` 是空对象，因为两个作者没有声明宿主服务。
- `loaderFor` 用 `createLocalToolLoader`。`settings` 核对设置采用与清单全等，再交运维者层的构造值。
  `schemas` 先核 `loaded.definition` 的规范化摘要与清单全等，不等答 `invalid`。然后履行非空 environment
  声明的义务（R2-D79）：采用不是 `environmentNeedAdoption` 时答 `invalid`；是时直接调用执行环境契约的
  `environmentNeedSchema['~standard'].validate`，不经 schema-provider。结果有 issues 时答 `invalid`；校验件
  抛出、返回 Promise 或返回读不懂的结果时答 `unavailable`。只有明确的 `{ value }` 才通过。
- `recordRejection` 返回被拒绝的 Promise。协调者把它转成 `unavailable`，不伪造永久 `rejected`。

## `tool-bindings` 行

`toolBindingsRow` 用 `createLocalToolBindingsPlugin`。一个插件、一个 fiber 提供两个服务：类静态提供的
`toolBindings`，以及构造时注册的 `toolCatalog`。行撤除时两个服务一起退出。

`availability.judge` 只取已核来源：

- 快照不可用、`principalVerifier` 不在、主体没有通过核验、不是 Session 工作主体、租户与调用不一致，都答
  `unavailable`。
- 定义不是官方层，或名字与规范化摘要不与清单条目相等，`qualification` 为 `denied`，三项兼容都为 false。
- 消费者材料的三项证据必须与清单确认的文本消费者全等。陌生材料答 `unavailable`。
- `dependencies` 逐项报告 environment 声明的 facility。A 段没有落点与设施的可用性来源，每项如实报 `false`。
- `inputCompatible`、`outputCompatible`、`attachmentsReadable` 按固定定义与确认的文本消费者能力判断。

A 段的运行时三项：

- `authority` 是窄代理，每次调用现取当前 `toolStartAuthority`，只认契约服务定义的实例。`tool-records` 现在是
  替身，所以它答 `unavailable`。
- `scope` 抛出 `unavailable`，作者不会运行；`settle` 答 `unavailable`，不用测试常量冒充结果。
- 三项都在 B 段改接 `createLocalToolRuntimePlugins` 的同一个 bundle。

## 具名缺件与已知限制

- **耐久拒绝记录，波 3**：本波没有拒绝记录仓。
- **生产的消费者档案来源，波 3**：全仓没有生产的 `ToolConsumerProfile` 来源，「已确认的文本消费者」暂由发行
  清单声明。生产来源由 L-TOOL 在波 3 给出（R2-D79）。
- **官方作者只能由登记者装载**：租户访问调 `ensureLoaded` 时 `admits` 答 `denied`。B 段的必做项：发行入口在
  启动时用 `toolReleaseRegistrant` 预装 Shell 与 Files，`adoption-sources` 只读已装的作者，不用租户访问首装
  官方作者（R2-D79）。
- **可用性的 `dependencies` 在 A 段恒为 `false`**：A 段没有落点与设施的可用性来源。B 段的必做项：接上执行环境
  行的真实可用性，否则 Shell、Files 不可用（R2-D79）。
- **产物核对不覆盖依赖包**：只核 tool-definitions 自己的 `package.json` 与 `dist`，不核它依赖的包。
- **核对与 import 之间有改写窗口**：快照先核产物摘要，再 import 模块。两步之间磁盘上的改写不在保护范围内。
- **CRLF 的 `package.json` 让快照不可用**：检出把 tool-definitions 的 `package.json` 换成 CRLF 时，摘要与清单
  不等，快照不可用，所有核验答 `unavailable`。

## 持续验证

- [来源权威与快照](../../tests/entry/tool-release.spec.ts)：每个字段的改动、非官方层、未知资产、快照不可用、
  登记者以外的主体、代次不符、产物翻转一个字节、手改清单、executor 漂移。
- [tool-host](../../tests/rows/tool-host/release-host.spec.ts)：真实 Cordis 下按生产路径（真实
  `environmentNeedSchema`）首装两作者、篡改产物、缺运维者值、校验件抛出或返回 Promise 时失败关闭、租户访问被拒、
  来源不按参数 import、定义与设置不符、拒绝记录，以及 environment 声明合法通过、改坏一个字段与未知采用答 `invalid`。
- [tool-bindings](../../tests/rows/tool-bindings/release-bindings.spec.ts)：可用性各分支、启动权威代理、
  两个占位、一个 fiber 两个服务。
- [清单脚本](../../tests/tool-release-script.spec.ts)：一致、产物不符、手改条目、只改格式、用法错误。

这些用例证明发行来源与登记链路，不证明作者执行、执行环境或完整 Tool 运行时。
