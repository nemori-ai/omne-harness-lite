import type { CanvasKindBody } from '@omne-harness/canvas-protocol'
import { lookScope } from '@omne-harness/shell-contract'
import type { Reading } from './reading.ts'

/** What the server says of one kind: declared with its name for people, not declared, or not known now. */
export type KindStanding =
  | Readonly<{ kind: 'declared'; label: string }>
  | Readonly<{ kind: 'undeclared' }>
  | Readonly<{ kind: 'unreadable' }>

/** A kind the server lists twice is a basis that cannot be had, the same as kinds that cannot be read. */
export function standingOf(kinds: Reading<readonly CanvasKindBody[]>, name: string): KindStanding {
  if (kinds.kind !== 'read') return { kind: 'unreadable' }
  const listed = kinds.value.find(kind => kind.name === name)
  if (listed === undefined) return { kind: 'undeclared' }
  return listed.kind === 'declared'
    ? { kind: 'declared', label: listed.label }
    : { kind: 'unreadable' }
}

type Instance = Readonly<{ fiber: string; generation: number }>

/** What a view module may read of the registry the shell holds: who placed what, at which scope. */
export type PlacedDrawings = Readonly<{
  serving: readonly Instance[]
  placed: readonly Readonly<{
    point: string
    key: string
    scope: readonly string[]
    instance: Instance
  }>[]
}>

export type DrawingHost = Readonly<{
  registry(): PlacedDrawings
  look(): string | undefined
}>

const sees = (scope: readonly string[], asker: readonly string[]): boolean =>
  scope.length <= asker.length && scope.every((part, at) => asker[at] === part)

/** Who put the drawings on a key of a point at the deepest layer this tenant sees, if two or more. */
export function drawingsInConflict(
  host: DrawingHost,
  point: string,
  key: string,
  scope: string | undefined,
): readonly string[] {
  const registry = host.registry()
  const asker = lookScope(scope, host.look())
  const serving = (instance: Instance) =>
    registry.serving.some(
      one => one.fiber === instance.fiber && one.generation === instance.generation,
    )
  const standing = registry.placed.filter(
    placed =>
      placed.point === point &&
      placed.key === key &&
      sees(placed.scope, asker) &&
      serving(placed.instance),
  )
  const depth = Math.max(-1, ...standing.map(placed => placed.scope.length))
  const owners = new Set(
    standing.filter(placed => placed.scope.length === depth).map(placed => placed.instance.fiber),
  )
  return owners.size > 1 ? [...owners].sort() : []
}
