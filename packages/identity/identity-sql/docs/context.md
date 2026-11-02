# 使用与定位

本文件说明消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的位置。它引用系统架构与真实消费者，不成为新的架构源。

## 使用方式

最小有效示例见 [README_ZH.md「使用」](../README_ZH.md#使用)。调用方要做四件事：

1. 把 `identitySqlMaterials()` 的参加者、迁移与读 handler 聚合进存储提供者的材料目录。目录由应用装配构造（[sql-contract §4.2](../../../storage/sql-contract/SPEC.md)）。
2. 在第一次操作之前调用 `storage.registerCombination(identitySqlRegistration())`。登记幂等，重启后再调用得到同一登记。
3. 打开 scrypt 模块并派生假材料，连同 `storage`、时钟与期限源交给 `createIdentitySql`。
4. 用完后先 `stop()`，再关闭 scrypt 模块。存储的关闭归装配。

经 Cordis 使用时，`IdentitySqlPlugin` 做第 2 至 4 件事，调用方只做第 1 件，并给插件两个时长的配置。

## 消费者与定位

| 消费者                                           | 怎样使用                                                           | 状态                             |
| ------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------- |
| `apps/harness-server` 的 `identity` 行（APP-4b） | 装入 `IdentitySqlPlugin`，把 `identitySqlMaterials()` 交给材料聚合 | 等 DP-1 的行注册表形状           |
| authorization 行                                 | 经 `tenantStanding` 键读当前资格                                   | 只认识 identity 的键，不认识本包 |
| 服务端入口与会话建立                             | 经 `identityOperations` 键注册、签发与识别                         | 只认识 identity 的键，不认识本包 |

```text
identity（契约：类型、ID-16、ID-17、服务键）
   ▲ 实现
identity-sql（本包）──▶ scrypt（口令派生）
   │ 经 storage 键
   ▼
sql-contract（SqlStorage）◀── sqlite-provider（Worker、文件、WAL）
```

本包在 identity 能力组里，是组内唯一接触介质的成员。它只依赖契约与提供者的公开入口，不依赖 `packages/storage/**` 的内部。依赖方向沿[分层与依赖](../../../../docs/architecture/layers-and-dependencies.md)：契约成员 identity 不依赖本包，应用依赖本包。
