import type {
  RunnerActionRequest,
  RunnerActionSource,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { compareInteger } from '@omne-harness-lite/session-log'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import { readDriverToolBatch } from './driver-tool-source.ts'
import { actionAnchor } from './driver-action-facts.ts'

export interface SessionRunnerActionOptions {
  readonly journal: BorrowedRunJournal
  readonly ownerGeneration: string
  readonly access: SessionAccess
  readonly admission: Omit<RunnerActionRequest['admission'], 'report'>
}

export async function readSessionRunnerAction(
  options: SessionRunnerActionOptions,
  request: Pick<RunnerActionRequest, 'manifest' | 'run' | 'attempt' | 'assistantMessage'>,
): Promise<
  | { readonly action: RunnerActionSource }
  | { readonly failure: 'invalidInput' | 'unavailable' | 'attemptSuperseded' }
> {
  const { journal, ownerGeneration, access } = options
  const admission = { ...options.admission }
  const { manifest, run, attempt, assistantMessage } = request
  if (manifest !== journal.scope.session || run !== journal.run) return { failure: 'invalidInput' }
  const prefix = await currentPrefix(journal)
  if (!prefix) return { failure: 'unavailable' }
  const found = readDriverToolBatch(
    { scope: journal.scope, ownerGeneration, entries: prefix.entries, tail: prefix.tail },
    assistantMessage,
  )
  if (found.kind !== 'batch') return { failure: 'unavailable' }
  const batch = found.batch
  if (batch.origin.run !== run) return { failure: 'invalidInput' }
  if (
    batch.runState !== 'open' ||
    compareInteger(batch.origin.attempt, attempt) !== 0 ||
    compareInteger(batch.latestAttempt, attempt) !== 0
  )
    return { failure: 'attemptSuperseded' }
  return {
    action: Object.freeze({
      ...admission,
      access,
      scope: journal.scope,
      ...batch.origin,
      calls: batch.calls,
      anchors: batch.calls
        .filter(call => !call.unparseable)
        .map(call => actionAnchor(assistantMessage, call.callId)),
      report: batch.adoption.adoption.report,
      toolNames: batch.adoption.adoption.tools.map(tool => tool.name),
    }),
  }
}

async function currentPrefix(journal: BorrowedRunJournal) {
  if (journal.currentGeneration() !== journal.generation) return undefined
  const prefix = await journal.readPrefix()
  if ('failure' in prefix || journal.currentGeneration() !== journal.generation) return undefined
  if (
    prefix.source.session !== journal.scope.session ||
    !tenantIdEquals(prefix.source.tenant, journal.scope.tenant)
  )
    return undefined
  return prefix
}
