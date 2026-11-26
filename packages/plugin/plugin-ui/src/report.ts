import { fiberOf, type Kept, type ReportedPoint } from '@omne-harness/plugin-protocol'
import type { Changes, Described } from '@omne-harness/shell-contract'

export type PluginReport = Readonly<{
  name: string
  version: string
  state: 'loaded' | 'failed' | 'held'
  reason: string | null
}>

type Tree = Readonly<{ points: readonly ReportedPoint[]; parts: Described['parts'] }>
export type Reported = Tree & Readonly<{ plugins: readonly PluginReport[] }>

/** The tree as the protocol tells it: the rules of each point as plain data, its fields as a list in the order of their names. */
export function describedOf({ points, parts }: Described): Tree {
  return {
    parts,
    points: points.map(({ name, summary, contract, dataKeys }): ReportedPoint => {
      const { arity, keyFrom, key, gives, item, resolve, binding, onError, version, revision } =
        contract
      const fields = Object.entries(item.fields)
        .map(([field, kind]) => ({ name: field, kind }))
        .sort((left, right) => (left.name < right.name ? -1 : 1))
      const rules = { arity, keyFrom, key, gives, resolve, binding, onError, version, revision }
      const told = {
        ...rules,
        item: { kind: item.kind, fields },
        example: contract.example ?? null,
      }
      return { name, summary, contract: told, ...(dataKeys === undefined ? {} : { dataKeys }) }
    }),
  }
}

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
      // A waiting plugin is told as one that did not load, with what it waits for as the reason.
      if (kind === 'waiting')
        return [{ name, version, state: 'failed', reason: `waits for ${state.lacks.join(', ')}` }]
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
