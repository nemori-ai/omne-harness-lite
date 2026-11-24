import { insidePackage, type Member, type PluginManifest, type SideName } from './manifest.ts'

/** The kinds of file a package carries beside the files of its directory members. */
export const FILE_SUFFIXES = ['.js', '.css', '.json'] as const

export const IMAGE_SUFFIXES = ['.png', '.jpg', '.webp', '.avif', '.svg'] as const

const CARRIED: readonly string[] = [...FILE_SUFFIXES, ...IMAGE_SUFFIXES]

type Begins = (head: Uint8Array) => boolean

const at = (head: Uint8Array, from: number, ...bytes: number[]): boolean =>
  bytes.every((byte, index) => head[from + index] === byte)

function vector(head: Uint8Array): boolean {
  const words = new TextDecoder().decode(head)
  const root = words.replace(/^\uFEFF?(?:\s|<\?[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/u, '')
  return /^<svg[\s>/]/u.test(root)
}

const BEGINS: Readonly<Record<(typeof IMAGE_SUFFIXES)[number], Begins>> = {
  '.png': head => at(head, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  '.jpg': head => at(head, 0, 0xff, 0xd8, 0xff),
  '.webp': head => at(head, 0, 0x52, 0x49, 0x46, 0x46) && at(head, 8, 0x57, 0x45, 0x42, 0x50),
  '.avif': head => at(head, 4, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69) && at(head, 11, 0x66),
  '.svg': vector,
}

export const IMAGE_HEAD_BYTES = 1024

export function imageFault(path: string, head: Uint8Array): string | null {
  const suffix = IMAGE_SUFFIXES.find(each => path.endsWith(each))
  if (suffix === undefined || BEGINS[suffix](head)) return null
  return `the file ${path} is not the image its name says`
}

const FILE_REF = /(?<![A-Za-z0-9_-])file\(([^()]*)\)/gu

export function fileRefs(value: string): readonly string[] {
  return [...new Set(Array.from(value.matchAll(FILE_REF), match => (match[1] ?? '').trim()))]
}

function pointed(data: unknown): readonly string[] {
  if (typeof data === 'string') return fileRefs(data)
  if (typeof data !== 'object' || data === null) return []
  return Object.values(data).flatMap(pointed)
}

export type PackageFile = Readonly<{ path: string; digest: string }>

export type PackageJudgment = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>

export type PlacedMember = Readonly<{ at: string; side: SideName; member: Member }>
type Placed = PlacedMember

/** Every member of a manifest with where the manifest writes it. */
export const membersOf = (manifest: PluginManifest): readonly PlacedMember[] =>
  (['client', 'server'] as const).flatMap(side =>
    (manifest[side]?.members ?? []).map((member, index) => ({
      at: `${side}.members[${index}]`,
      side,
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
  const lost = pointed(member.data).find(path => !files.some(file => file.path === path))
  return lost === undefined ? null : `${at}: the file ${lost} it points at is not in the package`
}

function fileFault(path: string, directories: readonly string[]): string | null {
  if (!insidePackage(path)) return `the file ${path} is not a path inside the package`
  if (directories.some(directory => under(directory, path))) return null
  return CARRIED.some(suffix => path.endsWith(suffix))
    ? null
    : `the file ${path} is not one of ${CARRIED.join(', ')}`
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
