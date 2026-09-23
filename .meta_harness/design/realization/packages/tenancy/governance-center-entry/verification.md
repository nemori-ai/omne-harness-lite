# governance-center-entry 验证与证据

契约侧的证据义务权威在 [`spec/compositions/governance-center-entry/verification.md`](../../../../spec/compositions/governance-center-entry/verification.md)：
形式任务与否定核对（V-1～V-3）、规范场景与实现符合性（V-4～V-15）、静态检查（SC-1～SC-3）。本页按本节点的兑现点登记。
原始配置、输入与运行结果归 [record/evidence](../../../../record/evidence/README.md)，本页只引用并写范围。

> **当前状态：本节点没有任何运行。**`packages/tenancy/governance-center-entry` 尚未建包，下面每一条节点义务都是「未开始」。
> 契约 `candidate`，主责产品依据 PF-017 rev 1 `draft`；即便测试将来全绿，也不提升语义接受。

## 证据义务

测试编号 `T-n` 只在本节点内有效，候选测试 id 写在第二列括号里；「受阻」写明挡住它的是什么。

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| S-10、S-11、S-13、S-14、S-32、S-33（契约 V-1、V-2） | TLC：`EntryDecision.cfg` | **契约起草时已执行**（无反例；[契约 verification「实际执行」](../../../../spec/compositions/governance-center-entry/verification.md#实际执行)），已按前提绑定（[bindings](bindings.yaml)）；证的是**契约模型**，不是本节点 | 原始输出入 `record/evidence` 归主线 |
| [S-17](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-17-路由表封闭每条路由的九件事从哪读)、[S-24](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-24-有意不投影)；契约 SC-1、SC-3 | T-1（`gce.route-table-closed`）：路由表的键集合恰等于 Schema `EnvelopeRouteId` 的枚举，公开体检另一处；本包源码没有按名字解析服务或方法 | 未开始；受阻：尚未建包 | 本节点 |
| [S-6](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-6-四种入口答复)、[S-8](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-8-协议版本与跨版本不变的两样)、[S-11](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-11-认人)、[S-33](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-33-认出人之后登录状态被撤销)；契约 V-5、场景 S-39 | T-2（`gce.answers-byte-identical`）：六种不认情形加「撤销落在认人与办事之间」，七次线上答复逐字节相同（状态行、全部头、体）；「表示层不合格」一格用三个出示物各跑一次——首或末是空白、`\uD800` 转义出的孤立代理项、1025 个标量值——都得同一份字节，且 `logins.exchange` 一次都没被调用（桩计数）；请求体含非法 UTF-8 字节 ⇒ `version-mismatch`；答复里没有 `Date` 头；`version-mismatch` 与公开体检的字节有快照，改动即红——这份快照就是契约 G-10 传输绑定工件的可执行形式 | 未开始；受阻：尚未建包、传输未采用（N-6） | 本节点。**模型的「同一个答复值」不能替代这一条** |
| [S-10](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-10-判定次序)；契约 V-6、场景 S-38 | T-3（`gce.decision-order`）：版本对不上 × 四种出示物 ⇒ 四次 `version-mismatch`、公开体检照常；数据所在够不着时已撤销得 `unavailable`、没带得 `login-state-rejected`；有效配坏载荷 `invalid-input`、已撤销配同一份 `login-state-rejected`；注册与登录的坏载荷在存储不可用时仍 `invalid-input` | 未开始；受阻：需要可注入故障的存储夹具（测试装配） | 本节点 + 测试装配 |
| [S-14](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-14-失败映射)、[S-26](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检)；契约 V-7、场景 S-40 | T-4（`gce.three-exits-defect-count`）：让存储不可用，以有效登录状态问事得 `unavailable`，恢复后同一个登录状态照常；让一个参与方桩给出集合外的值，得 `unavailable` 且完整体检的 `defectCount` 加一 | 未开始 | 本节点（入口 + 运维一起） |
| [S-9](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-9-列表句柄)、[S-20](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-20-登录状态的两条路由撤销列出)；契约 V-8、场景 S-41 | T-5（`gce.handle-list-revoke`）：登录答复的 `loginStateHandle` 等于列表里自己那一项；列表里每一项（即 `LoginStateId`）拿去当出示物都得 `login-state-rejected`，与一个从没签发过的值逐字节相同，且账号能力的 `verify` 一次都没被调用（桩计数）；按句柄撤销同账号另一个成功、再撤仍得 `ok`（AI S-16 已撤销即 `ok`）；撤别的账号的句柄、从没签发过的句柄 ⇒ `login-state-not-found`，逐字节相同；句柄在载荷那一步过 Schema：首尾空白 ⇒ `invalid-input`，`revoke` 未被调用（桩计数）；合 S-31 但不是 64 个十六进制字符的句柄（例如 `abc`）**不**被入口层拒绝，原样到达 `revoke`（桩记录收到的目标与载荷逐字相同），得 `login-state-not-found`；撤销路由只有一次领域调用（桩计数：没有 `listEffective`）；撤自己之后再来得 `login-state-rejected`；另加两条交错：认人与撤销之间目标被别处撤掉 ⇒ `ok`，发起方被撤掉 ⇒ `login-state-rejected`。**备份那一半**（契约 S-41 后半）：登录三次、撤销一次、停机做一份数据备份，把备份里的每一个字符串值放进信封当出示物来问事 ⇒ 每一次都 `login-state-rejected`，与没带时逐字节相同；同一次里两个仍有效的出示物照常能用（正对照） | 未开始 | 本节点（备份那一支要装配的停机与备份；它只核「拿来用，用不了」，持久内容的三种形式搜归账号能力一侧的 AI S-46，不以本条代替） |
| [S-12](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-12-身份推导)、[S-13](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-13-补授权)；契约 V-9、场景 S-43 | T-6（`gce.derivation-and-gate`）：切到组织 A 后发邀请由 A 发出；载荷夹带「以组织 B 行事」的成员 ⇒ `invalid-input` 且没有邀请被发出；读自己不在的组织与不存在的组织都得 `notAuthorized`；成员资格读面读不到时得 `unavailable`；上级链两个组织、其中一个不在 ⇒ `notAuthorized`；两个组织一个读不到、一个 `ineffective`，两种次序都得 `unavailable`，且两次都被读了（不短路）；补授权读得 `invalidInput`（桩）⇒ 缺陷 | 未开始 | 本节点 |
| [S-15](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存)；契约 V-10、场景 S-42 后半 | T-7（`gce.delta-zero`）：撤销之后**立刻**用它问事 ⇒ `login-state-rejected`；切换当前租户身份后下一个请求就以新身份行事；解除成员资格后下一次补授权即 `notAuthorized` | 未开始 | 本节点。模型表达不了跨请求缓存，**只能靠这一条** |
| [S-27](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-27-governancecenterid-的形状与相等)、[S-28](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变)；契约 V-11、场景 S-44 | T-8（`gce.center-id`）：两次从零首启得不同标识；同一份数据重启、换监听地址后得同一标识；**启动时让那一格读不出（注入 `StorageUnavailable`）⇒ 起不来、没有铸出新的，修好后是原来那个**；存着的值形状不合 ⇒ 起不来、不重铸；存储中途不可用时公开体检照样答出三样；**真并发演练**：两个写事务同时首启（sqlite 与 pg 各一次）⇒ 表里恰一行、两者拿到同一个标识 | 未开始；pg 支受阻：pg 零运行（装配第二程） | 本节点；「读不到当作还没有」这一支必须真跑 |
| [S-25](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)、[S-26](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检)；契约 V-12、场景 S-45，SC-2、SC-3 | T-9（`gce.two-faces`）：客户端一面没有读完整体检或写部署事实的路由；运维面对任意请求都答完整体检、答复过 Schema `FullHealthReply`；运维面不经网络可达；把信封发到运维面得到的仍是完整体检 | 未开始 | 本节点 |
| [S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录)～[S-23](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-23-当前租户身份的两条路由)；契约 V-13 | T-10（`gce.route-mapping`）：27 条路由每一个可达失败值 ⇒ 线上答复等于契约路由表所写；`interrupted` 原样；契约 S-14 的缺陷格逐一用桩触发：`identifier-held-by-expired-record`、OG S-21／S-25 就调用方本人的 `accountNotActivated`／`accountDoesNotExist`、OG S-27 与 AI S-37 空列表、OG S-36 的 `account` 分量不等于认人所得、成功返回不合 `Result_<路由>` ⇒ 各自缺陷；撤销路由 AI S-16 的 `invalid-input`（桩）⇒ `invalid-input`（目标来自载荷）；每条路由的请求过 `Envelope`、成功答复连同 `operation` 过 `Exchange`——登录那一条的 `loginState` 过出示物的形状（出示物的[对齐义务](design.md#出示物的线上形状对齐义务)在本节点这一侧的证据），`loginStateHandle` 过 IV `LoginStateId`、等于 `logins.issue` 返回的 `LoginStateId`；列出路由每一项恰为 `{ loginStateHandle, issuedAt }`、不含出示物 | 未开始 | 本节点；`credential` 的形状推不出，这一格只核「原样交给参与方」 |
| [S-29](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出)、[S-30](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-30-工程记录)；契约 V-14、场景 S-46 | T-11（`gce.no-secrets-in-outputs`）：跑完其余各测试后，在全部答复、两种体检、工程记录、启动失败说明里搜部署密钥的值、凭据材料、模型凭据的值、TLS 私钥、出示物——出示物按契约 S-46 的三种形式逐一搜（原样；UTF-8 字节的 base64url，带与不带填充；UTF-8 字节的十六进制，大写与小写）——除登录成功答复那一处出示物外一处都没有；工程记录里没有对端地址、`AccountId`、`TenantId`、载荷值；拒绝的记录分得出 `absent`／`multiple`／`malformed`／`judged`；`unavailable` 与缺陷的记录只写入口层自己观察到的失败值（哪一次调用、参与方给出的值名或异常类型），不出现「存储」「钟」这类推断出的分类 | 未开始 | 本节点 + 装配的日志汇 |
| [S-34](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)；契约 V-15 | T-12（`gce.lifecycle`）：拿掉任一被 inject 的服务（含 `credentials`、`clock`）⇒ 入口层 `PENDING` ⇒ 装配启动失败；入口层插件体抛出（端口占用、铸标识失败、等钟超界）⇒ 启动失败且监听已关；**`openSignal`**：兑现之前入口层已 `ACTIVE`、端口已绑，连接一律被关闭、没有答复，运维面也不答、没有 `serving`；兑现之后才开闸并发 `serving`；兑现之前撤除 ⇒ 端口立即释放、不等在途、不发 `stopped`，其后再兑现也不开闸；被拒绝 ⇒ 闸不开、没有未处理的 Promise 拒绝；**崩溃落在开闸之前**的演练（与 `apps/tenancy-host` 的 U-1 一起）：恢复快照后没有任何客户端见过的写丢失；两张面同起同停（运维面与客户端一面在同一对通知之间应答）；存储不可用时两个插件都不卸载、只以返回值收场；停机时注入在途请求：`drainTimeoutMs` 内答完的照常答，超时的连接被销毁，而它们的领域写要么完整在、要么完全不在；入口层撤完之后运维面才撤 | 未开始；受阻：`apps/tenancy-host` 的 `boot()` 未建 | 装配 + 本节点 |
| 迁移纪律 M-1、M-3 | T-13（`gce.migration-fragment`）：片段连跑两次无错；主键冲突报 `governance_center_pkey`（sqlite 先，pg 随装配第二程） | 未开始 | 本节点 |
| 配置错误一个政策 | T-14（`gce.config-errors-fail-start`）：缺证书或私钥、PEM 不合、套接字目录权限过宽、残留套接字有人在听、`deploymentKey` 不是两个 `true`、部署参数缺一或非正、`drainTimeoutMs` 或 `clockReadyTimeoutMs` 缺席或非正、`openSignal` 缺席或不是 thenable ⇒ 各自 `FAILED`，没有运行期具名拒绝 | 未开始 | 本节点 |
| [S-4](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-4-请求信封) 传输落地两条约束 | T-15（`gce.duplicate-members`）：每个顶层成员重复，答复落在它那一步：`protocolVersion` 重复 ⇒ `version-mismatch`；`operation` 重复 ⇒ `invalid-input`，且认人读面没有被调用；`payload` 重复 ⇒ `invalid-input`——要认人的路由配已撤销的出示物时得 `login-state-rejected`（认人在前），免认人的路由在存储不可用时仍得 `invalid-input`；出示物重复（其一有效）⇒ `login-state-rejected`，且认人读面没有被调用；载荷内部成员重复 ⇒ 与 `payload` 重复同一步的 `invalid-input`。另：解析器对同名成员在任一层都报出路径，只用 `JSON.parse` 的实现让本测试失败 | 未开始；四个顶层成员与契约 S-4 稳定稿逐条相符（2026-09-23 核过）；载荷内部那一支契约未单列，仍是本节点的延伸读法（N-3） | 本节点 |
| [S-16](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-16-不记住来访不区别对待来者)；场景 S-42 前半 | T-16（`gce.peer-agnostic`）：同一个有效登录状态、同一件事，从两个对端地址、以人用客户端与脚本各发一次 ⇒ 答复逐字节相同 | 未开始 | 本节点 |
| [S-19](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录) 表示层同源 | T-17（`gce.credentials-same-source`）：注册与登录的凭据表示层跟随 inject 进来的 `credentials.parse`（换成规则不同的桩，入口层重跑后判定随之改变）；`credential` 不是非空字符串或 `parse` 不过 ⇒ `invalid-input`，且注册组合、账号能力都没有被调用；`credentials` 缺席 ⇒ 入口层 `PENDING`（并入 T-12） | 未开始 | 本节点 |
| [S-26](../../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检) 十项的来源；两张面同起同停 | T-18（`gce.ops-serving-notification`）：`serving` 之前与 `stopped` 之后运维面关闭连接不答；开闸后三样齐全、`startedAt` 是 `openSignal` 兑现后开门那一刻读到的时刻（晚于插件体里等钟那一次，钟桩按调用次序给不同时刻来区分）；入口层换代重跑期间两张面都不答，重跑见到已兑现的 `openSignal` 即开门，恢复后 `startedAt` 与 `defectCount` 不变、门关本身没有让 `defectCount` 增加；`storageReachable`、`clockSane` 每次读都现探。**插件体里等钟**：钟桩先给若干次 `'unavailable'`、在 `clockReadyTimeoutMs` 内转为可读 ⇒ 插件体等到之后才返回；一直读不到 ⇒ 入口层 `FAILED`、启动失败、监听已关、没有 `serving`、运维面始终不答；等待期间撤掉入口层 ⇒ 轮询停止、不抛出。**开门那一刻等钟**：兑现时钟桩读不到、在上界内转为可读 ⇒ 等到才开门；一直读不到 ⇒ 不开门、端口释放、一条原因为钟的 error 记录、没有 `serving` | 未开始 | 本节点 |
| 契约 G-11 防冒充（中心一侧；[design](design.md#防冒充中心一侧的手段与材料)） | T-19（`gce.server-authentication`）：入口层的端口上明文 HTTP 请求得不到任何答复（没有明文监听）；TLS 握手出示的正是 config 里的证书链；缺证书或私钥 ⇒ 启动失败（并入 T-14）；私钥不出现在任何输出里（并入 T-11） | 未开始 | 本节点。**客户端「确认不了就不交出登录状态」的证据归 `apps/cli` 的客户端代理，那个提供者尚不存在——受阻** |
| 契约 G-10 传输绑定（[design](design.md#传输绑定将来冻结的工件)） | 冻结之后：T-2 的固定字节快照与绑定工件逐字节一致；工件改动只能以新版本出现 | 未开始；受阻：传输候选未采用（N-6） | 本节点 + 契约 owner（冻结位置与登记） |

### 静态检查

| # | 检查什么 | 守的条款 | 状态与 owner |
|---|---|---|---|
| 契约 SC-1 | 本包源码不出现 `.produce(`、`'organization-purge'`（现有 `restricted-call-sites` 已扫 `packages/`，本包在其范围内）；另加 `createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(` 的限定 | S-24、S-36 | 现有两项：规则已写，本包建好后即生效；新增方法限定：未开始，owner `tools/ts-checks` |
| 契约 SC-2 | 运维面源码目录的导入白名单（`kernel-basis`、`storage` 协议、`offer-expiry`、Node 内置、本包事件声明模块），事件声明模块不导入任何 `tenancy/*` 包 | S-25 | 未开始，owner `tools/ts-checks`，带「故意违反就失败」自测 |
| 契约 SC-3 | 由 T-1 与 T-9 覆盖（路由表封闭 + 运维面只有一个操作） | S-18、S-24 | 同 T-1、T-9 |
| 只碰一张表 | 本包源码里 `selectFrom`／`insertInto`／`updateTable`／`deleteFrom` 的表名只能是 `governance_center`，不出现 `sql` 模板 | S-28；[本节点约束](design.md#本节点约束存储要求之外)第 4 条 | 未开始，owner `tools/ts-checks` |
| 不读对端地址 | 本包源码不出现 `remoteAddress`、`x-forwarded-for` 一类读取 | S-16 | 未开始，owner `tools/ts-checks` |
| `credentials` 只调 `parse` | 本包源码不出现 `derive(`、`verify(`、`checkPolicy(` 对 `credentials` 的调用 | S-19；[本节点约束](design.md#本节点约束存储要求之外)第 7 条 | 未开始，owner `tools/ts-checks` |
| 只凭出示物认人 | 本包源码不出现对 `logins` 的 `.verify(` 调用、不 import `parseLoginStateId`、不出现 `as LoginStateId` 断言；认人所得的类型（候选 `Caller`）只在 ② 阶段模块里构造；以登录状态为发起方或调用方的四处调用只从它取实参。带「故意违反就失败」自测（例如把载荷里的句柄交给 `listEffective`） | S-11；AI v2 S-30「只有 S-44 认出示物」；[本节点约束](design.md#本节点约束存储要求之外)第 8 条 | 未开始，owner `tools/ts-checks`；另有 T-5 的「拿句柄当出示物」 |
| 现有三条 | `no-bail-control`、`no-wall-clock`、`no-testing-import` 扫 `packages/`，本包建好后自动覆盖 | basis `async-control-not-bail`；offer-expiry SC-OE-3 | 规则已写；运行尚未登记为 evidence run |

## 实际执行

| 运行 | 输入与配置范围 | 结果 | 证据位置 |
|---|---|---|---|
| — | — | **无**：本节点没有任何运行 | — |

契约的形式任务在 2026-09-23 跑过一次（无反例，752 个状态，时序性质检查完），那是**契约模型**的结果，登记在[契约 verification](../../../../spec/compositions/governance-center-entry/verification.md#实际执行)；原始输出尚未入 `record/evidence`。
它进了本节点的绑定，因为它会在模型的判定次序被改坏时失败（六个变异配置演示过五条断言会失败）；它不说明本节点的任何源码符合契约——那是上表 T-n 的事。

**有限检查不写成无条件证明**：模型只在一次行为一个请求、环境任选读得到读不到、流水线带弱公平的前提下成立（[formal 入口](../../../../spec/compositions/governance-center-entry/v1/formal/README.md)）。

## 覆盖缺口

与 [README 分层状态](README.md#分层状态)、[bindings](bindings.yaml) 末尾的「不绑」注释一致：

- **没有任何节点证据**：全部 T-n 未开始，因为包不存在；`apps/tenancy-host` 的 `boot()` 也不存在，T-3、T-8、T-12 还要它或测试装配提供可注入故障的存储。
- **模型覆盖但不绑**：S-7（`AnsweredClosed` 自指）、S-18（`HealthUnconditional` 无变异）、S-19（两条免认人断言无变异）；它们的证据形式是 T-8、T-10、T-17。
- **模型表达不了**：S-15 δ = 0（只有 T-7）、逐字节相同（只有 T-2）、多个请求之间的交错与排空（只有 T-12）。
- **读法未定**：载荷内部成员重复的答复（N-3，本节点按 `payload` 重复同一步收场；契约 S-4 稳定稿仍未单列）。原 N-1（`startedAt` 在钟读不到时）、N-2（工程记录分不出存储与钟）已由契约裁决闭合，对应测试已并入 T-18、T-11，见 [design.md 缺口表](design.md#实施缺口与消费者影响)。
- **本节点认领的契约缺口**：**G-10 传输绑定的版本化工件**——候选 `https-json/1` 已写在 [design「传输绑定」](design.md#传输绑定将来冻结的工件)，未采用、未冻结，它的证据是冻结后的 T-2 快照；**G-11 防冒充的具体手段**——中心一侧的手段与材料已写在 [design「防冒充」](design.md#防冒充中心一侧的手段与材料)，证据 T-19 未开始，客户端一侧的证据归 `apps/cli` 的客户端代理，受阻。
- **依赖他节点**：结构检查规则（N-7，`tools/ts-checks`）；账号能力包的 v2 源码（N-13 设计层已闭合，源码仍是 v1 骨架：没有 `exchange` 与 `parseLoginStatePresentation`，T-2、T-5、T-10 的认人与登录两支无从实现）；时钟的运行中回拨检出（N-5 设计层已闭合，源码未改，T-18 的 `clockSane` 那一支要它）；开门那一刻失败时的启动失败由 `apps/tenancy-host` 等 `serving` 兑现（N-12 已闭合），T-12 与那边的演练一起跑。
- **已核对**：入口契约改钉 AI v2 的稳定稿（N-11 已闭合，2026-09-23）——T-5 加了契约 S-41 的备份一支与句柄只到 S-31 的一支，T-10 核登录与列表的 Schema 引用，T-11 按契约 S-46 的三种形式搜，T-15 与 S-4 逐条相符；bindings 里 S-11 的前提已核。
- 撤销目标的契约冲突（N-14）已闭合：AI v2 S-16 的来源要求只针对发起方，撤销回到一次调用，T-5、T-10 的撤销几支不再受阻。
- **契约 G-2～G-4、G-7、G-8** 不在本节点的证据范围内。G-1（存储与备份里的登录状态可冒用）契约已标闭合：持久内容的三种形式搜归账号能力一侧的 AI S-46，**不在本节点**；本节点这一侧是契约 S-41 的两半——列表与句柄交出去的都不是出示物、备份里的字符串从线上拿来用不了（T-5）。
