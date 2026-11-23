import type { Changes, Described } from '@omne-harness/shell-contract'
import { fiberOf } from './floor.ts'
import type { Kept } from './loader.ts'

export type PluginReport = Readonly<{
  name: string
  version: string
  state: 'loaded' | 'failed' | 'held'
  reason: string | null
}>

export type Reported = Described & Readonly<{ plugins: readonly PluginReport[] }>

/** How each plugin with an outcome stands, by name. A loaded one that does not count somewhere says where and with whom. */
export function reportsOf(
  states: ReadonlyMap<string, Kept>,
  conflicts: Changes['conflicts'],
): readonly PluginReport[] {
  const clash = (fiber: string): string | null => {
    const at = conflicts.find(each => each.by.includes(fiber))
    if (at === undefined) return null
    const others = at.by.filter(other => other !== fiber).join(', ')
    return `${at.point} ${at.key} is put as well by ${others}: neither counts`
  }
  return [...states]
    .flatMap(([name, state]): PluginReport[] => {
      if (state.kind === 'loading') return []
      const { version, kind } = state
      const reason = kind === 'failed' ? state.reason : clash(fiberOf(name, version))
      return [{ name, version, state: kind, reason }]
    })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
}

/** Tells what differs from what was last taken, one telling at a time; what changed meanwhile is told right after one that was taken. */
export function createReporter(
  tell: () => Reported,
  send: (reported: Reported) => Promise<boolean>,
): Readonly<{ touch(): void; stop(): void }> {
  let taken: string | undefined
  let sending = false
  let stopped = false
  const touch = (): void => {
    if (stopped || sending) return
    const reported = tell()
    const text = JSON.stringify(reported)
    if (text === taken) return
    sending = true
    void send(reported)
      .catch(() => false)
      .then(took => {
        sending = false
        if (!took) return
        taken = text
        touch()
      })
  }
  return {
    touch,
    stop() {
      stopped = true
    },
  }
}
