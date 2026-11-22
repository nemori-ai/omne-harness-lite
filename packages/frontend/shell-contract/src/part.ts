import {
  list,
  type Contract,
  type Entry,
  type Registry,
  type Unavailable,
} from '@omne-harness/dynamis'

export const PARTS_POINT = 'shell.parts'

const DEPTHS = ['tokens', 'style', 'render'] as const

export type PartDepth = (typeof DEPTHS)[number]

export type PartDeclaration = Readonly<{
  name: string
  label: string
  summary: string
  within?: string | null
  depths: readonly PartDepth[]
  when?: string | null
}>

export type PartDeclarer = Readonly<{ declarePart: (declaration: PartDeclaration) => void }>

export type Part = Readonly<{
  name: string
  declaration: PartDeclaration
  props: Readonly<{ 'data-part': string }>
  declare: (shell: PartDeclarer) => void
}>

type PartItem = Readonly<{
  label: string
  summary: string
  within: string | null
  depths: readonly PartDepth[]
  when: string | null
}>

export type DeclaredPart = PartItem & Readonly<{ name: string; by: readonly string[] }>

export type PartsRead =
  | Readonly<{
      kind: 'read'
      parts: readonly DeclaredPart[]
      conflicts: readonly Readonly<{ name: string; by: readonly string[] }>[]
    }>
  | Unavailable

export const partsContract: Contract = {
  name: PARTS_POINT,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of the part: <host>.<area>, or with a part and one more under it',
  gives: 'nothing: a part is declared here, it is drawn by the module that declares it',
  item: { kind: 'data', fields: { label: 'string', summary: 'string', depths: 'array' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'a name declared two ways stands for no part, and nothing can be changed by it',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary:
    'The parts of the interface that have a name: what each is called, what it is, what it is inside, and which depths of change it opens.',
}

const SEGMENT = /^[a-z][a-z0-9-]*$/u

function nameFault(name: string): string | null {
  const segments = name.split('.')
  const count = segments.length
  if (count < 2 || count > 4)
    return `the name has ${count} segment${count === 1 ? '' : 's'}, a part has two to four`
  const bad = segments.find(segment => !SEGMENT.test(segment))
  return bad === undefined
    ? null
    : `the segment ${bad} is not lower case letters, digits and hyphens after a letter`
}

function depthsFault(depths: readonly string[]): string | null {
  const unknown = depths.find(depth => !(DEPTHS as readonly string[]).includes(depth))
  if (unknown !== undefined) return `the depth ${unknown} is not one of ${DEPTHS.join(', ')}`
  const twice = depths.find((depth, index) => depths.indexOf(depth) !== index)
  return twice === undefined ? null : `the depth ${twice} is named twice`
}

/** Why a module whose parts go under `host` may not declare this part, or null when it may. */
export function partFault(declaration: PartDeclaration, host: string): string | null {
  const { name, within } = declaration
  const shape = nameFault(name)
  if (shape !== null) return shape
  const under = name.slice(0, name.indexOf('.'))
  if (under !== host) return `the name is under ${under}, this module declares under ${host}`
  if (within === name) return 'the part is inside itself'
  const outer = within === undefined || within === null ? null : nameFault(within)
  if (outer !== null) return `within: ${outer}`
  const depths = depthsFault(declaration.depths)
  if (depths !== null) return depths
  if (declaration.label.trim() === '') return 'the label is empty'
  if (typeof declaration.when === 'string' && declaration.when.trim() === '')
    return 'the note of when it is drawn is empty'
  return declaration.summary.trim() === '' ? 'the summary is empty' : null
}

/** The host a view module declares under: its name without the `-ui` it ends with. */
export function partHostOf(module: string): string {
  return module.replace(/~\d+$/u, '').replace(/-ui$/u, '')
}

export function partEntry(declaration: PartDeclaration): Entry<PartItem> {
  const item: PartItem = {
    label: declaration.label,
    summary: declaration.summary,
    within: declaration.within ?? null,
    depths: [...declaration.depths],
    when: declaration.when ?? null,
  }
  return {
    point: PARTS_POINT,
    key: declaration.name,
    id: '',
    scope: [],
    rank: 0,
    digest: JSON.stringify([item.label, item.summary, item.within, item.depths, item.when]),
    item,
  }
}

export function definePart(declaration: PartDeclaration): Part {
  return {
    name: declaration.name,
    declaration,
    props: { 'data-part': declaration.name },
    declare: shell => shell.declarePart(declaration),
  }
}

/** The parts declared now, in the order of the registry; a name declared two ways stands for no part. */
export function partsOn(registry: Registry): PartsRead {
  const read = list<PartItem>(registry, PARTS_POINT, null, [])
  if (read.kind !== 'read') return read
  const parts = read.items.map(({ entry, holders }) => ({
    name: entry.key,
    ...entry.item,
    by: holders.map(holder => holder.fiber),
  }))
  const conflicts = read.conflicts.map(entries => ({
    name: entries[0]?.key ?? '',
    by: entries.map(entry => entry.instance.fiber).sort(),
  }))
  return { kind: 'read', parts, conflicts }
}
