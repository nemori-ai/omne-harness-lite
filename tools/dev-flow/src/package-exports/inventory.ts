export type ExportKind = 'type' | 'value' | 'class' | 'both'

export type InventoryName = Readonly<{
  name: string
  kind: ExportKind
  pending: boolean
  sameAs?: string
}>

export type InventoryChapter = Readonly<{ title: string; names: readonly InventoryName[] }>

export type InventoryEntry = Readonly<{ chapters: readonly InventoryChapter[] }>

export type Augmentation = Readonly<{
  module: string
  interface: string
  members: readonly string[]
  pending: boolean
  landed?: readonly string[]
}>

export type Inventory = Readonly<{
  package: string
  source: string
  expectedPending: number
  entries: Readonly<Record<string, InventoryEntry>>
  augmentations: readonly Augmentation[]
}>

export type DecodedInventory =
  | Readonly<{ kind: 'inventory'; inventory: Inventory }>
  | Readonly<{ kind: 'invalid'; problems: readonly string[] }>

const KINDS: ReadonlySet<string> = new Set(['type', 'value', 'class', 'both'])

type Fields = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isText)
}

function unknownKeys(value: Fields, allowed: readonly string[], at: string): string[] {
  return Object.keys(value)
    .filter(key => !allowed.includes(key))
    .map(key => `${at}: unknown field ${key}`)
}

function nameProblems(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at}: not an object`]
  const problems = unknownKeys(value, ['name', 'kind', 'pending', 'sameAs'], at)
  if (!isText(value['name'])) problems.push(`${at}: name is not a non-empty string`)
  if (typeof value['kind'] !== 'string' || !KINDS.has(value['kind']))
    problems.push(`${at}: kind is not one of ${[...KINDS].join(', ')}`)
  if (typeof value['pending'] !== 'boolean') problems.push(`${at}: pending is not a boolean`)
  if ('sameAs' in value && !isText(value['sameAs']))
    problems.push(`${at}: sameAs is not a non-empty string`)
  return problems
}

function entryProblems(value: unknown, at: string): string[] {
  if (!isRecord(value) || !Array.isArray(value['chapters']))
    return [`${at}: chapters is not a list`]
  const problems = unknownKeys(value, ['chapters'], at)
  value['chapters'].forEach((chapter: unknown, index) => {
    const here = `${at} chapter ${index}`
    if (!isRecord(chapter) || !isText(chapter['title']) || !Array.isArray(chapter['names'])) {
      problems.push(`${here}: needs a non-empty title and a names list`)
      return
    }
    problems.push(...unknownKeys(chapter, ['title', 'names'], here))
    chapter['names'].forEach((name: unknown, position) =>
      problems.push(...nameProblems(name, `${here} name ${position}`)),
    )
  })
  return problems
}

function augmentationProblems(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at}: not an object`]
  const problems = unknownKeys(value, ['module', 'interface', 'members', 'pending', 'landed'], at)
  if (!isText(value['module']) || !isText(value['interface']))
    problems.push(`${at}: module and interface must be non-empty strings`)
  if (!isTextList(value['members'])) problems.push(`${at}: members is not a list of names`)
  if (typeof value['pending'] !== 'boolean') problems.push(`${at}: pending is not a boolean`)
  if ('landed' in value && !isTextList(value['landed']))
    problems.push(`${at}: landed is not a list of names`)
  return problems
}

export function decodeInventory(value: unknown): DecodedInventory {
  if (!isRecord(value)) return { kind: 'invalid', problems: ['inventory: not an object'] }
  const problems = unknownKeys(
    value,
    ['package', 'source', 'expectedPending', 'entries', 'augmentations'],
    'inventory',
  )
  if (!isText(value['package'])) problems.push('inventory: package is not a non-empty string')
  if (!isText(value['source'])) problems.push('inventory: source is not a non-empty string')
  const expected = value['expectedPending']
  if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0)
    problems.push('inventory: expectedPending is not a non-negative integer')
  const entries = value['entries']
  if (!isRecord(entries) || Object.keys(entries).length === 0)
    problems.push('inventory: entries is not a non-empty object')
  else
    for (const [entry, body] of Object.entries(entries))
      problems.push(...entryProblems(body, `entry ${entry}`))
  const augmentations = value['augmentations']
  if (!Array.isArray(augmentations)) problems.push('inventory: augmentations is not a list')
  else
    augmentations.forEach((item: unknown, index) =>
      problems.push(...augmentationProblems(item, `augmentation ${index}`)),
    )
  if (problems.length > 0) return { kind: 'invalid', problems }
  return { kind: 'inventory', inventory: value as Inventory }
}

export function namesOf(entry: InventoryEntry): readonly InventoryName[] {
  return entry.chapters.flatMap(chapter => chapter.names)
}

export function isOwnEntry(sameAs: string): boolean {
  return sameAs === '.' || sameAs.startsWith('./')
}

export function inventoryProblems(
  inventory: Inventory,
  manifestEntries: readonly string[],
): string[] {
  const problems: string[] = []
  const listed = Object.keys(inventory.entries).sort()
  const manifest = [...manifestEntries].sort()
  for (const entry of manifest)
    if (!listed.includes(entry))
      problems.push(`package.json exports ${entry}, the inventory does not`)
  for (const entry of listed)
    if (!manifest.includes(entry))
      problems.push(`the inventory lists ${entry}, package.json does not export it`)
  let pending = 0
  for (const [entry, value] of Object.entries(inventory.entries)) {
    for (const chapter of value.chapters)
      if (chapter.names.length === 0) problems.push(`${entry}: chapter "${chapter.title}" is empty`)
    const seen = new Set<string>()
    for (const item of namesOf(value)) {
      if (seen.has(item.name)) problems.push(`${entry}: ${item.name} is listed twice`)
      seen.add(item.name)
      if (item.pending) pending += 1
      if (item.sameAs === undefined || !isOwnEntry(item.sameAs)) continue
      const ownerEntry = inventory.entries[item.sameAs]
      const owner =
        ownerEntry === undefined
          ? undefined
          : namesOf(ownerEntry).find(other => other.name === item.name)
      if (ownerEntry === undefined)
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which is not an entry`)
      else if (owner === undefined)
        problems.push(`${entry}: ${item.name} is sameAs ${item.sameAs}, which does not list it`)
    }
  }
  if (pending !== inventory.expectedPending)
    problems.push(
      `expectedPending is ${inventory.expectedPending}, the inventory flags ${pending} names pending`,
    )
  for (const augmentation of inventory.augmentations) {
    const unlisted = (augmentation.landed ?? []).filter(
      name => !augmentation.members.includes(name),
    )
    if (unlisted.length > 0)
      problems.push(
        `${augmentation.module} ${augmentation.interface}: landed ${unlisted.join(', ')} are not listed in members`,
      )
  }
  return problems
}
