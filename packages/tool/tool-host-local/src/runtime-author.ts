import { fail, succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  createIndependentToolScope,
  type ToolConfiguration,
} from '@omne-harness/tool'
import {
  decodeToolOperationId,
  type ToolTerminal,
  type ProcessBlock,
} from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  describedAdoption,
  renderToolResult,
  type ToolMessageContentBlock,
  type ToolOutputCustody,
  type ToolWaiter,
} from '@omne-harness/tool-contract/provider'
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

/** Local emit receipts remain local. The fact driver owns durable process acceptance. */
export function createRuntimeAuthorExecution(
  input: Readonly<{
    configuration: ToolConfiguration
    custody: ToolOutputCustody<unknown>
  }>,
): RuntimeAuthorExecution & Readonly<{ close(): void; pending(): number }> {
  const text = createLocalTextResults()
  const shutdown = new AbortController()
  const pending = new Map<string, Parameters<ToolOutputCustody<unknown>['preserve']>[0]>()
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
    pending: () => pending.size,
    scope({ execution }) {
      const blocks = new Map<string, ProcessBlock>()
      const scope = createIndependentToolScope({
        signal: execution.signal,
        limits: input.configuration,
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
      if ('failure' in encoded)
        return fail({
          kind: 'unavailable',
          dependency: 'author-output-codec',
          diagnostic: encoded.failure.reason,
        })
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
          const argumentsValue = author.parameters.parse(call.request.arguments)
          if ('failure' in decoded || 'failure' in argumentsValue) {
            projected = failed(
              'The original output or argument codec cannot reconstruct the saved return.',
            )
          } else {
            const result = (() => {
              if (author.kind === 'ordinary') {
                const checked = author.output.check({
                  arguments: argumentsValue.ok,
                  value: decoded.ok,
                })
                return 'failure' in checked
                  ? checked
                  : renderToolResult(checked.ok, author, text, defaultResultPolicy)
              }
              const checked = author.output.check({
                arguments: argumentsValue.ok,
                value: decoded.ok,
              })
              return 'failure' in checked
                ? checked
                : renderToolResult(checked.ok, author, text, defaultResultPolicy)
            })()
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
      return succeed({
        kind: 'final',
        raw: raw.ok,
        result: projected.result.ok,
        terminal: projected.terminal,
        effect: {
          kind: 'unknown',
          diagnostic: 'Author completion does not prove the disposition of external effects.',
        },
      })
    },
  }
}
