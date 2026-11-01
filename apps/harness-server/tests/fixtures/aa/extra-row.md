# 应用装配（夹具）

## 插件树

下表是最小发行层。

| 行 id | 成员与插件 | 提供 | 必需（`inject`） |
| --- | --- | --- | --- |
| `storage` | 存储 | 存储服务 | 无 |
| `identity` | 身份 | 登录 | `storage` |
| `extra-row` | 额外 | 无 | 无 |
| `server-entry` | 入口 | 接入 | `identity` |

### 受信子树

| 行 id | 可见的受信名 |
| --- | --- |
| `storage` | `storage`、`tenantDomainLookup` |

## 缺口与承接者

| 行 id | 说明 |
| --- | --- |
| `not-a-row` | 本表不是插件树 |
