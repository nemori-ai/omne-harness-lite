# 公开接口导航

本文件导航本包的公开边界：导出入口、调用者资格、接口定义索引，以及输入输出与失败行为的定位。精确类型与运行时校验归公开源码，非类型行为的唯一正文是 [SPEC.md](../SPEC.md)。不手写第二套签名。

## 导出入口

- `.`：`src/index.ts`。只有类型（`src/types.ts`）与三个纯函数 `combinationManifest`、`manifestDigest`、`inputDigestV2`。不导入 Cordis。
- `./worker`：`src/worker.ts`。参加者、迁移与读 handler 模块的接口，以及 `SqlValue`、`QueryRows`。只有类型。
- `./cordis`：`src/cordis.ts`。`StorageService`、`StorageHostService`、`TenantDomainsService` 与各自的键常量，并增补 `Context`。
- `./testing`：`src/testing/index.ts`。`createMemorySqlStorage` 与 `runSqlStorageConformance`。

调用者资格：SQL 操作不携带主体，调用 SQL 的领域入口负责授权。

## 定义索引

- 身份、提交、认回、登记与读取的结果类型：`src/types.ts`，行为条款见 [SPEC.md](../SPEC.md) 的「结果与不变量」。
- 材料、清单与组合问题：`src/types.ts`；组合有效性与清单摘要的行为见 SPEC。
- 关闭控制口与宿主接口（`StorageControl`、`StorageHost`、`CloseLeasePort`）：`src/types.ts`。关闭行为在 #687 第二段写入提供者规格。
- 目录形状（`TenantDomain`、`TenantDomainAccess`、`TenantDomains`）：`src/types.ts`。目录实现不在本包。
- API 快照：`api/`，由 `pnpm run contract:api` 生成。
