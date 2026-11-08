import {
  historicalBodyInterpretations,
  historicalBodyOperation,
  prepareHistoricalBody,
} from './history-body.ts'
import { adoptResultBody } from './ledger-result-uses.ts'
import { createHash } from 'node:crypto'
import { readHistoricalPlan } from './history-plan.ts'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type Adoption,
  type ToolFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import type { ResultPolicy, ToolMaterialFingerprint } from '@omne-harness/tool-contract/provider'
import type { ToolConfiguration, ToolLedgerPorts } from './construction.ts'
import type { ToolHistoryLedgerStore, ToolHistoryStoredRecord } from './history-store.ts'
import type {
  HistoricalMigrationProgress,
  HistoricalSourceFingerprint,
  HistoryMigrationRecord,
  ToolHistoryAuthority,
  ToolHistoryCopies,
  HistoricalSourceReader,
  ToolHistoryMigration,
} from './history-contract.ts'
import {
  judgeCallInput,
  judgeMutationInput,
  invalid,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { mintEvidence, nextRevision, sameFactValue } from './evidence.ts'
import { encodeToolMaterial } from './material-codec.ts'
import {
  historicalCopyPlan,
  historyObject,
  readHistoricalSource,
  currentPreparationRecords,
  type HistoricalSource,
} from './history-source.ts'
import { createMaterialReclaimer } from './ledger-material-reclaim.ts'
import { createLedgerTransactions } from './ledger-transactions.ts'
import { createLedgerMaterialCustody, sampleMaterialTime } from './ledger-material-custody.ts'
import {
  preserveResultChannels,
  activateResultChannels,
  type PreparedResultChannels,
} from './ledger-result-material.ts'
import { systemBodyPolicy } from './result-offloading.ts'
import { type Snapshot } from './ledger-decider.ts'
import type {
  LedgerWrite,
  LedgerRecord,
  LedgerCommit,
  LedgerCommitInput,
  ResultRecord,
  ToolLedgerStore,
} from './ledger-store.ts'

export type ToolHistoryMigrationOptions<P> = Readonly<{
  adoption: Adoption
  store: ToolHistoryLedgerStore
  authority: ToolHistoryAuthority<P>
  materials: NonNullable<ToolLedgerPorts<P>['materials']>
  copies: ToolHistoryCopies<P>
  sourceReader?: HistoricalSourceReader<P>
  resultPolicy: ResultPolicy<ContentBlock>
  configuration: Pick<
    ToolConfiguration,
    'ledgerCommitAttempts' | 'readResultArguments' | 'offloading'
  >
}>
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-history-migration', diagnostic })
const conflict = (operation: ToolOperationId) => fail({ kind: 'conflict' as const, operation })
const domainOf = (input: CallInput<unknown>) => ({
  kind: 'call' as const,
  tenant: input.tenant,
  call: input.call,
})
const keyOf = (operation: ToolOperationId) => `history-migration:${operation}`

function fingerprint(value: unknown): Outcome<ToolMaterialFingerprint, ToolFailure> {
  const encoded = encodeToolMaterial(value)
  return 'failure' in encoded ? encoded : succeed(encoded.ok.fingerprint)
}
function copyHistoryInput<T>(value: T): Outcome<T, ToolFailure> {
  const encoded = encodeToolMaterial(value)
  if ('failure' in encoded) return invalid('history', 'invalid-input')
  try {
    return succeed(structuredClone(value))
  } catch {
    return invalid('history', 'invalid-input')
  }
}
function journal(
  rows: readonly ToolHistoryStoredRecord[],
  operation: ToolOperationId,
): HistoryMigrationRecord | null {
  const value = rows.find(row => row.key === keyOf(operation))?.record
  if (
    !historyObject(value) ||
    value.kind !== 'history-migration' ||
    !historyObject(value.migration)
  )
    return null
  return value.migration as HistoryMigrationRecord
}
function sourceMatches(
  rows: readonly ToolHistoryStoredRecord[],
  source: HistoricalSourceFingerprint,
): boolean {
  const selected = source.keys.map(key => rows.find(row => row.key === key))
  if (selected.some(row => row === undefined)) return false
  const observed = fingerprint(selected)
  return 'ok' in observed && sameFactValue(observed.ok, source.value)
}

export function createToolHistoryMigration<P>(
  options: ToolHistoryMigrationOptions<P>,
): ToolHistoryMigration<P> {
  const { store, authority, materials, configuration } = options
  const commit = async (input: LedgerCommitInput): Promise<LedgerCommit> => {
    try {
      return await store.commit(input)
    } catch {
      return { kind: 'unknown', diagnostic: 'historical ledger commit is unconfirmed' }
    }
  }
  const entry = async (value: unknown) => {
    const parsed = judgeCallInput<P>(value, 'recover')
    if ('failure' in parsed) return parsed
    try {
      const qualified = await authority.qualify(parsed.ok)
      return 'failure' in qualified ? qualified : parsed
    } catch {
      return unavailable('maintenance authority failed')
    }
  }
  const read = async (input: CallInput<P>) => {
    try {
      const value = await store.read(domainOf(input))
      return value.kind === 'complete' ? succeed(value) : unavailable(value.diagnostic)
    } catch {
      return unavailable('historical ledger read failed')
    }
  }
  const inventory = async (input: CallInput<P>) => {
    try {
      return await options.copies.inventory(input)
    } catch {
      return unavailable('historical copy inventory failed')
    }
  }
  const inspect: ToolHistoryMigration<P>['inspect'] = async input => {
    const parsed = judgeMutationInput<P>(input, 'recover')
    if ('failure' in parsed) return parsed
    const allowed = await entry(parsed.ok)
    if ('failure' in allowed) return allowed
    const current = await read(parsed.ok)
    if ('failure' in current) return current
    const qualified = await entry(parsed.ok)
    if ('failure' in qualified) return qualified
    const known = journal(current.ok.records, parsed.ok.operation)
    return known === null
      ? invalid('operation', 'unknown-history-migration')
      : succeed(known.progress)
  }
  const plans: ToolHistoryMigration<P>['plans'] = async input => {
    const allowed = await entry(input)
    if ('failure' in allowed) return allowed
    const current = await read(allowed.ok)
    if ('failure' in current) return current
    const found = []
    for (const row of current.ok.records) {
      if (
        !row.key.startsWith('history-migration:') &&
        !(historyObject(row.record) && row.record.kind === 'history-migration')
      )
        continue
      const plan = readHistoricalPlan(row, allowed.ok, options.adoption)
      if ('failure' in plan) return plan
      found.push(plan.ok)
    }
    const qualified = await entry(allowed.ok)
    return 'failure' in qualified ? qualified : succeed(found)
  }
  const preview: ToolHistoryMigration<P>['preview'] = async input => {
    const fixed = copyHistoryInput(input.interpretations)
    if ('failure' in fixed) return fixed
    input = { ...input, interpretations: fixed.ok }
    const allowed = await entry(input)
    if ('failure' in allowed) return allowed
    const readback = await read(allowed.ok)
    if ('failure' in readback) return readback
    const decoded = readHistoricalSource(allowed.ok, readback.ok.records, options.resultPolicy)
    if (decoded.kind !== 'ready') return succeed(decoded)
    const interpretations = historicalBodyInterpretations(decoded.source, input.interpretations)
    if ('failure' in interpretations) return succeed({ kind: 'quarantined', reason: 'encoding' })
    const ordered = [...readback.ok.records].sort((a, b) => a.key.localeCompare(b.key))
    const value = fingerprint(ordered)
    if ('failure' in value) return value
    const source: HistoricalSourceFingerprint = {
      format: 'tool-ledger-pre-w3',
      tenant: allowed.ok.tenant,
      call: allowed.ok.call,
      revision: readback.ok.revision,
      keys: ordered.map(row => row.key),
      value: value.ok,
    }
    const copies = await inventory(allowed.ok)
    if ('failure' in copies) return copies
    if (copies.ok.unsealed.length > 0) return succeed({ kind: 'quarantined', reason: 'in-flight' })
    const plan = historicalCopyPlan(decoded.source, copies.ok.copies)
    if (plan === null) return succeed({ kind: 'quarantined', reason: 'ownership' })
    return succeed({
      kind: 'ready',
      source,
      results: decoded.source.results.map(result => ({
        result: result.result,
        body: result.value.original.kind === 'none' ? 'none' : 'finite-text',
        retainedCopies: plan.retained,
        releasedCopies: plan.cleanup.length,
      })),
    })
  }
  const apply: ToolHistoryMigration<P>['apply'] = async input => {
    const fixed = copyHistoryInput({ source: input.source, interpretations: input.interpretations })
    if ('failure' in fixed) return fixed
    input = { ...input, ...fixed.ok }
    const allowed = await entry(input)
    if ('failure' in allowed) return allowed
    const parsed = judgeMutationInput<P>(input, 'recover')
    if ('failure' in parsed) return parsed
    if (
      !Array.isArray(input.interpretations) ||
      !historyObject(input.source) ||
      input.source.format !== 'tool-ledger-pre-w3' ||
      !Array.isArray(input.source.keys) ||
      !input.source.keys.every(key => typeof key === 'string') ||
      new Set(input.source.keys).size !== input.source.keys.length
    )
      return invalid('source', 'history-preview-required')
    if (
      !sameFactValue(input.source.tenant, parsed.ok.tenant) ||
      input.source.call !== parsed.ok.call
    )
      return conflict(parsed.ok.operation)
    const identity = fingerprint({
      adoption: options.adoption,
      source: input.source,
      interpretations: input.interpretations,
    })
    if ('failure' in identity) return identity
    for (let attempt = 0; attempt < configuration.ledgerCommitAttempts; attempt += 1) {
      const current = await read(parsed.ok)
      if ('failure' in current) return current
      const known = journal(current.ok.records, parsed.ok.operation)
      if (known !== null) {
        if (!sameFactValue(known.input, identity.ok)) return conflict(parsed.ok.operation)
        if (known.progress.kind === 'cleaned') return succeed(known.progress)
        if (known.progress.kind === 'published') return cleanup(parsed.ok, known)
        if (known.progress.kind !== 'preparing') return conflict(parsed.ok.operation)
        return prepareAndPublish(parsed.ok, known)
      }
      if (
        !sourceMatches(current.ok.records, input.source) ||
        current.ok.records.length !== input.source.keys.length
      )
        return conflict(parsed.ok.operation)
      const decoded = readHistoricalSource(parsed.ok, current.ok.records, options.resultPolicy)
      if (decoded.kind !== 'ready')
        return invalid(
          'source',
          decoded.kind === 'quarantined' ? decoded.reason : 'already-current',
        )
      const interpreted = historicalBodyInterpretations(decoded.source, input.interpretations)
      if ('failure' in interpreted) return interpreted
      const originals = []
      for (const result of decoded.source.results) {
        const value = fingerprint(result.value)
        if ('failure' in value) return value
        originals.push({ result: result.result, value: value.ok })
      }
      const copies = await inventory(parsed.ok)
      if ('failure' in copies) return copies
      if (copies.ok.unsealed.length > 0) return invalid('source', 'in-flight')
      const plan = historicalCopyPlan(decoded.source, copies.ok.copies)
      if (plan === null) return invalid('source', 'ownership')
      const policy = systemBodyPolicy(configuration.offloading, configuration.readResultArguments)
      const migration: HistoryMigrationRecord = {
        operation: parsed.ok.operation,
        source: input.source,
        input: identity.ok,
        interpretations: input.interpretations,
        policies: decoded.source.results.map(result => ({ result: result.result, policy })),
        originals,
        cleanup: plan.cleanup,
        progress: { kind: 'preparing', operation: parsed.ok.operation, source: input.source },
      }
      const qualified = await entry(input)
      if ('failure' in qualified) return qualified
      const committed = await commit({
        domain: domainOf(parsed.ok),
        expected: current.ok.revision,
        revision: nextRevision(current.ok.revision),
        writes: [{ kind: 'put', record: { kind: 'history-migration', migration } }],
      })
      if (committed.kind === 'committed') return prepareAndPublish(parsed.ok, migration)
      if (committed.kind === 'unknown')
        return fail({ kind: 'commit-unknown', operation: parsed.ok.operation })
      if (committed.kind === 'unavailable') return unavailable(committed.diagnostic)
    }
    return unavailable('historical migration revision contention')
  }

  async function cleanup(
    input: MutationInput<P>,
    migration: HistoryMigrationRecord,
  ): Promise<Outcome<HistoricalMigrationProgress, ToolFailure>> {
    if (migration.progress.kind !== 'published') return conflict(input.operation)
    const publication = migration.progress.receipt
    for (const copy of migration.cleanup) {
      const allowed = await entry(input)
      if ('failure' in allowed) return allowed
      const current = await read(input)
      if ('failure' in current) return current
      let removed
      try {
        removed = await options.copies.cleanup({
          ...input,
          copy,
          publication,
          expected: current.ok.revision,
        })
      } catch {
        return fail({ kind: 'commit-unknown', operation: input.operation })
      }
      if ('failure' in removed) return removed
      if (removed.ok.kind === 'pending') return succeed(migration.progress)
    }
    for (let attempt = 0; attempt < configuration.ledgerCommitAttempts; attempt += 1) {
      const current = await read(input)
      if ('failure' in current) return current
      const known = journal(current.ok.records, input.operation)
      if (known?.progress.kind === 'cleaned') return succeed(known.progress)
      if (known?.progress.kind !== 'published' || !sameFactValue(known.input, migration.input))
        return conflict(input.operation)
      const allowed = await entry(input)
      if ('failure' in allowed) return allowed
      const progress: HistoricalMigrationProgress = { ...known.progress, kind: 'cleaned' }
      const committed = await commit({
        domain: domainOf(input),
        expected: current.ok.revision,
        revision: nextRevision(current.ok.revision),
        writes: [
          { kind: 'put', record: { kind: 'history-migration', migration: { ...known, progress } } },
        ],
      })
      if (committed.kind === 'committed') return succeed(progress)
      if (committed.kind === 'unknown')
        return fail({ kind: 'commit-unknown', operation: input.operation })
      if (committed.kind === 'unavailable') return unavailable(committed.diagnostic)
    }
    return unavailable('historical cleanup revision contention')
  }

  async function prepareAndPublish(input: MutationInput<P>, migration: HistoryMigrationRecord) {
    const current = await read(input)
    if ('failure' in current) return current
    if (!sourceMatches(current.ok.records, migration.source)) return conflict(input.operation)
    const sourceRows = current.ok.records.filter(row => migration.source.keys.includes(row.key))
    const decoded = readHistoricalSource(input, sourceRows, options.resultPolicy)
    if (decoded.kind !== 'ready') return invalid('source', 'history-changed')
    const interpretations = historicalBodyInterpretations(decoded.source, migration.interpretations)
    if ('failure' in interpretations) return interpretations
    const adapted: Pick<ToolLedgerStore, 'read' | 'commit'> = {
      commit: store.commit.bind(store),
      read: async domain => {
        const answer = await store.read(domain)
        if (answer.kind !== 'complete') return answer
        if (!sourceMatches(answer.records, migration.source))
          return { kind: 'unavailable', diagnostic: 'historical source changed' }
        const records = currentPreparationRecords(answer.records, migration.source.keys)
        return records === null
          ? { kind: 'unavailable', diagnostic: 'unexpected migration preparation' }
          : { ...answer, records }
      },
    }
    const transactions = createLedgerTransactions(adapted, configuration.ledgerCommitAttempts)
    const custody = createLedgerMaterialCustody({
      materials,
      entry,
      transact: transactions.transact,
    })
    const validate = (snapshot: Snapshot) =>
      snapshot.migrations.get(input.operation)?.progress.kind === 'preparing'
        ? succeed(undefined)
        : conflict(input.operation)
    const channels: {
      old: HistoricalSource['results'][number]
      channels: PreparedResultChannels
    }[] = []
    for (const result of decoded.source.results) {
      const operation = decodeToolOperationId(`history-result:${input.operation}:${result.result}`)
      if ('failure' in operation) return invalid('operation', 'history-result-identity')
      const interpretation = interpretations.ok.get(result.result)
      const fixedPolicy = migration.policies.find(policy => policy.result === result.result)
      if (fixedPolicy === undefined) return invalid('policy', 'historical-policy-required')
      const prepared =
        interpretation === undefined
          ? succeed(null)
          : await prepareHistoricalBody(
              { ...input, operation: operation.ok },
              result,
              interpretation,
              {
                policy: fixedPolicy.policy,
                reader: options.sourceReader,
                custody,
                validate,
                authorize: () => entry(input),
              },
            )
      if ('failure' in prepared) return prepared
      const body = prepared.ok
      const rendered =
        body !== null && result.value.original.kind === 'offloaded'
          ? {
              ...result.value,
              original: { ...result.value.original, source: body.description.source },
            }
          : result.value
      const saved = await preserveResultChannels(
        custody,
        { ...input, operation: operation.ok, source: result.source },
        rendered,
        body,
        validate,
      )
      if ('failure' in saved) return saved
      channels.push({ old: result, channels: saved.ok })
    }
    return transactions.transact(
      domainOf(input),
      input.operation,
      async (snapshot, mint) => {
        const checked = validate(snapshot)
        if ('failure' in checked) return { kind: 'reply', outcome: checked }
        const time = await sampleMaterialTime(materials.clock, snapshot.materialTime)
        if ('failure' in time) return { kind: 'reply', outcome: time }
        const allowed = await entry(input)
        if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
        const receipt = mintEvidence(
          'history-migration',
          { tenant: input.tenant, call: input.call, operation: input.operation },
          mint.revision,
          migration.source,
        )
        const progress: HistoricalMigrationProgress = {
          kind: 'published',
          operation: input.operation,
          source: migration.source,
          receipt,
          activatedAt: time.ok,
        }
        const writes: LedgerWrite[] = []
        for (const prepared of channels) {
          const active = activateResultChannels(prepared.channels, time.ok)
          if ('failure' in active) return { kind: 'reply', outcome: active }
          const old = prepared.old
          const final = decoded.source.facts.find(fact =>
            sameFactValue(fact.evidence, old.custody.final),
          )!
          const value = fingerprint(final.fact)
          if ('failure' in value) return { kind: 'reply', outcome: value }
          const result: ResultRecord = {
            ...old,
            value: active.ok,
            custody: {
              kind: 'execution',
              final: old.custody.final,
              finalValue: value.ok,
              raw: old.custody.raw,
              materialized: receipt,
              cleanup: old.custody.cleanup,
            },
          }
          writes.push({ kind: 'put', record: { kind: 'result', result } })
          if (
            result.value.original.kind === 'offloaded' &&
            old.value.original.kind === 'offloaded'
          ) {
            const uses = adoptResultBody(snapshot, result)
            if ('failure' in uses) return { kind: 'reply', outcome: uses }
            writes.push(...uses.ok, {
              kind: 'put',
              record: {
                kind: 'historical-body-alias',
                alias: {
                  tenant: input.tenant,
                  call: input.call,
                  result: result.result,
                  bodyId: result.value.original.body.description.bodyId,
                  source: old.value.original.source,
                  migration: input.operation,
                  basis: receipt,
                },
              },
            })
          }
          const { result: _body, ...pointer } = final.fact
          writes.push({
            kind: 'put',
            record: {
              kind: 'fact-event',
              fact: {
                ...final,
                value: value.ok,
                fact: {
                  ...pointer,
                  value: value.ok,
                  payload: { kind: 'settled', result: result.result, settlement: receipt },
                },
              },
            },
          })
        }
        for (const batch of decoded.source.batches) {
          const value = fingerprint({
            start: batch.start,
            source: batch.source,
            batch: batch.batch,
            after: batch.after,
            cursor: batch.cursor,
            events: batch.events.map(event => ({
              event,
              fact: decoded.source.facts.find(
                fact =>
                  fact.event === event &&
                  sameFactValue(fact.start, batch.start) &&
                  sameFactValue(fact.source, batch.source),
              )!.fact,
            })),
          })
          if ('failure' in value) return { kind: 'reply', outcome: value }
          writes.push({
            kind: 'put',
            record: { kind: 'fact-batch', batch: { ...batch, value: value.ok } },
          })
        }
        const owned = new Set(
          channels
            .flatMap(item => [
              item.channels.content,
              item.channels.data,
              item.channels.attachments,
              ...(item.channels.original.kind === 'offloaded'
                ? [item.channels.original.summary]
                : []),
            ])
            .map(seal => seal.material.id),
        )
        for (const material of snapshot.materials.values()) {
          if (!owned.has(material.material.id)) continue
          if (!snapshot.materialUses.has(`preparation:${material.writeOperation}`)) continue
          writes.push(
            { kind: 'delete', key: `material-use:preparation:${material.writeOperation}` },
            {
              kind: 'put',
              record: {
                kind: 'material-cleanup',
                cleanup: {
                  material: material.material,
                  writeOperation: material.writeOperation,
                  basis: receipt,
                },
              },
            },
          )
        }
        writes.push(
          { kind: 'put', record: { kind: 'call', call: decoded.source.call } },
          {
            kind: 'put',
            record: { kind: 'history-migration', migration: { ...migration, progress } },
          },
        )
        return { kind: 'commit', value: progress, writes }
      },
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
  }
  async function drainAbandoned(
    input: MutationInput<P>,
    migration: HistoryMigrationRecord,
  ): Promise<Outcome<HistoricalMigrationProgress, ToolFailure>> {
    const adapted: Pick<ToolLedgerStore, 'read' | 'commit'> = {
      commit: store.commit.bind(store),
      read: async domain => {
        const answer = await store.read(domain)
        if (answer.kind !== 'complete') return answer
        const records = currentPreparationRecords(answer.records, migration.source.keys)
        return records === null
          ? { kind: 'unavailable', diagnostic: 'unexpected migration preparation' }
          : { ...answer, records }
      },
    }
    const transactions = createLedgerTransactions(adapted, configuration.ledgerCommitAttempts)
    const reclaim = createMaterialReclaimer({
      materials,
      entry,
      authorize: async input => {
        const allowed = await entry(input)
        return 'failure' in allowed ? allowed : succeed(undefined)
      },
      transact: transactions.transact,
    })
    const reclaimed = await reclaim(input)
    if ('failure' in reclaimed) return reclaimed
    if (reclaimed.ok.kind !== 'idle') return succeed(migration.progress)
    return transactions.transact(
      domainOf(input),
      input.operation,
      async snapshot => {
        const allowed = await entry(input)
        if ('failure' in allowed) return { kind: 'reply', outcome: allowed }
        const current = snapshot.migrations.get(input.operation)
        if (current?.progress.kind === 'abandoned')
          return { kind: 'reply', outcome: succeed(current.progress) }
        if (current?.progress.kind !== 'abandoning' || snapshot.materialCleanup.size > 0)
          return { kind: 'reply', outcome: conflict(input.operation) }
        const receipt = mintEvidence(
          'history-migration',
          { tenant: input.tenant, call: input.call, operation: input.operation },
          nextRevision(snapshot.revision),
          { abandoned: migration.source },
        )
        const progress: HistoricalMigrationProgress = {
          kind: 'abandoned',
          operation: input.operation,
          source: migration.source,
          receipt,
        }
        return {
          kind: 'commit',
          value: progress,
          writes: [
            {
              kind: 'put',
              record: { kind: 'history-migration', migration: { ...current, progress } },
            },
          ],
        }
      },
      fail({ kind: 'commit-unknown', operation: input.operation }),
    )
  }

  const abandon: ToolHistoryMigration<P>['abandon'] = async input => {
    const parsed = judgeMutationInput<P>(input, 'recover')
    if ('failure' in parsed) return parsed
    input = parsed.ok
    const allowed = await entry(input)
    if ('failure' in allowed) return allowed
    for (let attempt = 0; attempt < configuration.ledgerCommitAttempts; attempt += 1) {
      const current = await read(parsed.ok)
      if ('failure' in current) return current
      const observed = await entry(input)
      if ('failure' in observed) return observed
      const known = journal(current.ok.records, parsed.ok.operation)
      if (known === null) return invalid('operation', 'unknown-history-migration')
      if (known.progress.kind === 'abandoned') return succeed(known.progress)
      if (known.progress.kind === 'published' || known.progress.kind === 'cleaned')
        return conflict(parsed.ok.operation)
      if (known.progress.kind === 'abandoning') return drainAbandoned(parsed.ok, known)
      const revision = nextRevision(current.ok.revision)
      const basis = mintEvidence(
        'history-migration',
        { tenant: input.tenant, call: input.call, operation: input.operation },
        revision,
        { abandoned: known.source },
      )
      const records = currentPreparationRecords(current.ok.records, known.source.keys)
      if (records === null) return unavailable('unexpected migration preparation')
      const prepared = records.filter(
        (record): record is Extract<LedgerRecord, { kind: 'material' }> =>
          record.kind === 'material',
      )
      const owned = new Set(
        known.policies.flatMap(policy => {
          const operation = `history-result:${input.operation}:${policy.result}`
          const body = decodeToolOperationId(operation)
          const identity = 'ok' in body ? historicalBodyOperation(body.ok) : body
          return [
            ...['content', 'data', 'attachments', 'summary'].map(
              slot =>
                `result-slot:${createHash('sha256').update(operation).update('\0').update(slot).digest('hex')}`,
            ),
            ...('ok' in identity ? [identity.ok] : []),
          ]
        }),
      )
      const progress: HistoricalMigrationProgress = {
        kind: 'abandoning',
        operation: input.operation,
        source: known.source,
      }
      const writes: LedgerWrite[] = [
        { kind: 'put', record: { kind: 'history-migration', migration: { ...known, progress } } },
      ]
      for (const { material } of prepared) {
        if (!owned.has(material.writeOperation)) continue
        writes.push(
          { kind: 'delete', key: `material-use:preparation:${material.writeOperation}` },
          {
            kind: 'put',
            record: {
              kind: 'material-cleanup',
              cleanup: {
                material: material.material,
                writeOperation: material.writeOperation,
                basis,
              },
            },
          },
        )
      }
      const qualified = await entry(input)
      if ('failure' in qualified) return qualified
      const committed = await commit({
        domain: domainOf(parsed.ok),
        expected: current.ok.revision,
        revision,
        writes,
      })
      if (committed.kind === 'committed') return succeed(progress)
      if (committed.kind === 'unknown')
        return fail({ kind: 'commit-unknown', operation: input.operation })
      if (committed.kind === 'unavailable') return unavailable(committed.diagnostic)
    }
    return unavailable('historical abandonment revision contention')
  }
  return { preview, apply, inspect, abandon, plans }
}
