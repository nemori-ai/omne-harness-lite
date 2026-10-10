import { createParameterJudge, type ParameterJudge } from '@omne-harness-lite/tool-definition'
import {
  StorageUnavailable,
  type AtomicStorage,
  type StorageUnit,
} from '@omne-harness-lite/storage'
import type { LogAuthority, SessionLogParticipant } from '@omne-harness-lite/session-log'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import {
  inspectToolJournalEntry,
  projectToolJournal,
  toolJournalCallKey,
  type ToolResultCustodySource,
  type ToolResultCustodyEvidence,
  type ToolOriginalIssueIdentity,
  type ToolTerminalRecord,
  type ResultStoreConfig,
  type ToolJournalHistory,
} from '@omne-harness-lite/tool-execution-runtime'
import { createImmutableFiles } from './immutable-files.ts'
import { createByteStore } from './bytes.ts'
import { createRecords, same, object } from './records.ts'
import { captureStoreConfig, captureRef, references, blockReferences } from './values.ts'
import { readStoredResult } from './result-record.ts'

export interface ToolResultCustodyDependencies {
  readonly parameters?: ParameterJudge

  readonly storage: AtomicStorage
  readonly log: Pick<SessionLogParticipant, 'sourceIn' | 'readByKeyIn'>
  readonly access: LogAuthority
  readonly original: {
    readonly verifyIn: (unit: StorageUnit, identity: ToolOriginalIssueIdentity) => Promise<boolean>
  }
}
export interface ToolResultCustodyInstance {
  readonly source: ToolResultCustodySource
  readonly close: () => Promise<void>
}
export async function openToolResultCustodySource(
  config: Pick<ResultStoreConfig, 'directory' | 'storage'>,
  dependencies: ToolResultCustodyDependencies,
): Promise<ToolResultCustodyInstance> {
  const parameters = dependencies.parameters ?? createParameterJudge()
  const fixed = captureStoreConfig(config),
    files = await createImmutableFiles(fixed.directory),
    records = createRecords(files),
    bytes = createByteStore(files, fixed.storage),
    tasks = new Set<Promise<unknown>>()
  let accepting = true,
    closed = false,
    closing: Promise<void> | undefined
  const source = Object.freeze<ToolResultCustodySource>({
    verifyIn(unit, original, terminal) {
      if (!accepting) return Promise.resolve({ failure: 'unavailable' })
      const captured = captureOriginal(original, terminal)
      if (!captured) return Promise.resolve({ failure: 'invalidSource' })
      const task = verify(unit, captured.original, captured.terminal).catch(error => {
        if (error instanceof StorageUnavailable) return { failure: 'unavailable' as const }
        throw error
      })
      tasks.add(task)
      void task.then(
        () => tasks.delete(task),
        () => tasks.delete(task),
      )
      return task
    },
  })
  async function verify(
    unit: StorageUnit,
    original: ToolOriginalIssueIdentity,
    terminal: ToolTerminalRecord,
  ): ReturnType<ToolResultCustodySource['verifyIn']> {
    unit.assertStorage(dependencies.storage)
    if (!(await dependencies.original.verifyIn(unit, original))) return { failure: 'invalidSource' }
    const valid = await verifyJournal(unit, dependencies, original, terminal, parameters)
    if ('failure' in valid) return valid
    const scope = { tenant: original.ref.tenant, session: original.ref.session },
      stored = await readAuthor(records, original, terminal)
    if (stored?.kind === 'rejected') return { failure: 'unavailable' }
    const required = terminalReferences(terminal, stored?.value)
    for (const reference of required) {
      const read = await bytes.read(scope, reference, original.ref)
      if (read.kind === 'rejected') return { failure: 'unavailable' }
    }
    const evidence: ToolResultCustodyEvidence = {
      original,
      terminal,
      ...(stored ? { stored: stored.value } : {}),
      references: required,
    }
    return { verified: evidence }
  }
  return Object.freeze({
    source,
    close() {
      accepting = false
      if (closed) return Promise.resolve()
      if (closing) return closing
      const task = Promise.resolve().then(async () => {
        await Promise.allSettled([...tasks])
        await files.close()
        closed = true
      })
      closing = task
      void task.then(
        () => {
          closing = undefined
        },
        () => {
          closing = undefined
        },
      )
      return task
    },
  })
}
function captureOriginal(original: ToolOriginalIssueIdentity, terminal: ToolTerminalRecord) {
  const captured = copyJsonValue({ original, terminal })
  if ('failed' in captured || !object(captured.ok) || !object(captured.ok.original)) return
  const value = captured.ok.original
  if (Object.keys(value).length !== 5 || !captureRef(value.ref) || !object(value.origin)) return
  for (const field of ['adoption', 'executionGeneration', 'originalPosition'])
    if (!('ok' in parseOpaqueIdentifier(value[field], 'OriginalToolField'))) return
  return captured.ok as unknown as {
    original: ToolOriginalIssueIdentity
    terminal: ToolTerminalRecord
  }
}
async function verifyJournal(
  unit: StorageUnit,
  dependencies: ToolResultCustodyDependencies,
  original: ToolOriginalIssueIdentity,
  terminal: ToolTerminalRecord,
  parameters: ParameterJudge,
): Promise<{ valid: true } | { failure: 'invalidSource' | 'unavailable' }> {
  const scope = { tenant: original.ref.tenant, session: original.ref.session },
    coordinate = await dependencies.log.sourceIn(unit, dependencies.access, scope)
  if ('failure' in coordinate)
    return { failure: coordinate.failure === 'denied' ? 'invalidSource' : 'unavailable' }
  const key = toolJournalCallKey(original.ref.callId)
  if (typeof key !== 'string') return { failure: 'invalidSource' }
  const records = await dependencies.log.readByKeyIn(
    unit,
    dependencies.access,
    coordinate.source,
    key,
  )
  if ('failure' in records)
    return { failure: records.failure === 'denied' ? 'invalidSource' : 'unavailable' }
  if (!journalEntriesMatch(scope, records.entries, original.ref.callId, parameters))
    return { failure: 'invalidSource' }
  const projected = projectToolJournal(scope, records.entries, parameters)
  if ('invalid' in projected) return { failure: 'unavailable' }
  const execution = projected.executions.get(original.ref.callId)
  if (!execution || !matchesOriginal(execution, original, terminal))
    return { failure: 'invalidSource' }
  return { valid: true }
}
function journalEntriesMatch(
  scope: Parameters<typeof projectToolJournal>[0],
  entries: Parameters<typeof projectToolJournal>[1],
  callId: ToolOriginalIssueIdentity['ref']['callId'],
  parameters: ParameterJudge,
): boolean {
  for (const entry of entries) {
    const checked = inspectToolJournalEntry(scope, entry, parameters)
    if (!('value' in checked) || checked.value.ref.callId !== callId) return false
  }
  return true
}

function uniqueReferences(input: ToolResultCustodyEvidence['references']) {
  return input.filter(
    (reference, index) => !input.slice(0, index).some(previous => same(reference, previous)),
  )
}

function matchesOriginal(
  execution: ToolJournalHistory,
  original: ToolOriginalIssueIdentity,
  terminal: ToolTerminalRecord,
) {
  const input = execution.intent.value.input
  return (
    same(execution.terminal, terminal) &&
    same(execution.intent.value.origin, original.origin) &&
    execution.intent.entry.dedupeKey === original.originalPosition &&
    object(input) &&
    object(input.submission) &&
    input.submission.adoption === original.adoption
  )
}
function readAuthor(
  records: ReturnType<typeof createRecords>,
  original: ToolOriginalIssueIdentity,
  terminal: ToolTerminalRecord,
) {
  const outcome = terminal.value.terminal
  if (
    (outcome.outcome === 'completed' || outcome.outcome === 'failed') &&
    outcome.result !== undefined
  )
    return readStoredResult(records, original.ref, outcome.result)
}
function terminalReferences(
  terminal: ToolTerminalRecord,
  stored: ToolResultCustodyEvidence['stored'],
) {
  const ended = terminal.value
  return uniqueReferences([
    ...(stored ? references(stored.result) : []),
    ...(stored?.raw ? [stored.raw] : []),
    ...blockReferences([ended.delivery.result, ...(ended.delivery.internal?.blocks ?? [])]),
    ...(ended.delivery.raw ? [ended.delivery.raw] : []),
  ])
}
