import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const memberDirectory = new URL('../', import.meta.url)
const sourceDirectory = new URL('../src/', import.meta.url)

/** The run-time dependencies that the group architecture allows for the pi transport. */
const allowed = new Set([
  '@omne-harness/model-contract',
  '@omne-harness/operation-result',
  '@omne-harness/json-text',
  '@omne-harness/content-block',
])

/** Names that must never enter the install closure of this member, in any dependency field. */
function isForbidden(name: string): boolean {
  return (
    name === '@omne-harness/model' ||
    name === '@omne-harness/session' ||
    name.startsWith('@omne-harness/session-') ||
    name.startsWith('@omne-harness-lite/')
  )
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  )
}

function readManifest(): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(readFileSync(new URL('package.json', memberDirectory), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('package.json must hold an object')
  return Object.fromEntries(Object.entries(parsed))
}

function field(
  manifest: Readonly<Record<string, unknown>>,
  name: (typeof dependencyFields)[number],
): Readonly<Record<string, string>> {
  const value = manifest[name]
  if (value === undefined) return {}
  if (!isStringRecord(value)) throw new Error(`${name} must map names to version strings`)
  return value
}

/** Every module specifier in the source, type-only imports and re-exports included. */
function sourceSpecifiers(): readonly string[] {
  const files = readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' }).filter(file =>
    file.endsWith('.ts'),
  )
  return files.flatMap(file => {
    const text = readFileSync(new URL(file, sourceDirectory), 'utf8')
    return [...text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].flatMap(match =>
      match[1] === undefined ? [] : [match[1]],
    )
  })
}

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

describe('the install closure holds only contract and common members', () => {
  const manifest = readManifest()

  it('declares run-time dependencies from the allowed set only, as workspace members', () => {
    const dependencies = field(manifest, 'dependencies')
    for (const [name, version] of Object.entries(dependencies)) {
      expect(allowed.has(name), name).toBe(true)
      expect(version, name).toBe('workspace:*')
    }
  })

  it('declares no Model runtime, Session, legacy package or archived path in any field', () => {
    for (const name of dependencyFields) {
      for (const [dependency, version] of Object.entries(field(manifest, name))) {
        expect(isForbidden(dependency), `${name}: ${dependency}`).toBe(false)
        expect(version, `${name}: ${dependency}`).not.toContain('.legacy')
      }
    }
  })

  it('imports, in values or types, only Node built-ins, declared dependencies or own files', () => {
    const declared = new Set(Object.keys(field(manifest, 'dependencies')))
    for (const specifier of sourceSpecifiers()) {
      if (specifier.startsWith('node:') || specifier.startsWith('.')) continue
      expect(declared.has(packageName(specifier)), specifier).toBe(true)
    }
  })
})
