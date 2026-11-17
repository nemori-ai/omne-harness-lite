export interface FileTime {
  readonly file: string
  readonly seconds: number
}

export type Batch =
  | { readonly member: string; readonly kind: 'whole'; readonly seconds: number }
  | {
      readonly member: string
      readonly kind: 'files'
      readonly index: number
      readonly files: readonly string[]
      readonly exclude: readonly string[]
      readonly seconds: number
    }
  | {
      readonly member: string
      readonly kind: 'rest'
      readonly exclude: readonly string[]
      readonly seconds: number
      readonly expected: number
    }

const TYPECHECK_FILE = /\.(?:spec|test)-d\.[cm]?[jt]sx?$/u

export const UNKNOWN_FIRST = Number.MAX_SAFE_INTEGER

export const isTypecheckFile = (file: string) => TYPECHECK_FILE.test(file)

function groupsOf(files: readonly FileTime[]): FileTime[][] {
  const groups: FileTime[][] = []
  for (const file of files) {
    const overlapping = groups.filter(group =>
      group.some(other => other.file.includes(file.file) || file.file.includes(other.file)),
    )
    const merged = [...overlapping.flat(), file]
    for (const group of overlapping) groups.splice(groups.indexOf(group), 1)
    groups.push(merged)
  }
  return groups
}

const total = (files: readonly FileTime[]) => files.reduce((sum, file) => sum + file.seconds, 0)

export function memberBatches(
  member: string,
  history: readonly FileTime[],
  targetSeconds: number,
  skipped: ReadonlySet<string> = new Set(),
): Batch[] {
  const known = history.filter(file => !skipped.has(file.file))
  const typecheck = known.filter(file => isTypecheckFile(file.file))
  const rest = (exclude: readonly string[], seconds: number): Batch => ({
    member,
    kind: 'rest',
    exclude: [...new Set([...exclude, ...skipped])].sort(),
    seconds,
    expected: Math.max(1, typecheck.length),
  })
  if (history.length === 0)
    return [
      skipped.size === 0
        ? { member, kind: 'whole', seconds: UNKNOWN_FIRST }
        : rest([], UNKNOWN_FIRST),
    ]
  const runtime = known.filter(file => !isTypecheckFile(file.file))
  const sum = total(known)
  if (runtime.length <= 1 || total(runtime) <= targetSeconds)
    return [skipped.size === 0 ? { member, kind: 'whole', seconds: sum } : rest([], sum)]
  const groups = groupsOf(runtime).sort((a, b) => total(b) - total(a))
  const bins: FileTime[][] = []
  for (const group of groups) {
    const fit = bins.find(bin => total(bin) + total(group) <= targetSeconds)
    if (fit === undefined) bins.push([...group])
    else fit.push(...group)
  }
  const batches: Batch[] = bins.map((bin, index) => ({
    member,
    kind: 'files',
    index: index + 1,
    files: bin.map(file => file.file).sort(),
    exclude: [...skipped].sort(),
    seconds: total(bin),
  }))
  batches.push(
    rest(
      runtime.map(file => file.file),
      total(typecheck),
    ),
  )
  return batches
}

export function batchQueue(
  members: readonly string[],
  known: (member: string) => readonly FileTime[],
  targetSeconds: number,
  skipped: (member: string) => ReadonlySet<string> = () => new Set(),
): Batch[] {
  return members
    .flatMap(member => memberBatches(member, known(member), targetSeconds, skipped(member)))
    .map((batch, order) => ({ batch, order }))
    .sort((a, b) => b.batch.seconds - a.batch.seconds || a.order - b.order)
    .map(({ batch }) => batch)
}

export function batchLabel(batch: Batch): string {
  if (batch.kind === 'whole') return batch.member
  if (batch.kind === 'files') return `${batch.member}#${batch.index}`
  return `${batch.member}#rest`
}

export function batchArgs(batch: Batch): string[] {
  if (batch.kind === 'whole') return []
  const exclude = batch.exclude.flatMap(file => ['--exclude', file])
  return batch.kind === 'files' ? [...batch.files, ...exclude] : exclude
}

export function batchFiles(batch: Batch): number | undefined {
  if (batch.kind === 'files') return batch.files.length
  return batch.kind === 'rest' ? batch.expected : undefined
}
