// Declared production-dependency closure of a workspace member, read from package.json files only
// (no pnpm, no network), and the forbidden-dependency judgment on it. The installed closure is
// judged again after installation by consumer.ts, because third-party packages bring their own
// dependencies.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Manifest = Readonly<{
  name: string
  version?: string
  exports?: Readonly<Record<string, unknown>>
  dependencies?: Readonly<Record<string, string>>
  optionalDependencies?: Readonly<Record<string, string>>
  peerDependencies?: Readonly<Record<string, string>>
}>

export type ForbiddenRule = Readonly<{ category: string; names: readonly string[] }>

export type Policy = Readonly<{ profile: string; forbidden: readonly ForbiddenRule[] }>

export type Violation = Readonly<{
  name: string
  category: string
  /** Declared dependency chain from the member to the offending package. */
  via: readonly string[]
}>

export type DeclaredClosure = Readonly<{
  /** The member itself first, then every workspace member that it reaches. */
  workspace: readonly Readonly<{ name: string; directory: string; via: readonly string[] }>[]
  external: readonly Readonly<{ name: string; via: readonly string[] }>[]
}>

const PRODUCTION_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const

export function readManifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest
}

export function readPolicy(path: string): Policy {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Policy>
  if (typeof value.profile !== 'string' || !Array.isArray(value.forbidden))
    throw new Error(`${path}: policy needs "profile" and "forbidden"`)
  return value as Policy
}

function expand(root: string, pattern: string): string[] {
  let directories = [root]
  for (const part of pattern.split('/')) {
    directories = directories.flatMap(directory => {
      if (!part.includes('*')) return [join(directory, part)]
      if (!existsSync(directory)) return []
      return readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => join(directory, entry.name))
    })
  }
  return directories.filter(directory => existsSync(join(directory, 'package.json')))
}

/** Maps workspace package names to directories, from the `packages:` globs of pnpm-workspace.yaml. */
export function workspaceMembers(root: string): Map<string, string> {
  const text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const block = /^packages:\n((?: {2}- .+\n)+)/mu.exec(text)?.[1] ?? ''
  const patterns = [...block.matchAll(/^ {2}- '?([^'\n]+)'?$/gmu)].map(match => match[1] as string)
  const members = new Map<string, string>()
  for (const pattern of patterns)
    for (const directory of expand(root, pattern))
      members.set(readManifest(directory).name, directory)
  return members
}

export function declaredClosure(
  memberDirectory: string,
  members: ReadonlyMap<string, string>,
): DeclaredClosure {
  const root = readManifest(memberDirectory)
  const workspace = [{ name: root.name, directory: memberDirectory, via: [root.name] }]
  const external: { name: string; via: readonly string[] }[] = []
  const seen = new Set([root.name])
  const queue: { manifest: Manifest; via: readonly string[] }[] = [
    { manifest: root, via: [root.name] },
  ]
  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    for (const field of PRODUCTION_FIELDS) {
      for (const name of Object.keys(item.manifest[field] ?? {})) {
        if (seen.has(name)) continue
        seen.add(name)
        const via = [...item.via, name]
        const directory = members.get(name)
        if (directory === undefined) {
          external.push({ name, via })
          continue
        }
        workspace.push({ name, directory, via })
        queue.push({ manifest: readManifest(directory), via })
      }
    }
  }
  return { workspace, external }
}

function matcher(pattern: string): RegExp {
  const escaped = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
  return new RegExp(`^${escaped.join('.*')}$`, 'u')
}

export function findForbidden(
  packages: readonly Readonly<{ name: string; via: readonly string[] }>[],
  policy: Policy,
): Violation[] {
  const rules = policy.forbidden.map(rule => ({
    category: rule.category,
    patterns: rule.names.map(matcher),
  }))
  return packages.flatMap(item => {
    const hit = rules.find(rule => rule.patterns.some(pattern => pattern.test(item.name)))
    return hit === undefined ? [] : [{ name: item.name, category: hit.category, via: item.via }]
  })
}

/** Dependency specifiers that only make sense inside the workspace and must not reach a consumer. */
export function workspaceResidue(manifest: Manifest): string[] {
  const residue: string[] = []
  for (const field of PRODUCTION_FIELDS)
    for (const [name, specifier] of Object.entries(manifest[field] ?? {}))
      if (/^(workspace|catalog|link|file|portal):/u.test(specifier))
        residue.push(`${field}.${name} = ${specifier}`)
  return residue
}
