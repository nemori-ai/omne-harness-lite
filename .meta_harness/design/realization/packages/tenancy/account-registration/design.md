# account-registration 实现设计

## 实现路径与来源

**自建一个薄的 Cordis 插件。**契约拥有的是**两条动作链的次序、幂等边界、失败映射与依据的产出**，没有任何事实；
没有可复用的第三方实现（saga／工作流引擎会引入「链条状态」这个长命对象，[S-22 明令禁止](../../../../spec/compositions/account-registration/v1/contract.md#s-22-编排本链的提供者被卸载或换代)）。

**为什么是插件而不是模块**：两条链要 inject 三个服务面，且注册入口要能解析到一个「注册动作链」服务；
它有生命周期（随 `accounts`／`organizations` 换代重跑），这是 fiber 的判据之一。
**但它不拥有资源、不拥有事实**——插件体只做 config 校验与一次 `provide`。

**Cordis 版本**：手册基线 4.0.2，采用版本尚无决定。

## 能力到 Cordis 的投影

服务名、方法名一律候选。契约每一分支的收场本表不复述，只写兑现点。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-8](../../../../spec/compositions/account-registration/v1/contract.md#s-8-三步次序与责任交接) 注册主链 | `registration.register(loginIdentifier, presentedCredential) → TerminalOutcome`（[S-5](../../../../spec/compositions/account-registration/v1/contract.md#s-5-终结结果集合) 四值，字面量联合，无第五值）。方法体按次序：① `accounts.produce` → 按[映射表](../../../../spec/compositions/account-registration/v1/contract.md#参与方失败值到终结结果的映射)收场；`identifier-held-by-expired-record` ⇒ 就地跑[清除链](#s-34-清除链的第二个发起者建不起来)，两步都 `ok` ⇒ **重跑 ① 一次**（计数器是方法局部变量，不是状态）；② `organizations.createPersonal(accountId)` → `ok`（含幂等）⇒ **本节点签发激活依据** `handoffWarrant.issue(activationKey, 'activation', accountId)`；③ `accounts.activate(accountId, warrant)` → `ok` ⇒ `registered` | 尚未实现 | 三步是三次跨 owner 的调用，本节点**不包事务、不加锁**；「不得凭写在同一函数里宣称原子」——正确性来自 [S-10](../../../../spec/compositions/account-registration/v1/contract.md#s-10-激活是唯一提交点) 提交点位置与三个幂等边界，不来自本节点 |
| [S-8 ②](../../../../spec/compositions/account-registration/v1/contract.md#激活依据由谁产出绑定什么) 激活依据 | 在 `createPersonal` 返回 `ok` 的那一刻用**本插件私有的 `activation` 私钥**签发（[identity-values 选签名方案的理由](../../core/identity-values/design.md#交接凭证走签名不走进程内登记)）；只绑定 AccountId，不绑尝试、不作废；**同一次尝试内产出即用**由方法体结构兑现（③ 只用本次 ② 的返回值，没有别的来源） | 尚未实现 | 与 account-identity 的核实（公钥、用途 `activation`）配对；一份自制依据在那边 `warrant-invalid`（其 S-42） |
| [S-34](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除) 清除链 | `registration.purgeExpired(accountId) → 'ok' \| { failure, from: 'S-53' \| 'S-38', class: 'terminal' \| 'defect' \| 'transient' }`。① `organization-purge.purgePersonalOrganization(accountId)` → `ok + warrant` ⇒ ② `accounts.purge(accountId, warrant)`；任一步失败**原样带出**（两套拼法不翻译）并贴三分类标签——分类表写死在方法体（[契约的表](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)），**与发起者无关**。主链就地发起时由 `register` 再按[按发起者分的表](../../../../spec/compositions/account-registration/v1/contract.md#参与方失败值到终结结果的映射)映射成 `interrupted` | 尚未实现 | 依据由 ① 产出、②核实，本节点只**逐字携带**；「不得拿一份别的依据凑数」由方法体结构兑现（② 的入参只有 ① 的返回值） |
| [S-12](../../../../spec/compositions/account-registration/v1/contract.md#s-12-重试规则) 重试 | 不在本节点：重来是一次新的 `register` 调用，按当前存储状态走；本节点不记上一次走到哪 | — | 幂等边界在两个参与方 |
| [S-21](../../../../spec/compositions/account-registration/v1/contract.md#s-21-两个同标识的注册并发发生) 并发 | 本节点**不协调**并发 `register`：① 与 ① 由 account-identity 的唯一约束裁决，② 与 ② 由治理的一一约束裁决，③ 与 ③ 幂等 | — | 与 account-identity 的存储要求 R-2／R-3、organization-governance 的 R-2／R-6 配合；本节点零锁 |
| [S-22](../../../../spec/compositions/account-registration/v1/contract.md#s-22-编排本链的提供者被卸载或换代) 编排者换代 | 插件体**无闭包状态**；`register` 的局部变量只活在一次调用内。**在途调用**：每步之前检查本 fiber 是否仍 `ACTIVE`（候选：读 `ctx.fiber.state`，**待核对主张**），已非 `ACTIVE` ⇒ 停在当前位置返回 `interrupted`，**不清理、不补偿** | 尚未实现 | 契约要的是「等同崩溃」；主动停步是让「停在它当时所在的位置」可被观察，不是新机制。检查失败（API 不存在）的退路：不检查，让在途调用跑完——两个参与方的幂等边界使之无害，但契约 S-22 的字面收场就不完全对齐，届时记缺口 |
| [S-23](../../../../spec/compositions/account-registration/v1/contract.md#s-23-参与方缺席时哪项保证暂停哪项继续) 参与方缺席 | 三个服务面都是**必需 inject**：任一缺席 ⇒ 本 fiber `PENDING`，`registration` 不可解析，注册入口按自己的契约失败。已 `ACTIVE` 后参与方运行期返回 `storage-unavailable`／`unavailable` ⇒ `interrupted` | 尚未实现 | ③ 前置读不到时不激活——本节点从不调 `activate` 而不带 ② 的依据 |
| 缺陷可观测（[映射表「另记什么」列](../../../../spec/compositions/account-registration/v1/contract.md#参与方失败值到终结结果的映射)） | `interrupted` 之外另落一条结构化记录 `{ kind: 'composition-defect' \| 'entry-defect' \| 'contract-violation', step, failure }`，级别 error；**不进返回值，不并入普通 `interrupted` 计数** | 尚未实现 | 契约只要求可区分地记录，通道归本节点；观测契约精确形状等全局观测规格 |

### S-34 清除链的第二个发起者建不起来

契约认两个发起者：主链就地发起（本节点的 `register`）与清扫提供者。**清扫要先知道「哪些账号记录已过期」，而 [account-identity](../account-identity/design.md) 的读面只有按 AccountId 读一条（S-18）**——五份契约里没有任何「列出已过留存期限的未激活记录」的读面。
本节点提供 `purgeExpired(accountId)` 作为清扫的入口，**但清扫的候选来源是一个规格缺口**：要么 account-identity 出 v2 加一个枚举读面（属语义扩张），要么装配从存储层直读（违反所有权）。
本版**不建清扫 effect**；这不阻断任何验收——[契约明写清扫不承担任何验收判据](../../../../spec/compositions/account-registration/v1/contract.md#撞上一条已过期的记录时为什么由本组合接手)，「到期即可重新注册」由主链就地清除兑现。记入 G-6 的 owner 事项与 [verification 覆盖缺口](verification.md#覆盖缺口)。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `capability.account-identity/v1` S-13、S-14、S-18、S-19、S-38、S-39（+ 场景 S-41～S-43、S-30） | **必需 inject** `accounts`（[account-identity](../account-identity/design.md)）。S-18 本节点**不直接调**：③ 的前置由依据承载，account-identity 自己现读期限 | 换代 ⇒ 本插件重跑（可承受：无状态） | 缺席 ⇒ `PENDING` |
| `capability.organization-governance/v1` S-20、S-53 | **必需 inject** `organizations`（S-20）与 `organization-purge`（S-53）——[后者单列服务名正是为了只让本节点 inject 它](../organization-governance/design.md#s-53-单独一个服务名只给清除链) | 同上 | 缺席 ⇒ `PENDING` |
| `data.identity-values/v1` S-1、S-2、S-35 | 包依赖 [identity-values](../../core/identity-values/design.md)：`AccountId` 类型、`handoffWarrant.issue` | 随包版本 | — |
| `activation` 签名私钥 | 插件私有 config，装配下发；**部署配置输入**，不在启动时生成 | 加载时校验形状 | 缺或形状不对 ⇒ **启动失败**，与另两个持钥节点同一政策：密钥缺失是配置错误，一份漏配的部署不该半开着跑、把每次注册都记成 `interrupted` |
| 存储、时间源 | **不消费**——本节点无事实、无期限判定 | — | — |
| `credentials` | **不消费**——凭据只被逐字传给 `accounts.produce` | — | — |

## 状态、并发与失败映射

**无状态、无存储、无提交点、无锁。**抽象状态（没有账号 → 未激活 → 已激活）全在 account-identity 的存储里；本节点每次调用从 ① 读起。

**失败映射**：两条链的全部参与方失败值到终结结果／三分类的映射**写死在方法体**，逐格对应契约的两张表；`register` 的返回类型是 `TerminalOutcome` 四值字面量联合，lint 查它不含第五值（契约 S-5、组合的静态义务）。**没有 catch-all**：参与方声明之外的异常上抛，视作缺陷。

**S-25 表左列，本版由谁给**：第 1 行（③ 读到 ② 之后的事实）——装配：同进程、同存储，且 ③ 的前置由依据携带；第 2、3 行——两个参与方的存储要求 R-2；第 4 行——治理；第 5、6 行——契约条款，本节点方法体结构兑现；第 7 行（S-53 只由本节点调）——`organization-purge` 单列 + 结构检查；第 8 行（三个读取点同答案）——account-identity [账号行上的过期事实](../account-identity/design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)（首次观测时落盘、行锁序列化）+ organization-governance R-6 引用约束，本节点不参与；两条交错（激活 vs 清除、创建个人组织 vs 清除）的收场都在那一节。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（`activation` 私钥存在且形状对） | 插件体开头 | 抛出即不 provide（fiber 状态**待核对主张**） | — |
| `ctx.provide('registration')` | 本 fiber；`ACTIVE` 后注册入口与清扫可解析 | 无第二项 | 撤除：服务消失；**在途 `register` 停在当前步返回 `interrupted`**（上表 S-22 行）；**不保留任何东西**——本节点没有事实 |
| 无定时器、无清扫 effect（[建不起来](#s-34-清除链的第二个发起者建不起来)） | — | — | — |

## 实施缺口与消费者影响

- **清扫候选的枚举读面缺失**：owner 为 spec（account-identity v2）或产品；本版无清扫。
- **待核对主张**：读本 fiber 状态的 API（S-22 主动停步）、`ctx.provide` 纳管、插件体抛出后的 fiber 状态（同批节点共用）。
- **[G-5](../../../../spec/compositions/account-registration/v1/contract.md#九已知缺口)**：`plugin-body-reruns-on-provider-change` 的 probe 为 null；本节点的重跑安全依据是三个幂等边界，不依赖它。
- **消费者**：注册入口（apps）须自己做登录标识与凭据的表示层校验，且不得把 `identifier-held-by-expired-record` 透出——后者在本节点内部就被消化，入口根本拿不到它；这一点由 `register` 的返回类型兑现。
