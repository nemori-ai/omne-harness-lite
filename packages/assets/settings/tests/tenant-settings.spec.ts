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
function definitionOf(): SettingDefinitions {
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
    ],
  })
  if (defined.kind !== 'defined') throw new Error(JSON.stringify(defined))
  return defined.definition
}
const PERMITS: Readonly<Record<string, boolean>> = { deny: false, ask: true, auto: true }

type Value = Readonly<{ pick: string | null; allowedSet: readonly string[] | null }>

function world() {
  const definition = definitionOf()
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
    ],
  }
  const calls: string[] = []
  const flags = {
    catalog: 'ok' as 'ok' | 'unavailable' | 'partial' | 'duplicate' | 'not-held',
    organizationBound: null as readonly string[] | null,
    organizationPick: null as string | null,
    organizationReadable: true,
    lose: false,
    tenantActions: ['set', 'clear'] as SettingsGrant['actions'],
    reject: null as SettingsFailure['reason'] | null,
    copyAsset: { category: 'tool', name: 'Shell' } as { category: string; name: string },
    between: null as (() => void) | null,
  }
  const roots = new Map<string, { digest: string; result: TenantSettingsWriteResult }>()
  const writes: SettingsChange[] = []
  const view = (): SettingsTargetView => ({
    target,
    enabled: true,
    sources: [
      {
        sourceId: 'organization',
        ownerRef: 'governance',
        scope: { kind: 'organization', subjectRef: 'org' },
        authorityRevision: '1',
      },
      {
        sourceId: 'tenant',
        ownerRef: 'governance',
        scope: { kind: 'tenant', subjectRef: 'tenant-a' },
        authorityRevision: '1',
      },
    ],
    definitionRef,
    definition,
    state,
    grants: [
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
      async admit({ principal, tenant }) {
        calls.push('principals.admit')
        return principal === LOGIN_A && tenant === tenantA ? 'allowed' : 'denied'
      },
    },
    catalog: {
      async read(tenant): Promise<SettingsBasis | SettingsFailure> {
        calls.push('catalog.read')
        if (tenant !== tenantA) return { kind: 'rejected', reason: 'forbidden' }
        if (flags.catalog === 'unavailable') return { kind: 'rejected', reason: 'unavailable' }
        const views =
          flags.catalog === 'not-held'
            ? []
            : flags.catalog === 'duplicate'
              ? [view(), { ...view(), target: { ...target, targetRef: 'tool.Shell.copy' } }]
              : [view()]
        return {
          scopeKey: 'tenant-a',
          revision: String(state.revision),
          views,
          completeness: flags.catalog === 'partial' ? 'partial' : 'complete',
          unavailableProviders: [],
        }
      },
      assetOf: candidate =>
        candidate.target.targetRef === 'tool.Shell.copy'
          ? flags.copyAsset
          : { category: 'tool', name: 'Shell' },
    },
    permissions,
    writer: {
      async write({ command, beforeWrite }) {
        calls.push('writer.write')
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
  return { face, calls, flags, writes, assign, own, state: () => state }
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
        assetOf: () => undefined,
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
})
