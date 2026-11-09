# 设置行

`settings` 行把 Settings 的秘密设置项交给装配：发行工具设置定义的登记表、`@omne-harness/settings` 的秘密项入口（`createSettingsSecretItems`），以及受准入的设置管理。它提供受信服务 `settingsSecretItems`，形状是 server-entry 的 `SettingsGovernance` 端口，只有 `server-entry` 行按调用读取。声明与秘密项的含义归 [Settings 的秘密设置项](../../../../packages/assets/settings/SPEC.md#secret-items)，工具设置声明的投影归 [tool-contract](../../../../packages/tool/tool-contract/SPEC.md)（`toolSettingDefinitions`）。本行不持有秘密，不读使用面。

## 配置与装载

本行没有运维者值；发行层写空对象。行声明：提供 `settingsSecretItems`，`inject` 受信 `settingsSecretCustody`，生命周期 `none`。准入按调用读受信 `principalVerifier` 与 `tenantStanding`，与 `model-credential` 行相同：缺席时管理答 `basis-unavailable`，行不停在 `PENDING`。

## 登记跟随发行

本行不自己读工具的设置声明。一个发行工具的定义（含 `declarations.settings`）只在 `tool-host` 行装好它的作者之后为本进程所知（`releaseDefinitionOf`，由装载器在核对定义摘要后保留）。本行在每次读登记表时对照受信发行快照的条目：已知而未登记的定义经 `toolSettingDefinitions({ adoption: 发行采用, name, declaration })` 投影，`registerContribution` 登记，并记下持有身份 `{ providerId, definitionId }`。不声明设置的工具记为无设置；登记表拒绝或投影抛出的工具记一次 warn（记录器 `settings`），不再重试。登记表容量是发行清单的条目数。行撤除时关闭登记表。

所以 `omne setting list` 在 `tool-host` 预装完成之前列不出 Web 的项，预装之后的第一次读就列出。这是「登记在发行装载之后」的实际含义：本行不猜作者什么时候装好，也不复制一份声明。

## 持有身份与键

秘密项入口的 `resolve` 从本行记下的持有身份回答：资产 `{ category: 'tool', name }`，持有 `{ providerId, definitionId }`，与 `toolSettingDefinitions` 的投影一致（`providerId` 是 `tool:` 前缀加采用 owner 的单射转义，`definitionId` 是工具名）。绑定键的目标由持有身份加项标识编码：`{ owner: 'setting', key: JSON.stringify([providerId, definitionId, itemId]) }`，用途 `setting`。`src/rows/settings/holding.ts` 是本应用内唯一写这个编码的地方：本行用它推出持有身份，`tool-bindings` 行的 Web 附着用它读同一个绑定。Settings 自己的编码在它的 `secret-items.ts` 里不导出；`tests/rows/settings/settings.spec.ts` 经入口写、经这把键读，证明两者相等。

## 准入与范围

每次调用先做准入（`src/rows/authorization/settings-access.ts`）：只有代该租户行事的登录主体可以管理，经 authorization 的租户准入（AU-11，`requires` 为空）；会话工作主体、系统主体、他租户的登录主体与伪造的主体一律 `denied`，不碰保管。通过后写入与读取的范围恒为行事租户的租户范围：公开操作没有通往官方范围或使用面的路径。官方范围只有运维者的本机路径能写，本行不提供。

## 结果映射

| 入口的答案 | `set` | `clear` | `describe` | `list` |
| --- | --- | --- | --- | --- |
| `written` / `removed` | `succeeded`（`configuredAt` 是本次写入的宿主时刻） | `succeeded` | — | — |
| `absent` | — | `no-change` | — | — |
| `not-written` | `basis-unavailable` | `basis-unavailable` | — | — |
| `unconfirmed` | `unknown` | `unknown` | — | — |
| `denied` | `denied` | `denied` | `denied` | `denied` |
| `unavailable` / `conflict` | — | — | `basis-unavailable` / `conflict` | `basis-unavailable` |
| `undeclared` | `not-visible` | `not-visible` | `not-visible` | — |
| `not-secret` | `not-writable` | `not-writable` | `not-writable` | 列出，`state` 为 `not-writable` |
| 有无 `unbound` / `bound` | — | — | `unbound`；`usable`、`revoked`、`unreadable` 按 `life`，带 `tenantId` 与保管记录的 `configuredAt` | 同左 |

`set` 的文本先经 `parseSecretText`：空白、控制字符或超长的文本答 `not-writable`，什么都不写。这里取 `not-writable` 而不是 `basis-unavailable`，因为重试同一文本不会成功，运维者也不必查保管库。

## 验证入口

`tests/rows/settings/settings.spec.ts`：登记跟随已知定义；写后读的键相等；范围只在租户层；准入四种拒绝与依据不可得；非秘密文本、未声明项与未知资产写不进；一个 `serve` 树里的行声明与受信键。`tests/rows/server-entry/settings.spec.ts`：按调用现取与缺席答 `basis-unavailable`。端到端在慢层 `tests/rows/tool-runtime/web-settings-e2e.spec.ts`。

```sh
cd apps/harness-server && NO_COLOR=1 pnpm exec vitest run --mode fast tests/rows/settings tests/rows/server-entry/settings.spec.ts
```
