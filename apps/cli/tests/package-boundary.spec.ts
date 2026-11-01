import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtBin, builtDist } from './support/cli-process.ts'

// The CLI reaches the system only through the SDK. It imports no contract, server, or Cordis package.
const forbidden = [
  '@deepseek-ai/cordis',
  '@earendil-works/pi-tui',
  '@omne-harness/public-contract',
  '@omne-harness/legal-identity',
  '@omne-harness/json-text',
  '@omne-harness/server-entry',
  '@omne-harness/session',
]

interface Manifest {
  readonly bin?: Record<string, string>
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as Manifest

function builtModules(): string[] {
  return readdirSync(builtDist, { recursive: true, encoding: 'utf8' })
    .filter(entry => entry.endsWith('.js'))
    .map(entry => join(builtDist, entry))
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map(
    match => match[1] ?? '',
  )
}

describe('install closure', () => {
  it('declares the SDK as its only runtime dependency, and no peer or optional dependency', () => {
    expect(manifest.dependencies ?? {}).toEqual({ '@omne-harness/sdk': 'workspace:*' })
    expect(manifest.peerDependencies).toBeUndefined()
    expect(manifest.optionalDependencies).toBeUndefined()
  })

  it('limits dev dependencies to the compiler, the test runner, and Node types', () => {
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual([
      '@types/node',
      'typescript',
      'vitest',
    ])
  })
})

describe('built modules', () => {
  it('imports the SDK at least once, so the boundary assertion has a positive control', () => {
    const imported = builtModules().flatMap(module =>
      importSpecifiers(readFileSync(module, 'utf8')),
    )
    expect(imported).toContain('@omne-harness/sdk')
  })

  it('exposes bin omne at dist/bin.js with a node shebang', () => {
    expect(manifest.bin).toEqual({ omne: './dist/bin.js' })
    expect(readFileSync(builtBin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('import only node builtins, sibling build modules, and the SDK', () => {
    const modules = builtModules()
    expect(modules).toContain(builtBin)
    for (const module of modules) {
      const specifiers = importSpecifiers(readFileSync(module, 'utf8'))
      for (const specifier of specifiers) {
        expect(
          forbidden.some(name => specifier.startsWith(name)),
          `${module} imports ${specifier}`,
        ).toBe(false)
        expect(
          specifier.startsWith('node:') ||
            specifier.startsWith('./') ||
            specifier === '@omne-harness/sdk',
          `${module} imports ${specifier}`,
        ).toBe(true)
      }
    }
  })
})
