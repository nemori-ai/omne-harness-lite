# @omne-harness-lite/credential-verification-scrypt

[中文](README_ZH.md)

A password credential provider based on Node scrypt. It exposes parsing, derivation, verification and configurable password policy checks through the public credential interface.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/credential-verification-scrypt": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                     | Purpose                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `createPasswordCredentials`, `parseCredential`                             | Independent credential service and presentation parsing |
| `CredentialVerificationConfig`, `ScryptParameters`, `DerivationParameters` | Strict derivation configuration and parameter types     |
| `PASSWORD_SCRYPT_SCHEME`                                                   | Encoded credential scheme identifier                    |
| `PasswordPolicy`, `CHARACTER_CLASSES`, `CharacterClass`                    | Password policy schema and character classes            |
| `./cordis`: `credentialsPlugin`, `managedCredentialsPlugin`                | Independent and assembly-managed bindings               |

## Example

```ts
import assert from 'node:assert/strict'
import { isOk } from '@omne-harness-lite/identity-values'
import {
  createPasswordCredentials,
  CredentialVerificationConfig,
} from '@omne-harness-lite/credential-verification-scrypt'

const credentials = createPasswordCredentials(CredentialVerificationConfig.parse({}))
const parsed = credentials.parse('documentation-example')
assert.ok(isOk(parsed))
const material = await credentials.derive(parsed.ok)
if (material === 'unavailable') throw new Error('Credential derivation unavailable')
assert.equal(await credentials.verify(material, parsed.ok), 'match')
```

The example runs two scrypt computations with the package defaults. It does not print the credential or stored material. Account acceptance also requires a separate policy check.

## Boundaries and lifecycle

Defaults are cost `2**17`, block size `8`, parallelization `1`, a 16-byte salt and a 32-byte key. Configuration validation rejects invalid or excessive parameter combinations. Derivation settings are not password policy.

Stored material carries its derivation parameters. Verification reads those parameters rather than silently adopting a replacement provider’s defaults. Unknown schemes report mismatch. Computation failures report unavailable.

Scrypt work does not become cancellable when a plugin stops. Managed close waits for actual owned computation. This provider does not store accounts or authorize tenants. See [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/credential-verification-scrypt run build
pnpm --filter @omne-harness-lite/credential-verification-scrypt run typecheck
pnpm --filter @omne-harness-lite/credential-verification-scrypt run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

Tests exercise scrypt and policy outcomes. Available thread-pool and memory resources affect computation time.

## Related packages

- [Public credential definitions](../../core/account-identity/README.md)
