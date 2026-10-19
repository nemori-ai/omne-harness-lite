// A role fixture is a small consumer project that lives in the member's tests. This file reads what
// the fixture declares in `fixture.json` and judges it against the member's closure: the declarations decide what the
// consumer directory installs, so a fixture cannot depend on more than it says.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { declaredClosure, type DeclaredClosure, type Policy } from './closure.ts'

export type FixtureSpec = Readonly<{
  directory: string
  role: string
  /** The packages that `fixture.ts` may import, by name. */
  dependencies: readonly string[]
  /** Names or `*` patterns that this fixture forbids on top of the member's policy. */
  forbidden: readonly string[]
}>

export type FixtureRead =
  | Readonly<{ kind: 'read'; spec: FixtureSpec }>
  | Readonly<{ kind: 'unreadable'; detail: string }>

/** The files that make a directory a fixture. */
export const FIXTURE_FILES = ['fixture.json', 'tsconfig.json', 'fixture.ts'] as const

function isTextList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

function unreadable(detail: string): FixtureRead {
  return { kind: 'unreadable', detail }
}

/** Reads `fixture.json` of a fixture; every way that it can be wrong is a named reason. */
export function readFixture(directory: string): FixtureRead {
  const missing = FIXTURE_FILES.filter(file => !existsSync(join(directory, file)))
  if (missing.length > 0) return unreadable(`${directory} lacks ${missing.join(', ')}`)
  const declared = parseJson(join(directory, 'fixture.json'))
  if (!isRecord(declared)) return unreadable(`${directory}/fixture.json is not a JSON object`)
  const { role, dependencies, forbidden = [] } = declared
  if (typeof role !== 'string' || role === '') return unreadable('fixture.json has no role')
  if (!isTextList(dependencies) || dependencies.length === 0)
    return unreadable('the fixture declares no dependencies')
  if (!isTextList(forbidden)) return unreadable('forbidden is not a list of names')
  return {
    kind: 'read',
    spec: { directory, role, dependencies: [...dependencies].sort(), forbidden },
  }
}

/** The declared dependencies that the member's closure does not contain. */
export function outsideClosure(spec: FixtureSpec, closure: ReadonlySet<string>): string[] {
  return spec.dependencies.filter(name => !closure.has(name))
}

/** The member's policy with this fixture's own forbidden names added as one more category. */
export function withFixtureForbidden(policy: Policy, spec: FixtureSpec): Policy {
  if (spec.forbidden.length === 0) return policy
  return {
    ...policy,
    forbidden: [...policy.forbidden, { category: `fixture:${spec.role}`, names: spec.forbidden }],
  }
}

/**
 * What the fixture declares, with the closure behind each declared package: the packages that the
 * fixture reaches and nothing else of the member's closure.
 */
export function fixtureClosure(
  spec: FixtureSpec,
  members: ReadonlyMap<string, string>,
): DeclaredClosure {
  const workspace = new Map<string, DeclaredClosure['workspace'][number]>()
  const external = new Map<string, DeclaredClosure['external'][number]>()
  const via = [`fixture:${spec.role}`]
  for (const name of spec.dependencies) {
    const directory = members.get(name)
    if (directory === undefined) {
      if (!external.has(name)) external.set(name, { name, via: [...via, name] })
      continue
    }
    const reached = declaredClosure(directory, members)
    for (const item of reached.workspace)
      if (!workspace.has(item.name))
        workspace.set(item.name, { ...item, via: [...via, ...item.via] })
    for (const item of reached.external)
      if (!external.has(item.name)) external.set(item.name, { ...item, via: [...via, ...item.via] })
  }
  return { workspace: [...workspace.values()], external: [...external.values()] }
}

export type Dependencies =
  | Readonly<{ kind: 'resolved'; dependencies: Readonly<Record<string, string>> }>
  | Readonly<{ kind: 'unpinned'; names: readonly string[] }>

/**
 * The direct dependencies of the consumer project: a workspace member by its tarball, a third-party
 * package by the one version that the workspace pins. A package with no single pin is reported
 * rather than guessed.
 */
export function directDependencies(
  spec: FixtureSpec,
  tarballs: ReadonlyMap<string, string>,
  pins: ReadonlyMap<string, ReadonlySet<string>>,
): Dependencies {
  const dependencies: Record<string, string> = {}
  const unpinned: string[] = []
  for (const name of spec.dependencies) {
    const tarball = tarballs.get(name)
    if (tarball !== undefined) {
      dependencies[name] = `file:${tarball}`
      continue
    }
    const versions = [...(pins.get(name) ?? [])].filter(version => !version.startsWith('link:'))
    const [only] = versions
    if (versions.length === 1 && only !== undefined) dependencies[name] = only
    else unpinned.push(name)
  }
  return unpinned.length === 0
    ? { kind: 'resolved', dependencies }
    : { kind: 'unpinned', names: unpinned }
}
