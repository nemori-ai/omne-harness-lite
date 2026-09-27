# @omne-harness-lite/identity-values

[中文](README_ZH.md)

Identity value types, strict parsers, equality, canonical tenant serialization, organization ancestry predicates, and signed handoff warrants. Use this package to carry explicit identities between components without a runtime context or database.

## Workspace use

This is an experimental, private workspace package, currently not published on npm. In a repository checkout, use the [development setup](../../../docs/development.md), build the workspace, and declare `"@omne-harness-lite/identity-values": "workspace:*"` in the consuming member. Declare other packages imported by an example as direct dependencies too. Import through the public package entry; do not import sibling `src/` paths.

## Public API

| Public API                                                                                                    | Purpose                                                           |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `parseAccountId`, `parseOrganizationId`, `parseLoginStateId`, `parseLoginIdentifier`, `parseOpaqueIdentifier` | Validate and brand opaque strings; return `Parsed<T>`             |
| `parseTenantId`, `tenantIdEquals`, `toCanonicalJson`                                                          | Explicit `(organization, account)` identity and stable JSON       |
| `parseScopeLayerIdentity`, membership/role parsers                                                            | Closed organization/tenant scopes and membership value shapes     |
| `ancestorChain`, `shareAncestor`, `sameAccountDistinctTenants`                                                | Pure predicates over caller-supplied values and a parent snapshot |
| `handoffWarrant` and individual warrant functions                                                             | Ed25519 key loading, signing and verification                     |
| `validate`, `schemaId`, `SCHEMA_DEF_NAMES`; `./schema`                                                        | Bundled identity Schema validation and JSON resource              |
| `generateOpaqueIdentifier`                                                                                    | Random identifier candidate; storage still enforces uniqueness    |

## Examples

Each TypeScript example is self-contained and uses the built public exports.

### Parse and compare tenant identities

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

### Read ancestry from an explicit snapshot

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

`unwrap` is used only for the known literals in this example. Branch on `invalidInput` for external input.

### Issue and verify a handoff warrant

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

The example creates temporary keys. Deployments must supply and retain their own PEM keys; use separate key pairs for activation and purge.

## Boundaries and failures

Parsers return `{ ok }` or `{ invalidInput }`; they do not trim, normalize Unicode, fold case, infer missing components, or admit unknown enum values. `unwrap` throws on invalid input. Schema validation checks representation, not authorization or membership effectiveness.

Tenant identity is a value, without a generated scalar tenant key or role component. Ancestry reads fail with `unavailable` or `cycle` rather than returning a truncated chain. The caller owns snapshot consistency, tenant isolation and current authorization checks. Identifier generation does not replace a unique constraint. Warrants bind purpose and account but have no expiry, revocation or attempt number; successful verification does not establish other domain facts.

## Development

```sh
pnpm --filter @omne-harness-lite/identity-values run build
pnpm --filter @omne-harness-lite/identity-values run typecheck
pnpm --filter @omne-harness-lite/identity-values run test
```

Build workspace dependencies first. These checks cover this package; integration behavior requires the actual consumer and provider.
