import type { Context, Plugin } from '@deepseek-ai/cordis'
import type { ContextCompaction } from '@omne-harness/agent-contract'
import { ContextCompactionService } from '@omne-harness/agent-cordis-contract/cordis'
import { createContextCompaction, type CompactionProviderOptions } from './provider.ts'

export type CompactionPluginInput = Readonly<{
  inject: readonly string[]
  create(ctx: Context): Promise<CompactionProviderOptions<unknown>>
  pollMs?: number
  pageSize?: number
  report?: (diagnostic: string) => void
}>

/** The application supplies storage, authorization and an executor independently. */
export function createContextCompactionPlugin(input: CompactionPluginInput): Plugin.Object {
  const pollMs = input.pollMs ?? 1000
  const pageSize = input.pageSize ?? 32
  if (
    !Number.isSafeInteger(pollMs) ||
    pollMs < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000
  )
    throw new RangeError('Compaction polling and page limits must be positive safe integers')
  return {
    name: 'context-compaction',
    inject: [...input.inject],
    async apply(ctx) {
      const options = await input.create(ctx)
      const provider = createContextCompaction(options)
      let closed = false
      let running = false
      let timer: ReturnType<typeof setTimeout> | null = null
      let after: string | null = null
      const report = (diagnostic: string) => {
        try {
          input.report?.(diagnostic)
        } catch {}
      }
      function schedule(delay: number) {
        if (closed || running) return
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void pump()
        }, delay)
        timer.unref()
      }
      async function pump() {
        if (closed || running) return
        running = true
        try {
          const page = await options.store.pending({
            authority: options.authority,
            after,
            limit: pageSize,
          })
          if ('failure' in page) {
            report(`pending: ${page.failure.kind}`)
            return
          }
          after = page.ok.next
          for (const ref of page.ok.refs) {
            if (closed) break
            const result = await provider.reconcile(ref)
            if ('failure' in result) report(`reconcile: ${result.failure.kind}`)
          }
        } catch (error) {
          report(`reconciliation threw: ${String(error)}`)
        } finally {
          running = false
          schedule(after === null ? pollMs : 0)
        }
      }
      class BoundService extends ContextCompactionService<unknown> {
        readonly admit: ContextCompaction<unknown>['admit'] = async request => {
          const result = await provider.service.admit(request)
          if ('ok' in result) schedule(0)
          return result
        }
        readonly inspect = provider.service.inspect
        readonly cancel: ContextCompaction<unknown>['cancel'] = async request => {
          const result = await provider.service.cancel(request)
          if ('ok' in result) schedule(0)
          return result
        }
        readonly acknowledge = provider.service.acknowledge
      }
      new BoundService(ctx)
      ctx.effect(() => () => {
        provider.withdraw()
        closed = true
        if (timer !== null) clearTimeout(timer)
        // An already-started reconciliation can persist its outcome. Unloading never
        // claims that provider-owned external work has physically stopped.
      })
      schedule(0)
    },
  }
}
