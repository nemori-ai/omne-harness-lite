# @omne-harness/identity-sql 行为规格

状态：实现成员，按 [DP-3 决策记录](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6561478373)（#978 评论 6561478373）建立。本成员是 [identity 契约](../identity/SPEC.md) ID-16 资格读口与 ID-17 三项操作的持久提供者。记录落在 [SQL 存储契约](../../storage/sql-contract/SPEC.md)系统作用域的事务域 `system.identity`。凭据只保存 [scrypt](../scrypt/SPEC.md) 派生材料。

本文件拥有本包在公开类型以外的必要行为。公开形状与运行时校验归 `src/` 的公开定义，公开定义的导航归 [docs/public-api.md](docs/public-api.md)。身份、登录与资格的产品语义归 identity 契约，本文只写本提供者怎样兑现它们，以及本提供者自己承担的规则。

## 范围与依据

本成员拥有四类东西：

1. 六张表 `id_account`、`id_credential`、`id_organization`、`id_tenant`、`id_membership`、`id_login` 的形状与迁移 `identity/001-identity`。
2. 存储契约的参加者 `identity` 与三个读 handler `identity.issue-basis`、`identity.login-by-proof`、`identity.standing`。
3. 纯工厂 `createIdentitySql`：注册激活、签发登录、识别登录与资格读口的实现，以及 scrypt 结果、提交结果与读结果到契约结果的映射。
4. `./cordis` 插件 `IdentitySqlPlugin`：配置校验、scrypt 打开、组合登记、两个服务键与停止语义。

本成员不拥有：identity 的产品规则与结果类型（归 [identity SPEC](../identity/SPEC.md)）、SQL 提交、查询与读取的行为（归 [sql-contract](../../storage/sql-contract/SPEC.md) 与 [sqlite-provider](../../storage/sqlite-provider/SPEC.md)）、口令派生的强度与队列（归 [scrypt](../scrypt/SPEC.md)）、主体签发与核验（线包 R3）、切换租户、退出、撤销、邀请与更换凭据（D-10，M2 不提供）、应用行与材料目录的聚合（`apps/harness-server`）。

| 依据                                           | 位置                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 三项操作的次序、结果与契约套件                 | [identity SPEC ID-17](../identity/SPEC.md#id-17-注册激活签发登录与识别登录)                                        |
| 资格读口、证据与角色映射                       | [identity SPEC ID-16](../identity/SPEC.md#id-16-首批公开形状主体与资格事实)                                        |
| 不同失败事实与不伪造确定无效                   | [identity SPEC ID-03](../identity/SPEC.md#id-03-登录退出与登录状态维护)                                            |
| 系统作用域、事务域、登记、提交结果、读 handler | [sql-contract SPEC](../../storage/sql-contract/SPEC.md) §2.5、§3、§4、§6、§7、§9                                   |
| 域打开、迁移、分组资格与持久性                 | [sqlite-provider SPEC](../../storage/sqlite-provider/SPEC.md) §4.5、§5.3、§5.4                                     |
| 派生与校验的结果种类与关闭                     | [scrypt SPEC](../scrypt/SPEC.md)                                                                                   |
| 成员位置、结果映射、单事务、读口、插件形状     | DP-3 决策记录第 1 至 6 条（候选 DP3-C1 至 DP3-C16）                                                                |
| 时钟由插件体构造                               | DP-1 第 2 轮 DP1-C16，经 DP-3 决策记录第 5 条                                                                      |
| Cordis 集成规则                                | [IC 约定](../../../docs/architecture/cordis-integration-conventions.md)，核对表在 [docs/cordis.md](docs/cordis.md) |

## 结果与不变量

<a id="is-01"></a>

### IS-01 记录位置与组合

全部记录落在作用域 `{ kind: 'system' }`、事务域 `system.identity`。六张表都归参加者 `identity`，分组声明是 `singleton`。组合版本是 `identity-sql/<清单摘要>`，清单摘要由 `identitySqlCombination()` 用本成员自己的材料计算。同一构建每次算出同一个值。构建改变材料字节时，版本随之改变，新登记不覆盖旧登记。

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
2. 提供者已停止时答 `basis-unavailable`，诊断 `provider-stopped`。读 handler `identity.login-by-proof` 按凭证摘要查登录行。读答 `unavailable` 时答 `basis-unavailable`。
3. 没有行时答 `invalid`。行里的标识、租户文本或时刻解析失败时答 `basis-unavailable`。
4. 读时钟。下界取两者中较晚的一个：本实例采用过的最晚读数，以及这份登录的 `issued_at`。读数早于下界，或时钟不可得，答 `basis-unavailable`。
5. 读数不早于 `max_deadline` 或 `idle_deadline` 时答 `invalid`。
6. 其他情况答 `recognized`。

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

`stop()` 之前已经受理的调用继续执行，不被中止。它们之后遇到的存储或 scrypt 拒绝，按 IS-02、IS-04、IS-05 的映射作答。

<a id="is-08"></a>

### IS-08 重启后账号与登录仍在

`commit` 返回 `committed` 时，事实已经按 sqlite-provider 的持久保证落盘。重启后，第一次操作触及 `system.identity` 时，提供者走 DO-1 路径 A 恢复域。插件体的 `registerCombination` 对已有登记幂等认回。账号、凭据、成员关系与登录行都在同一个文件里，签发时冻结的截止时刻随登录行保存，所以重启后的识别与重启前得到相同的判断。停机时间计入期限。

本实例采用过的最晚读数不跨重启，也不跨插件重跑。识别一面，每份登录的 `issued_at` 是跨重启的下界。签发一面没有跨重启的下界，见已知限制 2。

## 所有权、失败与生命周期

### 所有权

| 事项                             | 拥有者                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| 六张表与迁移字节                 | 本成员的参加者 `identity`。迁移发布后不改字节，表结构的变化写成新迁移                   |
| 组合登记                         | 插件体在提供服务之前调用 `registerCombination`。登记是持久的协议元数据，不随 fiber 撤除 |
| 停止标志与最晚时钟读数           | 一个提供者实例。插件重跑产生新实例                                                      |
| scrypt 模块与假材料              | 插件体。工厂只接收已打开的模块，不关闭它                                                |
| `SqlStorage` 对象                | 装配。本成员只经 `storage` 服务键使用它，不认识提供者                                   |
| 账号、组织、租户、登录标识的文本 | 本成员按 legal-identity 的词法产生，再经该包解析                                        |

### 失败

- 读 handler 的 `unavailable`（含 `closing`、`cancelled`）：签发与识别答 `basis-unavailable`，读口答 `unavailable`。
- 读输出不符合本成员约定的形状：同上，诊断以 `-malformed` 结尾。
- 注册的 `commit` 答 `rolled_back` 或 `rejected_before_accept`：`not-loginable`。
- 注册或登录写入的结果没有确定成立：拒绝 Promise，错误类型 `IdentitySqlResultUnknown`。调用方按 ID-17 的认回方法核实。
- 诊断文本只含固定字面量与存储契约的 `reason` 或 scrypt 的 `code`，不含登录标识、凭据、凭证或 SQL。

### 生命周期

插件体按固定次序做五件事：

1. 校验配置 `maxLifetime` 与 `idlePeriod`。解析失败或不大于零时插件抛错，该行 `FAILED`。
2. 用 `SCRYPT_PROFILE` 调 `openScrypt`，再 `derive` 假材料。派生失败时关闭模块并抛错，诊断 `decoy-derive-failed:<code>`。
3. `registerCombination`。结果不是 `registered` 时关闭模块并抛错。
4. 用系统时钟构造提供者，在同一插件体内各 `new` 一个 `IdentityOperationsService` 与 `TenantStandingSourceService` 子类实例。
5. 登记一个受管 effect。撤除函数先调用提供者的 `stop()`，再 `await` scrypt 的 `close()`。

`storage` 换代时插件体重跑：重开 scrypt、重派生假材料、`registerCombination` 幂等认回，产生新实例。旧实例的调用按 IS-07 作答。撤除不撤销已提交的事实。

### 已知限制

1. **空闲计时不刷新。** 成功业务访问报告的形状未定义（ID-16、ID-17 识别规则 2）。M2 的实际登录寿命是 `idlePeriod` 与 `maxLifetime` 中较短的一个。
2. **跨重启的时钟下界不完整。** 重启或插件重跑后，实例的最晚读数重新开始。识别一面，下界只到每份登录的 `issued_at`：时钟倒退到某份登录的截止时刻之前、`issued_at` 之后时，已失效的登录会再次识别为有效。签发一面没有跨重启的下界，新登录的 `issuedAt` 可以早于已有登录，它的截止时刻也更早，所以不延长任何登录的有效期。不用 `max(issued_at)` 补下界的理由见 DP-3 候选 DP3-C14。
3. **scrypt 参数固定在代码里（IC-14 偏离）。** 插件体使用 `SCRYPT_PROFILE`，`inFlight` 为 1，`queue` 为 4。并发超过 5 个的签发或注册得到 `basis-unavailable` 或 `not-loginable`。改参数要改代码并发版，而且只能放宽：N、r、p、keylen 不得小于已发布的值。收紧后，超过新配置的旧材料在计算前得到 `unavailable`，全部已有账号的签发都答 `basis-unavailable`。退出条件：部署需要调整并发或计算参数时，把七个字段写成行配置，并在插件体校验「只能放宽」。
4. **同进程的受信行能写系统域。** `storage` 不是访问控制。受信存储子树内的其他行能对 `system.identity` 提交，前提是它们知道参加者名与清单摘要。保护靠受信行只由发行代码安装。
5. **没有未激活注册与留存期。** 本提供者只有注册即激活一种开通方案。
6. **凭据核对与写登录之间没有守卫。** M2 没有更换凭据的操作，这个窗口不可达。ID-04 交付时，写登录的命令须核对 `id_credential.revision`。
7. **时序侧信道不在范围内。** 假材料只保证失败表现相同，不保证时长相同。
8. **个人组织的治理模型钉在 `default-team` revision `'1'`。** 换模型或升 revision 时，须同批迁移 `id_membership` 的 `role_model` 与 `role_model_revision`。迁移完成之前，个人租户的读口答 `unavailable`。
9. **截止时刻的加法不计闰秒。** 跨过插入闰秒的期限提前一秒结束。
10. **唯一约束写成列内约束。** sqlite-provider 的迁移 authorizer 拒绝显式 `CREATE INDEX` 的 REINDEX 步骤，所以三个唯一约束都写在 `CREATE TABLE` 里。新增独立索引要等提供者放开这一项。

## 组合与验证

### 消费的承诺

| 承诺                                                        | 本成员怎样消费                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| identity ID-17 契约套件 `checkIdentityOperationsContract`   | 在真实 sqlite-provider 上运行，用例集与参考替身相同，`login-inactive-uniform` 不适用 |
| sql-contract §6 登记幂等、§7 提交结果、§8 查询认回、§9 读取 | IS-01、IS-02、IS-04、IS-05、IS-06 的映射                                             |
| sqlite-provider §5.3 DO-1、`synchronous=FULL` 与 WAL        | IS-08 的持久性                                                                       |
| scrypt 的结果种类、`close` 让等候者得到 `stopped`           | IS-02、IS-04、IS-07 的映射                                                           |
| identity `./cordis` 的两个抽象类与键                        | 插件体的两个子类实例                                                                 |

### 验证资源

| 义务                                 | 资源                                                                             | 真实依赖                       |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------ |
| R4-1 契约套件对持久实现通过          | `tests/operations-contract.spec.ts`（慢层）                                      | sqlite-provider、scrypt 小配置 |
| R4-2 重启后账号与登录仍在            | `tests/restart.spec.ts` 与 `tests/fixtures/restart-child.ts`（慢层，两个子进程） | 同上                           |
| R4-3 凭据只存 scrypt 材料            | `tests/credential-storage.spec.ts`                                               | 同上，另读数据库文件字节       |
| R4-4 注册单事务与结果未知            | `tests/register-transaction.spec.ts`                                             | 同上，标识生成器与存储包装注入 |
| R4-5 读口不区分未知租户与非成员      | `tests/standing.spec.ts`                                                         | 同上                           |
| IS-07 停止后                         | `tests/stopped.spec.ts`                                                          | 同上，门控 scrypt 计算         |
| IS-04 的 scrypt 映射与假材料         | `tests/scrypt-mapping.spec.ts`                                                   | 同上                           |
| IS-02 输入上界                       | `tests/register-transaction.spec.ts`                                             | 同上                           |
| 公开入口、材料与组合                 | `tests/public-entry.spec.ts`                                                     | 无                             |
| 插件：配置失败、两键、系统时钟、撤除 | `tests/cordis-entry.spec.ts`（端到端用例在慢层，用 `SCRYPT_PROFILE`）            | Cordis 4.0.4、sqlite-provider  |

命令：成员目录运行 `pnpm run build`、`pnpm run typecheck`、`NO_COLOR=1 pnpm exec vitest run --mode fast` 与 `--mode slow`。用例经 `dist` 导入本成员，改源码后先构建。

### 未覆盖

- 应用层的贯通：行包装、材料聚合与真实装配归 `apps/harness-server`。
- 多进程并发写同一个域、介质损毁、闰秒附近的截止时刻、时序侧信道。
- 真实 `SCRYPT_PROFILE` 只在插件端到端用例里运行一次，其他用例用较小的 N。
- 个人组织治理模型的产品确认（DP-3 第三层第二项）。
