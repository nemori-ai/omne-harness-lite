import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtBin, builtDist } from './support/cli-process.ts'

const forbidden = [
  '@deepseek-ai/cordis',
  '@omne-harness/sdk',
  '@earendil-works/pi-tui',
  '@omne-harness/server-entry',
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
  it('declares no runtime, peer, or optional dependency', () => {
    expect(manifest.dependencies ?? {}).toEqual({})
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
  it('exposes bin omne at dist/bin.js with a node shebang', () => {
    expect(manifest.bin).toEqual({ omne: './dist/bin.js' })
    expect(readFileSync(builtBin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('import only node builtins and sibling build modules', () => {
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
          specifier.startsWith('node:') || specifier.startsWith('./'),
          `${module} imports ${specifier}`,
        ).toBe(true)
      }
    }
  })
})
