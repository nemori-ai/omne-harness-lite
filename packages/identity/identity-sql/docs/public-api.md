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

| 导出                                                        | 定义                 | 行为条款                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createIdentitySql(input)`                                  | `src/provider.ts`    | SPEC IS-02 至 IS-07。输入是 `IdentitySqlInput`：`storage`、`clock`、`terms`、`scrypt`、`decoyMaterial`，可选 `identifiers`。返回 `IdentitySql`：`operations`、`standing`、`stop()` |
| `IdentitySqlResultUnknown`                                  | `src/provider.ts`    | 写入结果不能确定时拒绝 Promise 的错误类型（SPEC「失败」）                                                                                                                          |
| `LOGIN_IDENTIFIER_UTF8_LIMIT`、`CREDENTIAL_UTF8_LIMIT`      | `src/provider.ts`    | IS-02 的输入上界，1024 与 4096 字节                                                                                                                                                |
| `identitySqlMaterials()`                                    | `src/materials.ts`   | IS-01。参加者、迁移与读 handler 的描述，供应用聚合进材料目录                                                                                                                       |
| `identitySqlCombination()`                                  | `src/materials.ts`   | IS-01。参加者列表、组合版本、清单摘要                                                                                                                                              |
| `identitySqlRegistration()`                                 | `src/materials.ts`   | IS-01。`registerCombination` 的请求值                                                                                                                                              |
| `IDENTITY_PARTICIPANT`、`IDENTITY_DOMAIN`、`IDENTITY_SCOPE` | `src/materials.ts`   | IS-01。`'identity'`、`'system.identity'`、`{ kind: 'system' }`                                                                                                                     |
| `randomIdentifiers()`、`IdentifierSource`                   | `src/identifiers.ts` | 标识来源。默认随机，测试注入                                                                                                                                                       |
| `parseIdentitySqlConfig(value)`                             | `src/config.ts`      | 配置校验。两个 `PT<秒>S` 文本，都大于零，没有多余字段                                                                                                                              |
| `IDENTITY_SQL_DEFAULT_CONFIG`                               | `src/config.ts`      | 配置初值，30 天与 7 天                                                                                                                                                             |
| `constantLoginTerms(terms)`                                 | `src/config.ts`      | 每次读答同一组期限的 `LoginTermsSource`                                                                                                                                            |

`./cordis` 入口：

| 导出                | 定义            | 行为条款                                                                                          |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `IdentitySqlPlugin` | `src/cordis.ts` | [docs/cordis.md](cordis.md)。`inject: ['storage']`，提供 `identityOperations` 与 `tenantStanding` |

操作与读口的输入输出类型归 [identity 根入口](../../identity/README_ZH.md)：`IdentityOperations`、`TenantStandingSource`、`IdentityClock`、`LoginTermsSource` 与各结果联合。存储类型归 [sql-contract](../../../storage/sql-contract/SPEC.md)。scrypt 类型归 [scrypt](../../scrypt/README_ZH.md)。
