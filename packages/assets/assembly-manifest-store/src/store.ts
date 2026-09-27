import { randomBytes } from 'node:crypto'
import { isAssetCategory, type AssetCategory } from '@omne-harness-lite/asset-model'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs, type Instant } from '@omne-harness-lite/offer-expiry'
import {
  narrow,
  StorageDefect,
  StorageUnavailable,
  UniqueViolation,
  type Storage,
  type ReadTx,
} from '@omne-harness-lite/storage'
import {
  answerPresence,
  checkManifestAppendInput,
  judgeManifestAppend,
  readEvaluationProjection,
  sessionRef,
  validNames,
} from './value.ts'
import type {
  AppendFacts,
  AppendResult,
  AssemblyManifestStore,
  CheckedAppend,
  EvaluationRef,
  EvaluationReadResult,
  ManifestDb,
  ManifestDiagnostic,
  ManifestOptions,
  ManifestRecord,
  ManifestSessionRef,
  ManifestTable,
  ReadFailure,
} from './types.ts'

class ContentUnavailable extends Error {}
type RecordRow = ManifestDb['assembly_manifest_record']
function decode(text: string): JsonValue {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new ContentUnavailable('manifest JSON representation unavailable')
  return result.ok
}
function positiveSeq(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new StorageDefect('invalid manifest sequence representation')
  return value
}
async function head(tx: ReadTx, session: string): Promise<number> {
  const row = await narrow<ManifestDb>(tx)
    .selectFrom('assembly_manifest_record')
    .select('seq')
    .where('session', '=', session)
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row === undefined ? 0 : positiveSeq(row.seq)
}
async function record(tx: ReadTx, row: RecordRow): Promise<ManifestRecord> {
  const session = sessionRef(row.session)
  const ref = parseOpaqueIdentifier(row.evaluation_ref, 'EvaluationRef')
  if (
    session === undefined ||
    !('ok' in ref) ||
    !['given', 'mint', 'reuse'].includes(row.evaluation_kind) ||
    (row.evaluation_kind === 'reuse'
      ? row.owned_ref !== null
      : row.owned_ref !== row.evaluation_ref)
  )
    throw new StorageDefect('invalid manifest record shell')
  const rows = await narrow<ManifestDb>(tx)
    .selectFrom('assembly_manifest_table')
    .selectAll()
    .where('session', '=', row.session)
    .where('seq', '=', row.seq)
    .execute()
  if (rows.length === 0) throw new StorageDefect('manifest record missing tables')
  const tables: Partial<Record<AssetCategory, ManifestTable>> = {}
  for (const item of rows) {
    const filledAt = instantFromEpochMs(item.filled_at)
    if (!isAssetCategory(item.category) || !('ok' in filledAt))
      throw new StorageDefect('invalid manifest table shell')
    tables[item.category] = Object.freeze({
      filledAt: filledAt.ok,
      composition: decode(item.composition),
    })
  }
  return Object.freeze({
    session,
    seq: positiveSeq(row.seq),
    evaluation: Object.freeze(
      row.evaluation_kind === 'mint'
        ? { kind: 'mint' as const }
        : { kind: row.evaluation_kind, ref: ref.ok },
    ),
    evaluationRef: ref.ok,
    tables: Object.freeze(tables),
    content: decode(row.content),
  })
}
async function facts(tx: ReadTx, request: CheckedAppend): Promise<AppendFacts> {
  const db = narrow<ManifestDb>(tx)
  const identity = request.record.evaluation
  const ownerRow =
    identity.kind === 'mint'
      ? undefined
      : await db
          .selectFrom('assembly_manifest_record')
          .selectAll()
          .where('owned_ref', '=', identity.ref)
          .executeTakeFirst()
  const owner = ownerRow === undefined ? undefined : await record(tx, ownerRow)
  const filledAt: Partial<Record<AssetCategory, Instant>> = {}
  for (const category of Object.keys(request.record.tables) as AssetCategory[]) {
    const row = await db
      .selectFrom('assembly_manifest_table')
      .select('filled_at')
      .where('session', '=', request.session)
      .where('category', '=', category)
      .orderBy('filled_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (row !== undefined) {
      const parsed = instantFromEpochMs(row.filled_at)
      if (!('ok' in parsed)) throw new StorageDefect('invalid manifest stored filledAt')
      filledAt[category] = parsed.ok
    }
  }
  return {
    session: request.session,
    head: await head(tx, request.session),
    ...(owner === undefined ? {} : { owner }),
    filledAt,
  }
}

export function createAssemblyManifestStore(
  storage: Storage,
  options: ManifestOptions = {},
): AssemblyManifestStore {
  if (options.presenceSource !== undefined && typeof options.presenceSource.read !== 'function')
    throw new TypeError('invalid presence source')
  if (options.diagnostic !== undefined && typeof options.diagnostic !== 'function')
    throw new TypeError('invalid diagnostic port')
  if (options.diagnostic !== undefined && typeof options.diagnosticFailure !== 'function')
    throw new TypeError('diagnostic failure port is required')
  const { presenceSource, diagnostic, diagnosticFailure } = options
  let stopped = false,
    active = 0
  let closing: Promise<void> | undefined
  let drain: (() => void) | undefined
  function emit(event: ManifestDiagnostic): void {
    try {
      diagnostic?.(Object.freeze(event))
    } catch {
      diagnosticFailure?.({ kind: 'manifest_diagnostic_unavailable' })
    }
  }
  async function perform<T extends object>(
    operation: ManifestDiagnostic['operation'],
    session: ManifestSessionRef,
    fn: (note: (stage: 'capacity') => void) => Promise<T>,
  ): Promise<T | { readonly failure: 'unavailable' }> {
    if (stopped) return { failure: 'unavailable' }
    active++
    let outcome: T | { readonly failure: 'unavailable' }
    let stage: 'capacity' | undefined
    try {
      try {
        outcome = await fn(value => {
          stage = value
        })
      } catch (error) {
        if (!(error instanceof StorageUnavailable || error instanceof ContentUnavailable)) {
          emit({
            kind: 'assembly_manifest',
            operation,
            providerRevision: 'MF3',
            session,
            result: 'defect',
            resourceEnded: true,
          })
          throw error
        }
        outcome = { failure: 'unavailable' }
      }
      const fields = outcome as { failure?: string; head?: number; evaluationRef?: EvaluationRef }
      emit({
        kind: 'assembly_manifest',
        operation,
        providerRevision: 'MF3',
        session,
        result: fields.failure ?? 'success',
        ...(fields.head === undefined ? {} : { head: fields.head }),
        ...(fields.evaluationRef === undefined ? {} : { evaluationRef: fields.evaluationRef }),
        ...(stage === undefined ? {} : { stage }),
        resourceEnded: true,
      })
      return outcome
    } finally {
      active--
      if (stopped && active === 0) drain?.()
    }
  }
  return Object.freeze({
    async readHead(value: unknown) {
      const session = sessionRef(value)
      if (session === undefined) return { failure: 'invalidInput' } as const
      return perform('readHead', session, () =>
        storage.read(async tx => {
          const upper = await head(tx, session)
          const latest: Partial<Record<AssetCategory, ManifestRecord>> = {}
          const rows = await narrow<ManifestDb>(tx)
            .selectFrom('assembly_manifest_table')
            .select(['category', 'seq'])
            .where('session', '=', session)
            .where('seq', '<=', upper)
            .orderBy('seq', 'desc')
            .execute()
          const records = new Map<number, ManifestRecord>()
          for (const row of rows) {
            if (!isAssetCategory(row.category)) throw new StorageDefect('invalid manifest category')
            if (latest[row.category] !== undefined) continue
            let full = records.get(row.seq)
            if (full === undefined) {
              const stored = await narrow<ManifestDb>(tx)
                .selectFrom('assembly_manifest_record')
                .selectAll()
                .where('session', '=', session)
                .where('seq', '=', row.seq)
                .executeTakeFirst()
              if (stored === undefined) throw new StorageDefect('missing manifest table parent')
              full = await record(tx, stored)
              records.set(row.seq, full)
            }
            latest[row.category] = full
          }
          return { head: upper, latest: Object.freeze(latest) }
        }),
      )
    },
    async append(value: unknown, expected: unknown, input: unknown): Promise<AppendResult> {
      const checked = checkManifestAppendInput(value, expected, input)
      if ('failure' in checked) return checked
      const request = checked.ok
      return perform('append', request.session, note =>
        storage.write(async tx => {
          await tx.lockSentinel(`assembly-manifest/${request.session}`)
          const current = await facts(tx, request)
          const decision = judgeManifestAppend(current, request)
          if ('failure' in decision) return decision
          if (current.head === Number.MAX_SAFE_INTEGER) {
            note('capacity')
            return { failure: 'unavailable' } as const
          }
          const seq = current.head + 1
          const evaluation = request.record.evaluation
          const parsed = parseOpaqueIdentifier(
            evaluation.kind === 'mint' ? randomBytes(16).toString('base64url') : evaluation.ref,
            'EvaluationRef',
          )
          if (!('ok' in parsed)) throw new StorageDefect('generated invalid manifest reference')
          const evaluationRef = parsed.ok
          const db = narrow<ManifestDb>(tx)
          try {
            await db
              .insertInto('assembly_manifest_record')
              .values({
                session: request.session,
                seq,
                evaluation_kind: evaluation.kind,
                evaluation_ref: evaluationRef,
                owned_ref: evaluation.kind === 'reuse' ? null : evaluationRef,
                content: writeJsonLossless(request.record.content),
              })
              .execute()
          } catch (error) {
            if (!(error instanceof UniqueViolation)) throw error
            const rejudged = judgeManifestAppend(await facts(tx, request), request)
            // This first statement failed; no part of this request was inserted.
            if ('failure' in rejudged) return rejudged
            throw error
          }
          // P-2 preserves prior statements after a failed statement. Any failure here
          // must escape the callback so the whole record and every table roll back.
          for (const [category, table] of Object.entries(request.record.tables))
            await db
              .insertInto('assembly_manifest_table')
              .values({
                session: request.session,
                seq,
                category,
                filled_at: table.filledAt,
                composition: writeJsonLossless(table.composition),
              })
              .execute()
          return { seq, evaluationRef, head: seq }
        }),
      )
    },
    async readHistory(value: unknown, category: unknown, at: unknown) {
      const session = sessionRef(value),
        instant = instantFromEpochMs(at)
      if (session === undefined || !isAssetCategory(category) || !('ok' in instant))
        return { failure: 'invalidInput' } as const
      return perform('readHistory', session, () =>
        storage.read(async tx => {
          const table = await narrow<ManifestDb>(tx)
            .selectFrom('assembly_manifest_table')
            .select('seq')
            .where('session', '=', session)
            .where('category', '=', category)
            .where('filled_at', '=', instant.ok)
            .executeTakeFirst()
          if (table === undefined) return { failure: 'recordNotFound' } as const
          const stored = await narrow<ManifestDb>(tx)
            .selectFrom('assembly_manifest_record')
            .selectAll()
            .where('session', '=', session)
            .where('seq', '=', table.seq)
            .executeTakeFirst()
          if (stored === undefined) throw new StorageDefect('missing manifest history parent')
          return { record: await record(tx, stored) }
        }),
      )
    },
    async dependencyPresence(value: unknown, namesValue: unknown) {
      const session = sessionRef(value)
      if (session === undefined || !validNames(namesValue))
        return { failure: 'invalidInput' } as const
      const names = Object.freeze([...namesValue])
      return perform('dependencyPresence', session, async () => {
        if (presenceSource === undefined) return { failure: 'unavailable' } as const
        const snapshot = await presenceSource.read(session, names)
        if ('failure' in snapshot && snapshot.failure === 'unavailable')
          return { failure: 'unavailable' } as const
        return answerPresence(snapshot as Readonly<Record<string, 'present' | 'absent'>>, names)
      })
    },
    async readEvaluation(value: unknown): Promise<EvaluationReadResult> {
      const session = sessionRef(value)
      if (session === undefined) return { failure: 'invalidInput' }
      return perform('readEvaluation', session, () =>
        storage.read(async tx => {
          const upper = await head(tx, session)
          const source = await narrow<ManifestDb>(tx)
            .selectFrom('assembly_manifest_record')
            .selectAll()
            .where('session', '=', session)
            .where('seq', '<=', upper)
            .where('evaluation_kind', 'in', ['given', 'mint'])
            .orderBy('seq', 'desc')
            .limit(1)
            .executeTakeFirst()
          if (source === undefined) return { failure: 'recordNotFound' } as const
          // Parsing failures are unavailable; represented projection failures carry the closed reason.
          const projection = readEvaluationProjection(decode(source.content))
          if ('failure' in projection) return projection
          const ref = parseOpaqueIdentifier(source.evaluation_ref, 'EvaluationRef')
          if (!('ok' in ref) || source.owned_ref !== source.evaluation_ref)
            throw new StorageDefect('invalid manifest evaluation source shell')
          return { evaluationRef: ref.ok, ...projection.ok }
        }),
      )
    },
    close(): Promise<void> {
      if (closing !== undefined) return closing
      stopped = true
      closing =
        active === 0
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              drain = resolve
            })
      return closing
    },
  })
}
