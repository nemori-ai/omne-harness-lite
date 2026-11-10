import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  combinationManifest,
  manifestDigest,
  type CommitRequestV2,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  permissionSqlParticipants,
  toolPermissionReleaseParticipant,
} from '../../../dist/rows/governance/permission-materials.js'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import type { ToolReleaseSnapshot } from '../../../src/entry/tool-release-manifest.ts'
import {
  DECISION_PARTICIPANT,
  PERMISSION_CURRENT,
  PERMISSION_RELEASES,
  SUPPORT_PARTICIPANT,
} from '../../../dist/rows/governance/permission-protocol.js'
import { providerConfig } from '../storage/fixtures/tree.ts'
import { permissionFixture } from './permission-fixture.ts'

async function world(release?: Extract<ToolReleaseSnapshot, { kind: 'trusted' }>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'permission-interpreter-')))
  const participants = [...permissionSqlParticipants()]
  if (release !== undefined) participants.push(toolPermissionReleaseParticipant(release))
  const releaseMember =
    release === undefined ? 'fixture.permission-release' : 'harness.tool-permission-release'
  for (const [name, fact] of [
    ['release', PERMISSION_RELEASES],
    ['current', PERMISSION_CURRENT],
  ] as const) {
    if (name === 'release' && release !== undefined) continue
    const url = new URL(`./permission-${name}-fixture.mjs`, import.meta.url)
    participants.push({
      participant: `fixture.permission-${name}`,
      protocol: '1',
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ownedTables: [],
      readTables: [],
      requiresFacts: [],
      providesFacts: [fact],
      allowedFunctions: [],
      grouping: 'groupable',
    })
  }
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    participants,
    migrations: [],
    readHandlers: [],
    declaredCombinations: { tenant: null, system: null },
  }
  const made = await createSqliteStorage({
    config: providerConfig(root, {
      maxWorkers: 2,
      reservedWriterSlots: 1,
      maxReadWorkersPerDomain: 1,
      groupMaxOperations: 1,
    }),
    materials,
    closeLeases: { admit: () => ({}), release() {} },
  })
  if (made.kind !== 'created') throw new Error(JSON.stringify(made))
  const domain = {
    scope: { kind: 'tenant' as const, tenant: 'tenant-a' },
    transactionDomain: 'permissions',
  }
  const memberNames = participants.map(participant => participant.participant)
  const checked = combinationManifest({ catalog: materials, participants: memberNames })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const combination = {
    ...domain,
    combinationVersion: 'test-permission/1',
    manifestDigest: manifestDigest(checked.manifest),
    participants: memberNames,
  }
  const registered = await made.storage.registerCombination(combination)
  if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
  return {
    materials,
    memberNames,
    async run(input: ReturnType<typeof permissionFixture>, omit?: string) {
      const commands: CommitRequestV2['commands'] = [
        {
          participant: releaseMember,
          facts: release === undefined ? { released: [input.released] } : {},
        },
        { participant: 'fixture.permission-current', facts: { current: input.current } },
        { participant: SUPPORT_PARTICIPANT.participant, facts: {} },
        { participant: DECISION_PARTICIPANT.participant, facts: { action: input.action } },
      ]
      return made.storage.commit({
        identity: {
          ...domain,
          operation: 'permission-test',
          protocolVersion: '2',
          operationKey: randomUUID(),
        },
        combinationVersion: combination.combinationVersion,
        manifestDigest: combination.manifestDigest,
        commands: commands.filter(command => command.participant !== omit),
      })
    },
    async close() {
      const reply = await made.control.close({ initiator: 'disposal' })
      expect(reply.kind).toBe('closed')
      rmSync(root, { recursive: true, force: true })
    },
  }
}

it('runs the actual permission interpreter inside SqlStorage', async () => {
  const w = await world()
  try {
    for (const [value, kind] of [
      ['trusted', 'allow'],
      ['blocked', 'deny'],
      ['review', 'need-decision'],
    ]) {
      const input = permissionFixture()
      if (value === undefined) throw new Error('missing value fixture')
      input.pick(value)
      const result = await w.run(input)
      expect(result).toMatchObject({ kind: 'committed' })
      if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
      expect(
        result.responses.find(entry => entry.participant === DECISION_PARTICIPANT.participant)
          ?.reply.response,
      ).toMatchObject({ kind, action: input.action })
    }
    const replacement = permissionFixture()
    replacement.action.binding.implementationRef = 'shell-release/2'
    replacement.action.request.implementationRef = 'shell-release/2'
    replacement.current.request.implementationRef = 'shell-release/2'
    const result = await w.run(replacement)
    expect(result).toMatchObject({ kind: 'committed' })
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    expect(
      result.responses.find(entry => entry.participant === DECISION_PARTICIPANT.participant)?.reply
        .response,
    ).toMatchObject({ kind: 'unavailable' })
  } finally {
    await w.close()
  }
})

it('requires actual source and interpreter participants, not a registered manifest alone', async () => {
  const w = await world()
  try {
    for (const omitted of [
      'fixture.permission-release',
      'fixture.permission-current',
      SUPPORT_PARTICIPANT.participant,
    ]) {
      expect((await w.run(permissionFixture(), omitted)).kind).not.toBe('committed')
      const manifest = combinationManifest({
        catalog: w.materials,
        participants: w.memberNames.filter(member => member !== omitted),
      })
      expect(manifest.kind).not.toBe('manifest')
    }
  } finally {
    await w.close()
  }
})

it('reads the actual verified Tool release inside the Worker instead of accepting a caller declaration', async () => {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const interpretation = release.manifest.entries.find(entry => entry.asset.name === 'Shell')
    ?.governance.interpretations[0]
  if (interpretation === undefined) throw new Error('Shell permission release absent')
  const w = await world(release)
  try {
    const input = permissionFixture(structuredClone(interpretation))
    input.pick('auto')
    const result = await w.run(input)
    expect(result).toMatchObject({ kind: 'committed' })
    if (result.kind !== 'committed') throw new Error(JSON.stringify(result))
    expect(
      result.responses.find(entry => entry.participant === DECISION_PARTICIPANT.participant)?.reply
        .response,
    ).toMatchObject({ kind: 'allow', action: input.action })
    input.released.binding.implementationRef = 'caller-replacement'
    input.action.binding.implementationRef = 'caller-replacement'
    input.action.request.implementationRef = 'caller-replacement'
    input.current.request.implementationRef = 'caller-replacement'
    const replaced = await w.run(input)
    if (replaced.kind !== 'committed') throw new Error(JSON.stringify(replaced))
    expect(
      replaced.responses.find(entry => entry.participant === DECISION_PARTICIPANT.participant)
        ?.reply.response,
    ).toMatchObject({ kind: 'unavailable' })
  } finally {
    await w.close()
  }
})

it('refuses a material pinned to a different release generation', async () => {
  const release = await loadProductionRelease()
  if (release.kind !== 'trusted') throw new Error(JSON.stringify(release))
  const changed = { ...release, generation: `sha256:${'0'.repeat(64)}` }
  expect(toolPermissionReleaseParticipant(changed).protocol).not.toBe(
    toolPermissionReleaseParticipant(release).protocol,
  )
  const w = await world(changed)
  try {
    expect((await w.run(permissionFixture())).kind).toBe('rolled_back')
  } finally {
    await w.close()
  }
})
