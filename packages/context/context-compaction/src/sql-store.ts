import { randomUUID } from 'node:crypto'
import {
  decodeCompactionTaskRef,
  encodeCompactionTaskRef,
  type CompactionFailure,
  type CompactionReply,
  type CompactionTaskRef,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import type { CompactionRecord, CompactionStore } from './provider.ts'
import { decodeRecord, encodeRecord } from './record-codec.ts'
import { digest } from './evidence.ts'
import { COMPACTION_SQL_DOMAIN, compactionSqlRegistration } from './sql-materials.ts'
import { contentOf, decodeRecordManifest, type RecordManifest } from './sql-content.ts'

function unavailable(diagnostic: string) {
  return fail<CompactionFailure>({
    kind: 'unavailable',
    dependency: 'compaction-storage',
    diagnostic,
  })
}
function keyOf(ref: CompactionTaskRef) {
  const tenant = tenantCodec.encode(ref.tenant)
  return tenant.ok
    ? succeed({ key: digest([ref.authority, tenant.value, ref.task]), tenant: tenant.value })
    : fail<CompactionFailure>({
        kind: 'invalid',
        field: 'tenant',
        reason: 'invalid tenant identity',
      })
}
function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readTaskValue(storage: SqlStorage, input: JsonValue): CompactionReply<JsonValue> {
  const result = await storage.read({
    domain: COMPACTION_SQL_DOMAIN,
    handler: 'context.compaction.tasks.read',
    protocol: '1',
    requestKey: randomUUID(),
    input,
  })
  return result.kind === 'read'
    ? succeed(result.output)
    : unavailable(`read ${JSON.stringify(result)}`)
}
function taskContent(
  storage: SqlStorage,
  combination: ReturnType<typeof compactionSqlRegistration>,
  ref: CompactionTaskRef,
  tenant: string,
) {
  return contentOf(
    {
      read: input => readTaskValue(storage, input),
      async write(facts, key) {
        const identity = {
          ...COMPACTION_SQL_DOMAIN,
          operation: 'context.compaction.content',
          protocolVersion: '2' as const,
          operationKey: digest([tenant, key]),
        }
        const committed = await storage.commit({
          identity,
          combinationVersion: combination.combinationVersion,
          manifestDigest: combination.manifestDigest,
          commands: [{ participant: 'context.compaction.tasks', facts }],
        })
        const result = committed.kind === 'unknown' ? await storage.query(identity) : committed
        if (result.kind === 'committed') return succeed(undefined)
        if (result.kind === 'unknown' || result.kind === 'not_recallable')
          return fail({ kind: 'commit-unknown', ref, operation: identity.operationKey })
        return unavailable(`content write ${result.kind}`)
      },
    },
    tenant,
  )
}

export async function createCompactionSqlStore(
  storage: SqlStorage,
): CompactionReply<CompactionStore> {
  const combination = compactionSqlRegistration()
  const registered = await storage.registerCombination(combination)
  if (registered.kind !== 'registered') return unavailable(`registration ${registered.kind}`)
  const readValue = (input: JsonValue) => readTaskValue(storage, input)
  const content = (ref: CompactionTaskRef, tenant: string) =>
    taskContent(storage, combination, ref, tenant)
  type Stored = Readonly<{ record: CompactionRecord | null; manifest: RecordManifest | null }>
  async function readStored(ref: CompactionTaskRef): CompactionReply<Stored> {
    const key = keyOf(ref)
    if ('failure' in key) return key
    const found = await readValue({ key: key.ok.key })
    if ('failure' in found) return found
    if (found.ok === null) return succeed({ record: null, manifest: null })
    if (typeof found.ok !== 'string') return unavailable('invalid stored record')
    const manifest = decodeRecordManifest(found.ok)
    if ('failure' in manifest) return manifest
    const loaded = await content(ref, key.ok.tenant).load(manifest.ok)
    if ('failure' in loaded) return loaded
    const record = decodeRecord(loaded.ok)
    return 'failure' in record ? record : succeed({ record: record.ok, manifest: manifest.ok })
  }

  const store: CompactionStore = {
    async read(ref) {
      const found = await readStored(ref)
      return 'failure' in found ? found : succeed(found.ok.record)
    },
    async change(ref, decide) {
      const key = keyOf(ref)
      if ('failure' in key) return key
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const loaded = await readStored(ref)
        if ('failure' in loaded) return loaded
        const prior = loaded.ok.record
        const decided = decide(prior)
        if ('failure' in decided) return decided
        const { record, value } = decided.ok
        if (record === null) return succeed(value)
        const encoded = encodeRecord(record)
        if ('failure' in encoded) return encoded
        const previous = prior === null ? null : encodeRecord(prior)
        if (previous !== null && 'failure' in previous) return previous
        if (previous !== null && previous.ok === encoded.ok) return succeed(value)
        const expected = prior?.state.revision ?? null
        if (record.state.revision !== (BigInt(expected ?? '0') + 1n).toString())
          return fail({ kind: 'invalid', field: 'revision', reason: 'not the next revision' })
        const reference = encodeCompactionTaskRef(record.state.ref)
        if ('failure' in reference) return unavailable('invalid task reference')
        const saved = await content(ref, key.ok.tenant).save(encoded.ok, loaded.ok.manifest)
        if ('failure' in saved) return saved
        const identity = {
          ...COMPACTION_SQL_DOMAIN,
          operation: 'context.compaction.change',
          protocolVersion: '2' as const,
          operationKey: digest([key.ok.key, expected, encoded.ok]),
        }
        const committed = await storage.commit({
          identity,
          combinationVersion: combination.combinationVersion,
          manifestDigest: combination.manifestDigest,
          commands: [
            {
              participant: 'context.compaction.tasks',
              facts: {
                key: key.ok.key,
                authority: ref.authority,
                tenant: key.ok.tenant,
                task: ref.task,
                digest: ref.requestDigest,
                expected,
                revision: record.state.revision,
                live: record.state.phase === 'pending' || record.state.physical !== 'settled',
                reference: reference.ok,
                record: JSON.stringify(saved.ok),
              },
            },
          ],
        })
        const result = committed.kind === 'unknown' ? await storage.query(identity) : committed
        if (result.kind === 'committed') return succeed(value)
        if (result.kind === 'unknown' || result.kind === 'not_recallable')
          return fail({ kind: 'commit-unknown', ref, operation: identity.operationKey })
        if (result.kind === 'rolled_back' && result.responses.at(-1)?.reply.kind === 'conflict')
          continue
        if (result.kind === 'not_committed') continue
        if (result.kind === 'identity_conflict') return fail({ kind: 'conflict', ref })
        return unavailable(
          `write ${result.kind}${result.kind === 'rejected_before_accept' ? `: ${result.reason}` : ''}`,
        )
      }
      return fail({
        kind: 'capacity',
        diagnostic: 'concurrent compaction changes exceeded retry allowance',
      })
    },
    async pending(input) {
      const page = await readValue(input)
      if ('failure' in page) return page
      if (!Array.isArray(page.ok)) return unavailable('invalid pending page')
      const refs: CompactionTaskRef[] = []
      let next: string | null = null
      for (const [index, item] of page.ok.entries()) {
        if (!isRecord(item) || typeof item.reference !== 'string' || typeof item.key !== 'string')
          return unavailable('invalid pending item')
        if (index === input.limit) break
        const decoded = decodeCompactionTaskRef(item.reference)
        if ('failure' in decoded) return unavailable('invalid pending reference')
        refs.push(decoded.ok)
        next = item.key
      }
      return succeed({ refs, next: page.ok.length > input.limit ? next : null })
    },
  }
  return succeed(store)
}
