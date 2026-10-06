# @omne-harness-lite/session-log-jsonl

A local JSONL provider for the three operations in session-log v3: conditional batch append, read by an opaque key, and read after a position. Each batch occupies one line. Payloads pass the core strict, lossless JSON boundary; the provider does not interpret Run records, model responses, or business keys.

The package root exports `checkAppendInput`, `judgeAppend`, `emptyLogState`, `foldCommit`, `encodeCommitLine`, `decodeLogBytes`, `commitFormatVersion`, `indexFoldVersion`, `openJsonlSessionLog`, `defaultSessionLogPolicy`, and the policy, option, diagnostic and process-ownership types. These functions and the owner closure do not resolve Cordis. `./plugin` exports `Config`, `sessionLogJsonl`, and its default plugin export. The `sessionLog` service has exactly `append`, `readByKey`, and `readSince`; `close` belongs to the physical owner.

## Pure components

The representation check copies and freezes accepted input. Its `ok` value can be passed to the pure judge; supplying a state does not establish that it is the current authoritative state of a real log. Logical positions and attempts use core `JsonNumber`, including `LosslessNumber`, without floating-point comparison.

```ts
import assert from 'node:assert/strict'
import {
  checkAppendInput,
  emptyLogState,
  judgeAppend,
  encodeCommitLine,
  decodeLogBytes,
} from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('example-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  readKeys: ['example-record'],
  payload: { text: 'Hello' },
}], { kind: 'unfenced' }, { kind: 'tailEquals', tail: 0 })
if ('failure' in checked) throw new Error('invalid example input')
const decision = judgeAppend(emptyLogState(), checked.ok)
assert.deepEqual(decision, { positions: [1], tail: 1 })
const bytes = encodeCommitLine({ v: 1, session: checked.ok.session, first: 1, entries: checked.ok.entries })
const decoded = decodeLogBytes(bytes, checked.ok.session)
assert.ok(!('failure' in decoded))
assert.equal(decoded.commits.length, 1)
```

## Real files, idempotency, and tail conflicts

`append(session, entries, fence, condition)` requires all four arguments. Use an explicit `unfenced` or `fenced` value, and an explicit `unconditional` or `tailEquals` value. A missing argument is `invalidInput`; the provider does not supply a three-argument compatibility default.

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAppendInput, openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('example-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  dedupeKey: 'example-record', readKeys: ['example-record'], payload: { text: 'Hello' },
}], { kind: 'unfenced' }, { kind: 'unconditional' })
if ('failure' in checked) throw new Error('invalid example input')
const { session, entries, fence, condition } = checked.ok
// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-example-'))
const owner = await openJsonlSessionLog({ dir, processOwnership, policy: { appendQueueLimit: 8, residentLogsLimit: 4 } })
try {
  assert.deepEqual(await owner.readSince(session, 0), { entries: [], tail: 0 })
  assert.deepEqual(await owner.append(session, entries, fence, condition), { positions: [1], tail: 1 })
  assert.deepEqual(await owner.append(session, entries, fence, condition), { failure: 'alreadyRecorded', keys: ['example-record'] })
  const fresh = [{ ...entries[0], tenant: entries[0]?.tenant, dedupeKey: 'fresh', readKeys: [], payload: null }]
  const freshInput = checkAppendInput(session, fresh, fence, { kind: 'tailEquals', tail: 0 })
  if ('failure' in freshInput) throw new Error('invalid example input')
  assert.deepEqual(await owner.append(session, freshInput.ok.entries, fence, freshInput.ok.condition), { failure: 'tailChanged', tail: 1 })
  const original = await owner.readByKey(session, 'example-record')
  if ('failure' in original) throw new Error('read unavailable')
  assert.deepEqual(original.entries[0]?.payload, { text: 'Hello' })
} finally {
  await owner.close()
  await rm(dir, { recursive: true, force: true })
}
```

Legal requests are judged in the order `tenantMismatch`, `attemptSuperseded`, `alreadyRecorded`, then `tailChanged`. Each rejection confirms that this request wrote no business entries. `alreadyRecorded` reports colliding keys; it does not equate the old payload with the proposed batch. `unavailable` means no confirmed answer or submission and may leave an earlier operation unknown. A later conflict cannot establish that an earlier unknown request did not commit.

`readSince(session, 0)` returns the complete dense confirmed prefix and its tail from one snapshot. `readByKey` returns only matching entries; its tail does not turn those entries into a complete prefix. Reading a never-written session creates no session directory. Payloads and returned snapshots are owned immutable exchange values. Core opaque JSON wrappers are accepted through their public copying boundary; domain validation remains the receiver's responsibility.

## Healthy close and reopen

Await `close` before transferring physical ownership. Closing stops new and old references, rejects queued work that has not started, waits for actual writes, reads and repairs, closes all handles, and releases the root lock last. There is no write, confirmation, or close timeout. A rejected or still-pending close does not establish transfer; a host deadline cannot detach the old file task.

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkAppendInput, openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const checked = checkAppendInput('reopen-session', [{
  tenant: { organization: 'example-organization', account: 'example-account' },
  dedupeKey: 'stable', readKeys: ['stable'], payload: ['kept', { original: true }],
}], { kind: 'unfenced' }, { kind: 'unconditional' })
if ('failure' in checked) throw new Error('invalid example input')
// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-reopen-'))
const first = await openJsonlSessionLog({ dir, processOwnership })
try {
  assert.deepEqual(await first.append(checked.ok.session, checked.ok.entries, checked.ok.fence, checked.ok.condition), { positions: [1], tail: 1 })
} finally { await first.close() }
const second = await openJsonlSessionLog({ dir, processOwnership })
try {
  const read = await second.readByKey(checked.ok.session, 'stable')
  if ('failure' in read) throw new Error('read unavailable')
  assert.equal(read.tail, 1)
  assert.equal(read.entries[0]?.position, 1)
  assert.deepEqual(read.entries[0]?.payload, ['kept', { original: true }])
} finally {
  await second.close()
  await rm(dir, { recursive: true, force: true })
}
```

## Cordis plugin

Install Cordis 4.0.4 explicitly for this entry. The plugin has no injected services or business events. Configuration is checked before service publication. One owner cleanup effect drains the physical provider; Cordis manages the service registration separately. Cordis logs cleanup errors, so a resolved `fiber.dispose()` alone is not evidence that a failed provider close released the lock.

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { checkAppendInput } from '@omne-harness-lite/session-log-jsonl'
import { sessionLogJsonl } from '@omne-harness-lite/session-log-jsonl/plugin'

// Create once at physical process startup; reuse across every open and fiber.
const processOwnership = {
  current: `example-physical-life:${randomUUID()}`,
  async observeExit(): Promise<'unknown'> { return 'unknown' },
}
const dir = await mkdtemp(join(tmpdir(), 'omne-session-log-plugin-'))
const ctx = new Context()
const fiber = await ctx.plugin(sessionLogJsonl, { dir, processOwnership })
try {
  const service = ctx.get('sessionLog')
  if (service === undefined) throw new Error('service unavailable')
  const checked = checkAppendInput('plugin-session', [{
    tenant: { organization: 'example-organization', account: 'example-account' },
    readKeys: [], payload: { plugin: true },
  }], { kind: 'unfenced' }, { kind: 'unconditional' })
  if ('failure' in checked) throw new Error('invalid example input')
  assert.deepEqual(await service.append(checked.ok.session, checked.ok.entries, checked.ok.fence, checked.ok.condition), { positions: [1], tail: 1 })
} finally {
  await fiber.dispose()
  await rm(dir, { recursive: true, force: true })
}
```

## Storage and deployment boundaries

`dir` is required and absolute. Defaults are `appendQueueLimit: 64` and `residentLogsLimit: 256`; both are configurable positive integers, with no measured optimality claim. Queue capacity includes the active append. Residency is bounded, with idle LRU eviction; when all residents are busy, a new log is unavailable. An optional `diagnostic` callback receives only bounded stage/count fields and a session hash, plus recovery source and owner observation state, never payloads, bare paths, raw errors, credentials, or business key text.

`diagnostic(event): void` is a borrowed synchronous output. Exceptions thrown by that callback are isolated at the callback boundary: they cannot change a confirmed append, hide healthy history, interrupt recovery or prevent actual cleanup. Real IO and internal defects retain their own failure behavior; successful close still requires physical cleanup before releasing the lock. The host owns the sink and must record its output failures and coverage gaps independently (SYS-OBSERVABILITY.C5), including failures of the default Cordis logger. This package does not send failures back through the same failing sink, turn diagnostics into durable business records, or add background retries. Promise-returning asynchronous sinks have no completion or health contract on this synchronous port; the host must own their execution and failure handling.

Only one physical owner may use a root. A pinned SQLite handle holds `.owner-lock` exclusively; SQLite's own journal files may also appear. SQLite stores no log business state. Each session uses its SHA-256 directory with `entries.jsonl`, a derived `index.jsonl`, and the strict `recovery.json` marker (plus at most one `.next` temporary). Success follows batch `datasync` and the initial necessary directory syncs. Deployment requires Linux local filesystems that honor the adopted sync, stable-byte and lock premises; process-kill tests do not prove machine-power-loss durability or atomicity with another database.

Healthy opening uses the derived index and catches up its suffix. Missing, structurally invalid, incomplete or incompatible indexes are rebuilt from entries. Index content correctness retains the adopted same-fold-version/no-external-rewrite premise: a structurally valid index that omits a dedupe key can permit a duplicate, as the explicit V1 counterexample demonstrates. An index write failure warns without changing an already-confirmed batch.

**Recovery and migration:** D085 adds a durable per-session `recovery.json` gate. The provider establishes `active` before any business file mutation, and writes `clean` only after real tasks and handles stop and the derived index is safe. Healthy close/LRU preserves the normal index path. Untrusted logs keep `active`; same-process reopening is unavailable even after close releases the lock. A different owner needs trustworthy confirmation of the recorded physical process exit before a byte-zero recovery scan. Lock acquisition, fiber disposal, PID lookup and a kill request cannot establish exit.

`processOwnership` is mandatory trusted local construction input for both the closure and plugin configuration. Its `current` identifies one actual physical process lifetime, is captured immutably, and must remain identical across all its opens and fiber restarts. `observeExit(owner)` returns `exited`, `alive`, or `unknown`; exceptions and invalid returns are unknown. The examples generate an identity once at process startup and conservatively return unknown for historical owners. They demonstrate healthy use, not a production process observer. A supervisor can retain actual child-exit evidence; its own restart must leave unrecognized history unknown. This production host obligation (RG-G1) remains open.

Directories from an older writer have no formal marker and require explicit `observeLegacyExit(dir)` evidence that every old physical writer has exited. A missing callback refuses migration. Stop old admission, drain all writers, confirm their actual physical exit, migrate four-argument append callers, and install the new host port before opening old data. Damaged formal markers stay unavailable and do not enter legacy migration; stale `recovery.json.next` is never authority. Old writers cannot safely reopen the new layout. `@omne-harness-lite/model-request-runtime` consumes this provider's SL3 operations through the public root; this package does not interpret its records.

Source adoption: [SL3](../../../.meta_harness/design/spec/capabilities/session-log/v3/contract.md), D083, [D084 projection](../../../.meta_harness/design/realization/packages/session/session-log-jsonl/v3-design.md), and [D085 recovery projection](../../../.meta_harness/design/realization/packages/session/session-log-jsonl/v3-recovery-design.md). Run interpretation, common business key codecs, legal read authority, consumer retry policies and stopping all old business writers remain their respective owners' responsibilities.

The model-data regression (`tests/model-data.spec.ts`) round-trips the MS6 reply and MR9 response fixtures, which the current `messages` and `model-response` judges still admit, including the response-owned input calibration, through append and reopen. The log stores JSON values without interpreting calibration or repairing business-invalid payloads; model consumers own those judgments.
