# governance-center-entry 实现设计

本页回答**客户端一面与运维面由哪两个插件兑现、各自 inject 什么、一个请求在插件里按什么次序走、线上怎么落到传输上、
中心标识存在哪张表、怎么读或铸、装载与撤除怎么配对、对存储提供者要什么、还缺什么**。
契约的九件事不在这里复述：每条只写它在本节点上的兑现点与缺口，语义以
[`composition.governance-center-entry` v1](../../../../spec/compositions/governance-center-entry/v1/contract.md)（`candidate`）为准。

**贯穿全页的事实：源码不存在。**`packages/tenancy/governance-center-entry` 尚未建包；本页的插件名、事件名、配置字段、常量、列名、函数名**一律候选**；
参与方服务面与方法名沿各 owner 节点的候选（[account-identity](../account-identity/design.md#能力到-cordis-的投影)、
[organization-governance](../organization-governance/design.md#能力到-cordis-的投影)、[account-registration](../account-registration/design.md#能力到-cordis-的投影)），以那边为准。

## 实现路径与来源

**自建一个包、两个插件。**契约是本项目自己的线上投影，没有可采用的现成实现；能复用的是下表的构件。
形状依据[提案 `governance-center-entry`](../../../../record/proposals/governance-center-entry/README.md) 的[候选 A](../../../../record/proposals/governance-center-entry/alternatives.md#候选-a)：
入口层一条 fiber、运维面同包另一条 fiber，两条都不 provide、装在装载清单最后；
为什么入口层不拆成三扇门、监听与判定不拆、不并进装配、不并进任一领域插件、运维面不并进入口层、中心标识不进 ctx、认人不走事件、入口层必须 inject，
逐条见[为什么不拆、为什么不并](../../../../record/proposals/governance-center-entry/design.md#为什么不拆为什么不并)第 1～8 条，本页不重复。

| 用什么 | 给了什么 | 依据与状态 |
|---|---|---|
| `@deepseek-ai/cordis` 4.0.4 | fiber、inject、effect、`emit` | [D-025](../../../../record/decisions/cordis-adoption-version/decision.md)；依赖的内核语义见[下文](#依赖的上游机制语义) |
| [`core/kernel-basis`](../../core/kernel-basis/design.md#能力到-cordis-的投影) | `definePlugin`（config 校验失败 ⇒ 启动失败的唯一实现点）、`fiberIsActive` | 源码已有 |
| [`core/identity-values`](../../core/identity-values/design.md#实现路径与来源) | `parseLoginStateId`、`parseLoginIdentifier` 等表示层解析；交换表示的 JSON Schema 校验沿它的做法——`ajv` 8.20.0 的 Draft 2020-12 入口、规范 Schema 的逐字节副本加漂移测试 | 源码已有；本包校验本契约的 [Schema](../../../../spec/compositions/governance-center-entry/v1/governance-center-entry.schema.json)（它 `$ref` identity-values 与 offer-expiry 两份 Schema） |
| [`core/offer-expiry`](../../core/offer-expiry/design.md#能力到-cordis-的投影) | `instantToRfc3339`（`issuedAt`、`startedAt` 的线上表示）、`Clock` 形状 | 源码已有 |
| [`core/storage`](../../core/storage/design.md#协议候选形状) 协议 | `storage.write`／`read`、`UniqueViolation`、`StorageUnavailable`、`StorageDefect` | 源码已有；实例由 [`infra/storage-sql`](../../infra/storage-sql/design.md) provide |
| Node 内置 `node:https`、`node:http`、`node:crypto` | TLS 监听、本机套接字上的 HTTP、128 位随机、SHA-256 | 运行时自带 |
| 能检出重复键的 JSON 解析 | **对实现的要求**：请求体里任何一层对象的同名成员出现不止一次，都要被检出并报出它的路径（哪一层、哪个成员名）；只用 `JSON.parse` 不满足——它静默取最后一个 | **库未选，无决定**：成熟库优先，找不到合适的再在本包写一个只做这件事的解析器 |

**复杂度声明**：没有缓存、队列、重试、连接池、限流。像「机制」的只有三样，都是正确性所需——
**分派闸**（开门之前与排空开始之后不分派；[S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）、
**在途计数**（有界排空要知道何时等完）、**三条通知**（开门、关门与缺陷到达运维面，[下文](#插件边界服务面与三处关键选择)）。

## 插件边界、服务面与三处关键选择

| 插件（候选名） | inject（全部必需） | provide | 取得的资源 | config（候选字段；非法 ⇒ 启动失败） |
|---|---|---|---|---|
| `governance-center-entry`（入口层） | `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`、`credentials`（只用 `parse`）、`clock`（只在启动时用） | **无** | 一个 TLS 监听（effect）；启动时读或铸中心标识一次、等钟可读一次 | `listen`（地址与端口）、`tls`（证书链与私钥 PEM）、`version`（中心所装版本）、`drainTimeoutMs`（排空上界，正整数）、`clockReadyTimeoutMs`（启动等钟的上界，正整数） |
| `governance-center-ops`（运维面） | `storage`、`clock` | **无** | 一个本机套接字监听（effect）；三条通知的监听者 | `socketDirectory`（绝对路径）、`deploymentKey`（`{ present: true, complete: true }`，只收字面 `true`）、`deploymentParameters`（五项正整数毫秒） |

- **入口层不 inject** `accounts`（S-13／S-14／S-18／S-38 不投影，[S-24](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-24-有意不投影)）、
  `organization-purge`（S-53）。`credentials` inject，但**只调它的 `parse`**，不碰 `derive`／`verify`／`checkPolicy`，见下面第一张表。
  `clock` inject，**只在启动时用一次**：启动成功以中心的钟可读为条件，入口层开门之前等它可读、取那一刻作 `startedAt`（[下文](#中心标识版本与启动时刻怎么到达运维面)）；请求处理不读钟，客户端的钟从不参与判定。
- **运维面不引用任何治理服务**：它的源码目录只许导入 `kernel-basis`、`storage` 协议、`offer-expiry`、Node 内置与本包一个不导入任何 `tenancy/*` 包的事件声明模块（导入白名单，SC-2 的兑现形式，[下文](#本节点约束存储要求之外)）。
- **三条通知**都用 `emit`（通知，不是控制；返回值被丢弃，[`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)）：
  `governance-center-entry/serving`（候选名，载荷 `{ centerId, version, startedAt }`，入口层开门前发一次）、
  `governance-center-entry/stopped`（候选名，无载荷，入口层关门时发一次）与
  `governance-center-entry/defect`（候选名，**无载荷**，每记一次缺陷发一次）。不落存储、不经服务；本版不开任何控制类事件，认人是一次显式调用。
  运维面只在 `serving` 与 `stopped` 之间应答——**两张面同起同停**。
- **accepted_protocol_versions 是包内常量**（候选 `ACCEPTED_PROTOCOL_VERSIONS`，非空；候选值 `["1"]`），不是 config：
  哪些线上协议版本对得上，由本包的路由表实现了哪些版本决定；做成 config 就让装配能宣称接受一个代码没实现的版本。
  它随本包版本定下、运行期间不变，[S-8](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-8-协议版本与跨版本不变的两样)「缺即启动失败」因此在结构上不会发生；
  `version` 是中心所装版本的标识，归装配给值。二者的对应关系（S-18 末句）本节点的选择是：没有推导关系，各是各的。

### `credentials`：必需 inject，只用 `parse`

注册与登录的载荷里有凭据材料。线上它是一个非空字符串，内部格式归凭据方案的 owner；
[S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) 要入口层自己做它的表示层校验，且规则与账号能力提供者判凭据材料的规则**同源**。
那条规则只在可整体替换的 [`credentials.parse`](../credential-verification/design.md#能力到-cordis-的投影) 上；解析不过 ⇒ `invalid-input`。注册那一支尤其不能省：交进去再被判不合格，收场是 `interrupted`，契约明令不交。
入口层对 `credentials` **只调 `parse`**，`derive`／`verify`／`checkPolicy` 仍只由账号能力调用（结构检查，[本节点约束](#本节点约束存储要求之外)第 7 条）。

| | `resolveOptional(ctx, 'credentials')` 调用时解析（落选） | **必需 inject（选）** |
|---|---|---|
| 最强论证 | 凭据形式是本域唯一整体替换的地方，账号能力对它就是调用时解析（[account-identity 的理由](../account-identity/design.md#s-15-归本节点credentials-作可选依赖在调用时解析)）；换认证方式时入口层不重跑、门不关 | [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)：入口层用到的面缺席，客户端一面整体不应答；不会出现「凭据提供者缺席时注册与登录答 `unavailable`、别的路由照常」这种局部半开。同源由「调的就是同一个实例」兑现，不复制规则 |
| 本方弱点 | 凭据提供者缺席期间注册、登录的凭据表示层判不了，只能答 `unavailable`，其余照常——局部半开 | 换凭据提供者 = 入口层卸载重跑，门关再开（换代期间新请求问不到，在途跑完） |
| 置信度 | — | 高 |

### 中心标识、版本与启动时刻怎么到达运维面

运维面装在入口层之前，而中心标识由入口层在自己的插件体里读或铸；两张面**同起同停**：运维面只在客户端一面应答的那段时间里应答。
完整体检要的 `centerId`、`version` 是「启动时载入的那一个」，`startedAt` 是「这一次启动成功的时刻」——即入口层开始分派的那一刻（[S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）。
**启动成功以中心的钟可读为条件**：入口层在开门之前等 `clock.now()` 给出一个时刻，上界是 config `clockReadyTimeoutMs`（候选名，装配给值），超界 ⇒ 插件体抛出 ⇒ 启动失败；等到的那个时刻就是 `startedAt`，随 `serving` 通知交给运维面。

| | 运维面自己读 `governance_center`（落选） | 装配经 config 传给运维面（落选） | **入口层开门前 `emit serving`、关门时 `emit stopped`（选）** |
|---|---|---|---|
| 最强论证 | 运维面不依赖入口层起没起来；重跑后可自取 | 与部署参数走同一条路，运维面只读 config | 标识只有一个铸造者与一个载入点；`emit` 同步派发，监听者在入口层开门之前就拿到三样；`startedAt` 是入口层开门前刚读到的中心的钟；同一对通知顺带给出「同起同停」的边界 |
| 本方弱点 | 首次启动时那一行还不存在（入口层后装、后铸）；标识出现两个载入点；也不知道客户端一面何时停 | 运维面装载时标识还没铸：要么装配自己铸（装配胶水拥有契约语义，[红线](../../../AGENTS.md#红线)），要么把运维面挪到入口层之后（运维面失败时入口层已在分派，半开） | 运维面对入口层有一条运行时通知依赖；运维面重跑会丢三样直到入口层下一次开门（[N-4](#实施缺口与消费者影响)） |
| 置信度 | — | — | 中高 |

谁来等钟：

| | 运维面在自己的插件体里等钟可读，入口层照旧不 inject `clock`（落选） | **入口层 inject `clock`，开门之前等（选）** |
|---|---|---|
| 最强论证 | 入口层的 inject 集合更小，时钟换代不让客户端一面重跑 | 「钟可读」在开门那一刻判：判的位置与启动成功的位置是同一个插件体里相邻的两步，`startedAt` 就是判过的那个时刻 |
| 本方弱点 | 运维面等到之后、入口层开门之前，钟仍可能重新读不到（续约写失败），开门那一刻的 `startedAt` 又无定义；要补就得让运维面反过来挡入口层开门，那是控制事件 | 时钟换代让入口层重跑（门关再开）；入口层多一条只在启动时用的依赖 |
| 置信度 | — | 高 |

`clockReadyTimeoutMs` 应大于时钟节点的租约宽度（候选 10 s，[clock 节点](../../infra/clock/design.md#高水位为什么是写在前的租约不是写在后的节流)）：崩溃后快速重启落在租约窗口里时，钟至多这么久读不到；取值小于它，快速重启就必然启动失败。取值归装配。

### 缺陷怎么到达完整体检

[S-26](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检) 的 `defectCount` 数的是 [S-14](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-14-失败映射) 记过的缺陷；缺陷在入口层发现，计数在运维面答出。提案把承载者留给本节点（[交接缺口](../../../../record/proposals/governance-center-entry/design.md#交接缺口)）。

| | 装配提供一个诊断汇服务，两个插件都 inject（落选） | **入口层 `emit` 无载荷通知、运维面监听计数（选）** |
|---|---|---|
| 最强论证 | 有类型的服务面，可单独测；汇若在装配层，计数跨运维面重跑存活 | 不新增服务名与 inject 边；运维面导入白名单只多一个无依赖的声明模块；通知的返回值被丢弃，入口层的答复不等它、不受它影响 |
| 本方弱点 | 多一个服务、两条 inject 边；汇的实例归装配拥有，就是装配胶水持有状态 | 运维面不在（未装、重跑中）时通知丢失、计数少记；计数随运维面实例消失——与契约「重启归零」同寿命，但运维面重跑也归零 |
| 置信度 | — | 中高 |

## 能力到 Cordis 的投影

「入口」= 插件 `governance-center-entry`，「运维」= 插件 `governance-center-ops`。「T-n」是本节点的测试义务，登记在 [verification.md](verification.md#证据义务)，**全部未开始**；「绑定」指 [bindings.yaml](bindings.yaml) 里绑到契约模型的那几条。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-1-本契约拥有什么)／[S-2](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-2-参与方与精确承诺) 拥有什么、参与方 | 两个插件都不 provide；参与方的面按[上表](#插件边界服务面与三处关键选择) inject；本节点不做任何治理判定，只决定次序、身份交接与答复映射 | 尚未建包；Cordis 4.0.4 | 参与方前提「`LoginStateId` 不可猜测」由账号能力的提供者兑现（identity-values 的 128 位 CSPRNG 候选），本节点依赖它（句柄、认人） |
| [S-4](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-4-请求信封) 信封与传输落地的两条约束 | 入口：整个信封是请求体里的一个 JSON 对象，四个成员只有这一个承载位置（[传输](#传输机制候选)）；解析器报出重复成员后，**按成员各归判定次序的那一步**：`protocolVersion` 重复 ⇒ ① `version-mismatch`；`operation` 重复 ⇒ ①′ `invalid-input`（认人之前）；`payload` 重复 ⇒ 载荷那一步 `invalid-input`（要认人的路由在认出人之后，免认人的在 ①′ 之后）；出示物重复 ⇒ ②「多个出示物」`login-state-rejected`。载荷内部的成员重复与 `payload` 重复同一步收场 | 尚未实现；解析器未选 | 四个顶层成员按契约 S-4 的裁决；载荷内部那一支是本节点的延伸读法（[N-3](#实施缺口与消费者影响)）；T-15 |
| [S-5](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-5-出示物) 出示物 | 入口：`parseLoginStateId`（identity-values，S-31 交换表示）判表示层；出示物只活在一次请求处理的局部变量里 | identity-values 源码已有 | 不保存、不进工程记录；T-11 |
| [S-6](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复)／[S-7](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-7-答复集合闭合) 四种答复、答复闭合 | 入口：四种答复各一份**完整 HTTP 答复的固定字节**（状态行、固定头、体），插件体里构造一次、之后只写出不再拼接；路由结果 `{ result }`／`{ failure }` 由每条路由的映射函数给出，返回类型是封闭联合 | 尚未实现 | 逐字节相同靠[传输](#传输机制候选)的三处固定（无 `Date` 头、固定 `Connection: close`、无随请求变化的头）；T-2。模型只到「同一个答复值」 |
| [S-8](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-8-协议版本与跨版本不变的两样) 版本、跨版本不变的两样 | 入口：包内常量 `ACCEPTED_PROTOCOL_VERSIONS`；`version-mismatch` 与公开体检的字节序列在本包里各一处定义，改动它们的测试会红（T-2 的固定字节快照） | 尚未实现 | 「字节序列跨协议版本不变」落在哪个传输上，由传输绑定这份有版本的工件定——契约 G-10，本节点认领（[传输机制候选](#传输机制候选)） |
| [S-9](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-9-列表句柄) 列表句柄 | 入口：`H(id) = hex(SHA-256(标签 ‖ 0x00 ‖ id))`，标签候选 `omne.governance-center-entry.login-state-handle.v1`；每次由现读的列表重算，不存对照 | `node:crypto` | [选择表](#列表句柄与工程记录的关联号)；T-5 |
| [S-10](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-10-判定次序) 判定次序 | 入口：一个请求处理函数按[阶段表](#一个请求在入口层怎么走)顺序写死，每阶段只有「过」与「答」两个出口，没有回跳、没有并行的判定 | 尚未实现 | 绑定（契约模型的 `VersionFirst`、`InputAfterAuth`）；T-3 |
| [S-11](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-11-认人) 认人 | 入口：没带／多个／表示层不合格 ⇒ 不查即 `login-state-rejected`；否则 `logins.verify(出示物)`：`AccountId` ⇒ 往下；`login-state-rejected`、`invalid-input` ⇒ `login-state-rejected`；`storage-unavailable` ⇒ `unavailable`；抛出或集合外 ⇒ 缺陷 | 尚未实现 | 绑定（`CannotJudgeIsUnavailable`、`RejectionUniform`，只到值）；T-2、T-3 |
| [S-12](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-12-身份推导) 身份推导 | 入口：`AccountId` 取 ② 的结果；只对[路由表](#路由到服务方法)标「TenantId」的路由调 `memberships.currentTenant(出示物)`；推导结果随这一次请求交下去，不再重取 | 尚未实现 | 载荷没有「以谁的身份」这一格由 Schema 的封闭成员兑现（夹带即表外成员 ⇒ `invalid-input`）；T-6 |
| [S-13](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-13-补授权) 补授权 | 入口：四条读路由在调用前对载荷里的每个组织调 `memberships.standing({ organization, account: 调用方 })`：`effective` ⇒ 过；`ineffective` ⇒ `{ failure: "notAuthorized" }`，**不调**被投影操作；`{ failure: "unavailable" }` ⇒ `unavailable`；S-34 两个组织时逐个读、全部有效才过 | 尚未实现 | 绑定（`CannotJudgeIsUnavailable` 的补授权分支）；「哪个组织」不在模型里，T-6 |
| [S-14](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-14-失败映射) 失败映射 | 入口：每条路由一个封闭 `switch`，参与方返回类型的每个字面各一支，没有 `default` 放行；**请求边界上一处 `catch`**：参与方抛出、集合外的值、与承诺矛盾的结果（空列表、句柄多重匹配、注册出现 `identifier-held-by-expired-record`）、本包自己的异常 ⇒ `unavailable` + `emit` 缺陷通知 + 一条 error 级工程记录 | 尚未实现 | 那处 `catch` 不是吞错：它正是契约定的缺陷路径——答复、计数、记录三样都留下。绑定（`DefectIsUnavailable`）；T-4、T-10 |
| [S-15](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存) δ = 0 | 入口：[本节点约束](#本节点约束存储要求之外)第 1 条——插件实例里只有启动时定下的常量，没有任何按请求、按来者、按登录状态保存的值 | 尚未实现 | 模型表达不了跨请求缓存；证据只能是 T-7（撤销之后立刻再来，S-42） |
| [S-16](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-16-不记住来访不区别对待来者) 不区别对待来者 | 入口：请求处理不读对端地址、不读除承载信封所需之外的任何头 | 尚未实现 | 候选文本规则：本包源码不出现 `remoteAddress`、`x-forwarded-for` 一类读取（[结构检查](#本节点约束存储要求之外)）；T-16 |
| [S-17](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) 路由表封闭 | 入口：一个字面量对象，键恰为 27 条路由标识；值是该路由的阶段配置与一个调用函数（[下表](#路由到服务方法)）。**没有按名字解析服务或方法的代码** | 尚未实现 | T-1：路由表的键集合等于 Schema `EnvelopeRouteId` 的枚举；入口层除启动时铸标识外不提交任何东西，逐条核对见[提交点](#提交点入口层在路由上不提交任何东西) |
| [S-18](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-18-公开体检) 公开体检 | 入口：阶段 0；答复是插件体在标识载入后构造的固定字节 `{ reachable: true, centerId, version }`；不看版本、不看出示物、不读存储、不读钟 | 尚未实现 | 未绑定：`HealthUnconditional` 没有变异证明它会失败；T-8 末项、T-2 |
| [S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) 注册、登录 | 入口：表示层 = Schema `Payload_AR_S8`／`Payload_AI_S15`（`credential` 只约束为非空字符串）+ `parseLoginIdentifier` + `credentials.parse`；任一不过 ⇒ `invalid-input`，不交进去；合格才调 `registration.register`／`logins.issue`；出示物不看 | 尚未实现 | 未绑定（`ExemptIgnoresPresentation`、`ExemptInputWithoutLookup` 无变异）；T-10、T-17 |
| [S-20](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-20-登录状态的两条路由撤销列出) 撤销、列出 | 入口：`logins.listEffective(出示物)` → 每项换成 `{ loginStateHandle: H(id), issuedAt }`；撤销在同一份列表里按句柄匹配，恰一项 ⇒ `logins.revoke(目标, 出示物)` | 尚未实现 | T-5 |
| [S-21](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-21-组织治理写路由)～[S-23](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-23-当前租户身份的两条路由) 组织治理与当前租户身份路由 | 入口：[路由到服务方法](#路由到服务方法)逐行 | 尚未实现 | T-10（27 条路由每个可达失败值） |
| [S-24](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-24-有意不投影) 有意不投影 | 入口：路由表里没有它们；本包源码不出现 `accounts`、`organization-purge`、`.produce(`、`createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(` | 尚未实现 | 契约 SC-1；`restricted-call-sites` 已扫 `packages/`、本包在内，三个方法限定待加（[verification](verification.md#证据义务)） |
| [S-25](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由) 运维面 | 运维：`socketDirectory` 下一个 Unix 域套接字上的 HTTP；**不看请求内容，任何请求都答完整体检**——没有路由，也就没有第二个操作；只在 `serving` 与 `stopped` 之间应答（与客户端一面同起同停）；不写任何持久事实 | 尚未实现 | 契约 SC-2 由[导入白名单](#本节点约束存储要求之外)兑现；T-9 |
| [S-26](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检) 完整体检 | 运维：十项的来源见[下表](#完整体检十项从哪来) | 尚未实现 | T-4（`defectCount`）、T-9、T-18；`startedAt` 总有定义：启动成功以钟可读为条件（[上文](#中心标识版本与启动时刻怎么到达运维面)）；`clockSane` 的「开着时往回倒」依赖时钟节点（[N-5](#实施缺口与消费者影响)） |
| [S-27](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-27-governancecenterid-的形状与相等) 标识形状 | 入口：铸造 `randomBytes(16)` 的小写十六进制；读回时核 `^[0-9a-f]{32}$`，不合 ⇒ 启动失败，**不修、不重铸** | `node:crypto` | T-8 |
| [S-28](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) 铸造、存放、不变 | 入口：本包导出迁移片段建 `governance_center` 一行表；插件体里一次 `storage.write` 读或铸（[下节](#中心标识迁移片段与读或铸)）；**本包只碰这一张表** | 尚未实现 | 提交点即那次写；[存储要求](#对存储提供者的要求清单) R-GC1～R-GC7；T-8、T-13 |
| [S-29](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出) 秘密不进输出 | 两个插件：输出只有四种答复、路由结果、两种体检、工程记录、启动失败说明；出示物只出现在登录成功的 `result.loginState`；启动失败说明只写阶段与错误类型，不写任何 PEM 或 config 值 | 尚未实现 | TLS 私钥不在 S-29 列举之列，本节点照秘密处理；T-11 |
| [S-30](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-30-工程记录) 工程记录 | 入口：每个请求一条结构化记录（[字段](#工程记录)），经装配给定的日志汇；账号与租户只以关联号出现；`unavailable` 记的是**入口层自己观察到的失败值**——哪一次调用、参与方给出的哪个值——不推断它背后是存储还是钟 | 尚未实现；日志汇归装配 | T-11 |
| [S-31](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-31-不变量与安全性质) 性质表 | 各行的保护点即本表其余各行 | — | — |
| [S-32](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-32-进展性质与前提) 进展 | 入口：不排队、不重试、不等待前提恢复；一个请求的领域调用有上界——认人一次、推导至多一次、补授权至多两次、办事一次（撤销路由的办事是列表加撤销两次），推导与补授权不在同一条路由上出现 | 尚未实现 | 绑定（`EventuallyAnswered`，前提写在绑定里） |
| [S-33](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-33-认出人之后登录状态被撤销) 认出人之后被撤销 | 入口：映射表里 OG S-36／S-37 的 `loginStateNotValid`、AI S-37 的 `login-state-rejected`、AI S-16 的 `not-authorized` 一律写出 `login-state-rejected` 的**同一份固定字节** | 尚未实现 | 绑定（`LateRevocationUniform`，只到值）；T-2 第七次 |
| [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) 起来即整体、停机 | 入口：inject 全部消费面 + 装在最后 + 分派闸在标识载入、钟可读（超界即启动失败）并通知之后才开；撤除在**一个 effect** 里「关闸并通知 → 停止接受连接 → 有界等在途 → 关闭」；运维面随 `serving`／`stopped` 同起同停 | 尚未实现 | basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)、[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)、[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)；契约 V-15 归装配与本节点；T-12 |
| [S-35](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-35-内核不提供由本契约兑现的表) 内核不提供的部分 | 跨进程身份：S-11～S-13 各行；权限边界：S-25 行与导入白名单；有序清理与时序：S-34 行；持久化：S-28 行 | — | — |
| [S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 装配给／协议给 | 本节点兑现「协议给」一列里落在入口层的全部（δ = 0、身份推导、补授权、结构上不投影、表示层与判定分开、`unavailable` 是显式答复）；「装配给」一列里本节点能给的：起来即整体（inject）、停机三步（一个 effect）、运维者没有门（通道分离 + 白名单）；其余归装配，见[归装配](#归装配的事项) | — | 中心自身被拆开之后的右列不在本版（契约 G-8） |
| 契约[已知缺口](../../../../spec/compositions/governance-center-entry/v1/contract.md#十三已知缺口) G-1～G-4、G-7、G-8 | 不兑现，照契约缺口；本节点不为任何一条填默认值 | — | G-2：载荷夹带「以谁行事」按表外成员答 `invalid-input`，那是表示层收场，不是对 G-2 的回答 |
| 契约 G-10 传输绑定的版本化工件（**owner 本节点**） | 入口与运维：[传输机制候选](#传输机制候选)里的「传输绑定」，采用后冻结为有版本的资源 | 候选，未采用 | 闭合条件与验证义务见[那一节](#传输绑定将来冻结的工件)与 [verification](verification.md#证据义务) |
| 契约 G-11 防冒充的具体手段（**owner 本节点**；[S-3](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-3-本契约明确不承诺什么) 不进契约） | 入口：服务端 TLS，证书链与私钥作部署配置输入（[防冒充](#防冒充中心一侧的手段与材料)） | 尚未实现 | 客户端怎么确认归据点一侧（`apps/cli`），确认失败怎么呈现归 PF-016；本节点的验证义务是 T-19 |

### 一个请求在入口层怎么走

阶段与 [S-10](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-10-判定次序) 的步一一对应；「查」指一次参与方调用。任何一次调用抛出或给出集合外的值都走缺陷路径（`unavailable` + 缺陷），下表不再逐行重复。

| 阶段 | 做什么 | 查吗 | 出口 |
|---|---|---|---|
| 闸 | 分派闸未开或已关 ⇒ 关闭连接，不写答复 | 不查 | 问不到 |
| 0 公开体检 | 请求体解析为对象、恰有一个 `operation` 成员且等于 S-18 的路由标识 | 不查 | 公开体检固定字节 |
| ① 版本 | 体解析不了、不是对象、`protocolVersion` 缺席、重复、不是字符串或不在常量集合内 | 不查 | `version-mismatch` |
| ①′ 信封 | `operation` 缺席、重复或不在路由表，有表外成员 | 不查 | `invalid-input` |
| 免认人 | 注册、登录：`payload` 不重复、载荷内无重复成员、过 Schema、`parseLoginIdentifier`、`credentials.parse` | 不查 | `invalid-input` |
| ② 认人 | 其余路由：[S-11 行](#能力到-cordis-的投影)（出示物重复即「多个出示物」） | 视情形 | `login-state-rejected`；`unavailable` |
| 载荷 | `payload` 不重复、载荷内无重复成员、过该路由的 `Payload_<路由>` Schema 与 identity-values 解析 | 不查 | `invalid-input` |
| 推导 | 标「TenantId」的路由：`memberships.currentTenant(出示物)` | 查 | `login-state-rejected`；`unavailable` |
| 补授权 | 四条读路由 | 查 | `{ failure: "notAuthorized" }`；`unavailable` |
| ③ 办事 | 调被投影的操作、按映射写出 | 领域自己查 | 路由结果；`unavailable`；`invalid-input`；`login-state-rejected` |

每个阶段只读前面阶段的结果；Schema 按成员分段校验（先 `Envelope` 的顶层成员、认出人之后再校载荷那一段），因为整份 `Envelope` 一次校验分不出不合格的是哪个成员，而答复取决于那个成员。

### 路由到服务方法

服务名与方法名是 owner 节点的候选。「推导」列：`—` 不推导；`AccountId` 取 ② 的结果；`TenantId` 调 `memberships.currentTenant`；`出示物` 直接交下去。
线上成员名到领域参数名的映射（如 `includeConcluded` → 领域的「连已终结的一起要」）写在各路由的调用函数里，一处。

| 路由 | 推导 | 补授权 | 调用 |
|---|---|---|---|
| AR S-8 注册 | — | — | `registration.register(loginIdentifier, credential)` |
| AI S-15 登录 | — | — | `logins.issue(loginIdentifier, credential)`；成功时本节点另算 `loginStateHandle` |
| AI S-16 撤销 | 出示物 | — | `logins.listEffective(出示物)` → 按句柄匹配 → `logins.revoke(目标, 出示物)` |
| AI S-37 列出 | 出示物 | — | `logins.listEffective(出示物)` |
| OG S-21 | AccountId | — | `organizations.createTeam(accountId, creationKey?)` |
| OG S-22 | — | 载荷里的组织 | `organizations.read(organization)` |
| OG S-23 | TenantId | — | `offers.issueInvitation(tenant, invitedAccount, role?, offerTtl?)` |
| OG S-24 | TenantId | — | `offers.withdrawInvitation(tenant, invitation)` |
| OG S-25 | AccountId | — | `offers.acceptInvitation(accountId, invitation)` |
| OG S-26 | — | 载荷 `tenant` 的组织分量 | `memberships.standing(tenant)` |
| OG S-27 | AccountId | — | `memberships.mine(accountId)` |
| OG S-28 | TenantId | — | `memberships.changeRole(tenant, targetTenant, role)` |
| OG S-29 | TenantId | — | `memberships.remove(tenant, targetTenant)` |
| OG S-30 | TenantId | — | `offers.issueAffiliationRequest(tenant, recipientOrganization, direction, offerTtl?)` |
| OG S-31 | TenantId | — | `offers.withdrawAffiliationRequest(tenant, affiliationRequest)` |
| OG S-32 | TenantId | — | `offers.acceptAffiliationRequest(tenant, affiliationRequest)` |
| OG S-33 | TenantId | — | `organizations.dissolveAffiliation(tenant, childOrganization)` |
| OG S-34 | — | 载荷里每一个组织 | 一个 ⇒ `organizations.ancestorChain(o)`；两个 ⇒ `organizations.shareAncestor(a, b)` |
| OG S-35 | — | 载荷 `tenant` 的组织分量 | `organizations.scopeLayers(tenant)` |
| OG S-36 | 出示物 | — | `memberships.currentTenant(出示物)` |
| OG S-37 | 出示物 | — | `memberships.switchCurrentTenant(出示物, targetTenant)` |
| OG S-55 | 按 `callerIdentityKind`：AccountId 或 TenantId | — | `offers.readInvitation(caller, invitation)` |
| OG S-56 | TenantId | — | `offers.readAffiliationRequest(tenant, affiliationRequest)` |
| OG S-57 | AccountId | — | `offers.listReceivedInvitations(accountId, includeConcluded?)` |
| OG S-58 | TenantId | — | `offers.listIssued(tenant, includeConcluded?)` |
| OG S-59 | TenantId | — | `memberships.list(tenant, includeIneffective?)` |
| OG S-60 | TenantId | — | `offers.listReceivedAffiliationRequests(tenant, includeConcluded?)` |

可选项缺席时原样作缺席交下去，入口层不替领域填默认值（S-17 第 7 件事）。

## 传输机制候选

**候选，采用无决定**；与 [cli-tui 提案 D11](../../../../record/proposals/cli-tui/alternatives.md#d11-线上协议与认证) 的候选 A 同向（HTTPS、JSON、请求／响应、无推送），差别在出示物的承载位置，见下表。
为什么传输不进契约见[提案](../../../../record/proposals/governance-center-entry/alternatives.md#传输机制为什么不进契约)。

| 面 | 候选 |
|---|---|
| 客户端一面 | HTTP/1.1 over TLS（`node:https`，最低 TLS 1.3）。**只看请求体**：方法与路径不参与任何判定；体是整个信封（或公开体检请求）的 UTF-8 JSON |
| 答复 | 一律 `200`，`Content-Type: application/json`、`Cache-Control: no-store`、`Content-Length`、`Connection: close`；关掉 Node 自动写的 `Date` 头；不写任何请求编号、时间戳、原因。四种入口答复各是一份固定字节；路由结果按确定的成员顺序序列化 |
| 问不到 | 闸未开、排空已开始：关闭连接，不写答复 |
| 防冒充 | 服务端 TLS；材料是部署配置输入，不是部署密钥（[下文](#防冒充中心一侧的手段与材料)） |
| 运维面 | 同一套 HTTP 答复形状，承载在 `socketDirectory` 下的 Unix 域套接字上；只在 `serving` 与 `stopped` 之间应答，其余时间关闭连接不答；目录须只对中心的运行用户可访问（启动时核权限位，不合 ⇒ 启动失败）；启动时遇到残留的套接字文件：先试连，连不上即删除后再绑定，连得上 ⇒ 另一个实例在跑 ⇒ 启动失败 |

| | 出示物走 `Authorization: Bearer` 头、其余成员走体（落选；D11 候选同此） | **整个信封在请求体里（选）** |
|---|---|---|
| 最强论证 | HTTP 生态惯例：代理与日志默认遮蔽 `Authorization`，客户端库现成 | 四个成员只有一个承载位置，重复只在一个解析器里判；「版本先于出示物」不跨两处；公开体检与信封同一个入口，跨版本不变的那两样只依赖请求体 |
| 本方弱点 | Node 对重复的 `authorization` 头**静默丢弃后一份**，「多个出示物」要改读原始头；头与体可能同时带出示物，要再立一条规则 | 出示物在请求体里：记录请求体的中间设备会记下它——部署上不放这类设备是运维约定；与 D11 的候选不同向，据点一侧要同意 |
| 置信度 | — | 中 |

| | 跟随请求的 keep-alive（落选） | **每个答复固定 `Connection: close`（选）** |
|---|---|---|
| 最强论证 | 省掉每个请求一次 TLS 握手 | Node 依请求的 `Connection` 头决定写不写 `Connection: keep-alive`／`Keep-Alive: timeout=…`，跟随请求就让答复随请求变化（[S-6](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复)）；一个连接一个请求，排空也简单 |
| 本方弱点 | 答复头随请求而变 | 每个请求一次握手；有测量证明是瓶颈再换，换之前重核 S-6 与 S-8 |
| 置信度 | — | 中 |

| | 运维面按路径路由到一个 `/health`（落选） | **运维面不看请求内容，任何请求都答完整体检（选）** |
|---|---|---|
| 最强论证 | 惯例，将来好加 | 没有路由就没有第二个操作可加，「恰有一个操作」由结构给出（[S-25](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)）；SC-2 查的代码更少 |
| 本方弱点 | 路由表是一个将来会被人往里加东西的位置 | 将来契约若加第二个运维操作，要重写这一层 |
| 置信度 | — | 高 |

### 传输绑定：将来冻结的工件

契约 **G-10（传输绑定的版本化工件）的 owner 是本节点**。上面这组候选采用之后，要冻结成一份**有版本的传输绑定**（候选标识 `https-json/1`），
它是「这份契约落在这一种传输上」的全部事实，[S-8](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-8-协议版本与跨版本不变的两样) 说永不改的两样就在它里面：

| 工件里有什么 | 冻结之后 |
|---|---|
| 请求的承载：只看请求体；UTF-8 JSON；重复成员按成员各归一步的收场（[S-4 行](#能力到-cordis-的投影)） | 不改 |
| 公开体检请求在这个传输上的形状，与它的答复形状（状态、头集合与次序、体的成员次序） | **跨协议版本不改**（S-8 第 1 样） |
| `version-mismatch` 的完整字节（状态行、头、体） | **跨协议版本不改**（S-8 第 2 样） |
| 其余三种入口答复的完整字节、路由结果的头集合与序列化次序 | 随协议版本演化，同一版本内逐字节不变（S-6） |
| TLS 的最低版本与服务端认证方式；运维面的套接字承载 | 改了就是新版本的绑定 |

换传输（例如换成 HTTP/2 或经网关）= 发一份**新版本的绑定工件**，不改旧的；两份绑定可以并存，各自的那两样各自冻结。
工件冻结在哪、怎么登记，随 G-10 的闭合定（契约 owner 与本节点）；在那之前它只是本节的候选，**未采用、未冻结**。验证义务：T-2 的固定字节快照就是这份工件的可执行形式。

### 防冒充：中心一侧的手段与材料

契约 **G-11（防冒充的具体手段）的 owner 是本节点**；契约只写性质（客户端确认不了连上的真是那个中心，就不交出登录状态、不接答复，[S-3](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-3-本契约明确不承诺什么)），
怎么做到归这里。[PF-017 §8](../../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖) 把它定为对技术设计的硬要求。

| 项 | 候选 |
|---|---|
| 手段 | 服务端 TLS 认证：入口层只以 TLS 监听，**没有明文监听**；中心出示 config 里的证书链，握手证明它持有对应私钥。中心不做客户端证书认证——认人只看出示物 |
| 材料 | 证书链与私钥：**部署配置输入**，与部署密钥同样经装配下发、同样「缺即启动失败」（私钥文件权限沿密钥的规矩），但**不是部署密钥**；私钥与部署密钥一样不进任何输出（[S-29](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出) 未列它，本节点照秘密处理） |
| 客户端信任什么 | 两个候选，**选择归据点一侧**：按公共或组织的 CA 链加主机名校验；或按中心钉住证书公钥（运维者把指纹连同地址交给同事）。标识不能拿来做这件事——它不是秘密（S-27） |
| 换证书 | 改 config、重启；与中心标识无关，标识不变 |
| 不在本节点 | 客户端的确认逻辑（`apps/cli`）；确认失败时的呈现（PF-016） |

本节点的验证义务是 T-19：没有明文监听；握手出示的正是 config 里的证书链；缺材料 ⇒ 启动失败（与 T-14 同一政策）；私钥不出现在任何输出里（并入 T-11）。
**客户端那一半的证据不在这里**：「确认不了就不交出登录状态」只能在据点一侧的客户端代理上测，那个提供者尚不存在——受阻消费者。

## 中心标识：迁移片段与读或铸

**迁移片段**（本包导出，候选名 `governanceCenterMigration`，Kysely `Migration`，与 [`clockLeaseMigration`](../../infra/clock/design.md#高水位为什么是写在前的租约不是写在后的节流) 同形，由装配合进它给 storage-sql 的 `MigrationProvider`，与其他片段次序无关）：

| 表（候选名） | 列 | 约束 |
|---|---|---|
| `governance_center` | `slot`（TEXT NOT NULL，本包只写常量 `'center'`）、`center_id`（TEXT NOT NULL） | 主键 `slot`，不命名，两方言都报 `governance_center_pkey`（[迁移纪律 M-3](../../../apps/tenancy-host/design.md#迁移纪律每条对应一个提供者要求)，TEXT 列、不是 rowid 别名）；**不建 CHECK**（M-7：`center_id` 的形状由本包读回时核）；`ifNotExists`，可重跑（M-1）；**不带 `down`**——撤掉这张表就是丢掉中心的身份 |

提案给的列候选里还有 `created_at`，本节点不要：契约里没有它的消费者，多一列就多一个没有人读的持久事实（`tenancy/` 下的源码也不许取墙钟，只能来自 `clock`）。

**读或铸**（入口层插件体里，一次 `storage.write`，这一次写就是[首次启动的提交点](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变)）：

1. 读 `slot = 'center'` 那一行；有 ⇒ 核 `center_id` 的形状，合则用它，不合 ⇒ 抛出（启动失败，不修、不重铸）。
2. 无 ⇒ 生成 128 位随机、插入；撞 `governance_center_pkey` ⇒ 在同一事务内重读，用读到的那一个。
3. `StorageUnavailable`、`StorageDefect`（表不在、列不对）⇒ 原样上抛 ⇒ 插件体抛出 ⇒ 启动失败。**读不到绝不当作还没有。**

| | 主键就是 `center_id`，读后写（落选） | 部署级互斥 `lockSentinel` + 读后写（落选） | **常量槽位作主键（选）** |
|---|---|---|---|
| 最强论证 | 表最简单 | 不加列；协议已有（P-5） | 「至多一行」由存储约束兑现，不依赖写者记得取锁；撞键在同一事务内重读即收敛（P-2）；两方言同一个约束名 |
| 本方弱点 | 两个并发首启各铸一个，两行并存 = 两个中心 | 只在所有写者都取同名锁时成立 | 多一列没有语义的 `slot` |
| 置信度 | — | — | 高 |

**自构的两条交错**：
(a) 两个写者同时首启（入口层重跑时旧插件体仍在执行，或两个进程指向同一份数据）——sqlite 下 `BEGIN IMMEDIATE` 已把两次写排成先后，后者读到前者提交的行；pg 下两者都读到「无」、都插入，后者在主键上等前者提交后得 `UniqueViolation`，同一事务内重读（READ COMMITTED 下新语句看得到已提交的行，P-3）拿到前者的值。两者最终同一个标识。
(b) 读那一行时存储抖动——提供者若把失败折成「空结果」，这里就会铸出第二个标识。挡住它的是[存储要求](#对存储提供者的要求清单) R-GC5（P-8：不可用只以 `StorageUnavailable` 到达，不返回空结果），由一致性套件 C-9a 证；本节点另有 T-8 用会注入故障的存储核「读不到 ⇒ 起不来、不铸」。
(a) 的 pg 分支要真并发才看得见，写进 [verification](verification.md#证据义务) 作 T-8 的真并发演练。

**之后**：标识载入插件实例（公开体检答复的固定字节在这时构造）；运行期间入口层再也不碰存储。入口层重跑是一次新的「启动」：重新读（不会再铸），读不到 ⇒ 重跑失败、客户端一面保持问不到。

## 列表句柄与工程记录的关联号

| | 部署级密钥的 HMAC（落选） | **域分离的 SHA-256（选）** |
|---|---|---|
| 最强论证 | `LoginStateId` 即使可猜，句柄也反推不出 | 不引入新的秘密与持久事实（S-9「不产生新的持久事实」）；确定、跨重启稳定；64 个十六进制正好是 SHA-256 的长度 |
| 本方弱点 | 多一份要保管、要轮换的部署配置输入；换钥即全部句柄改变 | 不可逆以 `LoginStateId` 128 位随机为前提（S-36「出示物不可伪造」行）；前提失守时句柄可被穷举反推——但那时出示物本身已可猜，句柄不是最弱一环 |
| 置信度 | — | 高 |

工程记录里的关联号用同一构造、不同标签（候选 `omne.governance-center-entry.account-correlation.v1`，租户用它的规范 JSON 形式作输入）：还原不出 `AccountId`、`TenantId`（S-30），同一账号的记录跨重启可关联。
**已知性质**：已经知道某个 `AccountId` 的人（例如同组织成员在成员列表里见过它）算得出它的关联号、从而在记录里认出它——契约要的是「还原不出」，不是「关联不上」；读记录的人与握着磁盘的人是同一类（S-30 末段）。

## 完整体检十项从哪来

| 项 | 来源 | 读不到时 |
|---|---|---|
| `reachable` | 常量 `true` | — |
| `centerId`、`version` | `serving` 通知 | `serving` 之前、`stopped` 之后运维面不答任何请求（问不到，与客户端一面同起同停） |
| `startedAt` | `serving` 通知里入口层开门前读到的那个时刻（`instantToRfc3339`）；入口层重跑再发通知时**保留第一次的值** | 不会读不到：钟在 `clockReadyTimeoutMs` 内读不到，入口层就不开门、启动失败，也就没有 `serving` |
| `storageReachable` | 每次读现探：一次 `storage.read` 读 `governance_center`，与一个包内超时常量（候选 2 s）竞速 | 超时、`StorageUnavailable`、`StorageDefect` ⇒ `false`（缺陷另记一条 error 记录，不计入 `defectCount`——那只数 S-14 的缺陷）；超时后那次读继续跑完，结果丢弃 |
| `clockSane` | 每次读现读 `clock.now()`，不是 `'unavailable'` ⇒ `true` | `'unavailable'` ⇒ `false`；运行中墙钟回拨目前不会让时钟答 `'unavailable'`（[N-5](#实施缺口与消费者影响)） |
| `deploymentKeyPresent`、`deploymentKeyComplete` | config（装配在密钥载入与配对自检通过后给字面 `true`） | 不是 `true` ⇒ config 校验不过 ⇒ 启动失败 |
| `defectCount` | `defect` 通知计数，运维面实例内的一个整数，启动时 0 | — |
| `deploymentParameters` | config 五项（与装配传给账号能力、组织治理的是同一组值；PF-003 两项没有消费者也要值，契约 G-4） | 缺一或非正 ⇒ 启动失败 |

每次读都现探、现读，不以上一次的结果顶替。答复在测试里对 Schema `FullHealthReply` 校验（成员封闭）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.account-identity/v1` S-15、S-16、S-17、S-37（`accepted`，[D-023](../../../../record/decisions/tenant-domain-design-acceptance/decision.md)） | 入口必需 inject `logins`（[account-identity](../account-identity/README.md)） | 换代 ⇒ 入口层卸载重跑（[`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）：门随旧实例关上、新实例重新绑定并重读标识；在途请求握着旧引用，按旧实例的返回收场 | 缺席 ⇒ 入口层 `PENDING`，客户端一面不应答（问不到）；装配启动时把它判为清单错误 |
| 同上契约的凭据那一半（S-8） | 入口必需 inject `credentials`（[credential-verification](../credential-verification/README.md)），只调 `parse` | 换代 ⇒ 入口层卸载重跑，同 `logins` | 同 `logins` |
| `capability.organization-governance/v1` 十七个操作与六个读面（`accepted`） | 入口必需 inject `organizations`、`memberships`、`offers`（[organization-governance](../organization-governance/README.md)）；**不** inject `organization-purge` | 同 `logins` | 同 `logins` |
| `composition.account-registration/v1` S-8（`accepted`） | 入口必需 inject `registration`（[account-registration](../account-registration/README.md)） | 同上 | 同上 |
| `data.identity-values/v1`、`data.offer-expiry/v1`（`accepted`） | 包依赖：解析器、`instantToRfc3339`、两份 Schema 副本 | 随包版本 | — |
| 存储协议（无契约，`storage`） | 入口、运维都必需 inject；入口只在启动时用一次，运维每次体检读一次 | 换代 ⇒ 两个插件都重跑；**本版装配不换代** | **不可用只表现为返回值**（`StorageUnavailable`），不表现为面缺席——两个插件不因存储抖动卸载；面缺席只在清单错误或换代时出现 ⇒ 两个都 `PENDING` |
| 时间源（offer-expiry S-16 的形状，`clock`） | 入口、运维都必需 inject；入口只在启动时等它可读一次，运维每次体检读一次 | 换代 ⇒ 两个插件都重跑（运维丢三样与计数，N-4）；本版装配不换代 | 不可用只表现为 `now()` 返回 `'unavailable'`：启动时超过 `clockReadyTimeoutMs` ⇒ 启动失败，运行中只让 `clockSane` 为 `false`；面缺席 ⇒ 两个都 `PENDING` ⇒ 装配判清单错误 |
| 部署配置输入 | 两个插件的 config，经 `definePlugin` 由内核在插件体之前校验 | 只在装载时读 | 缺、非法 ⇒ `FAILED` ⇒ 装配整体启动失败（[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)），与同批节点同一政策，没有运行期具名拒绝 |

### 对存储提供者的要求清单

| # | 要求 | 对应契约条款 | 协议兑现点 |
|---|---|---|---|
| R-GC1 | 读或铸在一次写事务内原子：插入要么提交要么无痕 | [S-28](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) ③、⑧ | P-1 |
| R-GC2 | 主键冲突可识别，报迁移里的约束名 `governance_center_pkey`；冲突只废那一条语句，同一事务可重读 | S-28 ⑤、性质 1 | P-2、P-11 |
| R-GC3 | 写事务内读到全部已提交写的最新值 | S-28 ⑤ | P-3 |
| R-GC4 | 持久：提交后跨重启仍在。**边界**：sqlite `synchronous=NORMAL` 下 OS 崩溃可丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md)）；丢的是 WAL 的后缀，标识若被丢，它之后的治理事实一并丢——「跟着数据走」仍成立，但客户端已见过的标识会随之消失 | S-28 性质 1、2 | P-7 |
| R-GC5 | 不可用与缺陷可识别，**读失败永不以空结果到达** | S-28 ⑦（读不到绝不当作还没有） | P-8；一致性套件 C-9a、C-14 |
| R-GC6 | `governance_center` 与全部治理事实在**同一个 `storage` 实例、同一个库** | S-28 性质 2；[S-36](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「中心标识与治理事实同一存储」行 | 装配：恰一个 `storage`（[tenancy-host「同一存储」](../../../apps/tenancy-host/design.md#同一存储同一约束域本节点要保证的三件事)），那边须补一条互指的要求 |
| R-GC7 | 本包的迁移在 `storage` 对外可见之前跑完 | S-28 ②（读得出那一格的状态） | storage-sql 在 `provide` 之前跑迁移 |

七条都在 storage-sql 对账号能力、组织治理 R-1～R-5 的兑现范围内，不另开协议义务；R-GC6 是装配的事。

### 本节点约束（存储要求之外）

| # | 约束 | 守的条款 | 怎么守 |
|---|---|---|---|
| 1 | **δ = 0**：入口层不跨请求保存任何认人结果、授权判定、推导出的身份、成员资格效力；每个请求现读 AI S-17、OG S-36、OG S-26。插件实例里只有启动时定下的常量（配置、路由表、固定字节、中心标识） | S-15 | 代码评审 + T-7；参与方自己也不缓存（[account-identity S-17 行](../account-identity/design.md#能力到-cordis-的投影)） |
| 2 | 不按来者区别：不读对端地址、不保存任何按来者的状态 | S-16 | 候选文本规则（同 `tools/ts-checks` 现有形式）+ T-16 |
| 3 | 路由表封闭、无泛化分派 | S-17、S-24 | T-1 + `restricted-call-sites` 扩展 |
| 4 | **本包只碰 `governance_center` 一张表**，不写原始 SQL | S-28；提案「入口层持有 storage 的访问范围」 | 候选文本规则：本包源码里 `selectFrom`／`insertInto`／`updateTable`／`deleteFrom` 的表名只能是它，不出现 `sql` 模板 |
| 5 | 运维面目录只按白名单导入（`kernel-basis`、`storage` 协议、`offer-expiry`、Node 内置、本包的事件声明模块），事件声明模块本身不导入任何 `tenancy/*` 包 | S-25、契约 SC-2 | 候选文本规则；白名单让传递导入图有界，现有规则形式就查得了 |
| 6 | 工程记录与启动失败说明不含出示物、凭据材料、PEM、任何 config 值、载荷里的值、对端地址 | S-29、S-30 | T-11 |
| 7 | 对 `credentials` 只调 `parse`；`derive`、`verify`、`checkPolicy` 只由账号能力调用 | S-19（同源的表示层校验，不是凭据判定） | 候选文本规则：本包源码不出现这三个方法的调用 |

## 状态、并发与失败映射

**入口层实例状态**（内存，随实例消失）：配置常量、路由表、五份固定字节（四种答复 + 公开体检）、中心标识、分派闸（`closed → serving → draining`）、在途计数。
**运维面实例状态**：`centerId`、`version`、`startedAt`（未到时为空）、`defectCount`。**持久状态**：`governance_center` 一行，只在入口层启动时写一次。

### 提交点：入口层在路由上不提交任何东西

[S-17](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读) 第 3 件事：入口层的现读都是纯读，路由的提交点就是被投影操作那一次提交。逐类核对有没有哪条路由需要入口层参与提交——**没有**：

| 路由类 | 入口层的读与领域的提交之间可能插进什么 | 收场 | 需要共同存储对象吗 |
|---|---|---|---|
| 撤销（AI S-37 读 → AI S-16 写） | 目标在别处被撤 | S-16 幂等答 `ok`——这次撤销要的状态已成立（契约 S-20 末段） | 否：S-16 在自己那一次提交里重判发起方有效与目标归属 |
| 同上 | 出示的那一个被撤 | S-16 答 `not-authorized` ⇒ `login-state-rejected`（S-33） | 否，同上 |
| 补授权（OG S-26 读 → 被投影的读） | 调用方在该组织里被解除 | 这一次读照常答出——准入在闸上已通过，与 S-33 同一口径；下一个请求在闸上被拒 | 否：两步都是纯读，契约不要求同一快照 |
| 推导（OG S-36 读 → 领域写） | 当前租户身份被切换 | 以请求到达时推导出的那一个行事（契约 S-12、[`data.identity-values/v1#S-28`](../../../../spec/data/identity-values/v1/contract.md#s-28-当前租户身份在创建那一刻捕获)） | 否：领域在自己的提交里按它收到的身份判授权 |
| ② 认人 → 领域写 | 出示的那一个被撤 | S-33 | 否 |

入口层唯一的写是启动时那一次读或铸，只一个写者（本包），它的两条交错见[上文](#中心标识迁移片段与读或铸)。

**失败映射**：S-14 的表逐格写进每条路由的 `switch`；「当这条路由交给领域的全部输入都由入口层推导」那一行（领域答表示层不合格 ⇒ 缺陷）按[路由表](#路由到服务方法)逐条标出：OG S-27、S-36，AI S-37，撤销路由里的两次调用（S-37 那一次与 S-16 那一次的 `invalid-input` 都算缺陷，契约 S-20）。

**配置错误**：两个插件的 config 全部经 `definePlugin` 的 Config 校验；证书与私钥解析不了、套接字目录不存在或权限不对、残留套接字有人在听，都在插件体里抛出。一律 ⇒ `FAILED` ⇒ 装配整体启动失败，与同批节点一个政策（T-14）。

**并发**：请求之间不共享任何可变状态，除在途计数（只在闸与完成回调里加减）。一个请求内的领域调用逐个 `await`，没有并发调用。

### 工程记录

每个请求一条，经装配给定的日志汇（观测契约尚未立，字段形状待全局观测规格；[SYS-OBSERVABILITY](../../../../foundation/observability-and-logging/requirements.md#已确认要求与工程含义)）。至少：

| 字段（候选） | 内容 |
|---|---|
| `stage` | 走到的阶段（上面阶段表的名字） |
| `answer` | 四种入口答复之一，或 `result`／`failure:<具名值>` |
| `observed` | `unavailable` 或缺陷时：入口层自己观察到的失败值——哪一次调用（认人、推导、补授权、办事）、参与方给出的值的名字或异常类型；**不推断**它背后是存储还是钟 |
| `defect` | 缺陷时：路由标识、哪一次调用、领域给出的值的名字或异常类型（不含值与消息里的数据） |
| `rejection` | `login-state-rejected` 时：`absent`／`multiple`／`malformed`／`judged`（S-30 末条允许区分到这一步） |
| `account`、`tenant` | 关联号，不是身份值 |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| **运维** config 校验（内核，插件体之前） | — | 不合 ⇒ `FAILED`，插件体不跑 | — |
| **运维** 三条通知的监听（`ctx.on`） | 本 fiber；装载后立即生效 | 插件体后续抛出 ⇒ 随 fiber 收回（**假设**：`ctx.on` 经 effect 纳管） | 随 fiber 撤除；此后入口层的通知无人接收 |
| **运维** 本机套接字：核目录权限 → 处理残留文件 → 绑定；一个 `ctx.effect` 登记 disposer | 本 fiber；绑定完成即可接受连接，但只在 `serving` 与 `stopped` 之间作答，其余时间关闭连接不答（同起同停） | 权限不对、有人在听、绑定失败 ⇒ 抛出 ⇒ `FAILED`；`ctx.effect` 登记时 fiber 已被撤（`INACTIVE_EFFECT`）⇒ 自己关掉服务器、删掉套接字文件再重抛（同 [clock 的做法](../../infra/clock/design.md#成对的装载与撤除)） | disposer：停止接受 → 关闭已有连接 → 删除套接字文件。**不保留任何东西**：`defectCount`、`startedAt` 随实例消失（契约：重启归零） |
| **入口** config 校验（内核） | — | 不合 ⇒ `FAILED` | — |
| **入口** TLS 上下文与服务器对象；绑定监听；**紧接着**一个 `ctx.effect` 登记 disposer | 本 fiber；绑定后连接可达，但闸是 `closed`——一律关闭连接不答 | 证书或私钥不合、端口占用 ⇒ 抛出 ⇒ `FAILED`，此前没有任何东西要收；`INACTIVE_EFFECT` ⇒ 自己关服务器再重抛 | 见下「停机三步」 |
| **入口** 读或铸中心标识（一次 `storage.write`） | 首次启动的提交点 | 抛出 ⇒ `FAILED` ⇒ 已登记的 effect 随失败收回，监听关闭（[`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；标识若已提交，下次启动读到它 | **撤除不删**：标识是持久事实，撤除之后仍为真 |
| **入口** 等钟可读：轮询 `clock.now()`（同步），间隔是包内常量（候选 100 ms），上界 `clockReadyTimeoutMs`；等到的时刻即 `startedAt` | 不对外 | 超界 ⇒ 抛出 ⇒ `FAILED` ⇒ 监听随之关闭，启动失败；标识若刚铸过，下次启动读到它（无人见过，无害）；等待期间本 fiber 被撤（`fiberIsActive` 为假）⇒ 清掉轮询定时器、停止 | 轮询定时器只活在等待期间，等完或超界即清 |
| **入口** 构造公开体检固定字节；`emit('governance-center-entry/serving', { centerId, version, startedAt })` | 运维面此刻拿到三样 | 运维面不在 ⇒ 通知丢失；装配的装载顺序保证它在（运维先装且已 `ACTIVE`） | 一次性，无需撤除 |
| **入口** 开闸（`closed → serving`） | **中心起来了的那一刻**（S-34）；此后客户端一面应答 | 开闸之后插件体没有别的步骤可失败 | — |

**停机三步**（入口层那一个 effect 的 disposer，按序，[`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：只有同一个 effect 内部有序）：
① 闸 `serving → draining` 并 `emit('governance-center-entry/stopped')`：此后到达的请求一律关闭连接不答，运维面同时停答；② `server.close()`：不再接受新连接；
③ 等在途计数归零，上界 `drainTimeoutMs`；到时仍未答完的，销毁它们的连接。
**内核不取消在途调用**：被销毁连接的那些请求里的领域调用照样跑完，按各自那一次提交收场——那件事要么已提交、要么没发生，来者收不到答复（[S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)、PF-017 §6.8）。
disposer 返回之后仍在跑的请求若再遇到缺陷，只写工程记录、不再 `emit`（本插件已撤除，运维面可能也已撤除）。

**撤除之后仍然为真的**：中心标识与全部治理事实在存储里；入口层没有需要交接的在途状态，也没有需要恢复的东西。

**次序由装配保证**（入口层与运维面之间没有 inject 关系）：装载时运维先于入口，撤除时入口先于运维——所以 `serving` 发出时运维面一定在听，`stopped` 发出时运维面还没撤；两张面在同一对通知之间应答，**同起同停**。

**换代与重跑**：前提是存储与时钟的不可用只以返回值出现、不让面缺席，所以入口层只在参与方**换代**（或清单错误）时卸载。
换代 = 走一遍上面的撤除再走一遍装载：换代期间新请求不应答（两张面都问不到），在途请求跑完、按各自那一次提交收场，其间参与方给出的「不可用」照常映射 `unavailable`；**门关与重跑本身不记缺陷、不发缺陷通知**。
新实例重读标识、再发 `serving`；运维面见到同一个标识 ⇒ 恢复应答，`startedAt`、`defectCount` 保留；见到不同的标识 ⇒ 不可能发生的状态，记一条 error 记录、保留原值、不恢复应答。
**崩溃**：什么都不跑。重启时入口层读回同一个标识；残留的运维套接字文件由启动时的试连处理。

## 归装配的事项

以下由 [`apps/tenancy-host`](../../../apps/tenancy-host/design.md#归装配的事项逐条承接) 承接，本节点只点名；那个节点的修订另行进行。

| 事项 | 本节点要求什么 |
|---|---|
| 装载清单 | 运维面、入口层两条 fiber 装在最后，运维先于入口；两条都纳入同步 `PENDING` 结构判定；撤除按逆序，入口先于运维 |
| 迁移合成 | 合入 `governanceCenterMigration`，次序无关；与其余片段同一份 `MigrationProvider`、同一个库（R-GC6、R-GC7） |
| 迁移原子性与启动前只读核对 | [PF-017 §6.9](../../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)、[§6.10](../../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) 的实现要求；本节点的片段只保证幂等 |
| 入口层 config 的来源 | 监听地址；TLS 证书链与私钥（部署配置输入，来源与文件权限沿密钥的规矩，但不是部署密钥）；`version`（构建常量）；`drainTimeoutMs`（须小于装配的撤除总超时）；`clockReadyTimeoutMs`（候选名；须大于时钟的租约宽度） |
| 运维面 config 的来源 | 套接字目录；部署密钥载入与配对自检的结果（两个 `true`）；五项部署参数（与传给账号能力、组织治理的同一组值） |
| 日志汇 | 工程记录落在哪、按什么格式；观测契约立起来之前由装配定 |
| 同一存储（R-GC6） | 恰一个 `storage`；那边补一条与 R-GC6 互指的要求 |

## 依赖的上游机制语义

| 主张 | 本节点用在哪 | 依据与状态 |
|---|---|---|
| `inject` 全部必需，缺席即 `PENDING`；`ctx.get` 看得见整棵树、不登记依赖 | 起来即整体（含 `credentials`）；「运维面没有门」不能靠内核 | [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)（probe 4.0.4 通过） |
| 插件体或 config 抛出 ⇒ `FAILED`，已注册的 effect 收回 | 配置错误 = 启动失败；铸标识失败时监听随之关闭 | [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)（同上） |
| 必需服务换提供者 ⇒ 先卸载再重跑插件体 | 门随参与方的缺席关上；重跑重读标识 | [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)（同上） |
| effect 之间并发、不保序；只有同一 effect 内有序；撤除中再登记 effect 抛 `INACTIVE_EFFECT` | 停机三步放在一个 effect；`INACTIVE_EFFECT` 的自收口 | [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（同上） |
| `emit` 同步派发、丢弃返回值；异步控制不能用 `bail` | 三条通知；认人不走事件 | [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)（同上） |
| `isolate` 隔离实例可见性，不隔离数据 | 不用 `isolate` 做运维面的访问控制 | [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)（同上） |
| `ctx.fiber.state` 可读；插件体执行期间是 `LOADING` | `fiberIsActive`；「开闸在插件体里、fiber 随后 `ACTIVE`」 | **共用主张，非 basis**：`core/kernel-basis` 的 probe `fiber-state-readable`（[读数](../../core/kernel-basis/design.md#读数与-probe-结果)第 8 条） |
| `ctx.on` 注册的监听经 effect 纳管、随 fiber 撤除 | 运维面的三条监听 | **假设，须按 source-check 取证** |
| 不带 `thisArg` 的 `ctx.emit` 不按 isolate 过滤，监听者在 `emit` 的调用栈里同步执行；监听者抛出时 `emit` 的行为 | 通知在开闸之前同步到达；运维面监听者只做赋值与加一，不抛 | **假设**（「同步派发」一半有 basis，过滤与异常两半没有） |
| 重跑时旧实例的异步 disposer 在新插件体开始之前完成 | 入口层重跑时新实例绑定同一端口 | **假设，须取证**；不成立时新实例撞端口 ⇒ `FAILED`、客户端一面保持问不到直到重启（不半开，但不自愈） |
| 内核不提供跨进程身份与可见性、权限边界、可靠投递、背压 | 这些都由契约条款与本节点兑现 | **假设**：出自手册的内核负面清单，basis 没有条目 |
| Unix 域套接字只在本机可达，文件权限能挡住其他系统用户 | 运维面「只在中心所在的机器上」 | **假设**：与平台有关，本版不承诺 Windows |

## 实施缺口与消费者影响

`N-n` 只在本节点内有效，**已闭合的号保留、标「已闭合」，不复用**；`G-n` 是契约的缺口编号，下表前两行是**契约里 owner 为本节点的两条**，本节点认领。

| # | 缺口 | 类型 | 受阻消费者 | owner 与闭合条件 |
|---|---|---|---|---|
| 契约 G-10 | **传输绑定的版本化工件**：公开体检与 `version-mismatch` 跨协议版本不变的字节落在哪个传输上，由一份有版本的传输绑定定；本节点给出候选 `https-json/1`（[传输绑定](#传输绑定将来冻结的工件)），未采用、未冻结 | 契约缺口，本节点认领 | 据点一侧的客户端代理（要按某一份绑定实现）；T-2 的字节快照 | 本节点：候选被采用（决定）后冻结为资源并登记；冻结的位置与登记方式与契约 owner 一起定 |
| 契约 G-11 | **防冒充的具体手段**：本节点给出中心一侧的手段（只有 TLS 监听）与材料（证书链与私钥，部署配置输入）（[防冒充](#防冒充中心一侧的手段与材料)）；客户端信任 CA 链还是钉住证书未选 | 契约缺口，本节点认领 | 据点一侧的客户端代理（确认逻辑）；PF-016（确认失败的呈现） | 本节点：中心一侧 T-19 通过；客户端一侧的确认与它的证据归 `apps/cli`，那个提供者立起来之前这一半受阻 |
| N-1 | **已闭合**：钟在启动成功那一刻读不到时 `startedAt` 无定义（S-26）。契约裁决「启动成功以钟可读为条件，超界则启动失败」；本节点改为入口层 inject `clock`、开门前等它可读，上界 `clockReadyTimeoutMs`（[上文](#中心标识版本与启动时刻怎么到达运维面)） | — | — | — |
| N-2 | **已闭合**：「存储」与「钟」两类判不了在入口层分不出（S-30）。契约裁决 S-30 收窄为「记录入口层自己观察到的失败值」；本节点的工程记录照此只记调用与原值（[工程记录](#工程记录)） | — | — | — |
| N-3 | S-4 对四个顶层成员的重复已有裁决，本节点照做；**载荷内部**成员重复契约没有单列，本节点按「载荷不合格」与 `payload` 重复同一步收场（`invalid-input`） | 延伸读法，待核对 | 无（只影响畸形请求的答复） | 契约 S-4 成文后核对；若另有规定以它为准 |
| N-4 | 运维面重跑（只在 `storage` 或 `clock` 换提供者时）丢 `startedAt`、`defectCount`，并在入口层下一次开门前不应答 | 实现限制 | 无（本版装配不换这两个提供者） | 本节点：真要支持运行中换代时，把这几样挪到跨重跑的持有者 |
| N-5 | `clockSane` 的「开着时往回倒」要时钟在运行中检出回拨并答 `'unavailable'`；[clock 节点](../../infra/clock/design.md#状态并发与失败映射)目前只在启动时判回拨 | 依赖他节点 | 运维者；契约 S-36 末行 | `infra/clock` 节点补运行中判定 |
| N-6 | 带重复键报告的 JSON 解析器无决定；传输候选（HTTPS、Unix 套接字、`Connection: close`、信封在体）无决定——后者的采用即 G-10 的前一步 | 采用缺口 | 建包 | 主线：立提案或决定 |
| N-7 | 结构检查未建：`restricted-call-sites` 加方法限定；「只碰一张表」；运维面导入白名单；不读对端地址；`credentials` 只调 `parse` | 证据缺口 | 契约 SC-1、SC-2 | `tools/ts-checks`：各加规则与「故意违反就失败」自测 |
| N-8 | 请求体大小不设上界：契约没有对应的答复，限流与背压是非目标 | 已知风险 | — | 有测量或产品要求再做；做时先给它一个契约答复 |
| N-9 | 线上形状的 TS 类型（含 `GovernanceCenterId`）先由本包公开入口导出；据点一侧的客户端代理要用时，按[两层布局](../../../README.md#packages-的两层布局)判是否搬进 `core` | 消费者影响 | `apps/cli` 的客户端代理（不在本程） | 那个消费者出现时 |
| N-10 | 契约 `candidate`、主责产品依据 PF-017 rev 1 `draft`：本页每一处兑现都是候选依据上的候选实现 | 状态 | 一切依赖本节点的接受 | PF-017 接受、契约接受 |

**消费者影响**：`apps/tenancy-host` 要按[归装配](#归装配的事项)修订；`apps/cli` 的两条待立边改指本节点兑现的契约；
参与方的服务面方法名一旦在 owner 节点改动，[路由到服务方法](#路由到服务方法)跟着改，契约不动。
