# @omne-harness-lite/identity-values

[English](README.md)

提供身份值类型、严格解析、相等比较、租户规范序列化、组织上级关系谓词，以及签名交接凭证。组件之间可以显式传递身份，无需运行时 Context 或数据库。

## Workspace 使用

这是实验阶段的私有 workspace 包，目前未发布到 npm。在仓库检出中按[开发指南](../../../docs/development.md)准备环境并构建 workspace，消费成员声明 `"@omne-harness-lite/identity-values": "workspace:*"`，示例直接导入的其他包也应声明为直接依赖。通过公开包入口导入，不穿透兄弟包的 `src/`。

## 公开 API

| 公开 API                                                                                                      | 用途                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `parseAccountId`、`parseOrganizationId`、`parseLoginStateId`、`parseLoginIdentifier`、`parseOpaqueIdentifier` | 校验并建立不透明字符串的品牌类型，返回 `Parsed<T>` |
| `parseTenantId`、`tenantIdEquals`、`toCanonicalJson`                                                          | 显式的 `(organization, account)` 身份与稳定 JSON   |
| `parseScopeLayerIdentity`、成员效力及角色解析器                                                               | 闭合的组织／租户范围与成员值形状                   |
| `ancestorChain`、`shareAncestor`、`sameAccountDistinctTenants`                                                | 基于调用方提供的值与上级快照进行纯判定             |
| `handoffWarrant` 及单独导出的凭证函数                                                                         | Ed25519 密钥加载、签发与核实                       |
| `validate`、`schemaId`、`SCHEMA_DEF_NAMES`；`./schema`                                                        | 内置身份 Schema 校验及 JSON 资源                   |
| `generateOpaqueIdentifier`                                                                                    | 随机标识候选；唯一性仍由存储兑现                   |

## 使用示例

每个 TypeScript 示例独立完整，使用构建后的公开导出。

### 解析并比较租户身份

```ts
import {
  isOk,
  parseTenantId,
  tenantIdEquals,
  toCanonicalJson,
} from '@omne-harness-lite/identity-values'

const first = parseTenantId({ organization: 'org_1', account: 'acct_1' })
const second = parseTenantId({ account: 'acct_1', organization: 'org_1' })
if (!isOk(first) || !isOk(second)) throw new Error('invalid tenant input')
console.log(tenantIdEquals(first.ok, second.ok)) // true
console.log(toCanonicalJson(first.ok)) // {"organization":"org_1","account":"acct_1"}

const invalid = parseTenantId({ organization: 'org_1', account: 'acct_1', role: 'member' })
if ('invalidInput' in invalid) console.log('rejected extra member')
```

### 从显式快照读取上级关系

```ts
import {
  ancestorChain,
  parseOrganizationId,
  shareAncestor,
  unwrap,
} from '@omne-harness-lite/identity-values'

const root = unwrap(parseOrganizationId('root'))
const child = unwrap(parseOrganizationId('child'))
const parentOf = (id: typeof root) => (id === child ? root : id === root ? null : 'unavailable')
console.log(ancestorChain(child, parentOf)) // { ok: ['root'] }
console.log(shareAncestor(child, root, parentOf)) // { ok: true }
console.log(ancestorChain(child, () => 'unavailable')) // { failure: 'unavailable' }
```

此例只对已知合法的字面值使用 `unwrap`。外部输入应显式处理 `invalidInput`。

### 签发并核实交接凭证

```ts
import { handoffWarrant, parseAccountId, unwrap } from '@omne-harness-lite/identity-values'

const account = unwrap(parseAccountId('acct_1'))
const other = unwrap(parseAccountId('acct_2'))
const pem = handoffWarrant.generateKeyPair()
const signing = handoffWarrant.loadSigningKey(pem.privateKeyPem)
const verification = handoffWarrant.loadVerificationKey(pem.publicKeyPem)
if (!('ok' in signing) || !('ok' in verification)) throw new Error('invalid key configuration')
const warrant = handoffWarrant.issue(signing.ok, 'activation', account)
console.log(handoffWarrant.verify(verification.ok, 'activation', account, warrant)) // ok
console.log(handoffWarrant.verify(verification.ok, 'activation', other, warrant)) // invalid
console.log(handoffWarrant.verify(verification.ok, 'purge', account, warrant)) // invalid
```

示例生成临时密钥。部署需提供并持久保存自己的 PEM 密钥；激活与清除分别使用独立密钥对。

## 边界与失败处理

解析器返回 `{ ok }` 或 `{ invalidInput }`，不会裁剪、做 Unicode 规范化、折叠大小写、推断缺失分量或接受未知枚举值。`unwrap` 遇非法输入会抛异常。Schema 校验只检查表示，不能证明授权成立或成员资格有效。

租户身份是值，没有生成的标量租户键，也不包含角色。上级关系读取遇到问题返回 `unavailable` 或 `cycle`，不会返回截断链。快照一致性、租户隔离与当前授权判定归调用方。随机标识不能替代唯一约束。凭证绑定用途与账号，不带有效期、撤销或尝试号；核实通过不能证明其他领域事实。

## 开发

```sh
pnpm --filter @omne-harness-lite/identity-values run build
pnpm --filter @omne-harness-lite/identity-values run typecheck
pnpm --filter @omne-harness-lite/identity-values run test
```

先构建 workspace 依赖。这些检查覆盖本包；组合行为需针对实际消费者与提供者验证。
