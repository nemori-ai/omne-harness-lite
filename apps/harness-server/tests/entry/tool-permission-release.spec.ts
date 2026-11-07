import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { definePermission, projectPermissionSettings } from '@omne-harness/permissions'
import { toolPermissionRelease } from '../../src/entry/tool-permission-release.ts'
import { loadProductionRelease, productionReleaseInput } from '../../src/entry/tool-release.ts'
import { loadToolRelease, type ToolReleaseSnapshot } from '../../src/entry/tool-release-manifest.ts'
import { createToolGovernanceDefinitionSource } from '../../src/rows/governance/tool-definition-source.ts'
import { resolvePermissionInterpretation } from '../../src/rows/governance/permission-interpretation.ts'

let release: Extract<ToolReleaseSnapshot, { kind: 'trusted' }>
beforeAll(async () => {
  const loaded = await loadProductionRelease()
  if (loaded.kind !== 'trusted') throw new Error(JSON.stringify(loaded))
  release = loaded
})

it('publishes complete permission and Settings declarations from the actual verified release', () => {
  expect(release.manifest.format).toBe('omne-harness/tool-release/2')
  for (const entry of release.manifest.entries) {
    const { declaration, interpretations } = entry.governance
    expect(declaration.origin).toMatchObject({
      kind: 'asset',
      assetId: `harness.tool.${entry.asset.name}`,
    })
    expect(declaration.reference.version).toMatch(/^[a-f0-9]{64}$/)
    expect(declaration.permissions).toHaveLength(1)
    for (const permission of declaration.permissions) {
      expect(definePermission(permission).kind).toBe('defined')
      const projected = projectPermissionSettings(permission)
      expect(projected.kind).toBe('projected')
      if (projected.kind !== 'projected') throw new Error('release did not project Settings')
      expect(declaration.settings).toEqual([projected.definition])
      expect(permission.defaultRule).toEqual({ pick: 'ask', allowedSet: null })
      expect(permission.supportedScopes.map(scope => scope.kind)).toEqual([
        'one-time-call',
        'session',
        'tenant',
      ])
    }
    for (const interpretation of interpretations) {
      expect(resolvePermissionInterpretation(interpretation, interpretation.binding).kind).toBe(
        'supported',
      )
      expect(declaration.enforcementBindings).toContainEqual(interpretation.binding)
      expect(interpretation.binding.action).toBe('invoke')
    }
  }
})

it('serves the same original definition to separate tenant consumers without sharing mutable objects', async () => {
  const first = createToolGovernanceDefinitionSource(() => release)
  const second = createToolGovernanceDefinitionSource(() => release)
  for (const entry of release.manifest.entries) {
    const { digest: _digest, ...identity } = entry.governance.declaration.reference
    const a = await first.resolve(identity)
    const b = await second.resolve(identity)
    expect(a).toEqual({ kind: 'definition', declaration: entry.governance.declaration })
    expect(b).toEqual(a)
    if (a.kind !== 'definition' || b.kind !== 'definition') throw new Error('missing release')
    a.declaration.permissions.splice(0)
    expect(b.declaration.permissions).toHaveLength(1)
    expect(await first.resolve(identity)).toEqual(b)
    expect(await first.resolve({ ...identity, version: 'another' })).toEqual({
      kind: 'unavailable',
    })
    expect(await first.resolve({ ...identity, ownerId: 'another' })).toEqual({
      kind: 'unavailable',
    })
  }
})

it('changes governance and implementation identities when the same named Tool implementation changes', () => {
  const entry = release.manifest.entries.find(item => item.asset.name === 'Shell')
  if (entry === undefined) throw new Error('Shell not published')
  const input = {
    name: 'Shell' as const,
    adoption: entry.asset.adoption,
    module: entry.module,
    definition: entry.definition,
  }
  expect(toolPermissionRelease(input)).toEqual(entry.governance)
  const replacement = toolPermissionRelease({
    ...input,
    module: { ...input.module, executor: { ...input.module.executor, digest: 'replacement' } },
  })
  expect(replacement.declaration.reference.version).not.toBe(
    entry.governance.declaration.reference.version,
  )
  expect(replacement.declaration.enforcementBindings).not.toEqual(
    entry.governance.declaration.enforcementBindings,
  )
  expect(replacement.declaration.origin).not.toEqual(entry.governance.declaration.origin)
  const redirected = toolPermissionRelease({
    ...input,
    module: { ...input.module, export: 'anotherExport' },
  })
  expect(redirected.declaration.reference.version).not.toBe(
    entry.governance.declaration.reference.version,
  )
  expect(redirected.declaration.enforcementBindings).not.toEqual(
    entry.governance.declaration.enforcementBindings,
  )
})

it.each(['definition', 'interpretation', 'projection'] as const)(
  'rejects a tampered %s even when the Tool artifact files are unchanged',
  async field => {
    const manifest = structuredClone(release.manifest)
    const entry = manifest.entries.find(item => item.asset.name === 'Shell')
    if (entry === undefined) throw new Error('Shell not published')
    if (field === 'definition') entry.governance.declaration.permissions = []
    if (field === 'interpretation') entry.governance.interpretations = []
    if (field === 'projection') entry.governance.declaration.settings = []
    const root = mkdtempSync(join(tmpdir(), 'tool-permission-release-'))
    try {
      const manifestPath = join(root, 'manifest.json')
      writeFileSync(manifestPath, JSON.stringify(manifest))
      expect((await loadToolRelease({ ...productionReleaseInput(), manifestPath })).kind).toBe(
        'unavailable',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)

it('does not supply definitions when the authoritative release is missing or throws', async () => {
  const identity = {
    ownerId: 'harness-server.tool-release',
    definitionId: 'tool.Shell',
    version: '1',
  }
  const missing = createToolGovernanceDefinitionSource(() => ({
    kind: 'unavailable',
    diagnostic: 'offline',
  }))
  const failed = createToolGovernanceDefinitionSource(() => {
    throw new Error('offline')
  })
  expect(await missing.resolve(identity)).toEqual({ kind: 'unavailable' })
  expect(await failed.resolve(identity)).toEqual({ kind: 'unavailable' })
})
