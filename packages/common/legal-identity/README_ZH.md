# @omne-harness/legal-identity

[English](README.md)

合法身份值的 module 包。它解析、编码和比较账号、组织、登录状态、工作区、租户和范围层身份，并把已解析的组织与账号组合成租户。它还发布行事作用域，说明一次动作的事实归谁，以及契约成员共用的唯一一份 `Access<P>` 定义。

## 职责与状态

本成员拥有合法身份文本、相等判断、租户组合，以及唯一的 `IDENTITY_TYPE_NAMES`。它也拥有 `ActingScope` 和 `Access<P>`。位置 `packages/common/legal-identity` 是共同组说明里已经采用的目标。

Issue #243 实现了公开入口，当时包含五个 codec、五个相等函数、`tenant()` 和 `IDENTITY_TYPE_NAMES`。Issue #659 新增 `ActingScope` 及其构造函数、codec 和相等函数，以及 `Access<P>` 及其构造函数。依据是 #638 的 2026-10-23 决定记录：两种主体形式、唯一一份 `Access<P>`、空租户不可表达。Issue #679 新增 `WorkspaceId` 家族及其 codec 和相等函数。依据是 #638 的 2026-10-23 决定记录第 J11 项。工作区领域拥有工作区身份的含义。本包拥有它的文本形式，作为合法身份的第六个家族。共同组说明把本成员记为已实现。精确文本归本页。

解析成功不表示对象存在、成员有效或授权允许该操作。账号注册、认证、凭证、成员关系、角色、授权、时钟和 session 行为归各自的拥有者。工作区的存在、参与和关联归工作区契约。本包不导入 JSON 读取器、数据库、Cordis、身份服务，也不导入两棵 legacy 树。

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
| `accountCodec`、`organizationCodec`、`loginStateCodec`、`workspaceCodec`、`tenantCodec`、`scopeLayerCodec` | 每个 codec 是一个家族的 `{ parse, encode }` |
| `accountEquals`、`organizationEquals`、`loginStateEquals`、`workspaceEquals`、`tenantEquals`、`scopeLayerEquals` | 按值比较同一家族的两个值 |
| `tenant(organization, account)` | 组合一个已解析的组织和一个已解析的账号 |
| `IDENTITY_TYPE_NAMES` | 六个身份类型名，供静态检查使用 |
| `ActingScope` | 一次动作的事实归谁：`{ kind: 'tenant', tenant }` 或 `{ kind: 'system' }` |
| `tenantScope(tenant)`、`systemScope()` | 构造两种作用域。租户作用域需要已解析的租户 |
| `actingScopeCodec`、`actingScopeEquals` | 行事作用域的 `{ parse, encode }` 和按值比较 |
| `Access<P>` | 一次调用的访问依据：`Readonly<{ principal: P; tenant: TenantId }>`。契约成员再导出它 |
| `access(principal, tenant)` | 用主体和已解析的租户构造访问依据 |

`files` 只发布 `dist`。根导出把 `source` 写在 `types` 前面。`source` 指向 `src/index.ts`，`types` 和 `import` 指向 `dist`。这个形状归[产品包组织](../../../docs/package-organization.md)。`build` 先删除 `dist` 再编译。`tsconfig.build.json` 打开 `erasableSyntaxOnly`。

## 契约

语义来源是共同组说明和已接受的 #221 设计。本节写下本包实现的精确文本形式和失败码。共同组说明写出了 `acc_`、`org_`、`lgn_`，它们来自已接受的 #221 草图。`wsp_` 来自 #679 的决定，共同组说明还没有写出它。

每个 `parse` 和 `encode` 都返回结果，不抛出。成功是 `{ ok: true, value }`。失败是 `{ ok: false, error: { kind: 'identity-text-error', code } }`。解析不 trim，也不折叠大小写。

原子身份是家族前缀加 26 个字符，字符取自 `0123456789abcdefghjkmnpqrstvwxyz`。字母表里没有 `i`、`l`、`o`、`u`。

| 类型 | 前缀 |
| --- | --- |
| `AccountId` | `acc_` |
| `OrganizationId` | `org_` |
| `LoginStateId` | `lgn_` |
| `WorkspaceId` | `wsp_` |

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

行事作用域文本有两种形式。

- `{"kind":"system"}`
- `{"kind":"tenant","tenant":{"organization":"<组织文本>","account":"<账号文本>"}}`

行事作用域解析按下面的顺序检查。

1. 输入不是字符串、文本不是 JSON、值是 `null`、数组或其他非对象，得到 `type`。
2. 缺少 `kind`，得到 `missing-member`。
3. `kind` 不是 `system` 或 `tenant`，得到 `family`。
4. `system` 对象只能有 `kind`。`tenant` 对象只能有 `kind` 和 `tenant`。缺少成员得到 `missing-member`。有其他成员得到 `extra-member`。带 `tenant` 成员的 `system` 对象得到 `extra-member`。
5. `tenant` 成员按租户文本规则解析。

没有空租户或缺省租户的形式。类型没有第三个变体，系统变体没有 `tenant` 成员，所以类型检查器拒绝 `{ kind: 'tenant' }` 和 `{ kind: 'system', tenant }`。

`tenantScope()` 的参数必须是已解析的租户，否则抛出 `TypeError`。`systemScope()` 返回唯一的冻结系统作用域。两个系统作用域相等。两个租户作用域在 `tenantEquals` 判定租户相等时相等。

`Access<P>` 是 `Readonly<{ principal: P; tenant: TenantId }>`。`P` 没有约束：装配选择主体类型，本包不判断它。`access()` 的 `tenant` 必须是已解析的租户，否则抛出 `TypeError`。它原样保留主体并冻结结果。`access()` 成功不证明主体可信。主体拥有者的核验器负责这件事。

`parse` 和 `tenant()` 产生 `IDENTITY_TYPE_NAMES` 所列六个身份家族的合法值。这些值是带 `name` 字段的冻结普通数据。`ActingScope` 值使用 `kind` 字段，没有 `name` 字段。它们由 `actingScopeCodec.parse`、`tenantScope()` 和 `systemScope()` 构造。手写的 `{ name: 'AccountId', text }` 这类对象仍可能通过类型检查，因为已接受的设计没有编译期品牌。运行时 `encode` 对这类对象返回 `type`，每个相等函数都返回 `false`。另一家族的值得到同样的结果。

`tenant()` 的参数必须依次是已解析的组织和已解析的账号，否则抛出 `TypeError`。它不解析文本，也没有角色参数。租户不含角色，所以角色变化不能改变租户。

同一文本解析两次得到两个对象。该家族的相等函数对它们返回 `true`。`IDENTITY_TYPE_NAMES` 依次是 `AccountId`、`OrganizationId`、`LoginStateId`、`WorkspaceId`、`TenantId`、`ScopeLayerIdentity`。`LoginIdentifier` 是账号属性，不是身份类型名。

## 设计

`src/index.ts` 是唯一的模块。`ACCOUNT_SPEC`、`ORGANIZATION_SPEC`、`LOGIN_STATE_SPEC` 和 `WORKSPACE_SPEC` 各有 `name` 和 `prefix`。`IDENTITY_SPECS` 先放这四行，再放 `TenantId` 行，再放 `ScopeLayerIdentity` 行。后两行只有 `name`。带 `prefix` 的行是原子身份。`IDENTITY_TYPE_NAMES` 按这张表的行序得出，四个原子 codec 从各自的 spec 读取前缀。新增原子家族就是新增一行，不是新增一处前缀判断。

模块私有的 `WeakSet` 登记 `parse` 或 `tenant()` 返回的每个值。`encode`、相等函数和 `tenant()` 只接受登记过、且 `name` 是预期家族的值。每个值先冻结再登记，所以登记过的值不能改变家族或文本。`WeakSet` 不延长值的生命周期。#221 没有采用唯一符号品牌，所以这份登记是唯一的铸造检查。

租户解析和范围层解析共用一份 JSON 对象成员检查。租户层按租户规则解析内层租户。`parseTenantValue` 调用 `mintTenant`。范围层的租户分支调用 `parseTenantValue`。`mintTenant` 冻结租户并登记它。它不抛出。`tenant()` 先拒绝未铸造的参数，再调用 `mintTenant`。

## 配置与运行

本包不读环境变量，也不创建账号、凭证、时钟或进程。

铸造登记属于已加载的一份模块。值经过 JSON、结构化克隆、worker 消息或另一个进程后，不再带有登记。安装的第二份本包不接受第一份产生的值。要跨这些边界传递值，调用方发送编码后的文本，在另一侧重新解析。

## 验证

适用的测试是单元测试和从公开入口做的契约测试。测试用包名导入本包。包名解析到 `dist/index.js`，所以这些测试同时检查构建产物能被独立消费。集成测试和端到端旅程不适用。本包没有存储、身份服务或用户旅程。消费者和授权的测试留在各自的拥有者。

| 文件 | 覆盖 |
| --- | --- |
| `tests/atomic-identity.spec.ts` | 往返、`family`、`lexicon`、`case`、`whitespace`、重新解析后相等，以及手写或错家族的值 |
| `tests/tenant.spec.ts` | `tenant()`、租户文本、`role`、缺成员、非对象输入、重新解析后相等，以及手写租户 |
| `tests/scope-layer.spec.ts` | 组织层和租户层、被拒绝的层名、内层租户规则、相等，以及手写范围层 |
| `tests/identity-type-names.spec.ts` | 名单本身，以及 `LoginIdentifier` 不在名单里 |
| `tests/codec-variance.spec-d.ts` | 把 `accountCodec` 赋给账号与组织联合类型的 codec 是类型错误 |

在仓库根运行 `pnpm turbo run test --filter=@omne-harness/legal-identity`。turbo 先构建 `dist`，再运行测试。本目录里的 `pnpm test` 不构建。运行 `pnpm turbo run typecheck --filter=@omne-harness/legal-identity` 按源码类型检查测试。

`tests/acting-scope.spec.ts` 覆盖两种作用域、文本形式及其失败码、相等，以及手写作用域。`tests/acting-scope.spec-d.ts` 核对没有租户的租户作用域、带租户的系统作用域和第三种 kind 都是类型错误。`tests/access.spec.ts` 覆盖 `access()` 对已解析租户和手写租户的处理。`tests/access.spec-d.ts` 核对没有租户的访问依据是类型错误，以及这份定义恰为 `Readonly<{ principal: P; tenant: TenantId }>`。`tests/public-entry.spec.ts` 列出导出，所以这份清单的差异就是一次修改新增了什么。

测试不覆盖对手写对象的类型层禁止，因为已接受的设计允许它们通过类型检查。测试也不覆盖重复 JSON 键，以及同时加载两份本包的情况。`Access<P>` 没有需要比对的副本：`agent-contract`、`tool-contract`、`model-contract`、`execution-environment-contract`、`request-context-contract` 再导出本包的定义。

## 维护

包清单声明依赖本包的消费者是：agent 组的 `agent-contract`、`agent-cordis-contract`、`agent`；context 组的 `request-context-contract`、`runtime-context-contract`、`runtime-context-cordis-contract`；execution 组的 `execution-environment-contract`、`execution-environment`、`execution-environment-host-local`；model 组的 `model-contract`、`model-cordis-contract`、`model`、`model-host-local`；tool 组的 `tool-contract`、`tool-cordis-contract`；以及 `tools/product-checks` 的 `identity-shapes` 检查。该检查从本包导入 `IDENTITY_TYPE_NAMES`。`packages/identity/identity` 与 `packages/identity/authorization` 自 #659 起声明依赖本包。`packages/session/session` 在设计上点名使用本包，它的包清单没有声明依赖。各自写过 `Access<P>` 的契约成员（`agent-contract`、`tool-contract`、`execution-environment-contract`、`model-contract`、`request-context-contract`）是这份共用定义的消费者；改成再导出归它们各自的交付。#220 接收 `{ parse, encode }` 这一对，不导入解析实现文件。现在没有成员导入 `workspaceCodec`。第一个消费者是 `tool-contract` 的 `SourceLayer.workspace` 分支，该迁移归 #675。

新增原子家族时，先声明它的 spec 常量，把这一行放进 `IDENTITY_SPECS`，再加它的类型、codec、相等函数和测试。这项修改也会改变 `IDENTITY_TYPE_NAMES`，所以要同步 `identity-shapes` 的拥有者。修改前缀、字母表、失败码或检查顺序都会改变公开契约。修改前先同步已点名的消费者和共同组说明。
