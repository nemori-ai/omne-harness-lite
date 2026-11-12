// Builds Skill packages for the tests through the public entries only: a fixture directory or an
// in-memory file map becomes a sealed snapshot plus the bytes of its control files.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  toPackagePath,
  type PackagePath,
  type SkillPackageSnapshot,
} from '@omne-harness/skill-contract'
import { sealSnapshot } from '@omne-harness/skill-contract/provider'

export type PackageFiles = Readonly<Record<string, string | Uint8Array>>

export type BuiltPackage = Readonly<{
  snapshot: SkillPackageSnapshot
  control: Readonly<{ manifest?: Uint8Array; declaration?: Uint8Array }>
}>

const fixtures = fileURLToPath(new URL('./fixtures/packages/', import.meta.url))
const encoder = new TextEncoder()

/** Reads every file under `tests/fixtures/packages/<name>` as raw bytes. */
export function fixtureFiles(name: string): Record<string, Uint8Array> {
  const root = join(fixtures, name)
  const files: Record<string, Uint8Array> = {}
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const full = join(entry.parentPath, entry.name)
    files[relative(root, full).split(sep).join('/')] = new Uint8Array(readFileSync(full))
  }
  return files
}

/** Lists the fixture package directories. */
export function fixtureNames(): string[] {
  return readdirSync(fixtures, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
}

/** `value` as the type that `guard` proves, or an error naming it. */
export function granted<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error(`${guard.name} refuses ${JSON.stringify(value)}`)
  return value
}

export function path(raw: string): PackagePath {
  const checked = toPackagePath(raw)
  if (!('ok' in checked)) throw new Error(`not a package path: ${raw}`)
  return checked.ok
}

export function bytesOf(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? encoder.encode(content) : content
}

export function buildPackage(rootName: string, files: PackageFiles): BuiltPackage {
  const list = Object.entries(files).map(([raw, content]) => ({
    path: path(raw),
    bytes: bytesOf(content),
  }))
  const sealed = sealSnapshot({ rootName, files: list })
  if (!('ok' in sealed)) throw new Error(`fixture does not seal: ${JSON.stringify(sealed.failure)}`)
  const manifest = files['SKILL.md']
  const declaration = files['.omne/skill.json']
  return {
    snapshot: sealed.ok,
    control: {
      ...(manifest === undefined ? {} : { manifest: bytesOf(manifest) }),
      ...(declaration === undefined ? {} : { declaration: bytesOf(declaration) }),
    },
  }
}

export function buildFixture(name: string): BuiltPackage {
  return buildPackage(name, fixtureFiles(name))
}

/** A SKILL.md text with the given frontmatter lines and a short body. */
export function manifestText(lines: readonly string[], newline = '\n'): string {
  return ['---', ...lines, '---', 'Body.', ''].join(newline)
}
