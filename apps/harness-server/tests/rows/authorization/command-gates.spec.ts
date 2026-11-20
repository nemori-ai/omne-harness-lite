import { describe, expect, it } from 'vitest'
import { IMPLICIT_TOOL_GATE } from '@omne-harness/tool-contract'
import {
  releasedGateSchema,
  releasedGatesOf,
  toolPermissionRelease,
  type ReleasedGate,
} from '../../../src/entry/tool-permission-release.ts'
import { loadProductionRelease } from '../../../src/entry/tool-release.ts'
import { declaredPermission } from '../../../src/rows/authorization/current-tool-permission.ts'
import { sessionGrantFor } from '../../../src/rows/authorization/authorization-facts.ts'

const release = await loadProductionRelease()
if (release.kind !== 'trusted') throw new Error('Production release unavailable')
const files = release.manifest.entries.find(entry => entry.asset.name === 'Files')
if (files === undefined) throw new Error('Files release missing')

// A tool with two gates, declared the way a release declares them: what one gate governs, the other does not.
const READ: ReleasedGate = { id: 'read', title: '读', default: 'auto', commands: ['read', 'list'] }
const WRITE: ReleasedGate = { id: 'write', title: '写', default: 'ask', commands: ['write'] }
const governance = toolPermissionRelease({
  name: 'Files',
  adoption: files.asset.adoption,
  module: files.module,
  definition: files.definition,
  gates: [READ, WRITE],
})
const declarations = [
  { asset: files.asset, governance, holdingRef: 'harness.preinstalled.tool.Files' },
]

describe('a tool without commands', () => {
  it('stands under its one implicit gate, which names no command and can default to deny', () => {
    const gates = releasedGatesOf({ kind: 'function' } as never, [])
    expect(gates).toEqual([{ ...IMPLICIT_TOOL_GATE, commands: [] }])
    expect(releasedGateSchema.parse({ ...gates[0]!, default: 'deny' }).default).toBe('deny')
    const denied = toolPermissionRelease({
      name: 'Files',
      adoption: files.asset.adoption,
      module: files.module,
      definition: files.definition,
      gates: [{ ...gates[0]!, default: 'deny' }],
    })
    expect(
      denied.declaration.permissions.map(p => [p.title, p.description, p.defaultRule]),
    ).toEqual([
      [
        'Files：调用',
        '控制 Files 工具里归「调用」的命令。允许调用不代表执行环境可用或操作一定成功。',
        { pick: 'deny', allowedSet: null },
      ],
    ])
  })
})

describe('a tool with two gates', () => {
  it('declares one permission, binding and interpretation per gate, and one Settings item per gate', () => {
    const { declaration, interpretations } = governance
    expect(
      declaration.permissions.map(p => [p.capabilityId, p.enforcementKey, p.title, p.defaultRule]),
    ).toEqual([
      ['tool.Files', 'tool.read', 'Files：读', { pick: 'auto', allowedSet: null }],
      ['tool.Files', 'tool.write', 'Files：写', { pick: 'ask', allowedSet: null }],
    ])
    expect(declaration.enforcementBindings.map(b => b.enforcementKey)).toEqual([
      'tool.read',
      'tool.write',
    ])
    expect(interpretations.map(i => i.binding.enforcementKey)).toEqual(['tool.read', 'tool.write'])
    expect(declaration.settings).toHaveLength(1)
    const [settings] = declaration.settings
    expect(settings!.groups.map(group => group.id)).toEqual(['tool.Files'])
    expect(settings!.items.map(item => [item.id, item.groupId])).toEqual([
      ['read', 'tool.Files'],
      ['write', 'tool.Files'],
    ])
  })

  it('finds the permission of exactly the gate asked, and none for a gate the tool lacks', () => {
    const found = (id: string) =>
      declaredPermission(declarations, {
        definition: files.asset.adoption,
        gate: { id, title: id, default: 'ask' },
      })?.interpretation.binding.enforcementKey
    expect(found('read')).toBe('tool.read')
    expect(found('write')).toBe('tool.write')
    expect(found('invoke')).toBeUndefined()
  })

  it('lets a release for the session count only for the gate it was given for', () => {
    const request = (enforcementKey: string) =>
      ({ capabilityId: 'tool.Files', enforcementKey }) as Parameters<typeof sessionGrantFor>[0]
    const read = {
      request: null,
      reading: null,
      condition: null,
      authorizations: {
        session: {
          capabilityId: 'tool.Files',
          enforcementKey: 'tool.write',
          basis: 'basis-1',
          source: { owner: 'hitl', record: 'answer', revision: '1', digest: 'd' },
        },
      },
    } as unknown as Parameters<typeof sessionGrantFor>[1]
    expect(sessionGrantFor(request('tool.write'), read)).toMatchObject({ basis: 'basis-1' })
    expect(sessionGrantFor(request('tool.read'), read)).toBeNull()
  })
})
