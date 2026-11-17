import canonicalize from 'canonicalize'
import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  createTenantSettings,
  decideSettingsChange,
  defineSettings,
  type PermissionItemView,
  type SettingDefinitions,
  type SettingsBasis,
  type SettingsChange,
  type SettingsFailure,
  type SettingsGrant,
  type SettingsSourceDescriptor,
  type SettingsState,
  type SettingsTargetView,
  type TenantSettingsPermissions,
  type TenantSettingsWriteResult,
  type WriteOutcome,
} from '../src/index.ts'

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'0'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('tenant fixture')
  return parsed.value
}
const tenantA = tenantOf('a')
const tenantB = tenantOf('b')
const LOGIN_A = 'login:a'
const WORK_A = 'work:a'
const presentation = {
  title: 'Item',
  description: 'What the item does',
  impact: 'Used on the next read',
  clear: 'The outer value applies again',
  adoption: 'next-read' as const,
}
function definitionOf(withNote = false): SettingDefinitions {
  const defined = defineSettings({
    providerId: 'harness',
    definitionId: 'tool.Shell',
    version: '1',
    groups: [{ id: 'g', parentId: null, title: 'G', description: 'Group', order: 0 }],
    items: [
      {
        id: 'invoke',
        groupId: 'g',
        category: 'governance',
        presentation,
        valueSchema: {
          type: 'object',
          required: ['pick', 'allowedSet'],
          additionalProperties: false,
          properties: {
            pick: { enum: [null, 'deny', 'ask', 'auto'] },
            allowedSet: {
              anyOf: [
                { type: 'null' },
                { type: 'array', items: { enum: ['deny', 'ask', 'auto'] }, uniqueItems: true },
              ],
            },
          },
        },
        default: { kind: 'value', value: { pick: 'ask', allowedSet: null } },
        merge: 'override',
        sensitivity: 'ordinary',
      },
      {
        id: 'verbose',
        groupId: 'g',
        category: 'preference',
        presentation,
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: false },
        merge: 'override',
        sensitivity: 'ordinary',
      },
      {
        id: 'apiKey',
        groupId: 'g',
        category: 'binding',
        presentation,
        valueSchema: { type: 'string', minLength: 1 },
        default: { kind: 'absent' },
        merge: 'override',
        sensitivity: 'secret',
      },
      ...(withNote
        ? [
            {
              id: 'note',
              groupId: 'g',
              category: 'preference' as const,
              presentation,
              valueSchema: { type: 'string' },
              default: { kind: 'absent' as const },
              merge: 'override' as const,
              sensitivity: 'ordinary' as const,
            },
            {
              id: 'free',
              groupId: 'g',
              category: 'preference' as const,
              presentation,
              valueSchema: {},
              default: { kind: 'absent' as const },
              merge: 'override' as const,
              sensitivity: 'ordinary' as const,
            },
          ]
        : []),
    ],
  })
  if (defined.kind !== 'defined') throw new Error(JSON.stringify(defined))
  return defined.definition
}
const PERMITS: Readonly<Record<string, boolean>> = { deny: false, ask: true, auto: true }

type Value = Readonly<{ pick: string | null; allowedSet: readonly string[] | null }>

const ORGANIZATION_SOURCE: SettingsSourceDescriptor = {
  sourceId: 'organization',
  ownerRef: 'governance',
  scope: { kind: 'organization', subjectRef: 'org' },
  authorityRevision: '1',
}
const TENANT_SOURCE: SettingsSourceDescriptor = {
  sourceId: 'tenant',
  ownerRef: 'governance',
  scope: { kind: 'tenant', subjectRef: 'tenant-a' },
  authorityRevision: '1',
}
const SESSION_SOURCE: SettingsSourceDescriptor = {
  sourceId: 'session',
  ownerRef: 'governance',
  scope: { kind: 'session', subjectRef: 'session-a' },
  authorityRevision: '1',
}

function world(options: Readonly<{ withNote?: boolean; withSession?: boolean }> = {}) {
  const definition = definitionOf(options.withNote === true)
  const target = { policyId: 'asset', targetRef: 'tool.Shell', scopeRef: 'tenant-a' }
  const definitionRef = {
    providerId: 'harness',
    definitionId: 'tool.Shell',
    version: '1',
    digest: 'a'.repeat(64),
  }
  let state: SettingsState = {
    revision: 0,
    sources: [
      { id: 'organization', values: [] },
      { id: 'tenant', values: [] },
      ...(options.withSession === true ? [{ id: 'session', values: [] }] : []),
    ],
  }
  const calls: string[] = []
  const admitted: string[] = []
  const assetTenants = new Set<string>()
  const flags = {
    sources: null as readonly SettingsSourceDescriptor[] | null,
    grants: null as SettingsTargetView['grants'] | null,
    reply: null as TenantSettingsWriteResult | null,
    readThrows: false,
    assetThrows: false,
    catalog: 'ok' as 'ok' | 'unavailable' | 'partial' | 'duplicate' | 'not-held',
    organizationBound: null as readonly string[] | null,
    organizationPick: null as string | null,
    organizationReadable: true,
    lose: false,
    tenantActions: ['set', 'clear'] as SettingsGrant['actions'],
    reject: null as SettingsFailure['reason'] | null,
    copyAsset: { category: 'tool', name: 'Shell' } as
      | { category: string; name: string }
      | undefined,
    copies: 0,
    between: null as (() => void) | null,
  }
  const roots = new Map<string, { digest: string; result: TenantSettingsWriteResult }>()
  const writes: SettingsChange[] = []
  const view = (): SettingsTargetView => ({
    target,
    enabled: true,
    sources: flags.sources ?? [
      ORGANIZATION_SOURCE,
      TENANT_SOURCE,
      ...(options.withSession === true ? [SESSION_SOURCE] : []),
    ],
    definitionRef,
    definition,
    state,
    grants: flags.grants ?? [
      { sourceId: 'organization', actions: ['set', 'clear', 'lock', 'unlock'] },
      { sourceId: 'tenant', actions: flags.tenantActions },
    ],
  })
  const own = (itemId: string): Value | null => {
    const value = state.sources[1]!.values.find(entry => entry.itemId === itemId)?.value
    return value?.kind === 'value' ? (value.value as Value) : null
  }
  function assign(sourceId: string, itemId: string, value: unknown, locked = false) {
    state = {
      revision: state.revision + 1,
      sources: state.sources.map(source =>
        source.id !== sourceId
          ? source
          : {
              id: source.id,
              values: [
                ...source.values.filter(entry => entry.itemId !== itemId),
                { itemId, value: { kind: 'value', value: value as never }, locked },
              ],
            },
      ),
    }
  }
  const permissions: TenantSettingsPermissions = {
    kindOf: ({ itemId }) => (itemId === 'invoke' ? 'permission' : 'ordinary'),
    async view({ itemId }): Promise<PermissionItemView | 'unavailable'> {
      calls.push('permissions.view')
      if (!flags.organizationReadable) return 'unavailable'
      const pick = own(itemId)?.pick ?? null
      const prohibitedAbove = flags.organizationPick === 'deny'
      return {
        appliesAt: 'For each later call',
        choices: ['deny', 'ask', 'auto'].map(value => ({
          value,
          label: value,
          description: value,
          permitsOperation: PERMITS[value]!,
        })),
        default: 'ask',
        own: pick,
        effective:
          prohibitedAbove || pick === 'deny'
            ? { kind: 'prohibited', by: prohibitedAbove ? 'organization' : 'tenant' }
            : { kind: 'value', value: pick ?? 'ask', source: pick === null ? 'default' : 'tenant' },
        bound: flags.organizationBound,
        editable: prohibitedAbove ? { kind: 'no', reason: 'prohibited-above' } : { kind: 'yes' },
      }
    },
    compose: ({ itemId, pick }) => {
      const allowedSet = own(itemId)?.allowedSet ?? null
      return pick in PERMITS
        ? {
            kind: 'value',
            value: { pick, allowedSet: allowedSet === null ? null : [...allowedSet] },
          }
        : { kind: 'invalid' }
    },
    cleared: ({ itemId }) => {
      const allowedSet = own(itemId)?.allowedSet ?? null
      return allowedSet === null
        ? { kind: 'clear' }
        : { kind: 'value', value: { pick: null, allowedSet: [...allowedSet] } }
    },
    async judge({ pick }) {
      calls.push('permissions.judge')
      if (!PERMITS[pick]) return 'within'
      if (!flags.organizationReadable) return 'unavailable'
      if (flags.organizationPick === 'deny') return 'out-of-bound'
      return flags.organizationBound === null || flags.organizationBound.includes(pick)
        ? 'within'
        : 'out-of-bound'
    },
  }
  const face = createTenantSettings<string>({
    deploymentRef: 'deployment',
    principals: {
      async admit({ principal, tenant, action }) {
        calls.push('principals.admit')
        admitted.push(action)
        return principal === LOGIN_A && tenant === tenantA ? 'allowed' : 'denied'
      },
    },
    catalog: {
      async read(tenant): Promise<SettingsBasis | SettingsFailure> {
        calls.push('catalog.read')
        if (flags.readThrows) throw new Error('the catalog is gone')
        if (tenant !== tenantA) return { kind: 'rejected', reason: 'forbidden' }
        if (flags.catalog === 'unavailable') return { kind: 'rejected', reason: 'unavailable' }
        const views =
          flags.catalog === 'not-held'
            ? []
            : flags.catalog === 'duplicate'
              ? [view(), { ...view(), target: { ...target, targetRef: 'tool.Shell.copy' } }]
              : [
                  view(),
                  ...Array.from({ length: flags.copies }, (_, index) => ({
                    ...view(),
                    target: { ...target, targetRef: `tool.Shell.copy${index}` },
                  })),
                ]
        return {
          scopeKey: 'tenant-a',
          revision: String(state.revision),
          views,
          completeness: flags.catalog === 'partial' ? 'partial' : 'complete',
          unavailableProviders: [],
        }
      },
      assetOf: async (tenant, candidate) => {
        assetTenants.add(String(tenant))
        if (flags.assetThrows) throw new Error('the holding cannot be read')
        return /^tool\.Shell\.copy\d+$/.test(candidate.target.targetRef)
          ? { category: 'tool', name: candidate.target.targetRef }
          : candidate.target.targetRef === 'tool.Shell.copy'
            ? flags.copyAsset
            : { category: 'tool', name: 'Shell' }
      },
    },
    permissions,
    writer: {
      async write({ command, beforeWrite }) {
        calls.push('writer.write')
        if (flags.reply !== null) return flags.reply
        if (flags.reject !== null) return { kind: 'rejected', reason: flags.reject }
        const { requestId: _requestId, ...stable } = command
        const digest = canonicalize(stable)!
        const known = roots.get(command.operationId)
        if (known !== undefined)
          return known.digest === digest
            ? known.result
            : { kind: 'rejected', reason: 'operation_conflict' }
        const refused = await beforeWrite()
        if (refused !== null) return { kind: 'refused', outcome: refused }
        flags.between?.()
        flags.between = null
        const operation = { target: command.target, operationId: command.operationId }
        const decision =
          state.revision !== command.expectedRevision
            ? ({ kind: 'rejected', reason: 'revision_conflict' } as const)
            : decideSettingsChange({
                command,
                state,
                definition,
                definitionRef,
                grants: view().grants,
              })
        let result: TenantSettingsWriteResult
        if (decision.kind === 'rejected')
          result =
            decision.reason === 'revision_conflict' || decision.reason === 'locked'
              ? { kind: 'aborted', operation, reason: decision.reason }
              : decision
        else {
          if (decision.kind === 'changed') {
            state = decision.state
            writes.push(command)
          }
          result = {
            kind: 'committed',
            operation,
            revision: decision.state.revision,
            changed: decision.kind === 'changed',
          }
        }
        roots.set(command.operationId, { digest, result })
        if (flags.lose) throw new Error('the answer was lost')
        return result
      },
    },
  })
  return { face, calls, admitted, assetTenants, flags, writes, assign, own, state: () => state }
}

const SHELL = { category: 'tool', name: 'Shell' }
const item = (principal = LOGIN_A, tenant = tenantA, itemId = 'invoke') => ({
  principal,
  tenant,
  asset: SHELL,
  item: itemId,
})
const pick = (value: string, operation = `op-${value}`, expectedRevision = '0') => ({
  ...item(),
  operation,
  expectedRevision,
  value: { kind: 'permission' as const, pick: value },
})

describe('set', () => {
  it('S1 a login principal of the tenant writes a valid pick of a held, declared item under the current revision: written with the new revision', async () => {
    const w = world()
    expect(await w.face.set(pick('auto'))).toEqual({ kind: 'written', revision: '1' })
    expect(w.own('invoke')).toEqual({ pick: 'auto', allowedSet: null })
  })

  it('S2 the value equals the current value of the layer: no-change, nothing written', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: 'auto', allowedSet: null })
    expect(await w.face.set(pick('auto', 'again', '1'))).toEqual({ kind: 'no-change' })
    expect(w.state().revision).toBe(1)
  })

  it('S3 a principal without the right, or a target that is not its tenant: denied, and nothing is read', async () => {
    const w = world()
    expect(await w.face.set({ ...pick('deny'), principal: 'login:b' })).toEqual({
      kind: 'denied',
    })
    expect(await w.face.set({ ...pick('deny'), tenant: tenantB })).toEqual({ kind: 'denied' })
    expect(w.calls).toEqual(['principals.admit', 'principals.admit'])
  })

  it('S4 a principal that is not a login principal (a session work principal): denied, and nothing is read', async () => {
    const w = world()
    expect(await w.face.set({ ...pick('auto'), principal: WORK_A })).toEqual({ kind: 'denied' })
    expect(await w.face.clear({ ...pick('auto'), principal: WORK_A })).toEqual({ kind: 'denied' })
    expect(await w.face.describe(item(WORK_A))).toEqual({ kind: 'denied' })
    expect(
      await w.face.list({ principal: WORK_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'denied' })
    expect(w.calls.every(call => call === 'principals.admit')).toBe(true)
    expect(w.writes).toEqual([])
  })

  it('S5 the asset is not held, or the item is not declared: not-visible, nothing written', async () => {
    const w = world()
    expect(await w.face.set({ ...pick('deny'), item: 'missing' })).toEqual({ kind: 'not-visible' })
    w.flags.catalog = 'not-held'
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'not-visible' })
    expect(w.writes).toEqual([])
  })

  it('S6 the value does not match the declared type and values: invalid, nothing written', async () => {
    const w = world()
    expect(await w.face.set(pick('sometimes'))).toEqual({ kind: 'invalid' })
    expect(
      await w.face.set({
        ...item(undefined, undefined, 'verbose'),
        operation: 'verbose',
        expectedRevision: '0',
        value: { kind: 'ordinary', value: 'yes' },
      }),
    ).toEqual({ kind: 'invalid' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('S7 a permission value that carries an allowed set: invalid, the layer takes a pick only', async () => {
    const w = world()
    const withSet = { kind: 'permission', pick: 'auto', allowedSet: ['ask'] }
    expect(await w.face.set({ ...pick('auto'), value: withSet as never })).toEqual({
      kind: 'invalid',
    })
    expect(
      await w.face.set({
        ...pick('auto'),
        value: { kind: 'ordinary', value: { pick: 'auto', allowedSet: ['ask'] } },
      }),
    ).toEqual({ kind: 'invalid' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('S7 an allowed set the layer already holds stays after a successful set', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: null, allowedSet: ['deny', 'ask'] })
    expect(await w.face.set(pick('ask', 'keep', '1'))).toEqual({ kind: 'written', revision: '2' })
    expect(w.own('invoke')).toEqual({ pick: 'ask', allowedSet: ['deny', 'ask'] })
  })

  it('S8 a stale revision: conflict, nothing written', async () => {
    const w = world()
    w.assign('tenant', 'verbose', true)
    expect(await w.face.set(pick('deny', 'stale', '0'))).toEqual({ kind: 'conflict' })
    expect(w.own('invoke')).toBeNull()
  })

  it('S8 the target changes after the preparation and before the commit: conflict, this write does not happen', async () => {
    const w = world()
    w.flags.between = () => w.assign('tenant', 'invoke', { pick: 'ask', allowedSet: null })
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'conflict' })
    expect(w.own('invoke')).toEqual({ pick: 'ask', allowedSet: null })
  })

  it('S9 locked by an outer layer: not-writable locked, nothing written', async () => {
    const w = world()
    w.assign('organization', 'verbose', true, true)
    expect(
      await w.face.set({
        ...item(undefined, undefined, 'verbose'),
        operation: 'locked',
        expectedRevision: '1',
        value: { kind: 'ordinary', value: false },
      }),
    ).toEqual({ kind: 'not-writable', reason: 'locked' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('S10 a pick that permits the operation outside the common allowed set: not-writable out-of-bound, nothing written', async () => {
    const w = world()
    w.flags.organizationBound = ['deny', 'ask']
    expect(await w.face.set(pick('auto'))).toEqual({
      kind: 'not-writable',
      reason: 'out-of-bound',
    })
    expect(w.writes).toEqual([])
    expect(await w.face.set(pick('deny', 'deny-under-bound'))).toEqual({
      kind: 'written',
      revision: '1',
    })
  })

  it('S10 a pick that permits the operation under an active prohibition above: not-writable out-of-bound', async () => {
    const w = world()
    w.flags.organizationPick = 'deny'
    expect(await w.face.set(pick('ask'))).toEqual({
      kind: 'not-writable',
      reason: 'out-of-bound',
    })
    expect(w.writes).toEqual([])
  })

  it('S11 a deny pick while an outer source is unreadable: written, a restriction does not depend on outer sources', async () => {
    const w = world()
    w.flags.organizationReadable = false
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'written', revision: '1' })
  })

  it('S12 another pick while an applicable source is unreadable: unavailable, nothing written', async () => {
    const w = world()
    w.flags.organizationReadable = false
    expect(await w.face.set(pick('auto'))).toEqual({ kind: 'unavailable' })
    expect(w.writes).toEqual([])
  })

  it('S13 the write was handed over and its answer lost: unknown; the same operation with the same input recalls the original result and writes once', async () => {
    const w = world()
    w.flags.lose = true
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'unknown' })
    w.flags.lose = false
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'written', revision: '1' })
    expect(w.writes).toHaveLength(1)
  })

  it('S13 the same operation with another input: conflict', async () => {
    const w = world()
    expect(await w.face.set(pick('deny', 'one'))).toEqual({ kind: 'written', revision: '1' })
    expect(await w.face.set(pick('ask', 'one'))).toEqual({ kind: 'conflict' })
    expect(w.writes).toHaveLength(1)
  })

  it('S-secret a secret item is not a source of this face: not-writable not-a-source', async () => {
    const w = world()
    expect(
      await w.face.set({
        ...item(undefined, undefined, 'apiKey'),
        operation: 'secret',
        expectedRevision: '0',
        value: { kind: 'secret', secret: 'k' },
      }),
    ).toEqual({ kind: 'not-writable', reason: 'not-a-source' })
  })
})

describe('clear', () => {
  const clear = (operation: string, expectedRevision: string, itemId = 'invoke') => ({
    ...item(undefined, undefined, itemId),
    operation,
    expectedRevision,
  })

  it('the layer has a value, the right and the revision are current: written, the layer no longer supplies the value', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: 'deny', allowedSet: null })
    expect(await w.face.clear(clear('clear', '1'))).toEqual({ kind: 'written', revision: '2' })
    expect(w.own('invoke')).toBeNull()
  })

  it('a clear of a permission item withdraws the pick and keeps an allowed set of the layer', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: 'deny', allowedSet: ['deny', 'ask'] })
    expect(await w.face.clear(clear('clear', '1'))).toEqual({ kind: 'written', revision: '2' })
    expect(w.own('invoke')).toEqual({ pick: null, allowedSet: ['deny', 'ask'] })
  })

  it('the layer has no value: no-change, nothing written', async () => {
    const w = world()
    expect(await w.face.clear(clear('clear', '0'))).toEqual({ kind: 'no-change' })
    expect(w.state().revision).toBe(0)
  })

  it('the other rows answer as set does: denied, not-visible, conflict, locked', async () => {
    const w = world()
    expect(await w.face.clear({ ...clear('c', '0'), principal: WORK_A })).toEqual({
      kind: 'denied',
    })
    expect(await w.face.clear(clear('c', '0', 'missing'))).toEqual({ kind: 'not-visible' })
    w.assign('tenant', 'invoke', { pick: 'deny', allowedSet: null })
    expect(await w.face.clear(clear('c', '0'))).toEqual({ kind: 'conflict' })
    w.assign('organization', 'verbose', true, true)
    expect(await w.face.clear(clear('v', '2', 'verbose'))).toEqual({
      kind: 'not-writable',
      reason: 'locked',
    })
  })
})

describe('list and describe', () => {
  it('the login principal lists the items of its assets, each with declaration, revision, own, effective, bound and editability', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: 'deny', allowedSet: null })
    w.flags.organizationBound = ['deny', 'ask']
    const listed = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      after: null,
      limit: 10,
    })
    expect(listed).toMatchObject({ kind: 'listed', completeness: 'complete', next: null })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.items.map(value => value.item)).toEqual(['apiKey', 'invoke', 'verbose'])
    expect(listed.items.find(value => value.item === 'invoke')).toMatchObject({
      kind: 'permission',
      revision: '1',
      own: 'deny',
      bound: ['deny', 'ask'],
      effective: { kind: 'prohibited', by: 'tenant' },
      editable: { kind: 'yes' },
      declaration: { appliesAt: 'For each later call', clearEffect: presentation.clear },
    })
    expect(listed.items.find(value => value.item === 'verbose')).toEqual({
      asset: SHELL,
      item: 'verbose',
      revision: '1',
      declaration: {
        title: presentation.title,
        purpose: presentation.description,
        appliesAt: 'Applies from the next read of the item.',
        clearEffect: presentation.clear,
      },
      kind: 'ordinary',
      valueSchema: { type: 'boolean' },
      default: { kind: 'set', value: false },
      own: { kind: 'unset' },
      effective: { value: { kind: 'set', value: false }, source: 'default' },
      lockedBy: null,
      editable: { kind: 'yes' },
    })
    expect(listed.items.find(value => value.item === 'apiKey')).toEqual({
      asset: SHELL,
      item: 'apiKey',
      revision: '1',
      declaration: {
        title: presentation.title,
        purpose: presentation.description,
        appliesAt: 'Applies from the next read of the item.',
        clearEffect: presentation.clear,
      },
      kind: 'secret',
      own: 'unreadable',
      official: 'unreadable',
      editable: { kind: 'no', reason: 'not-a-source' },
    })
  })

  it('pages come from one read and continue with next', async () => {
    const w = world()
    const first = await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 2 })
    if (first.kind !== 'listed') throw new Error(JSON.stringify(first))
    expect(first.items.map(value => value.item)).toEqual(['apiKey', 'invoke'])
    expect(first.next).toBe('2')
    const second = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      after: first.next,
      limit: 2,
    })
    expect(second).toMatchObject({ kind: 'listed', next: null, items: [{ item: 'verbose' }] })
  })

  it('no right, or a target that is not its tenant: denied, the same as an absent target, and nothing is read', async () => {
    const w = world()
    expect(await w.face.describe(item(LOGIN_A, tenantB))).toEqual({ kind: 'denied' })
    expect(await w.face.describe(item('login:b'))).toEqual({ kind: 'denied' })
    expect(w.calls).toEqual(['principals.admit', 'principals.admit'])
  })

  it('describe of an asset that is not held or an undeclared item: not-visible', async () => {
    const w = world()
    expect(await w.face.describe(item(undefined, undefined, 'missing'))).toEqual({
      kind: 'not-visible',
    })
    w.flags.catalog = 'not-held'
    expect(await w.face.describe(item())).toEqual({ kind: 'not-visible' })
  })

  it('the asset reference matches several holdings: conflict', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    expect(await w.face.describe(item())).toEqual({ kind: 'conflict' })
  })

  it('a source, the right or the storage is unreadable: unavailable, never a partial answer as a complete one', async () => {
    const w = world()
    w.flags.catalog = 'unavailable'
    expect(await w.face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'unavailable' })
    w.flags.catalog = 'ok'
    w.flags.organizationReadable = false
    expect(await w.face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'unavailable' })
    w.flags.organizationReadable = true
    w.flags.catalog = 'partial'
    expect(await w.face.describe(item(undefined, undefined, 'missing'))).toEqual({
      kind: 'unavailable',
    })
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toMatchObject({ kind: 'listed', completeness: 'partial' })
  })

  it('an unreadable admission is unavailable and reads nothing', async () => {
    const w = world()
    const face = createTenantSettings<string>({
      deploymentRef: 'deployment',
      principals: {
        admit: async () => {
          throw new Error('admission absent')
        },
      },
      catalog: {
        read: async () => {
          throw new Error('must not read')
        },
        assetOf: async () => undefined,
      },
      permissions: {} as TenantSettingsPermissions,
      writer: {
        write: async () => {
          throw new Error('must not write')
        },
      },
    })
    expect(await face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(await face.set(pick('deny'))).toEqual({ kind: 'unavailable' } satisfies WriteOutcome)
    expect(w.calls).toEqual([])
  })
})

describe('AS-19 the revision of a write is the revision of the view it was judged on', () => {
  const verbose = (operation: string, expectedRevision: string, value = true) => ({
    ...item(undefined, undefined, 'verbose'),
    operation,
    expectedRevision,
    value: { kind: 'ordinary' as const, value },
  })

  it('a permission item whose revision is newer than the judged view: conflict even if storage would accept it, nothing written', async () => {
    const w = world()
    w.flags.between = () => w.assign('tenant', 'verbose', true)
    expect(await w.face.set(pick('auto', 'newer', '1'))).toEqual({ kind: 'conflict' })
    expect(w.writes).toEqual([])
    expect(w.own('invoke')).toBeNull()
  })

  it('an ordinary item is held to the same comparison', async () => {
    const w = world()
    w.flags.between = () => w.assign('tenant', 'invoke', { pick: 'ask', allowedSet: null })
    expect(await w.face.set(verbose('newer', '1'))).toEqual({ kind: 'conflict' })
    expect(w.writes).toEqual([])
    expect(w.state().revision).toBe(0)
  })

  it('a revision older than the judged view: conflict, nothing written', async () => {
    const w = world()
    w.assign('tenant', 'invoke', { pick: 'ask', allowedSet: null })
    w.assign('tenant', 'invoke', { pick: 'ask', allowedSet: null })
    expect(await w.face.set(verbose('older', '1'))).toEqual({ kind: 'conflict' })
    expect(w.writes).toEqual([])
  })

  it('the comparison comes before the bound judgement: a stale pick that is out of bound answers conflict', async () => {
    const w = world()
    w.flags.organizationBound = ['deny']
    expect(await w.face.set(pick('auto', 'stale-out', '1'))).toEqual({ kind: 'conflict' })
    expect(w.calls).not.toContain('permissions.judge')
  })

  it('an operation the writer already knows is recalled with the revision it was sent with, not compared with the newer view', async () => {
    const w = world()
    expect(await w.face.set(pick('deny', 'known', '0'))).toEqual({ kind: 'written', revision: '1' })
    expect(await w.face.set(pick('deny', 'known', '0'))).toEqual({ kind: 'written', revision: '1' })
    expect(w.writes).toHaveLength(1)
  })
})

describe('the right to write the tenant source', () => {
  const setVerbose = (operation: string) => ({
    ...item(undefined, undefined, 'verbose'),
    operation,
    expectedRevision: '0',
    value: { kind: 'ordinary' as const, value: true },
  })

  it('a tenant source granted clear only: set is not-writable not-a-source and the writer is not reached', async () => {
    const w = world()
    w.flags.tenantActions = ['clear']
    expect(await w.face.set(setVerbose('s'))).toEqual({
      kind: 'not-writable',
      reason: 'not-a-source',
    })
    expect(w.calls).not.toContain('writer.write')
  })

  it('a tenant source granted set only: clear is not-writable not-a-source', async () => {
    const w = world()
    w.flags.tenantActions = ['set']
    expect(
      await w.face.clear({
        ...item(undefined, undefined, 'verbose'),
        operation: 'c',
        expectedRevision: '0',
      }),
    ).toEqual({ kind: 'not-writable', reason: 'not-a-source' })
  })

  it('a tenant source with no grant while another source holds one: not-writable not-a-source', async () => {
    const w = world()
    w.flags.tenantActions = []
    expect(await w.face.set(setVerbose('s'))).toEqual({
      kind: 'not-writable',
      reason: 'not-a-source',
    })
  })

  it('a tenant source granted set only: the item is editable in the view', async () => {
    const w = world()
    w.flags.tenantActions = ['set']
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: { editable: { kind: 'yes' } },
    })
  })

  it('a tenant source granted clear only: the item is not editable in the view', async () => {
    const w = world()
    w.flags.tenantActions = ['clear']
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: { editable: { kind: 'no', reason: 'not-a-source' } },
    })
  })
})

describe('the answer to a rejection of the writer', () => {
  const rejections: readonly (readonly [SettingsFailure['reason'], WriteOutcome])[] = [
    ['invalid_input', { kind: 'invalid' }],
    ['limit_exceeded', { kind: 'invalid' }],
    ['incompatible', { kind: 'invalid' }],
    ['forbidden', { kind: 'denied' }],
    ['revision_conflict', { kind: 'conflict' }],
    ['definition_changed', { kind: 'conflict' }],
    ['operation_conflict', { kind: 'conflict' }],
    ['locked', { kind: 'not-writable', reason: 'locked' }],
    ['unsupported', { kind: 'not-writable', reason: 'not-a-source' }],
    ['unavailable', { kind: 'unavailable' }],
    ['basis_changed', { kind: 'unavailable' }],
    ['closing', { kind: 'unavailable' }],
  ]
  it.each(rejections)('%s', async (reason, outcome) => {
    const w = world()
    w.flags.reject = reason
    expect(await w.face.set(pick('deny'))).toEqual(outcome)
  })
})

describe('an ordinary item in the view', () => {
  const view = async (w: ReturnType<typeof world>) => {
    const described = await w.face.describe(item(undefined, undefined, 'verbose'))
    if (described.kind !== 'described') throw new Error(JSON.stringify(described))
    return described.item
  }

  it('a value of the tenant layer: own is set, and the tenant supplies the effective value', async () => {
    const w = world()
    w.assign('tenant', 'verbose', true)
    expect(await view(w)).toMatchObject({
      own: { kind: 'set', value: true },
      effective: { value: { kind: 'set', value: true }, source: 'tenant' },
      lockedBy: null,
      editable: { kind: 'yes' },
    })
  })

  it('a value of the organization layer: own stays unset, the organization supplies the effective value, not locked', async () => {
    const w = world()
    w.assign('organization', 'verbose', true)
    expect(await view(w)).toMatchObject({
      own: { kind: 'unset' },
      effective: { value: { kind: 'set', value: true }, source: 'organization' },
      lockedBy: null,
      editable: { kind: 'yes' },
    })
  })

  it('no value in any layer: the default supplies the effective value', async () => {
    const w = world()
    expect(await view(w)).toMatchObject({ effective: { source: 'default' } })
  })

  it('locked by the organization: lockedBy organization and the item is not editable, locked', async () => {
    const w = world()
    w.assign('organization', 'verbose', true, true)
    expect(await view(w)).toMatchObject({
      lockedBy: 'organization',
      effective: { source: 'organization' },
      editable: { kind: 'no', reason: 'locked' },
    })
  })

  it('locked by the tenant layer itself: not reported as locked by the organization, still editable', async () => {
    const w = world()
    w.assign('tenant', 'verbose', true, true)
    expect(await view(w)).toMatchObject({ lockedBy: null, editable: { kind: 'yes' } })
  })

  it('locked above but the tenant has no right to set: not-a-source takes precedence over locked', async () => {
    const w = world()
    w.flags.tenantActions = []
    w.assign('organization', 'verbose', true, true)
    expect(await view(w)).toMatchObject({ editable: { kind: 'no', reason: 'not-a-source' } })
  })
})

describe('the numbers the face accepts are whole strings', () => {
  const stale = ['x0', '0x', ' 0', '0 ', '0\n', '00', '-1', '1000000000000000']
  it.each(stale)('expected revision %j: invalid, nothing read for the write', async revision => {
    const w = world()
    expect(await w.face.set(pick('deny', 'bad', revision))).toEqual({ kind: 'invalid' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('the largest revision of fifteen digits is a revision', async () => {
    const w = world()
    expect(await w.face.set(pick('deny', 'big', '999999999999999'))).toEqual({ kind: 'conflict' })
  })

  const cursors = ['x1', '1x', ' 1', '1\n', '01', '1000000000']
  it.each(cursors)('page cursor %j: unavailable', async after => {
    const w = world()
    expect(await w.face.list({ principal: LOGIN_A, tenant: tenantA, after, limit: 1 })).toEqual({
      kind: 'unavailable',
    })
  })

  it('a cursor of nine digits is a cursor', async () => {
    const w = world()
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: '999999999', limit: 1 }),
    ).toMatchObject({ kind: 'listed', items: [], next: null })
  })
})

describe('which asset a query names', () => {
  const named = (category: string | undefined, name: string) => ({
    ...item(),
    asset: category === undefined ? { name } : { category, name },
  })

  it('a name with another category: not-visible', async () => {
    const w = world()
    expect(await w.face.describe(named('other', 'Shell'))).toEqual({ kind: 'not-visible' })
  })

  it('a category with another name: not-visible', async () => {
    const w = world()
    expect(await w.face.describe(named('tool', 'Other'))).toEqual({ kind: 'not-visible' })
  })

  it('a name without a category names the asset of any category', async () => {
    const w = world()
    expect(await w.face.describe(named(undefined, 'Shell'))).toMatchObject({ kind: 'described' })
  })

  it('two holdings that differ in the category only: the query with the category finds one, the query without it conflicts', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = { category: 'other', name: 'Shell' }
    expect(await w.face.describe(named('tool', 'Shell'))).toMatchObject({
      item: { asset: { category: 'tool', name: 'Shell' } },
    })
    expect(await w.face.describe(named('other', 'Shell'))).toMatchObject({
      item: { asset: { category: 'other', name: 'Shell' } },
    })
    expect(await w.face.describe(named(undefined, 'Shell'))).toEqual({ kind: 'conflict' })
  })

  it('two holdings that differ in the name only: each query finds its own', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = { category: 'tool', name: 'Other' }
    expect(await w.face.describe(named('tool', 'Shell'))).toMatchObject({
      item: { asset: { name: 'Shell' } },
    })
    expect(await w.face.describe(named(undefined, 'Other'))).toMatchObject({
      item: { asset: { name: 'Other' } },
    })
  })

  it('a list with an asset query keeps only the matching asset', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = { category: 'other', name: 'Shell' }
    const listed = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      asset: { category: 'other', name: 'Shell' },
      after: null,
      limit: 10,
    })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.items.map(value => value.asset.category)).toEqual(['other', 'other', 'other'])
  })

  it('a list across assets orders by category, then name, then item', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = { category: 'tool', name: 'Alpha' }
    const listed = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      after: null,
      limit: 10,
    })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.items.map(value => `${value.asset.name}/${value.item}`)).toEqual([
      'Alpha/apiKey',
      'Alpha/invoke',
      'Alpha/verbose',
      'Shell/apiKey',
      'Shell/invoke',
      'Shell/verbose',
    ])
  })

  it('a list across assets orders by category before name', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = { category: 'alpha', name: 'Zed' }
    const listed = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      after: null,
      limit: 10,
    })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.items.map(value => `${value.asset.category}/${value.asset.name}`)).toEqual([
      'alpha/Zed',
      'alpha/Zed',
      'alpha/Zed',
      'tool/Shell',
      'tool/Shell',
      'tool/Shell',
    ])
  })

  it('a holding the catalog cannot name an asset for is not listed and does not make a name ambiguous', async () => {
    const w = world()
    w.flags.catalog = 'duplicate'
    w.flags.copyAsset = undefined
    const listed = await w.face.list({
      principal: LOGIN_A,
      tenant: tenantA,
      after: null,
      limit: 10,
    })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    expect(listed.items.map(value => value.item)).toEqual(['apiKey', 'invoke', 'verbose'])
    expect(await w.face.describe(item())).toMatchObject({ kind: 'described' })
  })
})

describe('the tenant source and its grant decide whether the face may write', () => {
  const setVerbose = (operation: string, expectedRevision = '0') => ({
    ...item(undefined, undefined, 'verbose'),
    operation,
    expectedRevision,
    value: { kind: 'ordinary' as const, value: true },
  })
  const clearVerbose = (operation: string, expectedRevision = '0') => ({
    ...item(undefined, undefined, 'verbose'),
    operation,
    expectedRevision,
  })
  const NOT_A_SOURCE = { kind: 'not-writable', reason: 'not-a-source' } as const
  const ALL_GRANTS = ['set', 'clear', 'lock', 'unlock'] as const

  it('a view with no tenant source: set and clear are not-writable not-a-source, the item is not editable, and the writer is not reached', async () => {
    const w = world()
    w.flags.sources = [ORGANIZATION_SOURCE]
    expect(await w.face.set(setVerbose('s'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.clear(clearVerbose('c'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: { own: { kind: 'unset' }, editable: { kind: 'no', reason: 'not-a-source' } },
    })
    expect(w.calls).not.toContain('writer.write')
  })

  it('a view with two tenant sources has no single layer to write: not-writable not-a-source even when both are granted', async () => {
    const w = world()
    w.flags.sources = [
      ORGANIZATION_SOURCE,
      TENANT_SOURCE,
      { ...TENANT_SOURCE, sourceId: 'tenant-2' },
    ]
    w.flags.grants = [
      { sourceId: 'organization', actions: ALL_GRANTS },
      { sourceId: 'tenant', actions: ALL_GRANTS },
      { sourceId: 'tenant-2', actions: ALL_GRANTS },
    ]
    expect(await w.face.set(setVerbose('s'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.clear(clearVerbose('c'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: { editable: { kind: 'no', reason: 'not-a-source' } },
    })
    expect(w.calls).not.toContain('writer.write')
  })

  it('a tenant source that has no grant row at all: set and clear are not-writable not-a-source', async () => {
    const w = world()
    w.flags.grants = [{ sourceId: 'organization', actions: ALL_GRANTS }]
    expect(await w.face.set(setVerbose('s'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.clear(clearVerbose('c'))).toEqual(NOT_A_SOURCE)
    expect(w.calls).not.toContain('writer.write')
  })

  it('a tenant source granted lock and unlock only: neither set nor clear is allowed', async () => {
    const w = world()
    w.flags.tenantActions = ['lock', 'unlock']
    expect(await w.face.set(setVerbose('s'))).toEqual(NOT_A_SOURCE)
    expect(await w.face.clear(clearVerbose('c'))).toEqual(NOT_A_SOURCE)
  })

  it('a grant of clear alone is enough to clear, a grant of set alone is enough to set', async () => {
    const w = world()
    w.assign('tenant', 'verbose', true)
    w.flags.tenantActions = ['clear']
    expect(await w.face.clear(clearVerbose('c', '1'))).toEqual({ kind: 'written', revision: '2' })
    w.flags.tenantActions = ['set']
    expect(await w.face.set(setVerbose('s', '2'))).toEqual({ kind: 'written', revision: '3' })
  })

  it('the item locked by the tenant layer itself is still written by the tenant', async () => {
    const w = world()
    w.assign('tenant', 'verbose', false, true)
    expect(await w.face.set(setVerbose('s', '1'))).toEqual({ kind: 'written', revision: '2' })
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: { own: { kind: 'set', value: true } },
    })
  })
})

describe('the answer to an aborted, committed or unknown write', () => {
  const operation = {
    target: { policyId: 'asset', targetRef: 'tool.Shell', scopeRef: 'tenant-a' },
    operationId: 'op-deny',
  }
  const aborted: readonly (readonly [string, WriteOutcome])[] = [
    ['forbidden', { kind: 'denied' }],
    ['revision_conflict', { kind: 'conflict' }],
    ['definition_changed', { kind: 'conflict' }],
    ['locked', { kind: 'not-writable', reason: 'locked' }],
    ['incompatible', { kind: 'invalid' }],
    ['cancelled', { kind: 'unavailable' }],
    ['sealed', { kind: 'unavailable' }],
  ]
  it.each(aborted)('aborted %s', async (reason, outcome) => {
    const w = world()
    w.flags.reply = { kind: 'aborted', operation, reason: reason as never }
    expect(await w.face.set(pick('deny'))).toEqual(outcome)
  })

  it('committed with a change: written with the revision of the commit as text', async () => {
    const w = world()
    w.flags.reply = { kind: 'committed', operation, revision: 7, changed: true }
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'written', revision: '7' })
  })

  it('committed without a change: no-change', async () => {
    const w = world()
    w.flags.reply = { kind: 'committed', operation, revision: 7, changed: false }
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'no-change' })
  })

  it('an unknown answer of the writer is unknown, not a success or a failure', async () => {
    const w = world()
    w.flags.reply = { kind: 'unknown', operation }
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'unknown' })
  })
})

describe('which layer an ordinary item reports', () => {
  const noteOf = async (w: ReturnType<typeof world>) => {
    const described = await w.face.describe(item(undefined, undefined, 'note'))
    if (described.kind !== 'described') throw new Error(JSON.stringify(described))
    return described.item
  }

  it('no default and no value in any layer: the default, own and effective are all unset, and no layer supplies it', async () => {
    const w = world({ withNote: true })
    expect(await noteOf(w)).toMatchObject({
      default: { kind: 'unset' },
      own: { kind: 'unset' },
      effective: { value: { kind: 'unset' }, source: null },
      lockedBy: null,
      editable: { kind: 'yes' },
    })
  })

  it('a value of the tenant layer for an item with no default: the tenant supplies it', async () => {
    const w = world({ withNote: true })
    w.assign('tenant', 'note', 'hello')
    expect(await noteOf(w)).toMatchObject({
      default: { kind: 'unset' },
      own: { kind: 'set', value: 'hello' },
      effective: { value: { kind: 'set', value: 'hello' }, source: 'tenant' },
    })
  })

  it('a value of a layer that is neither the tenant nor the organization: it is effective but no named layer supplies it, and it locks nothing', async () => {
    const w = world({ withSession: true })
    w.assign('session', 'verbose', true)
    expect(await w.face.describe(item(undefined, undefined, 'verbose'))).toMatchObject({
      item: {
        own: { kind: 'unset' },
        effective: { value: { kind: 'set', value: true }, source: null },
        lockedBy: null,
        editable: { kind: 'yes' },
      },
    })
  })
})

describe('what the face passes on to its ports', () => {
  it('each method asks admission for its own action', async () => {
    const w = world()
    await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 1 })
    await w.face.describe(item())
    await w.face.set(pick('deny'))
    await w.face.clear({ ...item(), operation: 'c', expectedRevision: '1' })
    expect(w.admitted).toEqual(['list', 'describe', 'set', 'clear'])
  })

  it('a set hands the writer one command that names the tenant source, the item, the revision as a number and the value', async () => {
    const w = world()
    await w.face.set({
      ...item(undefined, undefined, 'verbose'),
      operation: 'cmd',
      expectedRevision: '0',
      value: { kind: 'ordinary', value: true },
    })
    expect(w.writes).toEqual([
      {
        protocol: 'settings/1',
        requestId: 'cmd',
        operationId: 'cmd',
        target: { policyId: 'asset', targetRef: 'tool.Shell', scopeRef: 'tenant-a' },
        definitionRef: {
          providerId: 'harness',
          definitionId: 'tool.Shell',
          version: '1',
          digest: 'a'.repeat(64),
        },
        expectedRevision: 0,
        sourceId: 'tenant',
        itemId: 'verbose',
        action: { kind: 'set', value: true },
      },
    ])
  })

  it('a clear of an ordinary item hands the writer a clear of the tenant source under the given revision', async () => {
    const w = world()
    w.assign('tenant', 'verbose', true)
    await w.face.clear({
      ...item(undefined, undefined, 'verbose'),
      operation: 'cmd',
      expectedRevision: '1',
    })
    expect(w.writes).toMatchObject([
      {
        operationId: 'cmd',
        expectedRevision: 1,
        sourceId: 'tenant',
        itemId: 'verbose',
        action: { kind: 'clear' },
      },
    ])
  })

  it.each([
    ['an operation that is not an id', { operation: 'not an id' }],
    ['an empty operation', { operation: '' }],
    ['an item that is not an id', { item: 'not an id' }],
    ['an empty item', { item: '' }],
  ])('%s: invalid before anything is read', async (_name, change) => {
    const w = world()
    expect(await w.face.set({ ...pick('deny'), ...change })).toEqual({ kind: 'invalid' })
    expect(
      await w.face.clear({ ...item(), operation: 'c', expectedRevision: '0', ...change }),
    ).toEqual({
      kind: 'invalid',
    })
    expect(w.calls.filter(call => call !== 'principals.admit')).toEqual([])
  })

  it.each(['verbose', 'free'])(
    'a permission pick for the item %s, which is not a permission item: invalid, nothing written',
    async itemId => {
      const w = world({ withNote: true })
      expect(
        await w.face.set({
          ...item(undefined, undefined, itemId),
          operation: 'wrong-kind',
          expectedRevision: '0',
          value: { kind: 'permission', pick: 'auto' },
        }),
      ).toEqual({ kind: 'invalid' })
      expect(w.calls).not.toContain('writer.write')
    },
  )

  it('a clear of a secret item is not-writable not-a-source', async () => {
    const w = world()
    expect(
      await w.face.clear({
        ...item(undefined, undefined, 'apiKey'),
        operation: 'secret',
        expectedRevision: '0',
      }),
    ).toEqual({ kind: 'not-writable', reason: 'not-a-source' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('a basis whose stored values do not fit its definition is unavailable, never a partial answer', async () => {
    const w = world()
    w.assign('tenant', 'ghost', true)
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'unavailable' })
    expect(await w.face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(await w.face.set(pick('deny', 'ghost', '1'))).toEqual({ kind: 'unavailable' })
    expect(w.calls).not.toContain('writer.write')
  })

  it('a catalog that throws is unavailable for list, describe, set and clear', async () => {
    const w = world()
    w.flags.readThrows = true
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'unavailable' })
    expect(await w.face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(await w.face.set(pick('deny'))).toEqual({ kind: 'unavailable' })
    expect(await w.face.clear({ ...item(), operation: 'c', expectedRevision: '0' })).toEqual({
      kind: 'unavailable',
    })
    expect(w.calls).not.toContain('writer.write')
  })

  it('reads the asset of each view for the tenant of the request', async () => {
    const w = world()
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toMatchObject({ kind: 'listed' })
    expect([...w.assetTenants]).toEqual([String(tenantA)])
  })

  it('an asset of a view that cannot be read makes the list unavailable, not shorter', async () => {
    const w = world()
    w.flags.assetThrows = true
    expect(
      await w.face.list({ principal: LOGIN_A, tenant: tenantA, after: null, limit: 10 }),
    ).toEqual({ kind: 'unavailable' })
    expect(await w.face.describe(item())).toEqual({ kind: 'unavailable' })
    expect(w.calls).not.toContain('writer.write')
  })
})

describe('the page size of a list', () => {
  const page = async (w: ReturnType<typeof world>, limit: number, after: string | null = null) => {
    const listed = await w.face.list({ principal: LOGIN_A, tenant: tenantA, after, limit })
    if (listed.kind !== 'listed') throw new Error(JSON.stringify(listed))
    return listed
  }

  it.each([0, -3, Number.NaN])('a limit of %s answers one item', async limit => {
    const listed = await page(world(), limit)
    expect(listed.items.map(value => value.item)).toEqual(['apiKey'])
    expect(listed.next).toBe('1')
  })

  it('a limit with a fraction counts whole items', async () => {
    const listed = await page(world(), 2.9)
    expect(listed.items).toHaveLength(2)
    expect(listed.next).toBe('2')
  })

  it('a limit that reaches the end leaves no next', async () => {
    const listed = await page(world(), 3)
    expect(listed.items).toHaveLength(3)
    expect(listed.next).toBeNull()
  })

  it('a limit above one hundred answers one hundred items and a next that continues after them', async () => {
    const w = world()
    w.flags.copies = 40
    const first = await page(w, 100000)
    expect(first.items).toHaveLength(100)
    expect(first.next).toBe('100')
    const rest = await page(w, 100000, first.next)
    expect(rest.items).toHaveLength(23)
    expect(rest.next).toBeNull()
  })

  it('the cursor 0 is the first page', async () => {
    const w = world()
    expect((await page(w, 2, '0')).items.map(value => value.item)).toEqual(['apiKey', 'invoke'])
  })
})

describe('the numbers the face accepts are whole strings, more shapes', () => {
  it.each(['', '+1', '1.5', '1e3', '٣', '0\r', '\t1'])(
    'expected revision %j: invalid',
    async revision => {
      const w = world()
      expect(await w.face.set(pick('deny', 'bad', revision))).toEqual({ kind: 'invalid' })
      expect(
        await w.face.clear({ ...item(), operation: 'bad', expectedRevision: revision }),
      ).toEqual({
        kind: 'invalid',
      })
      expect(w.calls).not.toContain('writer.write')
    },
  )

  it.each(['', '+1', '1.5', '1e3', '٣', '\t1', '0\r'])(
    'page cursor %j: unavailable',
    async after => {
      const w = world()
      expect(await w.face.list({ principal: LOGIN_A, tenant: tenantA, after, limit: 1 })).toEqual({
        kind: 'unavailable',
      })
    },
  )
})
