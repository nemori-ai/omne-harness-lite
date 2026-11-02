// The removal of the plugin (SPEC property 9). Four steps run in one function, in order, because
// the effects of one fiber are released concurrently (effect-disposal-concurrent-not-ordered).
// Two triggers call the same function: the stop handle of the ordered shutdown and the effect of
// the fiber. Whichever comes first runs the steps; the later one waits for that run and gets its
// result. `close` is called once.
import type { SessionInstance } from '@omne-harness/session'
import type { StopResult } from './assembly-lifecycle.ts'
import { describe, type Diagnose } from './diagnostics.ts'
import type { Scanners } from './scanners.ts'

export type Teardown = () => Promise<StopResult>

export function createTeardown(
  input: Readonly<{
    /** Step 1: faces answer `unavailable`, notices are not handed on, no scanner is bound. */
    mark(): void
    scanners: Scanners
    instance: SessionInstance<unknown>
    /** The upper bound of the wait for `close`. It limits this plugin only, not the shutdown. */
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
      // The wait ends here; the instance does not stop because of it. Commands in flight end with
      // their own receipt or with `commit-unknown`.
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
