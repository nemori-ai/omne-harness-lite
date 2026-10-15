# @omne-harness/scrypt

[中文](README_ZH.md)

Bounded scrypt for a later login or credential change. The identity package stores the opaque material and does not parse it.

## Responsibility and status

This package derives and checks password material. It does not log in, store accounts, or hold keys. PanQiWei accepted the contract on #276 and placed the member at `packages/identity/scrypt`. The accepted load is `SCRYPT_PROFILE`. Tests ran on Node v26.0.0. The declared engines stay `>=24.18.0 <25`.

## Usage

Call `openScrypt` with an explicit profile. `SCRYPT_PROFILE` is the accepted one. There is no Cordis entry.

```ts
import { SCRYPT_PROFILE, openScrypt } from '@omne-harness/scrypt'

const opened = openScrypt(SCRYPT_PROFILE)
if (!opened.ok) throw new Error(opened.code)
const started = opened.module.derive('correct horse battery', () => ({ ok: true }))
if (!('done' in started)) throw new Error(started.code)
const derived = await started.done
await opened.module.close()
```

`close` rejects new work, drops work still queued, and waits for a hash that already started.

## Contracts

Behavior that the types do not state is in [SPEC.md](SPEC.md). A refused policy or an illegal profile does not call scrypt. `mismatch` means the password is wrong or the scheme is not `scrypt`. `unavailable` means the material is damaged, over the current budget, or the computation failed. Stopping a wait does not free a running slot.

## Design

`openScrypt` owns the running count, the sum of derived memory, and the queue. `planAdmission` decides `run`, `queue`, `memory_limit`, or `queue_full` from those counts. `hashScrypt` calls Node `crypto.scrypt` with `maxmem` set to `128 * r * (N + p + 2)`.

## Configuration and operation

Pass a complete `ScryptProfile`. A missing field, a zero, or a non-finite number makes `openScrypt` return `invalid_profile`. The accepted profile uses N = 131072, r = 8, p = 1, a 32-byte key, a 16-byte salt, one running hash, and four queued hash jobs. Password length rules stay in the function the caller passes.

## Verification

Run `pnpm --filter @omne-harness/scrypt test`. The RFC 7914 vector and one accepted-profile round trip use real Node scrypt. Queue and cancel tests use a held compute function. This package has no login journey test.

## Maintenance

A change to the material text, the admission counts, or `SCRYPT_PROFILE` updates SPEC.md and `tests/scrypt.spec.ts`. Login and credential storage are later consumers. They are not implemented here.
