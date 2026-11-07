import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  createIndependentToolScope,
  type ToolConfiguration,
} from '@omne-harness/tool'
import {
  decodeToolOperationId,
  type FixedToolRequest,
  type ToolTerminal,
  type ProcessBlock,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  defaultResultPolicy,
  describedAdoption,
  renderToolResult,
  type ToolMessageContentBlock,
  type ToolOutputCustody,
  type ToolFinalCustody,
  type ToolWaiter,
} from '@omne-harness/tool-contract/provider'
import type { ToolOperationSlot } from '@omne-harness/tool-contract/binding'
import type { LocalToolBindingsInput } from './executor-binding.ts'
import type { ToolEnvironmentValue } from './author-environment.ts'
import { createLocalTextResults } from './text-results.ts'

export type RuntimeAuthorExecution = Pick<
  LocalToolBindingsInput<unknown, ToolEnvironmentValue, ToolMessageContentBlock>,
  'scope' | 'settle'
>

const failureCodec = describedAdoption({
  owner: '@omne-harness/tool-host-local',
  name: 'author-failure-json',
  revision: '1',
})

function interruption(call: Parameters<RuntimeAuthorExecution['settle']>[0]): ToolTerminal | null {
  if (call.outcome.kind !== 'failed' || !call.execution.signal.aborted) return null
  const control: unknown = call.execution.signal.reason
  if (
    typeof control !== 'object' ||
    control === null ||
    !('operation' in control) ||
    !('start' in control) ||
    !('tenant' in control) ||
    !('call' in control) ||
    !('intent' in control)
  )
    return null
  const operation = decodeToolOperationId(control.operation)
  if (
    'failure' in operation ||
    control.call !== call.call ||
    canonicalDigest(control.tenant) !== canonicalDigest(call.tenant) ||
    canonicalDigest(control.start) !== canonicalDigest(call.start)
  )
    return null
  const intent = control.intent
  if (
    typeof intent !== 'object' ||
    intent === null ||
    !('kind' in intent) ||
    (intent.kind !== 'stop' && intent.kind !== 'withdraw')
  )
    return null
  return {
    kind: 'interrupted',
    cause: { kind: 'control', operation: operation.ok, withdrawn: intent.kind === 'withdraw' },
  }
}

/** Local emit receipts remain local. The fact driver owns durable process acceptance. */
export function createRuntimeAuthorExecution(
  input: Readonly<{
    configuration: ToolConfiguration
    custody: Pick<ToolOutputCustody<unknown>, 'preserve' | 'inspect'>
    finalCustody: ToolFinalCustody<unknown, ToolMessageContentBlock>
  }>,
): RuntimeAuthorExecution &
  Readonly<{ close(): void; pending(): number; retainedReturns(): number }> {
  const text = createLocalTextResults()
  const shutdown = new AbortController()
  const pending = new Map<string, Parameters<ToolOutputCustody<unknown>['preserve']>[0]>()
  type FinalRequest = Parameters<typeof input.finalCustody.preserveFinal>[0]
  const finals = new Map<string, FinalRequest>()
  const unencoded = new Map<AbortSignal, Parameters<RuntimeAuthorExecution['settle']>[0]>()
  const retry = () =>
    new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer)
        shutdown.signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, input.configuration.driverRetryDelayMs ?? 1000)
      shutdown.signal.addEventListener('abort', done, { once: true })
      if (shutdown.signal.aborted) done()
    })
  const retain = async (request: Parameters<ToolOutputCustody<unknown>['preserve']>[0]) => {
    const key = canonicalDigest([request.tenant, request.call, request.operation])
    pending.set(key, request)
    while (!shutdown.signal.aborted) {
      try {
        const preserved = await input.custody.preserve(request)
        if ('ok' in preserved) {
          pending.delete(key)
          return preserved
        }
        if (preserved.failure.kind !== 'unavailable' && preserved.failure.kind !== 'commit-unknown')
          return preserved
        const inspected = await input.custody.inspect(request)
        if ('ok' in inspected && inspected.ok.kind === 'retained') {
          pending.delete(key)
          return succeed(inspected.ok.raw)
        }
      } catch {
        // The original bytes and operation stay owned here when custody cannot answer.
      }
      await retry()
    }
    return fail({
      kind: 'unavailable' as const,
      dependency: 'toolOutputCustody',
      diagnostic: 'Original output custody remains unresolved after executor retirement.',
    })
  }
  const retainFinal = async (request: FinalRequest) => {
    const key = canonicalDigest([request.tenant, request.call, request.operation])
    finals.set(key, request)
    while (!shutdown.signal.aborted) {
      try {
        const answer = await input.finalCustody.preserveFinal(request)
        if ('ok' in answer) {
          finals.delete(key)
          return answer
        }
        if (answer.failure.kind !== 'unavailable' && answer.failure.kind !== 'commit-unknown')
          return answer
      } catch {}
      await retry()
    }
    return fail({
      kind: 'unavailable' as const,
      dependency: 'toolFinalCustody',
      diagnostic: 'Final custody remains unresolved after executor retirement.',
    })
  }
  const absentWaits: ToolWaiter = {
    wait: async request =>
      fail({
        kind: 'unavailable',
        operation: request.key,
        reason: 'The author wait provider is absent.',
      }),
  }
  return {
    close: () => shutdown.abort(),
    pending: () => pending.size + finals.size,
    retainedReturns: () => unencoded.size,
    scope({ execution }) {
      const blocks = new Map<string, ProcessBlock>()
      const scope = createIndependentToolScope({
        signal: execution.signal,
        limits: {
          authorBufferBytes: input.configuration.authorBufferBytes,
          authorBufferItems: input.configuration.authorBufferItems,
          authorWaitHistoryBytes: input.configuration.authorWaitHistoryBytes,
          authorWaitHistoryItems: input.configuration.authorWaitHistoryItems,
        },
        waits: absentWaits,
        process: {
          async receive({ sequence, update }) {
            const previous = blocks.get(update.index)
            const content =
              update.kind === 'replace'
                ? update.content
                : text.text(
                    (previous?.content.kind === 'text' ? previous.content.text : '') + update.text,
                  )
            if ('failure' in content)
              return fail({ kind: 'invalid', reason: content.failure.reason })
            const block = 'ok' in content ? content.ok.content[0] : content
            if (block === undefined)
              return fail({ kind: 'invalid', reason: 'Empty process block.' })
            const next: ProcessBlock = {
              index: update.index,
              sequence,
              mode: update.kind === 'replace' ? 'replace' : 'append',
              state: update.close ? 'closed' : 'open',
              content: block,
              trim: null,
            }
            if (update.close) blocks.delete(update.index)
            else blocks.set(update.index, next)
            execution.publish({ kind: 'process', blocks: [next] })
            return succeed(undefined)
          },
        },
      })
      if ('failure' in scope) throw new TypeError(`Invalid author scope: ${scope.failure.reason}`)
      return scope.ok
    },
    async settle(call) {
      const interrupted = interruption(call)
      const author = call.operation.author
      const operation = decodeToolOperationId(`${call.start.operation}/raw`)
      if ('failure' in operation)
        return fail({ kind: 'invalid', field: 'operation', reason: operation.failure.reason })
      const failed = (reason: string, cause: 'executor' | 'result' = 'result') => ({
        result: text.text(reason),
        terminal: { kind: 'failed', cause, diagnostic: reason } satisfies ToolTerminal,
      })
      let encoded: ReturnType<typeof author.codec.encode>
      try {
        encoded =
          call.outcome.kind === 'returned'
            ? author.codec.encode(call.outcome.value)
            : succeed(new TextEncoder().encode(JSON.stringify({ reason: call.outcome.reason })))
      } catch {
        encoded = fail({ reason: 'The original return codec threw.' })
      }
      if ('failure' in encoded) {
        unencoded.set(call.execution.signal, call)
        process.emitWarning(
          'The original Tool return remains in memory after output codec failure.',
          { code: 'TOOL_OUTPUT_CODEC_FAILED' },
        )
        return fail({
          kind: 'unavailable',
          dependency: 'author-output-codec',
          diagnostic: encoded.failure.reason,
        })
      }
      unencoded.delete(call.execution.signal)
      const bytes = encoded.ok.slice()
      const raw = await retain({
        principal: call.principal,
        tenant: call.tenant,
        call: call.call,
        operation: operation.ok,
        codec: call.outcome.kind === 'returned' ? author.codec.adoption : failureCodec,
        bytes,
        source: call.execution.source,
      })
      if ('failure' in raw) return raw
      let projected:
        | ReturnType<typeof failed>
        | {
            result: ReturnType<typeof defaultResultPolicy.judgeResult>
            terminal: ToolTerminal
          }
      try {
        if (call.outcome.kind === 'failed') projected = failed(call.outcome.reason, 'executor')
        else {
          const decoded = author.codec.decode(bytes)
          const argumentsValue = savedArguments(author, call.request)
          if ('failure' in decoded || 'failure' in argumentsValue) {
            projected = failed(
              'The original output or argument codec cannot reconstruct the saved return.',
            )
          } else {
            const result = checkedResult(author, argumentsValue.ok, decoded.ok, text)
            projected =
              'failure' in result
                ? failed(result.failure.reason)
                : {
                    result: defaultResultPolicy.judgeResult(result.ok),
                    terminal: { kind: 'completed' },
                  }
          }
        }
      } catch {
        projected = failed('The original return contract threw.')
      }
      if ('failure' in projected.result)
        return fail({
          kind: 'unavailable',
          dependency: 'toolResultPolicy',
          diagnostic: projected.result.failure.reason,
        })
      const finalOperation = decodeToolOperationId(`final:${canonicalDigest(call.start.operation)}`)
      if ('failure' in finalOperation)
        return fail({ kind: 'invalid', field: 'operation', reason: finalOperation.failure.reason })
      return retainFinal({
        principal: call.principal,
        tenant: call.tenant,
        call: call.call,
        operation: finalOperation.ok,
        start: call.start,
        source: call.execution.source,
        final: {
          kind: 'final',
          raw: raw.ok,
          result: projected.result.ok,
          terminal: interrupted ?? projected.terminal,
          effect: {
            kind: 'unknown',
            diagnostic: 'Author completion does not prove the disposition of external effects.',
          },
        },
      })
    },
  }
}

/**
 * The arguments of a saved call as its codec reads them again: the parameters of the admitted
 * command for a multi-command tool (D-94), the whole arguments otherwise.
 */
function savedArguments(author: ToolOperationSlot['author'], request: FixedToolRequest) {
  const cut = commandArguments(request.availability.definition, request.command, request.arguments)
  return 'failure' in cut ? cut : author.parameters.parse(cut.ok)
}

/** The checked and rendered result of a decoded return, per author kind. */
function checkedResult(
  author: ToolOperationSlot['author'],
  args: unknown,
  value: unknown,
  text: ReturnType<typeof createLocalTextResults>,
) {
  if (author.kind === 'ordinary') {
    const checked = author.output.check({ arguments: args, value })
    return 'failure' in checked
      ? checked
      : renderToolResult(checked.ok, author, text, defaultResultPolicy)
  }
  const checked = author.output.check({ arguments: args, value })
  return 'failure' in checked
    ? checked
    : renderToolResult(checked.ok, author, text, defaultResultPolicy)
}
