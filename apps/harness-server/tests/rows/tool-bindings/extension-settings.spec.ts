// AS-28: what the OmneExtensions binding makes of the row's settings face for one call.
import { describe, expect, it } from 'vitest'
import type { ManagedAsset } from '@omne-harness/assets'
import type { WriteOutcome } from '@omne-harness/settings'
import type {
  ActingSettings,
  ActingSettingView,
} from '../../../src/rows/governance/acting-settings.ts'
import {
  heldSettingsOf,
  type HeldSettingsInput,
} from '../../../src/rows/tool-bindings/extension-settings.ts'
import { fixtureTenant } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')
const PRINCIPAL = { who: 'the work of a session' }
const DOCS = { category: 'mcp', name: 'docs' }
const head = (item: string, title: string) => ({
  owner: { kind: 'asset', ...DOCS } as const,
  item,
  revision: '4',
  declaration: {
    title,
    purpose: 'p',
    appliesAt: 'next',
    clearEffect: 'c',
    group: { id: 'g', title: 'G', description: 'd' },
  },
})
const VIEWS: readonly ActingSettingView[] = [
  {
    ...head('program-calls', '程序调用'),
    kind: 'ordinary',
    valueSchema: { type: 'boolean' },
    default: { kind: 'set', value: false },
    own: { kind: 'unset' },
    effective: { value: { kind: 'set', value: false }, source: 'default' },
    lockedBy: null,
    editable: { kind: 'yes' },
  },
  {
    ...head('region', '区域'),
    kind: 'ordinary',
    valueSchema: { enum: ['eu', 'us'] },
    default: { kind: 'unset' },
    own: { kind: 'unset' },
    effective: { value: { kind: 'set', value: 'eu' }, source: 'organization' },
    lockedBy: 'organization',
    editable: { kind: 'no', reason: 'locked' },
  },
  { ...head('credential', '凭据'), kind: 'secret' },
  { ...head('invoke', '调用'), kind: 'permission' },
]

function world(over: Partial<HeldSettingsInput> = {}) {
  const asked: unknown[] = []
  const acting: ActingSettings = {
    async list(input) {
      asked.push(['list', input])
      return VIEWS
    },
    async write(input) {
      asked.push(['write', input])
      return { kind: 'written', revision: '5' }
    },
  }
  const settings = heldSettingsOf({
    acting,
    principal: PRINCIPAL,
    tenant: TENANT,
    describe: async () => ({ kind: 'asset' }) as ManagedAsset,
    secrets: () => undefined,
    ...over,
  })
  return { asked, settings }
}

const secretState = (own: string) => ({
  describe: async (input: unknown) => {
    expect(input).toEqual({ principal: PRINCIPAL, tenant: TENANT, asset: DOCS, item: 'credential' })
    return { kind: 'described', item: { kind: 'secret', own } } as never
  },
})

describe('the settings of a held asset, for one call of OmneExtensions', () => {
  it('reads them for the principal and the tenant of the call: an ordinary item with its values, the others by name', async () => {
    const { settings, asked } = world()
    expect(await settings.list(DOCS)).toEqual([
      {
        kind: 'ordinary',
        item: 'program-calls',
        title: '程序调用',
        revision: '4',
        schema: { type: 'boolean' },
        own: { kind: 'unset' },
        effective: { kind: 'set', value: false },
        source: 'default',
        writable: 'yes',
      },
      {
        kind: 'ordinary',
        item: 'region',
        title: '区域',
        revision: '4',
        schema: { enum: ['eu', 'us'] },
        own: { kind: 'unset' },
        effective: { kind: 'set', value: 'eu' },
        source: 'organization',
        writable: 'locked',
      },
      { kind: 'secret', item: 'credential', title: '凭据', revision: '4', configured: 'unknown' },
      { kind: 'permission', item: 'invoke', title: '调用', revision: '4' },
    ])
    expect(asked).toEqual([['list', { principal: PRINCIPAL, tenant: TENANT, asset: DOCS }]])
  })

  it.each([
    ['available', 'yes'],
    ['unset', 'no'],
    ['revoked', 'no'],
    ['unreadable', 'unknown'],
  ] as const)('a secret whose state is %s reads as set: %s', async (own, configured) => {
    const { settings } = world({ secrets: () => secretState(own) })
    const listed = await settings.list(DOCS)
    expect(listed).toContainEqual(expect.objectContaining({ item: 'credential', configured }))
  })

  it('a secret is not known to be set when the secret face refuses or throws', async () => {
    for (const describe of [
      async () => ({ kind: 'denied' }) as never,
      async () => {
        throw new Error('down')
      },
    ]) {
      const { settings } = world({ secrets: () => ({ describe }) })
      expect(await settings.list(DOCS)).toContainEqual(
        expect.objectContaining({ item: 'credential', configured: 'unknown' }),
      )
    }
  })

  it.each([
    ['absent', { kind: 'absent' }, 'not-held'],
    ['denied', { kind: 'denied' }, 'denied'],
    ['unavailable', { kind: 'unavailable' }, 'unavailable'],
  ] as const)(
    'an asset the management answers %s is %s, and its settings are not asked',
    async (_case, answer, expected) => {
      const { settings, asked } = world({ describe: async () => answer as ManagedAsset })
      expect(await settings.list(DOCS)).toBe(expected)
      expect(asked).toEqual([])
    },
  )

  it('an asset that cannot be asked about is unavailable; a name no asset can have is not held', async () => {
    const throwing = world({
      describe: async () => {
        throw new Error('down')
      },
    })
    expect(await throwing.settings.list(DOCS)).toBe('unavailable')
    expect(await world().settings.list({ category: '', name: '' })).toBe('not-held')
  })

  it.each([
    ['not-visible', []],
    ['denied', 'denied'],
    ['unavailable', 'unavailable'],
  ] as const)('a held asset whose settings read %s', async (read, expected) => {
    const acting = { list: async () => read, write: async () => ({ kind: 'unknown' }) as never }
    expect(await world({ acting }).settings.list(DOCS)).toEqual(expected)
  })

  it('writes at the revision read, for the principal and the tenant of the call', async () => {
    const { settings, asked } = world()
    const change = { kind: 'set', value: true } as const
    expect(
      await settings.write({
        asset: DOCS,
        item: 'program-calls',
        operation: 'op',
        revision: '4',
        change,
      }),
    ).toBe('written')
    expect(asked).toEqual([
      [
        'write',
        {
          principal: PRINCIPAL,
          tenant: TENANT,
          asset: DOCS,
          item: 'program-calls',
          operation: 'op',
          expectedRevision: '4',
          change,
        },
      ],
    ])
  })

  it.each([
    [{ kind: 'no-change' }, 'no-change'],
    [{ kind: 'denied' }, 'denied'],
    [{ kind: 'not-visible' }, 'gone'],
    [{ kind: 'invalid' }, 'invalid'],
    [{ kind: 'conflict' }, 'conflict'],
    [{ kind: 'not-writable', reason: 'locked' }, 'locked'],
    [{ kind: 'not-writable', reason: 'out-of-bound' }, 'out-of-bound'],
    [{ kind: 'not-writable', reason: 'prohibited-above' }, 'prohibited-above'],
    [{ kind: 'not-writable', reason: 'not-a-source' }, 'not-a-source'],
    [{ kind: 'unavailable' }, 'unavailable'],
    [{ kind: 'unknown' }, 'unknown'],
  ] as const)('a write answered %j is %s', async (outcome, expected) => {
    const acting = { list: async () => VIEWS, write: async () => outcome as WriteOutcome }
    const written = await world({ acting }).settings.write({
      asset: DOCS,
      item: 'program-calls',
      operation: 'op',
      revision: '4',
      change: { kind: 'clear' },
    })
    expect(written).toBe(expected)
  })
})
