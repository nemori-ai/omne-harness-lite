import { insidePackage, type Member, type PluginManifest } from './manifest.ts'

/** The kinds of file a package carries beside the files of its directory members. */
export const FILE_SUFFIXES = ['.js', '.css', '.json'] as const

export type PackageFile = Readonly<{ path: string; digest: string }>

export type PackageJudgment = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>

type Placed = Readonly<{ at: string; member: Member }>

const membersOf = (manifest: PluginManifest): readonly Placed[] =>
  (['client', 'server'] as const).flatMap(side =>
    (manifest[side]?.members ?? []).map((member, index) => ({
      at: `${side}.members[${index}]`,
      member,
    })),
  )

const under = (directory: string, path: string): boolean => path.startsWith(`${directory}/`)

function memberFault({ at, member }: Placed, files: readonly PackageFile[]): string | null {
  if ('module' in member)
    return files.some(file => file.path === member.module)
      ? null
      : `${at}: the file ${member.module} is not in the package`
  if ('directory' in member)
    return files.some(file => under(member.directory, file.path))
      ? null
      : `${at}: the directory ${member.directory} is not in the package`
  return null
}

function fileFault(path: string, directories: readonly string[]): string | null {
  if (!insidePackage(path)) return `the file ${path} is not a path inside the package`
  if (directories.some(directory => under(directory, path))) return null
  return FILE_SUFFIXES.some(suffix => path.endsWith(suffix))
    ? null
    : `the file ${path} is not one of ${FILE_SUFFIXES.join(', ')}`
}

/** Whether a package holds what its manifest writes, and nothing of a kind it may not carry. */
export function judgePackage(
  manifest: PluginManifest,
  files: readonly PackageFile[],
): PackageJudgment {
  const members = membersOf(manifest)
  const directories = members.flatMap(({ member }) =>
    'directory' in member ? [member.directory] : [],
  )
  const fault =
    members.map(placed => memberFault(placed, files)).find(found => found !== null) ??
    files.map(file => fileFault(file.path, directories)).find(found => found !== null)
  return typeof fault === 'string' ? { ok: false, reason: fault } : { ok: true }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== 'object' || value === null) return value
  const fields = value as Readonly<Record<string, unknown>>
  return Object.fromEntries(
    Object.keys(fields)
      .sort()
      .map(key => [key, canonical(fields[key])]),
  )
}

const byPath = (left: PackageFile, right: PackageFile): number => (left.path < right.path ? -1 : 1)

function filesOf(member: Member, files: readonly PackageFile[]): readonly PackageFile[] {
  const own = (path: string): boolean =>
    'module' in member
      ? path === member.module
      : 'directory' in member && under(member.directory, path)
  return files.filter(file => own(file.path)).sort(byPath)
}

/** Two members with one digest put the same item: the text of the member, and the digests of the files it writes. */
export function memberDigest(member: Member, files: readonly PackageFile[]): string {
  const held = filesOf(member, files).map(file => [file.path, file.digest])
  return JSON.stringify([canonical(member), held])
}
