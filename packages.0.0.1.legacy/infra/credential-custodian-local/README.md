# credential-custodian-local

Local, encrypted model credential replicas for a single account's machine instance. This package implements the D075 model-only projection described by its public owner: two restricted technical actions and one owned lifetime. It has no Cordis service, OAuth/MCP setup, sweep loop or generic six-operation provider.

The current behavior and future limits are in [SPEC](SPEC.md). Verification duties are in [verification](verification/README.md). Local tests use real SQLite and key files with a named binding-reader fixture. Real directory, identity, bootstrap and runtime integration belongs to assembly verification. Generic and OAuth operations remain unimplemented.

The public root exports `sealBody`, `openBody` and their context/result types. `./migrations` exports `replicaMigrations`: the base replica table/index, followed by a nullable `source_ref` addition. Existing rows keep their original ciphertext, login and timestamp; the migration assigns no source. Compose these owner fragments using `core/storage`'s `composeMigrations`, with the real directory's migration fragments in the same storage instance. Production migration confirmation belongs to the storage owner.

`./model-replica` exports the asynchronous `createModelReplicaCustodian(options)` and public types. Supply the same `AtomicStorage`, a borrowed `Clock`, an absolute key path, the real directory `createCredentialBindingReader(storage)` closure, and synchronous `ReplicaDiagnostics` ports. The key must already be an ordinary 32-byte file with permissions exactly `0600`; it is checked and read through one file handle at startup and on every operation. A missing key fails startup and is never generated. The component checks replica migration readiness before returning.

The assembly constructs one component and owns `close()`. Its trusted bootstrap may call `storeBoundReplica` with a verified login/tenant and a source/body pair. Directory P-1r only borrows `readBoundReplicaIn`, inside the same live storage unit. Ordinary runtime callers obtain credentials through the directory. These subpaths are an integration boundary, with call-site guards supplied by the assembly; they do not isolate hostile code in the same process.

Bodies are owned, nonempty `Uint8Array` values. The component does not infer an encoding or an OpenRouter key. Storage encrypts them using AES-256-GCM and an independent 12-byte nonce. The sealed format is `version[1] | nonce[12] | ciphertext | tag[16]`. Version 1 uses the legacy tenant context; version 2 authenticates both tenant and source. AAD segments have four-byte big-endian byte lengths and UTF-16LE content, preserving exact opaque identifiers, including lone surrogates. Moving ciphertext to another tenant, changing its source, or tagging a legacy ciphertext as current cannot produce a successful bound read. Key and ciphertext theft together is outside the declared protection.

The following independent example uses only public sealing primitives:

```ts
import { randomBytes } from 'node:crypto'
import { sealBody, openBody } from '@omne-harness-lite/credential-custodian-local'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'

const tenant = unwrap(parseTenantId({ organization: 'example-org', account: 'example-account' }))
const key = randomBytes(32)
const context = { kind: 'replica', tenant, sourceRef: 'example-source' } as const
const body = Uint8Array.of(0, 255, 128, 42)
const sealed = sealBody(key, context, body, randomBytes(12))
const opened = openBody(key, context, sealed)
if ('unopenable' in opened) throw new Error('example authentication failed')
if (!opened.body.every((byte, i) => byte === body[i])) throw new Error('example body changed')
key.fill(0)
opened.body.fill(0)
```

This owner-level example accepts dependencies already provisioned by a trusted assembly. It publishes a source/body pair and closes its own component; real callers must use the one shared assembly instance when P-1r is running.

```ts
import {
  createModelReplicaCustodian,
  type ModelReplicaOptions,
  type StoreBoundReplicaInput,
} from '@omne-harness-lite/credential-custodian-local/model-replica'

export async function publishOnce(options: ModelReplicaOptions, input: StoreBoundReplicaInput) {
  const owner = await createModelReplicaCustodian(options)
  try {
    return await owner.storeBoundReplica(input)
  } finally {
    await owner.close()
  }
}
```

Store results are exactly `{ stored: true, tenant }`, `{ stored: false }`, or `{ failure: 'invalidInput' | 'custodianWithdrawn' | 'unavailable' }`. Only binding absence/drift yields `stored:false`; success follows actual atomic commit. Unexpected unique/reference/defect errors keep their class, with values and causes removed after atomic termination. No implicit retry occurs.

The borrowed read only returns `{ body }` or `{ absent:true }`. It verifies a live unit and the same storage, and requires current binding, expected reference and stored source to match. It never reads the clock. Internal bad input/misused units are `StorageDefect`; key/closed-component/storage unavailability escapes `unit.run` as `StorageUnavailable`. Even a catching caller cannot commit a poisoned unit. The outer atomic owner must wait for termination before sanitizing errors or releasing a successful body to its consumer. An absent result is distinct from an unavailable error.

Close rejects new admission and waits for the component's actual in-flight work. Repeated calls share the same drain. It preserves the key, replica rows and directory bindings and does not close storage or clock. A participating read returning does not end its outer unit; that unit's owner remains responsible. Diagnostic events contain bounded stages, outcomes, tenant and `sourceMatch` only; no body/key/reference/ciphertext/cause. The assembly supplies correlation and retention and handles `sinkFailure`. Temporary key/plaintext buffers are cleared without claiming provable erasure of JS or OS memory.

The P-1r borrower selects and reads in one atomic unit. This example returns only after that unit commits; the reader functions come from the real shared assembly.

```ts
import type {
  ReadCredentialBindingIn,
  ReadBoundReplicaIn,
} from '@omne-harness-lite/credential-custodian-local/model-replica'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'

export async function readInP1r(
  storage: AtomicStorage,
  readBinding: ReadCredentialBindingIn,
  readReplica: ReadBoundReplicaIn,
  tenant: TenantId,
) {
  return storage.atomic(async unit => {
    const selected = await readBinding(unit, tenant)
    if ('absent' in selected) return { absent: true } as const
    return readReplica(unit, tenant, selected.binding.credentialRef)
  })
}
```

From the workspace, run `pnpm --filter @omne-harness-lite/credential-custodian-local run build`, `run typecheck` and `run test`. Tests cover cryptography, migration/source format, real file validation, storage failure classes and rollback, clock independence, two SQLite connections to one file, and actual drain. PostgreSQL, process-crash/receipt-loss recovery, full generic/OAuth operations and real identity/directory/runtime assembly are not implied by these tests. See [Chinese documentation](README_ZH.md).
