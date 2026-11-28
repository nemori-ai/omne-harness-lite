import { fiberOf, lacksText, type Kept, type ReportedPoint } from '@omne-harness/plugin-protocol'
import type { Changes, Described } from '@omne-harness/shell-contract'

export type PluginReport = Readonly<{
  name: string
  version: string
  state: 'loaded' | 'failed' | 'held'
  reason: string | null
  /** The plugin waits for these, by name; it says failed to a server that does not know waiting. */
  waiting?: readonly string[]
}>

type Tree = Readonly<{
  points: readonly ReportedPoint[]
  parts: Described['parts']
  handed?: readonly string[]
}>
export type Reported = Tree & Readonly<{ plugins: readonly PluginReport[] }>

/** The tree as the protocol tells it: the rules of each point as plain data, its fields as a list in the order of their names. */
export function describedOf({ points, parts }: Described): Tree {
  return {
    parts,
    points: points.map(({ name, summary, contract, dataKeys, form }): ReportedPoint => {
      const { arity, keyFrom, key, gives, item, resolve, binding, onError, version, revision } =
        contract
      const fields = Object.entries(item.fields)
        .map(([field, kind]) => ({ name: field, kind }))
        .sort((left, right) => (left.name < right.name ? -1 : 1))
      const rules = { arity, keyFrom, key, gives, resolve, binding, onError, version, revision }
      const { scopes } = contract
      const told = {
        ...rules,
        item: { kind: item.kind, fields },
        example: contract.example ?? null,
        ...(scopes !== undefined && scopes !== 'all' && { scopes }),
        title: contract.title,
      }
      return {
        name,
        summary,
        contract: told,
        ...(dataKeys === undefined ? {} : { dataKeys }),
        ...(form === undefined ? {} : { form }),
      }
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
      if (kind === 'waiting') {
        const waiting = state.lacks.map(lack => lack.name)
        return [
          {
            name,
            version,
            state: 'failed',
            reason: `waits for ${lacksText(state.lacks)}`,
            waiting,
          },
        ]
      }
      const reason = kind === 'failed' ? state.reason : clash(fiberOf(name, version))
      return [{ name, version, state: kind, reason }]
    })
    .sort((left, right) => (left.name < right.name ? -1 : 1))
}

/** The same report for a server before revision 4 of plugin/v1: the rules of a point say no title. */
export function beforeRevisionFour(reported: Reported): Reported {
  return {
    ...reported,
    points: reported.points.map(({ contract, ...point }) => {
      if (contract === undefined) return point
      const { title: _title, ...rules } = contract
      return { ...point, contract: rules }
    }),
  }
}

/** The same report for a server before revision 3 of plugin/v1: a waiting plugin is told as failed with the reason alone, and nothing of revision 3 is said. */
export function beforeRevisionThree(told: Reported): Reported {
  const { handed: _handed, ...reported } = beforeRevisionFour(told)
  return {
    ...reported,
    plugins: reported.plugins.map(({ waiting: _waiting, ...rest }) => rest),
    points: reported.points.map(({ form: _form, contract, ...point }) => {
      if (contract === undefined) return point
      const { scopes: _scopes, ...rules } = contract
      return { ...point, contract: rules }
    }),
  }
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
