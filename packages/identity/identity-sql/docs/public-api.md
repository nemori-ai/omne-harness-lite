# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。本文不手写第二套签名。

## 导出入口

| 入口                                | 源码            | 调用者                        |
| ----------------------------------- | --------------- | ----------------------------- |
| `@omne-harness/identity-sql`        | `src/index.ts`  | 应用装配、测试。不导入 Cordis |
| `@omne-harness/identity-sql/cordis` | `src/cordis.ts` | 应用的 `identity` 行          |

本包没有 `./testing` 入口。测试夹具在 `tests/fixtures/`，不发布。

## 定义索引

根入口：

| 导出                                                        | 定义                                       | 行为条款                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createIdentitySql(input)`                                  | `src/provider.ts`                          | SPEC IS-02 至 IS-14。输入是 `IdentitySqlInput`：`storage`、`clock`、`terms`、`invitationTerms`、`scrypt`、`decoyMaterial`，可选 `identifiers`、`principalVerifier` 与 `destinationResolver`。返回 `IdentitySql`：`operations`、`standing`、`governance`、`reservations`、`governanceRecovery`、`stop()` |
| `IdentitySqlResultUnknown`                                  | `src/result.ts`，经 `src/provider.ts` 导出 | 写入结果不能确定时拒绝 Promise 的错误类型（SPEC「失败」、IS-10）                                                                                                                                                                                                                                        |
| `LOGIN_IDENTIFIER_UTF8_LIMIT`、`CREDENTIAL_UTF8_LIMIT`      | `src/provider.ts`                          | IS-02 的输入上界，1024 与 4096 字节                                                                                                                                                                                                                                                                     |
| `identitySqlMaterials()`                                    | `src/materials.ts`                         | IS-01。参加者、迁移与读 handler 的描述，供应用聚合进材料目录                                                                                                                                                                                                                                            |
| `identitySqlCombination()`                                  | `src/materials.ts`                         | IS-01。参加者列表、组合版本、清单摘要                                                                                                                                                                                                                                                                   |
| `identitySqlRegistration()`                                 | `src/materials.ts`                         | IS-01。`registerCombination` 的请求值                                                                                                                                                                                                                                                                   |
| `IDENTITY_PARTICIPANT`、`IDENTITY_DOMAIN`、`IDENTITY_SCOPE` | `src/materials.ts`                         | IS-01。`'identity'`、`'system.identity'`、`{ kind: 'system' }`                                                                                                                                                                                                                                          |
| `randomIdentifiers()`、`IdentifierSource`                   | `src/identifiers.ts`                       | 标识来源。默认随机，测试注入                                                                                                                                                                                                                                                                            |
| `parseIdentitySqlConfig(value)`                             | `src/config.ts`                            | 配置校验。四个 `PT<秒>S` 文本，都必填、都大于零，默认邀请时长不长于最长时长，没有多余字段。不填入任何值（IS-15）                                                                                                                                                                                        |
| `IDENTITY_SQL_DEFAULT_CONFIG`                               | `src/config.ts`                            | 配置初值：登录 30 天与空闲 7 天，邀请默认 7 天、最长 30 天。供部署显式取用，校验不回退到它                                                                                                                                                                                                              |
| `constantLoginTerms(terms)`                                 | `src/config.ts`                            | 每次读答同一组期限的 `LoginTermsSource`                                                                                                                                                                                                                                                                 |
| `constantInvitationTerms(terms)`                            | `src/config.ts`                            | 每次读答同一组邀请时长的 `InvitationTermsSource`                                                                                                                                                                                                                                                        |

`./cordis` 入口：

| 导出                | 定义            | 行为条款                                                                                                                                                                                       |
| ------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentitySqlPlugin` | `src/cordis.ts` | [docs/cordis.md](cordis.md)。`inject: ['storage', 'identityClock']`，提供 `identityOperations`、`tenantStanding`、`identityGovernance`、`standingReservations` 与 `identityGovernanceRecovery` |

操作、读口与治理端口的输入输出类型归 [identity 根入口](../../identity/README_ZH.md)：`IdentityOperations`、`TenantStandingSource`、`IdentityGovernance`、`IdentityClock`、`LoginTermsSource`、`InvitationTermsSource` 与各结果联合。存储类型归 [sql-contract](../../../storage/sql-contract/SPEC.md)。scrypt 类型归 [scrypt](../../scrypt/README_ZH.md)。

预留及恢复行为见 [SPEC IS-16](../SPEC.md#is-16)，公开端口定义归 [identity reservations](../../identity/src/reservations.ts) 与 [governance](../../identity/src/governance.ts)。成员变更的未知错误带 `operation`，用原发起账号的当前有效登录调用 `governanceRecovery.resume` 认回；最终变更仍检查原登录。
