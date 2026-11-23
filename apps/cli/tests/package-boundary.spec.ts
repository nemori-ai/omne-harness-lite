import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { builtBin, builtDist } from './support/cli-process.ts'

const allowed = [
  '@omne-harness/assets-protocol',
  '@omne-harness/calendar-protocol',
  '@omne-harness/human-intervention-protocol',
  '@omne-harness/identity-protocol',
  '@omne-harness/mcp-protocol',
  '@omne-harness/media-protocol',
  '@omne-harness/model-protocol',
  '@omne-harness/notification-protocol',
  '@omne-harness/public-contract',
  '@omne-harness/schedule-protocol',
  '@omne-harness/sdk',
  '@omne-harness/session-diagnostics-protocol',
  '@omne-harness/session-protocol',
  '@omne-harness/tool-protocol',
  '@omne-harness/usage-protocol',
  '@omne-harness/workspace-protocol',
]

const forbidden = [
  '@deepseek-ai/cordis',
  '@earendil-works/pi-tui',
  '@omne-harness/legal-identity',
  '@omne-harness/json-text',
  '@omne-harness/server-entry',
  '@omne-harness/assets-access',
  '@omne-harness/human-intervention-access',
  '@omne-harness/identity-access',
  '@omne-harness/mcp-access',
  '@omne-harness/session-access',
  '@omne-harness/session-diagnostics-access',
  '@omne-harness/tool-access',
  '@omne-harness/session',
]

const isPackage = (specifier: string, name: string): boolean =>
  specifier === name || specifier.startsWith(`${name}/`)

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
  it('declares the SDK, the public contract and the protocol contracts it speaks as its only runtime dependencies, and no peer or optional dependency', () => {
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(allowed)
    expect(Object.values(manifest.dependencies ?? {})).toEqual(allowed.map(() => 'workspace:*'))
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
  it('imports the SDK client core and every contract it declares, so the boundary assertion has a positive control', () => {
    const imported = builtModules().flatMap(module =>
      importSpecifiers(readFileSync(module, 'utf8')),
    )
    expect(imported).toContain('@omne-harness/sdk/core')
    for (const name of allowed.filter(name => name !== '@omne-harness/sdk'))
      expect(imported, name).toContain(name)
  })

  it('does not import the hand-written clients of the SDK root', () => {
    for (const module of builtModules())
      expect(importSpecifiers(readFileSync(module, 'utf8')), module).not.toContain(
        '@omne-harness/sdk',
      )
  })

  it('exposes bin omne at dist/bin.js with a node shebang', () => {
    expect(manifest.bin).toEqual({ omne: './dist/bin.js' })
    expect(readFileSync(builtBin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('import only node builtins, sibling build modules, the SDK client core and the declared contracts', () => {
    const modules = builtModules()
    expect(modules).toContain(builtBin)
    for (const module of modules) {
      const specifiers = importSpecifiers(readFileSync(module, 'utf8'))
      for (const specifier of specifiers) {
        expect(
          forbidden.some(name => isPackage(specifier, name)),
          `${module} imports ${specifier}`,
        ).toBe(false)
        expect(
          specifier.startsWith('node:') ||
            specifier.startsWith('./') ||
            specifier === '@omne-harness/sdk/core' ||
            allowed.some(name => name !== '@omne-harness/sdk' && isPackage(specifier, name)),
          `${module} imports ${specifier}`,
        ).toBe(true)
      }
    }
  })
})
