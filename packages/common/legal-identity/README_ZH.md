# @omne-harness/legal-identity

[English](README.md)

合法身份值的 module 包。它解析、编码和比较账号、组织、登录状态、租户和范围层身份，并把已解析的组织与账号组合成租户。

## 职责与状态

本成员拥有合法身份文本、相等判断、租户组合，以及唯一的 `IDENTITY_TYPE_NAMES`。位置 `packages/common/legal-identity` 是共同组说明里已经采用的目标。

Issue #243 实现了公开入口。入口包含五个 codec、五个相等函数、`tenant()` 和 `IDENTITY_TYPE_NAMES`。共同组说明把本成员记为已实现。精确文本归本页。

解析成功不表示对象存在、成员有效或授权允许该操作。账号注册、认证、凭证、成员关系、角色、授权、时钟和 session 行为归各自的拥有者。本包不导入 JSON 读取器、数据库、Cordis、身份服务，也不导入两棵 legacy 树。

## 使用

调用方用包名导入公开入口。依赖为空。本包没有 Cordis 入口。

```ts
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('not a legal identity')

const pair = tenant(organization.value, account.value)
tenantCodec.encode(pair)
// { ok: true, value: '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}' }
```

| 导出 | 用途 |
| --- | --- |
| `accountCodec`、`organizationCodec`、`loginStateCodec`、`tenantCodec`、`scopeLayerCodec` | 每个 codec 是一个家族的 `{ parse, encode }` |
| `accountEquals`、`organizationEquals`、`loginStateEquals`、`tenantEquals`、`scopeLayerEquals` | 按值比较同一家族的两个值 |
| `tenant(organization, account)` | 组合一个已解析的组织和一个已解析的账号 |
| `IDENTITY_TYPE_NAMES` | 五个身份类型名，供静态检查使用 |

`files` 只发布 `dist`。根导出把 `source` 写在 `types` 前面。`source` 指向 `src/index.ts`，`types` 和 `import` 指向 `dist`。这个形状归[产品包组织](../../../docs/package-organization.md)。`build` 先删除 `dist` 再编译。`tsconfig.build.json` 打开 `erasableSyntaxOnly`。

## 契约

语义来源是共同组说明和已接受的 #221 设计。本节写下本包实现的精确文本形式和失败码。共同组说明没有写出三个前缀。前缀来自已接受的 #221 草图。

每个 `parse` 和 `encode` 都返回结果，不抛出。成功是 `{ ok: true, value }`。失败是 `{ ok: false, error: { kind: 'identity-text-error', code } }`。解析不 trim，也不折叠大小写。

原子身份是家族前缀加 26 个字符，字符取自 `0123456789abcdefghjkmnpqrstvwxyz`。字母表里没有 `i`、`l`、`o`、`u`。

| 类型 | 前缀 |
| --- | --- |
| `AccountId` | `acc_` |
| `OrganizationId` | `org_` |
| `LoginStateId` | `lgn_` |

原子解析按下面的顺序检查。第一个不通过的检查决定失败码。

1. 不是字符串的值得到 `type`。
2. 空文本得到 `lexicon`。
3. 首字符或末字符是空格、制表符或换行符，得到 `whitespace`。
4. 含有 `A` 到 `Z` 的任一字符，得到 `case`。
5. 文本不以该家族的前缀开头，得到 `family`。例如 `a` 得到 `family`，账号文本按组织解析也得到 `family`。
6. 正文长度不对，或含有字母表以外的字符，得到 `lexicon`。

租户文本是一个 JSON 对象，成员只能是 `organization` 和 `account`。

1. 输入不是字符串、文本不是 JSON、值是 `null`、数组或其他非对象，得到 `type`。
2. 缺少 `organization` 或 `account`，得到 `missing-member`。
3. 有其他成员，例如 `role`，得到 `extra-member`。
4. 每个成员必须是本家族的合法文本，失败码沿用原子解析。

租户编码先写 `organization`，再写 `account`。键重复时，`JSON.parse` 保留最后一个值。本包不拒绝重复键。

范围层文本有两种形式。

- `{"layer":"organization","organization":"<组织文本>"}`
- `{"layer":"tenant","tenant":{"organization":"<组织文本>","account":"<账号文本>"}}`

范围层解析按下面的顺序检查。

1. 输入不是字符串、文本不是 JSON、值是 `null`、数组或其他非对象，得到 `type`。
2. 缺少 `layer`，得到 `missing-member`。
3. `layer` 不是 `organization` 或 `tenant`，得到 `family`。`session`、`workspace`、`account`、`factoryDefault` 都属于这种情况。
4. 对象的成员只能是 `layer` 和与层同名的成员。缺少成员得到 `missing-member`。有其他成员得到 `extra-member`。
5. `organization` 成员按原子规则解析。`tenant` 成员按租户文本规则解析，所以不是对象的租户得到 `type`。

只有 `parse` 和 `tenant()` 产生合法值。值是带 `name` 字段的冻结普通数据。手写的 `{ name: 'AccountId', text }` 这类对象仍可能通过类型检查，因为已接受的设计没有编译期品牌。运行时 `encode` 对这类对象返回 `type`，每个相等函数都返回 `false`。另一家族的值得到同样的结果。

`tenant()` 的参数必须依次是已解析的组织和已解析的账号，否则抛出 `TypeError`。它不解析文本，也没有角色参数。租户不含角色，所以角色变化不能改变租户。

同一文本解析两次得到两个对象。该家族的相等函数对它们返回 `true`。`IDENTITY_TYPE_NAMES` 依次是 `AccountId`、`OrganizationId`、`LoginStateId`、`TenantId`、`ScopeLayerIdentity`。`LoginIdentifier` 是账号属性，不是身份类型名。

## 设计

`src/index.ts` 是唯一的模块。`ACCOUNT_SPEC`、`ORGANIZATION_SPEC` 和 `LOGIN_STATE_SPEC` 各有 `name` 和 `prefix`。`IDENTITY_SPECS` 先放这三行，再放 `TenantId` 行，再放 `ScopeLayerIdentity` 行。后两行只有 `name`。带 `prefix` 的行是原子身份。`IDENTITY_TYPE_NAMES` 按这张表的行序得出，三个原子 codec 从各自的 spec 读取前缀。新增原子家族就是新增一行，不是新增一处前缀判断。

模块私有的 `WeakSet` 登记 `parse` 或 `tenant()` 返回的每个值。`encode`、相等函数和 `tenant()` 只接受登记过、且 `name` 是预期家族的值。每个值先冻结再登记，所以登记过的值不能改变家族或文本。`WeakSet` 不延长值的生命周期。#221 没有采用唯一符号品牌，所以这份登记是唯一的铸造检查。

租户解析和范围层解析共用一份 JSON 对象成员检查。租户层按租户规则解析内层租户。`parseTenantValue` 调用 `mintTenant`。范围层的租户分支调用 `parseTenantValue`。`mintTenant` 冻结租户并登记它。它不抛出。`tenant()` 先拒绝未铸造的参数，再调用 `mintTenant`。

## 配置与运行

本包不读环境变量，也不创建账号、凭证、时钟或进程。

铸造登记属于已加载的一份模块。值经过 JSON、结构化克隆、worker 消息或另一个进程后，不再带有登记。安装的第二份本包不接受第一份产生的值。要跨这些边界传递值，调用方发送编码后的文本，在另一侧重新解析。

## 验证

适用的测试是单元测试和从公开入口做的契约测试。测试用包名导入本包。包名解析到 `dist/index.js`，所以这些测试同时检查构建产物能被独立消费。集成测试和端到端旅程不适用。本包没有存储、身份服务或用户旅程。Session 和授权的测试留在各自的拥有者。

| 文件 | 覆盖 |
| --- | --- |
| `tests/atomic-identity.spec.ts` | 往返、`family`、`lexicon`、`case`、`whitespace`、重新解析后相等，以及手写或错家族的值 |
| `tests/tenant.spec.ts` | `tenant()`、租户文本、`role`、缺成员、非对象输入、重新解析后相等，以及手写租户 |
| `tests/scope-layer.spec.ts` | 组织层和租户层、被拒绝的层名、内层租户规则、相等，以及手写范围层 |
| `tests/identity-type-names.spec.ts` | 名单本身，以及 `LoginIdentifier` 不在名单里 |
| `tests/codec-variance.spec-d.ts` | 把 `accountCodec` 赋给账号与组织联合类型的 codec 是类型错误 |

在本目录运行 `pnpm test`。它先构建 `dist`，再运行测试。运行 `pnpm typecheck` 按源码类型检查测试。

测试不覆盖对手写对象的类型层禁止，因为已接受的设计允许它们通过类型检查。测试也不覆盖重复 JSON 键，以及同时加载两份本包的情况。

## 维护

已点名的消费者是 `packages/identity/identity`、`packages/session/session`，以及 `tools/repo-toolchain` 的 `identity-shapes`。该检查从本包导入 `IDENTITY_TYPE_NAMES`。#220 接收 `{ parse, encode }` 这一对，不导入解析实现文件。

新增原子家族时，先声明它的 spec 常量，把这一行放进 `IDENTITY_SPECS`，再加它的类型、codec、相等函数和测试。这项修改也会改变 `IDENTITY_TYPE_NAMES`，所以要同步 `identity-shapes` 的拥有者。修改前缀、字母表、失败码或检查顺序都会改变公开契约。修改前先同步已点名的消费者和共同组说明。
