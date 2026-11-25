import { describe, expect, it } from 'vitest'
import { capabilityId, type CapabilityId } from '@omne-harness/assets'
import { access, accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { isPackageDigest, isSkillName, type PackageDigest } from '@omne-harness/skill-contract'
import {
  indexedInputs,
  stackedInputs,
  type HeldNames,
  type LayerInputs,
  type SkillCandidate,
  type SkillLayerInput,
} from '@omne-harness/skill-host-local'

const organization = organizationCodec.parse('org_0123456789abcdefghjkmnpqrs')
const account = accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
if (!organization.ok || !account.ok) throw new Error('the test tenant texts are not legal')
const reader = access('reader', tenant(organization.value, account.value))
const scope = null

function id(name: string): CapabilityId {
  const made = capabilityId('skill', name)
  if (!made.ok) throw new Error(name)
  return made.id
}
function digest(fill: string): PackageDigest {
  const text = `sha256:${fill.repeat(64)}`
  if (!isPackageDigest(text)) throw new Error(text)
  return text
}
function candidate(version: string): SkillCandidate {
  const name = 'weekly-report'
  if (!isSkillName(name)) throw new Error(name)
  return {
    asset: 'tenant/weekly-report',
    version,
    disabled: false,
    immutable: false,
    replaceLocked: false,
    locator: { kind: 'content-store', digest: digest('a') },
    digest: digest('a'),
    declared: { name, description: version, tools: [] },
  }
}
const read = (version: string): readonly SkillLayerInput[] => [
  { layer: 'official', state: 'read', candidates: [] },
  { layer: 'tenant', state: 'read', candidates: [candidate(version)] },
]
const UNREAD: readonly SkillLayerInput[] = [
  { layer: 'official', state: 'read', candidates: [] },
  { layer: 'tenant', state: 'unavailable' },
]

const report = id('weekly-report')

/** What the registry holds, name by name; `at` stands for the registry value it was read from. */
function registry(names: Readonly<Record<string, string>>): { held: HeldNames | undefined } {
  return { held: { at: {}, names: new Map(Object.entries(names)) } }
}

/** Layer reads that count themselves and answer what `answer` gives at the time of each read. */
function counted(answer: () => readonly SkillLayerInput[] | Promise<readonly SkillLayerInput[]>) {
  const asked: string[] = []
  const inputs: LayerInputs<unknown, unknown> = {
    async layers(_access, _scope, capability) {
      asked.push(capability.name)
      return answer()
    },
  }
  return { asked, inputs }
}

describe('the layers of the official and the tenant layer, kept while what is held stays the same', () => {
  it('reads the layers of a name once while what is held under it stays the same (C1)', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const inner = counted(() => read('v1'))
    const index = indexedInputs(inner.inputs, () => now.held)
    const first = await index.layers(reader, scope, report)
    expect(await index.layers(reader, scope, report)).toBe(first)
    expect(inner.asked).toEqual(['weekly-report'])
  })

  it('keeps them when the registry changes somewhere else (C2)', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const inner = counted(() => read('v1'))
    const index = indexedInputs(inner.inputs, () => now.held)
    await index.layers(reader, scope, report)
    now.held = registry({ 'weekly-report': 'v1', 'other-skill': 'v9' }).held
    await index.layers(reader, scope, report)
    expect(inner.asked).toEqual(['weekly-report'])
  })

  it('reads them again once what is held under the name changes, and gives the new layers, not the kept ones (C3)', async () => {
    let version = 'v1'
    const now = registry({ 'weekly-report': 'v1' })
    const inner = counted(() => read(version))
    const index = indexedInputs(inner.inputs, () => now.held)
    expect(await index.layers(reader, scope, report)).toEqual(read('v1'))
    version = 'v2'
    now.held = registry({ 'weekly-report': 'v2' }).held
    expect(await index.layers(reader, scope, report)).toEqual(read('v2'))
    expect(inner.asked).toHaveLength(2)
  })

  it('lets every call made while a read runs wait for that read (C3)', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const inner = counted(async () => {
      await gate
      return read('v1')
    })
    const index = indexedInputs(inner.inputs, () => now.held)
    const calls = [index.layers(reader, scope, report), index.layers(reader, scope, report)]
    release()
    const [one, two] = await Promise.all(calls)
    expect(one).toBe(two)
    expect(inner.asked).toHaveLength(1)
  })

  it('answers unknown identities and keeps no layers while what the tenant holds is not on the registry (C4)', async () => {
    const inner = counted(() => UNREAD)
    const index = indexedInputs(inner.inputs, () => undefined)
    expect(await index.identities(reader, scope)).toEqual({ failure: 'unknown' })
    expect(await index.layers(reader, scope, report)).toEqual(UNREAD)
    await index.layers(reader, scope, report)
    expect(inner.asked).toHaveLength(2)
  })

  it('keeps nothing for a name a layer could not be read for (C7)', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const inner = counted(() => UNREAD)
    const index = indexedInputs(inner.inputs, () => now.held)
    expect(await index.layers(reader, scope, report)).toEqual(UNREAD)
    await index.layers(reader, scope, report)
    expect(inner.asked).toHaveLength(2)
  })

  it('keeps nothing for a name whose read failed', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    let fail = true
    const inner = counted(() => {
      if (fail) throw new Error('the store is down')
      return read('v1')
    })
    const index = indexedInputs(inner.inputs, () => now.held)
    await expect(index.layers(reader, scope, report)).rejects.toThrow('the store is down')
    fail = false
    expect(await index.layers(reader, scope, report)).toEqual(read('v1'))
    expect(inner.asked).toHaveLength(2)
  })

  it('keeps nothing read while the registry changed, though the name reads the same after', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const inner = counted(() => {
      now.held = registry({ 'weekly-report': 'v1' }).held
      return read('v1')
    })
    const index = indexedInputs(inner.inputs, () => now.held)
    await index.layers(reader, scope, report)
    await index.layers(reader, scope, report)
    expect(inner.asked).toHaveLength(2)
  })

  it('reads a name nothing is held under at each call', async () => {
    const now = registry({})
    const inner = counted(() => read('v1'))
    const index = indexedInputs(inner.inputs, () => now.held)
    await index.layers(reader, scope, report)
    await index.layers(reader, scope, report)
    expect(inner.asked).toHaveLength(2)
  })

  it('lists every name held on the registry as a Skill, and forgets the layers of a name no longer held, and only those', async () => {
    const notes = id('daily-notes')
    const now = registry({ 'weekly-report': 'v1', 'daily-notes': 'v1' })
    const inner = counted(() => read('v1'))
    const index = indexedInputs(inner.inputs, () => now.held)
    expect(await index.identities(reader, scope)).toEqual({ ok: [report, notes] })
    await index.layers(reader, scope, report)
    await index.layers(reader, scope, notes)
    now.held = registry({ 'daily-notes': 'v1' }).held
    expect(await index.identities(reader, scope)).toEqual({ ok: [notes] })
    now.held = registry({ 'weekly-report': 'v1', 'daily-notes': 'v1' }).held
    await index.layers(reader, scope, report)
    await index.layers(reader, scope, notes)
    expect(inner.asked).toEqual(['weekly-report', 'daily-notes', 'weekly-report'])
  })

  it('keeps nothing read while what the tenant holds stopped being on the registry', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const told = now.held
    const inner = counted(() => {
      if (inner.asked.length === 1) now.held = undefined
      return read('v1')
    })
    const index = indexedInputs(inner.inputs, () => now.held)
    await index.layers(reader, scope, report)
    now.held = told
    await index.layers(reader, scope, report)
    expect(inner.asked).toHaveLength(2)
  })

  it('does not let a read of an older digest that ends late forget the read of the newer one', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    let release = (): void => undefined
    const late = new Promise<void>(resolve => {
      release = resolve
    })
    const inner = counted(async () => {
      if (inner.asked.length === 1) {
        await late
        return UNREAD
      }
      return read('v2')
    })
    const index = indexedInputs(inner.inputs, () => now.held)
    const older = index.layers(reader, scope, report)
    now.held = registry({ 'weekly-report': 'v2' }).held
    await index.layers(reader, scope, report)
    release()
    await older
    expect(await index.layers(reader, scope, report)).toEqual(read('v2'))
    expect(inner.asked).toHaveLength(2)
  })
})

describe('a turn layer on top of the kept layers', () => {
  const workspace: readonly SkillLayerInput[] = [
    { layer: 'workspace', state: 'read', candidates: [] },
  ]

  it('reads the workspace layer at each call and the kept layers once, in the order of the layers (C5)', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const lower = counted(() => read('v1'))
    const upper = counted(() => workspace)
    const turn = stackedInputs(indexedInputs(lower.inputs, () => now.held), {
      ...upper.inputs,
      identities: async () => ({ ok: [id('notes-here')] }),
    })
    expect(await turn.layers(reader, scope, report)).toEqual([...read('v1'), ...workspace])
    await turn.layers(reader, scope, report)
    expect(lower.asked).toHaveLength(1)
    expect(upper.asked).toHaveLength(2)
    expect(await turn.identities(reader, scope)).toEqual({
      ok: [id('weekly-report'), id('notes-here')],
    })
  })

  it('answers unknown identities when the turn layer cannot list them', async () => {
    const now = registry({ 'weekly-report': 'v1' })
    const turn = stackedInputs(
      indexedInputs(counted(() => read('v1')).inputs, () => now.held),
      {
        layers: async () => workspace,
        identities: async () => ({ failure: 'unknown' as const }),
      },
    )
    expect(await turn.identities(reader, scope)).toEqual({ failure: 'unknown' })
  })
})
