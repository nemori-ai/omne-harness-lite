# @omne-harness/identity-sql 行为规格

状态：实现成员，按 [DP-3 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6561478373)（#978 评论 6561478373）建立。本成员是 [identity 契约](../identity/SPEC.md) ID-16 资格读口、ID-17 三项操作与 ID-18 治理端口的持久提供者。治理端口按 M2 Reduce 的裁定 R2-D203 与 R2-D204 加入，兑现身份治理交付规格的 A、B、C 组。记录落在 [SQL 存储契约](../../storage/sql-contract/SPEC.md)系统作用域的事务域 `system.identity`。凭据只保存 [scrypt](../scrypt/SPEC.md) 派生材料。

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。身份、登录与资格的产品语义归 identity 契约，本文只写本提供者怎样兑现它们，以及本提供者自己承担的规则。

## 范围与依据

本成员拥有四类东西：

1. 十二张表的形状与三个迁移。迁移 `identity/001-identity` 建 `id_account`、`id_credential`、`id_organization`、`id_tenant`、`id_membership`、`id_login`。迁移 `identity/002-governance` 建 `id_organization_profile`、`id_invitation`、`id_create_receipt`、`id_login_revocation`。
2. 存储契约的参加者 `identity` 与五个读 handler `identity.issue-basis`、`identity.login-by-proof`、`identity.standing`、`identity.governance`、`identity.coordination`。
3. 纯工厂 `createIdentitySql`：注册激活、签发登录、识别登录、资格读口与治理端口的实现，以及 scrypt 结果、提交结果与读结果到契约结果的映射。
4. `./cordis` 插件 `IdentitySqlPlugin`：配置校验、scrypt 打开、组合登记、五个服务键与停止语义。

本成员不拥有：identity 的产品规则与结果类型（归 [identity SPEC](../identity/SPEC.md)）、SQL 提交、查询与读取的行为（归 [sql-contract](../../storage/sql-contract/SPEC.md) 与 [sqlite-provider](../../storage/sqlite-provider/SPEC.md)）、口令派生的强度与队列（归 [scrypt](../scrypt/SPEC.md)）、主体签发与核验（线包 R3）、更换凭据与组织隶属（R2-D204 第 6 条，本阶段不提供）、公开协议到治理端口的映射（归服务端接入）、应用行与材料目录的聚合（`apps/harness-server`）。

| 依据                                           | 位置                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 三项操作的次序、结果与契约套件                 | [identity SPEC ID-17](../identity/SPEC.md#id-17-注册激活签发登录与识别登录)                                        |
| 治理端口的结果、可见性与治理契约套件           | [identity SPEC ID-18](../identity/SPEC.md#id-18-治理端口)                                                          |
| 成功业务访问报告的形状、登录名单的空闲截止时刻 | R2-D203 对 P-7、P-11 的裁定                                                                                        |
| 邀请时长的初值（7 天、最长 30 天）             | R2-D204 第 7 条（P-10）                                                                                            |
| 资格读口、证据与角色映射                       | [identity SPEC ID-16](../identity/SPEC.md#id-16-首批公开形状主体与资格事实)                                        |
| 不同失败事实与不伪造确定无效                   | [identity SPEC ID-03](../identity/SPEC.md#id-03-登录退出与登录状态维护)                                            |
| 系统作用域、事务域、登记、提交结果、读 handler | [sql-contract SPEC](../../storage/sql-contract/SPEC.md) §2.5、§3、§4、§6、§7、§9                                   |
| 域打开、迁移、分组资格与持久性                 | [sqlite-provider SPEC](../../storage/sqlite-provider/SPEC.md) §4.5、§5.3、§5.4                                     |
| 派生与校验的结果种类与关闭                     | [scrypt SPEC](../scrypt/SPEC.md)                                                                                   |
| 成员位置、结果映射、单事务、读口、插件形状     | DP-3 决策记录第 1 至 6 条（候选 DP3-C1 至 DP3-C16）                                                                |
| 时钟经 `identityClock` 服务键注入              | R1-D27（AAP-8 替代路径）。它取代 DP1-C16 与 DP-3 决策记录第 5 条的「插件体内构造系统时钟」                         |
| Cordis 集成规则                                | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)，核对表在 [docs/cordis.md](docs/cordis.md) |

## 结果与不变量

<a id="is-01"></a>

### IS-01 记录位置与组合

全部记录落在作用域 `{ kind: 'system' }`、事务域 `system.identity`。十二张表都归参加者 `identity`，分组声明是 `singleton`。`identitySqlCombination()` 用本成员自己的材料计算清单摘要与组合版本。同一构建每次算出同一组值。参加者做的事改变时，版本随之改变，新登记不覆盖旧登记。

清单含参加者的代码摘要、它拥有的表与三个迁移。所以加入 002 的构建登记一个新版本，001 构建的旧登记留在域里。参加者的代码摘要只覆盖 `participant` 文件本身。参加者还执行它导入的模块：`schema` 与 `support`，`support` 里有发起登录、成员资格与组织种类的核对 SQL。所以组合版本不直接用清单摘要。版本是 `identity-sql/<版本摘要>`。版本摘要是 SHA-256，输入是清单摘要，加上参加者按相对路径导入的全部模块（含它自己）的相对路径与文件摘要。改 `participant`、`schema` 或 `support` 中的任一文件，版本都会改变。版本摘要不含文件所在的目录。登记里的 `manifestDigest` 仍是清单摘要。

`system.` 前缀保留给系统作用域的事务域。租户事务域的推导规则不得产出以它开头的标识。

<a id="is-02"></a>

### IS-02 注册激活是一次提交

一次注册激活是一次 `commit`，只有一条 `identity` 参加者命令。这条命令在一个事务里写五行：账号、凭据、个人组织、个人租户、首位成员。任何一行写入失败，整个操作回滚，不留半个开通。

输入规则在 ID-17 注册规则 1 之上更严格：登录标识的 UTF-8 不超过 1024 字节，凭据的 UTF-8 不超过 4096 字节。两个上界都含边界值。不合规的输入答 `not-loginable`，提供者不改写输入。

提交之前，提供者在主线程做完全部不确定的计算：校验输入、scrypt `derive`、产生 `acc_` 与 `org_` 标识。参加者只执行 SQL。参加者先查同标识的账号，已存在时回复 `conflict`。`login_identifier` 的唯一约束是第二道保护，所以并发注册同一标识至多一个成功。

| `commit` 结果                           | 注册结果                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `committed`                             | `succeeded`                                                                                                                                  |
| `rolled_back`、`rejected_before_accept` | `not-loginable`                                                                                                                              |
| `unknown`                               | 用同一身份 `query`，最多三次。`committed` 答 `succeeded`。`rolled_back` 或 `not_committed` 答 `not-loginable`。仍为 `unknown` 时拒绝 Promise |
| `identity_conflict`                     | 拒绝 Promise。操作键是 128 位随机数，这个结果只说明提供者内部出错                                                                            |

scrypt `derive` 的任何计算前拒绝，以及 `done` 得到 `unavailable`，都答 `not-loginable`。此时提供者还没有提交，「没有激活任何账号」成立。

首位成员的角色记为 `{ model: 'default-team', revision: '1' }` 的 `super-admin`。这项采用见 DP-3 决策记录第三层第二项，待 Reduce 答复。

<a id="is-03"></a>

### IS-03 秘密只以派生形式保存

`id_credential.material` 只保存 scrypt 材料串，形状由 scrypt 拥有。`id_login.proof_digest` 只保存登录凭证的 SHA-256 十六进制摘要。凭据原文与登录凭证原文不进入事实、表、读输出、结果诊断与错误文本。参加者与读 handler 从不接触它们。

账号不存在时，提供者对一份假材料调用一次 `verify`，然后答 `uniform-auth-failure`。假材料由插件体在启动时对一个随机秘密 `derive` 一次，只存在内存里。这样不存在的账号经过同一个 scrypt 名额与队列，`basis-unavailable` 不能用来枚举账号。

<a id="is-04"></a>

### IS-04 签发登录

提供者按 ID-17 签发的五步执行，前一步给出结果时不进入后一步：

1. 提供者已停止时答 `basis-unavailable`，诊断 `provider-stopped`。读时钟与期限配置。时钟不可得、读数早于本实例采用过的最晚读数、配置不可得、任一时长不大于零，都答 `basis-unavailable`。截止时刻落在 0000 年至 9999 年之外时也答 `basis-unavailable`。
2. 输入不是非空文本，或超出 IS-02 的字节上界时，答 `uniform-auth-failure`。超出上界的值不能属于任何账号，所以这一步不调用 scrypt。
3. 读 handler `identity.issue-basis` 一次读出账号行与凭据材料，并对 `id_login` 做一次 `LIMIT 1` 读。读答 `unavailable` 时答 `basis-unavailable`。这一步在比较凭据之前完成，所以这个结果不说明凭据是否正确。这一步只确认登录表可读，写入失败留到第 5 步。
4. 比较凭据。账号不存在时比较假材料。scrypt 结果按下表映射。
5. 产生 `lgn_` 标识与 32 字节随机登录凭证，提交一条 `identity` 命令写登录行。`committed` 答 `succeeded`。`unknown` 时用同一身份 `query` 一次，认回 `committed` 才答 `succeeded`。其他结果拒绝 Promise，不答 `basis-unavailable`。

| scrypt `verify` 结果                    | 出现时点           | 签发结果                                                        |
| --------------------------------------- | ------------------ | --------------------------------------------------------------- |
| `match`                                 | 算完               | 继续第 5 步                                                     |
| `mismatch`                              | 算完，或方案不认识 | `uniform-auth-failure`                                          |
| `queue_full`、`memory_limit`、`stopped` | 计算前             | `basis-unavailable`，诊断 `credential-check-unavailable:<code>` |
| `unavailable`                           | 计算前或算完       | `basis-unavailable`，同上                                       |

截止时刻的加法把每个 UTC 日计为 86400 秒，不计闰秒，与 identity 参考替身相同。两个时长与三个时刻随登录行保存为编码文本。

<a id="is-05"></a>

### IS-05 识别登录

提供者按 ID-17 识别的六步执行：

1. 凭证不是非空文本时答 `invalid`。这一步不看停止标志。
2. 提供者已停止时答 `basis-unavailable`，诊断 `provider-stopped`。读 handler `identity.login-by-proof` 按凭证摘要查登录行，同一快照里查这份登录有没有撤销行。读答 `unavailable` 时答 `basis-unavailable`。
3. 没有行时答 `invalid`。行里的标识、租户文本或时刻解析失败时答 `basis-unavailable`。
4. 登录已撤销时答 `invalid`。这一步在读时钟之前（identity ID-18「登录」）。
5. 读时钟。下界取两者中较晚的一个：本实例采用过的最晚读数，以及这份登录的 `issued_at`。读数早于下界，或时钟不可得，答 `basis-unavailable`。
6. 读数不早于 `max_deadline` 或 `idle_deadline` 时答 `invalid`。`idle_deadline` 是最近一次刷新后的值（IS-14）。
7. 其他情况答 `recognized`。`tenant` 是 `id_login.tenant_text`，即这份登录当前的选择（IS-12）。

识别不写任何东西，也不刷新空闲计时。

<a id="is-06"></a>

### IS-06 资格读口不区分未知租户与非成员

`read({ tenant })` 按租户文本查 `id_membership`：

- 提供者已停止时答 `unavailable`。
- 租户不能编码为租户文本时，租户文本取空串。证据的 `record` 是 `identity-sql/membership/` 加租户文本的 SHA-256 十六进制。
- 有一行 `state` 为 `active` 的成员关系时答 `member`。角色取自该行，资格经 `DEFAULT_TEAM_ROLE_MAPPING` 解析。证据的 `revision` 是该行的修订号。
- 其余情况都答 `not-member`：租户不存在、组织或账号不存在、账号不是该组织成员、成员关系不是 `active`、输入不能编码。证据只由输入算出，`revision` 是 `'0'`。提供者不读任何行来决定这份证据。
- 读 handler 答 `unavailable`，读输出畸形，或角色映射答 `model-mismatch`、`unknown-role` 时，答 `unavailable`。不答 `member`，也不答 `not-member`。

<a id="is-07"></a>

### IS-07 停止后的答复

`stop()` 只设停止标志。之后的新调用按下表作答，它们都不说明凭据、登录或成员关系的真假：

| 调用                  | 结果                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `registerAndActivate` | `not-loginable`                                                                   |
| `issueLogin`          | `basis-unavailable`，诊断 `provider-stopped`                                      |
| `recognizeLogin`      | 空凭证或非文本仍答 `invalid`。其他答 `basis-unavailable`，诊断 `provider-stopped` |
| `read`                | `unavailable`，诊断 `provider-stopped`                                            |
| 治理端口的十九项操作  | `basis-unavailable`，诊断 `provider-stopped`                                      |

`stop()` 之前已经受理的调用继续执行，不被中止。它们之后遇到的存储或 scrypt 拒绝，按 IS-02、IS-04、IS-05、IS-10 的映射作答。

<a id="is-08"></a>

### IS-08 重启后账号与登录仍在

`commit` 返回 `committed` 时，事实已经按 sqlite-provider 的持久保证落盘。重启后，第一次操作触及 `system.identity` 时，提供者走 DO-1 路径 A 恢复域。插件体的 `registerCombination` 对已有登记幂等认回。账号、凭据、成员关系、登录行与 002 的四张表都在同一个文件里。签发时冻结的截止时刻、刷新后的空闲截止时刻、当前选择、撤销行、邀请的终结与创建回执都随行保存，所以重启后的识别与治理操作与重启前得到相同的判断。停机时间计入期限。

本实例采用过的最晚读数不跨重启，也不跨插件重跑。识别一面，每份登录的 `issued_at` 是跨重启的下界。签发一面没有跨重启的下界，见已知限制 2。

<a id="is-09"></a>

### IS-09 迁移 002 与从 001 升级

迁移 `identity/002-governance` 要求 `identity/001-identity`，在同一个事务里建四张 STRICT 表：

| 表                        | 主键                        | 其他列                                                                                   | 写入者                           |
| ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `id_organization_profile` | `organization`              | `name`、`model`、`model_revision`                                                        | 创建团队                         |
| `id_invitation`           | `invitation`（`inv_` 文本） | `organization`、`invited_account`、`tenant_text`、`expires_at`、`state`、`revision` 整数 | 发出邀请、接受、拒绝、撤回、过期 |
| `id_create_receipt`       | `(account, create_call_id)` | `name`、`governance_model_id`、`outcome`，以及可空的 `organization` 与 `tenant_text`     | 创建团队                         |
| `id_login_revocation`     | `login`                     | `revoked_at`                                                                             | 撤销登录                         |

002 不改 001 的表。新的事实放进新表，键写成列内约束，与 001 相同（已知限制 10）。001 的字节保持发布时的值：迁移标记里的校验和不同时，存储提供者隔离该域。`migration` 文件读取的表名与语句在 `schema` 文件里，不在校验和之内，所以测试把它们钉在发布值上。002 的语句写在它自己的模块里。

从 001 升级：001 构建创建的域只有 001 的表、迁移标记与 001 版本的登记。本构建打开该文件后，插件体的 `registerCombination` 登记新版本。存储提供者在同一次登记里执行 002，再写新登记（sqlite-provider §5.3）。已有账号、凭据、登录与成员关系不变。已有登录没有撤销行，所以有效。它的 `tenant_text` 是个人租户，所以当前选择是个人租户。001 版本的登记留在域里。

<a id="is-10"></a>

### IS-10 治理写操作与结果映射

退出、移除、角色变化及邀请接受采用 [IS-16](#is-16) 的持久意图协议。每个最终成员变更及其治理核对仍在一个事务内；下文的一次提交映射适用于其他治理写入。

创建组织、发出邀请、拒绝、撤回、切换当前租户、撤销登录与成功业务访问报告各是一次 `commit`，只有一条 `identity` 命令。成员协调路径见 IS-16。

提供者在提交之前在主线程做完以下各项：

1. 已停止时答 `basis-unavailable`，诊断 `provider-stopped`。
2. 读一次时钟，按 ID-17 的规则采用。本节单次提交路径以这次读数为「当前」；成员协调路径在排空后读取新的时刻。
3. 发起登录 `login` 不能编码时答 `denied`。行事操作的 `actingTenant` 不能编码时答 `denied`。
4. 产生新标识（`org_`、`inv_`），计算租户文本、截止时刻与它们的排序键，并判断输入形状。按标识查找的输入不能编码时，事实里写 `null`，由参加者在核对发起登录之后答 `not-visible` 或 `denied`。
5. 发出邀请与成功业务访问报告各先做一次读（IS-11 的预读）。预读只给提供者计算所需的值，不决定答复。

参加者在这一条命令里按下列次序核对，前一步给出结果时不进入后一步，最后才写入：

1. 发起登录有效。次序与识别（IS-05 第 4 至 6 步）相同：有这一行；没有撤销行；本次读数不早于这份登录的 `issued_at`；两个截止时刻都晚于本次读数。行事操作还要求这份登录的当前选择等于 `actingTenant`。读数早于 `issued_at` 时，参加者不判定这份登录，答 `clock-earlier-than-record`，提供者答 `basis-unavailable`，诊断相同。其余不成立的情况答 `denied`。
2. 行动者的角色：所需角色由默认团队方案给出，提供者把角色名放进事实。参加者自己不认识任何角色名。
3. 预期状态：`expectedRole`、邀请的 `expectedState`、切换前的选择，以及最后管理员保护。

拒绝不写任何东西，参加者照常回复 `participated`，在响应里给出结果。所以拒绝不是回滚。邀请第一次被判定过期，以及有效成员接受邀请，都在同一条命令里写下终结，再答 `no-change`。

`system.identity` 的写是串行的，一组只有这一个操作（`singleton`）。两次并发调用不能都通过同一项核对再各自写入。两位超级管理员并发移除或降级对方时，后提交的一方在核对时已不是有效超级管理员，答 `denied`。

| `commit` 结果            | 治理结果                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `committed`              | 参加者响应里的结果。响应不能解析时拒绝 Promise：写入可能已经发生                                                                             |
| `rolled_back`            | `basis-unavailable`，诊断 `governance-rolled-back:<类别>`。没有写入任何东西                                                                  |
| `rejected_before_accept` | `basis-unavailable`，诊断 `governance-store-unavailable:<原因>`                                                                              |
| `unknown`                | 用同一身份 `query`，最多三次。`committed` 按响应作答。`rolled_back` 或 `not_committed` 答 `basis-unavailable`。仍为 `unknown` 时拒绝 Promise |
| `identity_conflict`      | 拒绝 Promise                                                                                                                                 |

拒绝 Promise 的错误类型是 `IdentitySqlResultUnknown`。调用方不自动重做。`createOrganization` 用 `queryCreateOrganization` 认回。

参加者和读 handler 不能调用时间函数，所以它们比较时刻时用排序键。排序键是编码时刻的日历部分、一个点，再接去掉末尾零的小数部分。两个排序键的文本次序与 utc-instant `compareInstants` 的次序相同。提供者用同一规则算出本次读数的排序键，放进事实与读输入。SQL 一侧的写法在 `support` 文件里。

<a id="is-11"></a>

### IS-11 治理读与预读

查询类操作各是一次 `read`，读 handler 是 `identity.governance`，次序 `snapshot`。查询是：查询创建回执、查询邀请、收到的邀请、发出的邀请、本人成员资格、组织成员、当前租户与本人有效登录。

handler 在同一个快照里先核对发起登录，规则同 IS-10 第 1 步，再读对象。拒绝答 `denied` 或 `not-visible`，不读对象的记录。读数早于发起登录的 `issued_at` 时，提供者答 `basis-unavailable`，诊断 `clock-earlier-than-record`。本人有效登录的名单还要求：本账号未撤销的登录里，没有一份的 `issued_at` 晚于本次读数。有这样一份时，名单不完整，同样答 `basis-unavailable`。可见性按 identity ID-18「可见性」：曾经是成员的账号看得见组织，从未成为成员的账号得到 `not-visible`。

| 读结果                                   | 治理结果                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 读到，结果是 `denied`、`not-visible`     | 同名结果                                                                                                           |
| 读到，结果是 `clock-earlier-than-record` | `basis-unavailable`，同一诊断。`queryCreateOrganization` 也是这个结果，不答 `unknown`                              |
| 读到，输出能解析                         | `succeeded`，或 ID-18 规定的结果                                                                                   |
| 读到，输出不能解析                       | `basis-unavailable`，诊断 `governance-read-malformed`                                                              |
| `unavailable`、`cancelled`               | `basis-unavailable`，诊断 `governance-read-unavailable:<原因>`。`queryCreateOrganization` 答 `unknown`，带同一诊断 |

`queryCreateOrganization` 没有该账号的回执时答 `unknown`，诊断 `no-receipt-of-this-account`。`queryOwnValidLogins` 的名单为空时答 `basis-unavailable`，诊断 `valid-login-list-empty`。

handler 另有两个预读，它们不核对发起登录：

- `account-of` 按登录标识读账号。发出邀请用它算被邀请者在该组织的租户文本。参加者在资格核对之后按标识重读一次，与预读的账号不同时答 `not-visible`。
- `login-terms` 读登录的空闲时长与当前是否有效。成功业务访问报告用它算新的空闲截止时刻。读数早于这份登录的 `issued_at` 时，它答 `clock-earlier-than-record`。

<a id="is-12"></a>

### IS-12 撤销与当前选择

- 撤销写一行 `id_login_revocation`。撤销行不删除，也不随重启消失，所以撤销后的识别一直答 `invalid`（IS-05 第 4 步）。目标不存在与属于其他账号得到相同的 `not-visible`。参加者按识别的次序判定目标：已撤销时答 `no-change`，不写第二行；读数早于目标的 `issued_at` 时答 `basis-unavailable`，诊断 `clock-earlier-than-record`；已到期（读数不早于任一截止时刻）时答 `no-change`，不写撤销行。
- `id_login.tenant_text` 是这份登录当前的选择。签发写入个人租户。切换在同一条命令里核对选择仍等于 `actingTenant`、目标是本账号的有效成员资格，再改写这一列。切换只改这一行，同账号的其他登录不变。成员被移除时这一列不变。

<a id="is-13"></a>

### IS-13 组织、邀请与名单

- 创建团队在一条命令里写组织、组织资料、创建者租户、首位超级管理员与回执。回执按「账号 + `createCallId`」保存，绑定名称与模型。`denied` 也写回执，所以同一调用再提交得到同一结果。
- 邀请在发出时保存被邀请者的租户文本与截止时刻。截止时刻是本次读数加时长，配置之后的变化不改变它。接受时，首次加入写租户行与成员行，重新加入把原成员行改回有效的普通成员。租户文本不变。
- 处置邀请时，第一次判定过期就把 `state` 改为 `expired`。之后时钟倒退或重启都读到这个终结。查询邀请与两份邀请名单不写入：开放的邀请到了截止时刻，读出 `expired`。
- 一份治理名单最多 1000 项。超过时 handler 让这次读失败，提供者答 `basis-unavailable`，不交出截断的名单（已知限制 13）。名单的读不成功时同样答 `basis-unavailable`，结果不带数组。

<a id="is-14"></a>

### IS-14 成功业务访问报告

`reportBusinessAccess({ login })` 按 R2-D203 对 P-7 的裁定实现：

1. 已停止时答 `basis-unavailable`。读一次时钟。`login` 不能编码时答 `not-refreshed`。
2. 预读 `login-terms`。读不到答 `basis-unavailable`。读数早于这份登录的 `issued_at` 时答 `basis-unavailable`，诊断 `clock-earlier-than-record`。没有这份登录，或它已撤销、已失效，答 `not-refreshed`。
3. 新的空闲截止时刻是本次读数加签发时冻结的空闲时长。超出 0000 年至 9999 年时答 `basis-unavailable`。
4. 提交一条命令。参加者再核对登录有效（IS-10 第 1 步），读数早于 `issued_at` 时答 `basis-unavailable`，其余不成立时答 `not-refreshed`，不复活登录。成立时只在新值晚于原值时改写 `idle_deadline`，再答 `refreshed`，带改写后的值。

报告只改这一份登录的 `idle_deadline`。`max_deadline` 不变。治理操作与识别都不报告，也不刷新。`queryOwnValidLogins` 给出的 `idleDeadline` 是这一列的当前值（P-11）。

<a id="is-15"></a>

### IS-15 邀请时长的配置

插件配置在两个登录时长之外有两个邀请时长：`invitationDefaultDuration` 与 `invitationMaxDuration`，都是 `PT<秒>S` 文本，都须大于零，默认时长不长于最长时长。四项都必填：缺任一项时校验不通过，插件 fiber 失败，不提供任何键。校验不填入任何值（R2-D240）。部署在发行配置里写全四项；P-10 的初值是 `PT604800S`（7 天）与 `PT2592000S`（30 天）（R2-D204 第 7 条）。`IDENTITY_SQL_DEFAULT_CONFIG` 列出这四个初值，供部署显式取用。

提供者经注入的 `InvitationTermsSource` 在每次发出邀请时读时长，不在代码里写死。时长不可得或非法时，发出邀请答 `basis-unavailable`。请求的时长不大于零或长于最长时长时答 `denied`。这两项判断在资格核对之后、查找被邀请标识之前生效。

## 所有权、失败与生命周期

### 所有权

| 事项                             | 拥有者                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| 十二张表与三个迁移的字节         | 本成员的参加者 `identity`。迁移发布后不改字节，表结构的变化写成新迁移                      |
| 组合登记                         | 插件体在提供服务之前调用 `registerCombination`。登记是持久的协议元数据，不随 fiber 撤除    |
| 停止标志与最晚时钟读数           | 一个提供者实例。插件重跑产生新实例                                                         |
| scrypt 模块与假材料              | 插件体。工厂只接收已打开的模块，不关闭它                                                   |
| `SqlStorage` 对象                | 装配。本成员只经 `storage` 服务键使用它，不认识提供者                                      |
| 时钟                             | 装配入口的 `identityClock` 入口对象。本成员只经 `identityClock` 服务键使用它，不认识提供者 |
| 邀请时长                         | 插件配置。插件体把校验后的值包成 `InvitationTermsSource` 交给提供者                        |
| 邀请、回执与撤销的标识文本       | 本成员。`inv_` 文本是不透明文本，没有 legal-identity 词法                                  |
| 账号、组织、租户、登录标识的文本 | 本成员按 legal-identity 的词法产生，再经该包解析                                           |

### 失败

- 读 handler 的 `unavailable`（含 `closing`、`cancelled`）：签发与识别答 `basis-unavailable`，读口答 `unavailable`。
- 读输出不符合本成员约定的形状：同上，诊断以 `-malformed` 结尾。
- 注册的 `commit` 答 `rolled_back` 或 `rejected_before_accept`：`not-loginable`。
- 注册或登录写入的结果没有确定成立：拒绝 Promise，错误类型 `IdentitySqlResultUnknown`。调用方按 ID-17 的认回方法核实。
- 治理写入的结果没有确定成立，或已提交的响应不能解析：拒绝 Promise，错误类型相同。映射见 IS-10。
- 诊断文本只含固定字面量与存储契约的 `reason`、回滚类别或 scrypt 的 `code`，不含登录标识、凭据、凭证、登录的 `LoginStateId` 文本或 SQL。

### 生命周期

插件体按固定次序做五件事：

1. 校验配置的两个登录时长与两个邀请时长（IS-15）。解析失败、不大于零或默认邀请时长长于最长时长时插件抛错，该行 `FAILED`。
2. 用 `SCRYPT_PROFILE` 调 `openScrypt`，再 `derive` 假材料。派生失败时关闭模块并抛错，诊断 `decoy-derive-failed:<code>`。
3. `registerCombination`。结果不是 `registered` 时关闭模块并抛错。
4. 用注入的 `identityClock` 与邀请时长构造提供者，在同一插件体内各 `new` 一个 `IdentityOperationsService`、`TenantStandingSourceService` 、`IdentityGovernanceService`、`StandingReservationsService` 与 `IdentityGovernanceRecoveryService` 子类实例。这些实例共用一个提供者，所以治理端口的撤销与切换对识别生效。
5. 登记一个受管 effect。撤除函数先调用提供者的 `stop()`，再 `await` scrypt 的 `close()`。

`storage` 或 `identityClock` 换代时插件体重跑：重开 scrypt、重派生假材料、`registerCombination` 幂等认回，产生新实例。旧实例的调用按 IS-07 作答。撤除不撤销已提交的事实。

### 时钟来源

插件 inject identity `./cordis` 的 `identityClock` 键（R1-D27）。装配入口提供 `IdentityClockService` 的子类，本成员不读墙钟，也不自建时钟。`identityClock` 缺席时 fiber 停在 PENDING，五个键都不提供。时钟换代时插件体重跑，实例内的最晚读数重新开始。期限类用例因此用可控时钟拨过截止时刻，不等待真实时间。

### 已知限制

1. **每次成功业务访问报告是一次提交。** IS-14 先读一次，再提交一次，每次提交写一份存储回执。高频访问的部署因此在 `system.identity` 上多出同频的写。本成员不合并报告。退出条件：报告频率成为瓶颈时，由报告方或本成员按时间窗合并，并修订 IS-14。
2. **跨重启的时钟下界不完整。** 重启或插件重跑后，实例的最晚读数重新开始。识别与治理一面，下界只到所判定登录的 `issued_at`（IS-05 第 5 步、IS-10 第 1 步）：时钟倒退到某份登录的截止时刻之前、`issued_at` 之后时，已失效的登录会再次识别为有效，也能再次发起治理调用。邀请的截止时刻没有这样的下界：时钟倒退到邀请截止时刻之前时，尚未判定过期的开放邀请读出 `open`。签发一面没有跨重启的下界，新登录的 `issuedAt` 可以早于已有登录，它的截止时刻也更早，所以不延长任何登录的有效期。不用 `max(issued_at)` 补下界的理由见 DP-3 候选 DP3-C14。
3. **scrypt 参数固定在代码里（IC-14 偏离）。** 插件体使用 `SCRYPT_PROFILE`，`inFlight` 为 1，`queue` 为 4。并发超过 5 个的签发或注册得到 `basis-unavailable` 或 `not-loginable`。改参数要改代码并发版，而且只能放宽：N、r、p、keylen 不得小于已发布的值。收紧后，超过新配置的旧材料在计算前得到 `unavailable`，全部已有账号的签发都答 `basis-unavailable`。退出条件：部署需要调整并发或计算参数时，把七个字段写成行配置，并在插件体校验「只能放宽」。
4. **同进程的受信行能写系统域。** `storage` 不是访问控制。受信存储子树内的其他行能对 `system.identity` 提交，前提是它们知道参加者名与清单摘要。保护靠受信行只由发行代码安装。
5. **没有未激活注册与留存期。** 本提供者只有注册即激活一种开通方案。
6. **凭据核对与写登录之间没有守卫。** M2 没有更换凭据的操作，这个窗口不可达。ID-04 交付时，写登录的命令须核对 `id_credential.revision`。
7. **时序侧信道不在范围内。** 假材料只保证失败表现相同，不保证时长相同。
8. **个人组织的治理模型钉在 `default-team` revision `'1'`。** 换模型或升 revision 时，须同批迁移 `id_membership` 的 `role_model` 与 `role_model_revision`。迁移完成之前，个人租户的读口答 `unavailable`。
9. **截止时刻的加法不计闰秒。** 跨过插入闰秒的期限提前一秒结束。
10. **唯一约束写成列内约束。** sqlite-provider 的迁移 authorizer 拒绝显式 `CREATE INDEX` 的 REINDEX 步骤，所以三个唯一约束都写在 `CREATE TABLE` 里。新增独立索引要等提供者放开这一项。
11. **几个函数的圈复杂度超过度量阈值。** 阈值是 warn 10、alert 12。`metrics` 报的超 alert 函数如下：
    - `provider.ts` 的 `issueLogin` CC 18、`recognizeLogin` CC 17。分支来自 ID-17 各操作的固定步骤次序与结果映射。`recognizeLogin` 比 001 多一步撤销判定（IS-05 第 4 步）。
    - 参加者的 `changeMember` CC 16、`disposeInvitation` CC 15、`issueInvitation` CC 13。每个分支是一项有序核对：发起登录、可见性、行动者角色、预期状态、最后管理员。这些核对必须在同一条参加者命令里按次序完成（IS-10），次序本身就是保证。拆成几个函数不减少分支，只把次序分到几处。
    - `governance.ts` 的 `governanceOver.write` CC 13。每个分支对应 IS-10 映射表里的一种提交结果。

    `registerAndActivate`、`parseIdentitySqlConfig`、`governanceOver.changeMember` 与治理读 handler 的 `answer` 都是 CC 12，超 warn，未超 alert。退出条件：把 `provider.ts` 的结果映射提成独立函数后重新度量。参加者的核对次序仍留在一个函数里。

12. **「登录表可读」的探读没有独立用例。** `read-issue-basis.ts` 的探读与账号表的读取在同一个读 handler、同一个 SQLite 文件里，不能独立于账号表失败。现有用例只让整个 `identity.issue-basis` 读失败，没有「账号表可读、登录表不可读」的用例。本提供者答 `basis-unavailable` 的条件因此是 ID-17 条件的子集。
13. **治理名单最多 1000 项。** 收到的邀请、发出的邀请、本人成员资格、组织成员与本人有效登录，任一份超过 1000 项时答 `basis-unavailable`，直到项数回落。本阶段没有分页。邀请的终结不删除，所以一个账号收到或一个组织发出的邀请累计超过 1000 份之后，对应名单一直答 `basis-unavailable`。退出条件：identity 契约定义分页或留存期之后，按它修订 IS-13。
14. **发出邀请与注册并发时可能答 `not-visible`。** 预读没有找到被邀请标识，而提交之前该标识注册成功时，参加者答 `not-visible`，不发出邀请。调用方再发一次即可。
15. **排序键依赖编码时刻的文本。** 参加者与读 handler 只比较 utc-instant `encodeInstant` 写出的文本。由其他途径写进时刻列的文本不受这条保证。表只由本成员的参加者写入（已知限制 4 的前提）。
16. **记录库故障的区分只在提供者之外。** 一次治理调用的读或提交同时触及登录记录与组织记录。存储不作答时，提供者只知道这次读或提交失败，不知道是哪一类记录。`queryCreateOrganization` 因此在登录记录不可得时也答 `unknown`，不答 `basis-unavailable`。

## 组合与验证

### 消费的承诺

| 承诺                                                          | 本成员怎样消费                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| identity ID-17 契约套件 `checkIdentityOperationsContract`     | 在真实 sqlite-provider 上运行，用例集与参考替身相同，`login-inactive-uniform` 不适用 |
| identity ID-18 治理契约套件 `checkIdentityGovernanceContract` | 在真实 sqlite-provider 上运行，接入记录库故障与重启，没有不适用的用例                |
| sql-contract §6 登记幂等、§7 提交结果、§8 查询认回、§9 读取   | IS-01、IS-02、IS-04、IS-05、IS-06 的映射                                             |
| sqlite-provider §5.3 DO-1、`synchronous=FULL` 与 WAL          | IS-08 的持久性                                                                       |
| scrypt 的结果种类、`close` 让等候者得到 `stopped`             | IS-02、IS-04、IS-07 的映射                                                           |
| identity `./cordis` 的五个抽象类与键                          | 插件体的五个子类实例                                                                 |
| identity `./cordis` 的 `identityClock` 键                     | 插件 inject 它，交给工厂作时钟                                                       |

### 验证资源

| 义务                                                                                                                                                 | 资源                                                                                       | 真实依赖                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| R4-1 契约套件对持久实现通过                                                                                                                          | `tests/operations-contract.spec.ts`（慢层）                                                | sqlite-provider、scrypt 小配置                                   |
| R4-2 重启后账号与登录仍在                                                                                                                            | `tests/restart.spec.ts` 与 `tests/fixtures/restart-child.ts`（慢层，两个子进程）           | 同上                                                             |
| R4-3 凭据只存 scrypt 材料                                                                                                                            | `tests/credential-storage.spec.ts`                                                         | 同上，另读数据库文件字节                                         |
| R4-4 注册单事务与结果未知                                                                                                                            | `tests/register-transaction.spec.ts`                                                       | 同上，标识生成器与存储包装注入                                   |
| R4-5 读口不区分未知租户与非成员                                                                                                                      | `tests/standing.spec.ts`                                                                   | 同上                                                             |
| IS-07 停止后                                                                                                                                         | `tests/stopped.spec.ts`                                                                    | 同上，门控 scrypt 计算                                           |
| IS-04 的 scrypt 映射与假材料                                                                                                                         | `tests/scrypt-mapping.spec.ts`                                                             | 同上                                                             |
| IS-02 输入上界                                                                                                                                       | `tests/register-transaction.spec.ts`                                                       | 同上                                                             |
| 公开入口、材料与组合                                                                                                                                 | `tests/public-entry.spec.ts`                                                               | 无                                                               |
| IS-01：组合版本覆盖参加者的导入闭包；负控：版本只取清单时，`support` 的改动不改变版本                                                                | `tests/combination-version.spec.ts` 与 `tests/fixtures/mutants.ts`                         | `dist` 副本                                                      |
| IS-12：撤销已到期、未撤销的目标答 `no-change`，不写撤销行；IS-10、IS-11：读数早于 `issued_at` 时治理调用答 `basis-unavailable`，不写入；两项各有负控 | `tests/governance-login-bounds.spec.ts`（慢层）与 `tests/fixtures/mutants.ts`              | sqlite-provider、scrypt 小配置、`dist` 副本                      |
| 插件：配置失败、缺邀请时长时失败、缺时钟 PENDING、五键、注入时钟与截止时刻、撤销、邀请时长、撤除                                                     | `tests/cordis-entry.spec.ts`（端到端用例在慢层，用 `SCRYPT_PROFILE`）                      | Cordis 4.0.4、sqlite-provider                                    |
| AC-1：治理契约套件对持久实现通过，两组配置                                                                                                           | `tests/governance-contract.spec.ts`（慢层）                                                | sqlite-provider、scrypt 小配置                                   |
| 负控：去掉最后管理员、预期角色、撤销后识别失效、名单完整性四项核对之一，对应用例变红；未改动的副本全部通过                                           | `tests/governance-negative.spec.ts`（慢层）与 `tests/fixtures/mutants.ts`                  | 同上，`dist` 副本                                                |
| AC-2：两位管理员互相移除或降级，50 次，每次至多一方成功，至少留一位超级管理员                                                                        | `tests/last-admin-concurrent.spec.ts`（慢层）                                              | 同上                                                             |
| AC-2：撤销跨进程保留；IS-09 从 001 升到 002                                                                                                          | `tests/governance-restart.spec.ts` 与 `tests/fixtures/governance-child.ts`（慢层，子进程） | 同上，`tests/fixtures/identity-001/` 是 001 构建参加者的冻结副本 |
| IS-13：名单到上限时完整，超过时 `basis-unavailable`                                                                                                  | `tests/list-limit.spec.ts`（慢层）                                                         | 同上                                                             |
| IS-10：回滚、回复丢失、结果未知的映射；IS-14 不提前空闲截止时刻                                                                                      | `tests/governance-mapping.spec.ts`                                                         | 同上                                                             |
| IS-10 的排序键与 `compareInstants` 同序，JavaScript 与 SQL 一致                                                                                      | `tests/order-key.spec.ts`                                                                  | `node:sqlite` 内存库                                             |
| IS-09：迁移 001 的字节与语句保持发布值                                                                                                               | `tests/public-entry.spec.ts`                                                               | 无                                                               |

命令：成员目录运行 `pnpm run build`、`pnpm run typecheck`、`NO_COLOR=1 pnpm exec vitest run --mode fast` 与 `--mode slow`。用例经 `dist` 导入本成员，改源码后先构建。慢层设 `IDENTITY_SQL_EVIDENCE_DIR` 时，负控与 50 次并发用例把逐项结果写进该目录。

### 未覆盖

- 应用层的贯通：行包装、材料聚合、`identityGovernance` 的受信持有与真实装配归 `apps/harness-server`。
- 公开协议到治理端口的映射与观察结束（C5）归服务端接入。
- 多进程并发写同一个域、介质损毁、闰秒附近的截止时刻、时序侧信道。
- 真实 `SCRYPT_PROFILE` 只在插件端到端用例里运行一次，其他用例用较小的 N。
- 个人组织治理模型的产品确认（DP-3 第三层第二项）。

<a id="is-16"></a>

### IS-16 持久预留与成员变更意图

本实现兑现 identity ID-19。迁移 `identity/003-standing` 在原系统域增加 `id_standing_reservation` 与 `id_membership_intent`，不改 001 或 002 的字节。`identity.coordination` 读 handler 在快照中读回原记录及有界分页。声明 `singleton` 保持，它限制分组提交，不禁止组合其他参加者。

`createIdentitySql` 接收可选 `principalVerifier` 与 `destinationResolver`，提供 `reservations` 与 `governanceRecovery`。没有核验器时 reserve 拒绝；没有目标 resolver 时已有预留保持 held。普通调用方没有可提交终态的 finish 端口。resolver 由装配固定路由，不从客户端载入模块。目标实现必须使 consume、业务写入及终态记录同事务，使 seal 与它们竞争且永不重开终态。

`worker/standing.ts` 的共同门保护注册、建组织、邀请接受与重新加入、退出、移除、角色变化的全部成员写入。注册和建组织只创建新成员，仍经过同一门。退出、移除、改角色及邀请接受先持久登记原逻辑命令；同一成员的 pending 意图按入库 sequence 排序。任何 pending 意图阻止新预留，只有队首可以提交。原治理核对保持既有次序，最终结果与清门同事务保存。

每个意图保存原命令、原登录、目标成员、最终响应和当前 SQL 尝试。准备尝试时先排空预留，读取新的时间，再在事务内核对共同门并持久保存尝试号与时刻。apply 使用这份不可变封套，并重新执行原治理核对。恢复先查询原 apply 身份；unknown 保留原封套。已知未提交或回滚后，新的准备事务才可退役旧尝试。退役与旧 apply 在同一域竞争：旧 apply 已完成则返回原终态；退役先完成则晚到的旧封套不能写成员。新尝试使用新 SQL 身份与新的时间，不能把新 nowKey 填进旧身份。

`IdentitySqlResultUnknown.operation` 暴露成员变更的原逻辑身份。调用方不能通过重进原 API 声称恢复同一操作；使用 `governanceRecovery.resume({ login, operation })`。已完成响应保存不变；读取检查当前登录属于原发起账号，且当前有效、选择及治理资格满足披露规则；最终变更始终检查持久保存的原登录。受信 `recover` 每次最多处理 100 个意图，每个意图每次最多处理 100 个预留，每次 SQL 结果查询最多三次，逐项执行。默认分页为 32。大绑定还受响应字节预算限制，实际返回数可更少，仍提供 continuation cursor。目标失败时保留记录，调用方用返回的 cursor 继续一轮；以后从头开始下一轮可重试失败项。

`stop()` 只停止新调用，不释放预留或删除意图。已接纳调用可继续到确定终态；实例停止不证明外部作用可逆。运行方负责有界重试调度，永久不可用的目标没有强制清门路径。资格映射更新必须保留已有预留的解释或先排空预留。

部署须采用含 003 的完整材料目录。当前 sqlite-provider 在重开域时推进写代际，旧 writer 的后续提交被拒绝；已记录而目录缺少的迁移使旧目录不能重开域。Identity 不读取这些存储私表。`tests/standing-reservations.spec.ts` 用真实文件和 Worker 检查旧目录拒绝、重启、晚到封套、目标不可用、原登录重检与三项负控。目标 resolver 在这些测试中是符合性夹具，真实跨域组合另行验证。

本人退出成功后，新登录无法选择原租户，`resume` 因当前披露资格答 `not-visible`。这不会改写持久终态，也不表示原变更结果丢失。没有单独的历史回执披露例外。
