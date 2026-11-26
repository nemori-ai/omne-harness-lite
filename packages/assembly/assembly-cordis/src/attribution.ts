import { AsyncLocalStorage } from 'node:async_hooks'

const guest = new AsyncLocalStorage<string>()

/** Runs guest code so that a fall of the process while it runs, or on what it started, is traced to `who`. */
export const attributed = <T>(who: string, run: () => T): T => guest.run(who, run)

export const attributedNow = (): string | undefined => guest.getStore()

export type Fall = Readonly<{ who: string | null; error: string }>

export type FallWatch = Readonly<{
  /** Called once, synchronously, before the process leaves: it must not wait for anything. */
  record(fall: Fall): void
  exit(code: 1): void
}>

const textOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Watches the whole process: an exception nobody caught is recorded with whom it is traced to, and the process leaves with 1. */
export function watchFalls(watch: FallWatch): () => void {
  let fallen = false
  const onFall = (error: unknown): void => {
    if (fallen) return
    fallen = true
    try {
      watch.record({ who: attributedNow() ?? null, error: textOf(error) })
    } finally {
      watch.exit(1)
    }
  }
  process.on('uncaughtException', onFall)
  process.on('unhandledRejection', onFall)
  return () => {
    process.off('uncaughtException', onFall)
    process.off('unhandledRejection', onFall)
  }
}
