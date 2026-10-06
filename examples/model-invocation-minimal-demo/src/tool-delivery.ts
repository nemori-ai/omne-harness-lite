import { copyJsonValue, type ToolResultBlock } from '@omne-harness-lite/content-blocks'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  type RunnerPiece,
  type LoopExtensionRunnerService,
} from '@omne-harness-lite/loop-extension-runner'
import { readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import {
  captureModelLogValue,
  prepareModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'
import {
  projectToolJournal,
  type ToolJournalHistory,
  type ToolResultStorageOperations,
} from '@omne-harness-lite/tool-execution-runtime'
import { afterEachSubject, toolDeliveryMessage } from './tool-delivery-subject.ts'
import type { createToolDeliveryJournal } from './tool-driver-journal.ts'

type Journal = Extract<
  Awaited<ReturnType<typeof createToolDeliveryJournal>>,
  { readonly kind: 'journal' }
>
export type ToolDeliveryResult =
  | { readonly kind: 'ready' | 'confirmed' }
  | {
      readonly kind: 'rejected'
      readonly reason: 'invalidInput' | 'notEnded' | 'unavailable' | 'blocked' | 'conflict'
    }
const rejected = (reason: Extract<ToolDeliveryResult, { readonly kind: 'rejected' }>['reason']) =>
  ({ kind: 'rejected', reason }) as const

/** One application-owned delivery coordinator per session; A remains owned by the independent runtime. */
export function createToolDelivery(input: {
  readonly journal: Journal
  readonly recovery: RecoveryAccess
  readonly results: ToolResultStorageOperations
  readonly runner: () => LoopExtensionRunnerService | undefined
  readonly attempts: number
}) {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 1)
    throw new TypeError('positive delivery attempts required')
  const queues = new Map<string, Promise<unknown>>()
  let open = true
  function serialize<T>(call: string, task: () => Promise<T>) {
    const result = (queues.get(call) ?? Promise.resolve()).then(task)
    const completed = result.then(
      () => undefined,
      () => undefined,
    )
    queues.set(call, completed)
    void completed.then(() => {
      if (queues.get(call) === completed) queues.delete(call)
    })
    return result
  }
  async function read(call: string) {
    const history = await input.journal.read()
    if ('unavailable' in history) return
    const tools = projectToolJournal(history.prefix.scope, history.prefix.entries)
    if ('invalid' in tools) return
    const execution = tools.executions.get(call)
    return execution ? { history, execution } : undefined
  }
  async function readable(execution: ToolJournalHistory): Promise<boolean> {
    const ended = execution.terminal?.value.terminal
    if (!ended) return false
    if (
      ended.outcome !== 'completed' &&
      !(ended.outcome === 'failed' && ended.result !== undefined)
    )
      return true
    const original = await input.results.readForDelivery(input.recovery, execution.intent.value.ref)
    return original.kind === 'found'
  }
  async function prepare(call: string, recover: boolean): Promise<ToolDeliveryResult> {
    if (!open) return rejected('unavailable')
    const current = await read(call)
    if (!current) return rejected('unavailable')
    const { execution } = current,
      ended = execution.terminal?.value
    if (!ended) return rejected('notEnded')
    if (execution.ready) return { kind: 'ready' }
    if (!(await readable(execution))) return rejected('unavailable')
    const subject = afterEachSubject(execution)
    if (!subject) return rejected('unavailable')
    const origin = execution.intent.value.origin
    let result: ToolResultBlock = ended.delivery.result
    let basis: Extract<
      import('@omne-harness-lite/tool-execution-runtime').ToolJournalPayload,
      { kind: 'delivery_ready' }
    >['basis']
    if (recover || input.runner() === undefined) {
      // The old dispatcher must already be drained/isolated by the application before recover().
      // Do not rerun a potentially effectful contribution after loss of continuity.
      const captured = copyJsonValue(ended.delivery.selectedChain)
      if ('failed' in captured || !Array.isArray(captured.ok)) return rejected('unavailable')
      const all = captured.ok as unknown as readonly RunnerPiece[]
      if (all.some(piece => !piece || !('ok' in judgeDefinition(piece.definition))))
        return rejected('unavailable')
      const chain = all.filter(
        piece =>
          piece.definition.position === 'after_action' &&
          piece.definition.dimension.scope === 'each',
      )
      const keys = passKeys({
        position: 'after_action',
        dimension: { scope: 'each' },
        anchor: ended.delivery.pass,
      })
      if ('invalidInput' in keys) return rejected('unavailable')
      const entries = current.history.prefix.entries.filter(entry =>
        entry.readKeys.includes(keys.pass),
      )
      const initial = {
        position: 'after_action' as const,
        dimension: { scope: 'each' as const },
        subject,
      }
      const conclusions = readPassConclusions({
        initial,
        anchor: ended.delivery.pass,
        run: origin.run,
        binding: {
          ...execution.intent.value.ref,
          logGeneration: current.history.prefix.ownerGeneration,
        },
        chain,
        entries,
        tail: current.history.prefix.tail,
      })
      if ('failure' in conclusions) return rejected('unavailable')
      const finals = entries.flatMap(entry => {
        const inspected = inspectRunnerConclusion({ ...execution.intent.value.ref, entry })
        return 'conclusion' in inspected && inspected.occurrence.kind === 'final'
          ? [inspected.conclusion]
          : []
      })
      if (finals.length === chain.length) {
        const composed = composeEffect(initial, finals)
        if ('invalidInput' in composed || composed.effect.kind !== 'proceed')
          return rejected('unavailable')
        if ('result' in composed.effect.subject && composed.effect.subject.result)
          result = composed.effect.subject.result as ToolResultBlock
        basis = {
          kind: 'conclusions',
          keys: entries.map(entry => entry.dedupeKey!).filter(key => key !== undefined),
        }
      } else basis = { kind: 'recovered_without_after_action', pass: ended.delivery.pass }
    } else {
      const runner = input.runner()
      if (!runner) return rejected('unavailable')
      const request = {
        position: 'after_action' as const,
        dimension: { scope: 'each' as const },
        subject,
        manifest: execution.intent.value.ref.session,
        anchor: ended.delivery.pass,
        run: origin.run,
        attempt: origin.attempt,
      }
      const dispatched = await runner.dispatch(request, new AbortController().signal)
      if ('failure' in dispatched || dispatched.effect.kind !== 'proceed')
        return rejected('unavailable')
      if ('result' in dispatched.effect.subject && dispatched.effect.subject.result)
        result = dispatched.effect.subject.result as ToolResultBlock
      const keys = passKeys({
        position: 'after_action',
        dimension: { scope: 'each' },
        anchor: ended.delivery.pass,
      })
      if ('invalidInput' in keys) return rejected('unavailable')
      const prefix = await input.journal.read()
      if ('unavailable' in prefix) return rejected('unavailable')
      basis = {
        kind: 'conclusions',
        keys: prefix.prefix.entries
          .filter(entry => entry.readKeys.includes(keys.pass))
          .map(entry => entry.dedupeKey!)
          .filter(key => key !== undefined),
      }
    }
    const captured = copyJsonValue({
      kind: 'delivery_ready',
      revision: 1,
      ref: execution.intent.value.ref,
      result,
      basis,
    })
    if ('failed' in captured) return rejected('unavailable')
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      const committed = await input.journal.commit(
        captured.ok as unknown as import('@omne-harness-lite/tool-execution-runtime').ToolJournalPayload,
      )
      if (committed.kind === 'committed') return { kind: 'ready' }
      if (committed.reason !== 'tailChanged')
        return rejected(committed.reason === 'conflict' ? 'conflict' : 'unavailable')
    }
    return rejected('unavailable')
  }
  async function confirm(call: string): Promise<ToolDeliveryResult> {
    if (!open) return rejected('unavailable')
    const current = await read(call)
    if (!current) return rejected('unavailable')
    const { execution } = current
    if (execution.confirmed) return { kind: 'confirmed' }
    if (!execution.ready || !execution.terminal || !(await readable(execution)))
      return rejected('notEnded')
    const candidate = toolDeliveryMessage(execution),
      runner = input.runner()
    if (!candidate || !runner) return rejected('unavailable')
    const origin = execution.intent.value.origin
    const dispatched = await runner.dispatch(
      {
        position: 'before_persist_message',
        subject: { producer: 'tool', message: candidate },
        manifest: execution.intent.value.ref.session,
        anchor: `${execution.terminal.value.delivery.pass}:persist`,
        run: origin.run,
        attempt: origin.attempt,
      },
      new AbortController().signal,
    )
    if ('failure' in dispatched) return rejected('unavailable')
    if (dispatched.effect.kind !== 'proceed') return rejected('blocked')
    if (
      !('message' in dispatched.effect.subject) ||
      dispatched.effect.subject.message.type !== 'tool'
    )
      return rejected('conflict')
    const message = dispatched.effect.subject.message
    const captured = captureModelLogValue({
      category: 'message',
      input: { kind: 'value', value: message },
    })
    if (!('ok' in captured)) return rejected('unavailable')
    for (let attempt = 0; attempt < input.attempts; attempt++) {
      const history = await input.journal.read()
      if ('unavailable' in history) return rejected('unavailable')
      const messages = history.models.entries.flatMap(record =>
        record.captured.message !== null && record.captured.message.type !== 'system'
          ? [record.captured.message]
          : [],
      )
      const prepared = prepareModelLogEntry({
        ...history.prefix.scope,
        shell: { tenant: history.prefix.scope.tenant, run: origin.run, attempt: origin.attempt },
        captured: captured.ok,
        purpose: { kind: 'message' },
        messagePrefix: messages,
      })
      if (!('ok' in prepared)) return rejected('conflict')
      const committed = await input.journal.commit(
        { kind: 'delivery_confirmed', revision: 1, ref: execution.intent.value.ref, message },
        prepared.ok,
      )
      if (committed.kind === 'committed') return { kind: 'confirmed' }
      if (committed.reason !== 'tailChanged')
        return rejected(committed.reason === 'conflict' ? 'conflict' : 'unavailable')
    }
    return rejected('unavailable')
  }
  return Object.freeze({
    prepare(call: string) {
      return serialize(call, () => prepare(call, false))
    },
    recover(call: string) {
      return serialize(call, () => prepare(call, true))
    },
    confirm(call: string) {
      return serialize(call, () => confirm(call))
    },
    async close() {
      open = false
      await Promise.all([...queues.values()])
      await input.journal.close()
    },
  })
}
