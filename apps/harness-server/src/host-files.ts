import {
  createHostFilesDomain,
  type HostFilesDomain,
} from '@omne-harness/execution-environment-host-local'
import type { HostFilesReport } from './types.ts'

export type HostFilesMaintenance =
  | Readonly<{ kind: 'maintained'; pending: number }>
  | Readonly<{ kind: 'unavailable' }>

export type HostFilesRuntime = ReturnType<typeof createHostFilesRuntime>

/** The entry owns the domain and this queue across all provider generations. */
export function createHostFilesRuntime(options: {
  domain?: HostFilesDomain
  diagnose: (
    diagnostic: Readonly<{
      kind: 'host-files-maintenance-failed' | 'host-files-retirement-failed'
    }>,
  ) => void
}) {
  const domain = options.domain ?? createHostFilesDomain()
  let tail = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | undefined
  let state: 'idle' | 'periodic' | 'stopping' | 'closed' = 'idle'
  let finishing: Promise<HostFilesReport> | undefined

  function request(): Promise<HostFilesMaintenance> {
    if (state === 'closed') return Promise.resolve({ kind: 'unavailable' })
    const next = tail.then(async (): Promise<HostFilesMaintenance> => {
      try {
        const { pending } = await domain.maintain()
        return { kind: 'maintained', pending }
      } catch {
        options.diagnose({ kind: 'host-files-maintenance-failed' })
        return { kind: 'unavailable' }
      }
    })
    tail = next.then(() => undefined)
    return next
  }

  function start(intervalMs: number): void {
    if (state !== 'idle') return
    state = 'periodic'
    const schedule = (remaining: number) => {
      if (state !== 'periodic') return
      const delay = Math.min(remaining, 2 ** 31 - 1)
      timer = setTimeout(() => {
        timer = undefined
        if (remaining > delay) schedule(remaining - delay)
        else void request().then(() => schedule(intervalMs))
      }, delay)
    }
    schedule(intervalMs)
  }

  function stopPeriodic(): void {
    if (state !== 'closed') state = 'stopping'
    clearTimeout(timer)
    timer = undefined
  }

  async function close(): Promise<void> {
    stopPeriodic()
    state = 'closed'
    await tail
  }

  function finish(retire: () => Promise<unknown>): Promise<HostFilesReport> {
    stopPeriodic()
    return (finishing ??= (async (): Promise<HostFilesReport> => {
      await tail
      try {
        await retire()
        const result = await request()
        if (result.kind === 'unavailable')
          return { kind: 'unavailable', diagnostic: 'maintenance-failed' }
        return result.pending === 0
          ? { kind: 'settled', count: 0 }
          : { kind: 'host-files-unsettled', count: result.pending }
      } catch {
        options.diagnose({ kind: 'host-files-retirement-failed' })
        return { kind: 'unavailable', diagnostic: 'retirement-failed' }
      } finally {
        await close()
      }
    })())
  }

  return { domain, request, start, stopPeriodic, close, finish }
}
