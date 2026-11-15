// The steps run in one function, in order, because the effects of one fiber are released concurrently; both triggers call it and the later one waits for the first run.
import type { SessionInstance } from '@omne-harness/session'
import type { StopResult } from './assembly-lifecycle.ts'
import { describe, type Diagnose } from './diagnostics.ts'
import type { Scanners } from './scanners.ts'

export type Teardown = () => Promise<StopResult>

export function createTeardown(
  input: Readonly<{
    mark(): void
    scanners: Scanners
    instance: SessionInstance<unknown>
    disposeWaitMs: number
    diagnose: Diagnose
  }>,
): Teardown {
  const { mark, scanners, instance, disposeWaitMs, diagnose } = input
  let shared: Promise<StopResult> | undefined

  const run = async (): Promise<StopResult> => {
    mark()
    const problems: string[] = [...(await scanners.releaseAll())]

    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => {
        resolve('timeout')
      }, disposeWaitMs)
    })
    const closed = (async () => instance.close())().then(
      () => 'closed' as const,
      (error: unknown) => {
        const problem = `closing the session instance failed: ${describe(error)}`
        diagnose(problem)
        problems.push(problem)
        return 'closed' as const
      },
    )
    const outcome = await Promise.race([closed, timeout])
    clearTimeout(timer)

    if (outcome === 'timeout') {
      const detail = `the session instance did not stop within ${String(disposeWaitMs)} ms`
      diagnose(detail)
      return { kind: 'incomplete', detail }
    }
    return problems.length === 0
      ? { kind: 'settled' }
      : { kind: 'failed', detail: problems.join('; ') }
  }

  return () => (shared ??= run())
}
