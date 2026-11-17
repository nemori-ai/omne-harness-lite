// @module-tag slow
import { expect, it } from 'vitest'
import { capabilityId, pinBody, type PackageReader } from '@omne-harness/assets'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  LOOP_EXTENSION_CATEGORY,
  RUN_SETTING,
  loopExtensionBodyContract,
  type BuiltinExtensions,
  type EnabledExtensionsViews,
} from '@omne-harness/loop-extension-contract'
import type { SettingsBasis } from '@omne-harness/settings'
import { digestBytes } from '@omne-harness/assets'
import { savedTenant } from '../../r9/support.ts'
import { loginAccess } from '../../model/public-stream-support.ts'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  type Entry,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import { settledSession, shellScript } from '../../governance/tenant-settings-support.ts'
import {
  tenantHoldingsHolder,
  type TenantHoldings,
} from '../../../src/rows/governance/tenant-holdings.ts'

const NAME = 'probe'
const ASSET = `tenant/${LOOP_EXTENSION_CATEGORY}/${NAME}`
const HOLDING = `${LOOP_EXTENSION_CATEGORY}.${NAME}`
const DECLARATION: LoopExtensionDeclaration = {
  name: NAME,
  position: 'before_model_call',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: NAME },
}

function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)] as const),
  )
  return {
    async manifest() {
      const entries = [...bytes].map(([path, value]) => ({
        path,
        bytes: value.length,
        digest: digestBytes(value),
      }))
      return { ok: { entries } }
    },
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? { failure: 'entry-not-found' } : { ok: found }
    },
  }
}

/** What the model was given, without the conversation: the system prompt and the tool declarations. */
function prefixOf(body: string): string {
  const request = JSON.parse(body) as { messages?: { role: string }[]; tools?: unknown }
  return JSON.stringify([
    (request.messages ?? []).filter(message => message.role === 'system'),
    request.tools,
  ])
}

async function publishAndHold(holdings: TenantHoldings, tenantRef: string): Promise<void> {
  const inspected = await loopExtensionBodyContract().layout!.inspect(
    packageOf({ 'extension.json': JSON.stringify(DECLARATION) }),
  )
  if (!('ok' in inspected)) throw new Error(JSON.stringify(inspected))
  const capability = capabilityId(LOOP_EXTENSION_CATEGORY, NAME)
  if (!capability.ok) throw new Error('not a capability identity')
  const published = await holdings.assets.publish({
    operationId: 'publish-probe',
    assetRef: ASSET,
    expectedRevision: 0,
    pinned: pinBody({
      identity: capability.id,
      version: 'v1',
      source: 'journey',
      body: inspected.ok,
    }),
  })
  if (published.kind !== 'committed') throw new Error(JSON.stringify(published))
  const held = await holdings.assets.hold({
    operationId: 'hold-probe',
    holdingRef: HOLDING,
    scopeRef: tenantRef,
    assetRef: ASSET,
    selection: { kind: 'follow' },
    sources: [
      {
        sourceId: 'tenant',
        ownerRef: tenantRef,
        scope: { kind: 'tenant', subjectRef: tenantRef },
      },
    ],
    grants: [],
  })
  if (held.kind !== 'committed') throw new Error(JSON.stringify(held))
}

/**
 * The release has no way yet for a tenant to write a plain setting of an asset that is not a tool.
 * This stands in for that one write: it answers the real settings with `run` set, and gives the
 * signal a settings writer gives after its commit. The assets under it stay the real ones.
 */
function runSwitch(real: TenantHoldings) {
  let on = false
  const listeners = new Set<() => void>()
  const settings: TenantHoldings['settings'] = {
    writer: real.settings.writer,
    async read(request) {
      const basis = await real.settings.read(request)
      if (!on || 'kind' in basis) return basis
      const views = basis.views.map(view =>
        view.target.targetRef !== HOLDING
          ? view
          : {
              ...view,
              state: {
                ...view.state,
                sources: [
                  {
                    id: 'tenant',
                    values: [
                      {
                        itemId: RUN_SETTING,
                        value: { kind: 'value' as const, value: true },
                        locked: false,
                      },
                    ],
                  },
                ],
              },
            },
      )
      return { ...basis, views } satisfies SettingsBasis
    },
    changes: {
      subscribe(listener) {
        const leave = real.settings.changes.subscribe(listener)
        const own = () =>
          listener({ domain: { policyId: 'asset', scopeRef: '', targetRef: HOLDING }, revision: 0 })
        listeners.add(own)
        return () => {
          leave()
          listeners.delete(own)
        }
      },
    },
  }
  return {
    holdings: { assets: real.assets, settings } satisfies TenantHoldings,
    set(value: boolean) {
      on = value
      for (const listener of listeners) listener()
    },
  }
}

const service = <T>(tree: ReleaseTree, key: string): T => {
  const found = tree.scope.get(key) as T | undefined
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

it('a tenant extension runs from the next pass after it is enabled and not after it is disabled, a Run waits while the view cannot be read, and the model sees the same system prompt and tools throughout', async () => {
  const requests: string[] = []
  let onRequest: (() => void) | undefined
  const script: GatewayScript = input => {
    requests.push(input.body)
    if (!input.body.includes('"role":"tool"')) onRequest?.()
    return shellScript(input)
  }
  const exit = await onReleaseTree({ script }, async tree => {
    const tenantRef = savedTenant(tree.home)
    const holder = tenantHoldingsHolder(tree.scope)
    const calls: string[] = []
    const registered = service<BuiltinExtensions>(tree, 'loopExtensionBuiltins').register(
      NAME,
      async input => {
        calls.push(input.position)
        return { kind: 'output', value: { kind: 'observed' } }
      },
    )
    expect(registered).toHaveProperty('ok')

    await settledSession(tree, 'nothing is published yet')
    const baseline = prefixOf(requests[0]!)
    expect(calls).toEqual([])

    const real = await holder.of?.(tenantRef)
    if (real === undefined) throw new Error('the governance of the tenant is not open')
    await publishAndHold(real, tenantRef)
    const views = service<EnabledExtensionsViews<unknown>>(tree, 'loopExtensionViews')
    const access = await loginAccess(tree)
    expect(await views.read(access)).toMatchObject({ kind: 'view', view: { members: [] } })
    await settledSession(tree, 'held, and run is off')
    expect(calls).toEqual([])

    const stand = runSwitch(real)
    holder.of = async () => stand.holdings
    onRequest = () => stand.set(true)
    await settledSession(tree, 'start: echo enable')
    expect(calls).toEqual(['before_model_call'])

    onRequest = () => stand.set(false)
    await settledSession(tree, 'start: echo disable')
    expect(calls).toEqual(['before_model_call', 'before_model_call'])

    onRequest = undefined
    stand.set(true)
    expect(await views.read(access)).toMatchObject({
      kind: 'view',
      view: { members: [{ capability: NAME, version: 'v1' }] },
    })
    const disabled = await real.assets.changeHolding({
      operationId: 'disable-probe',
      holdingRef: HOLDING,
      scopeRef: tenantRef,
      expectedRevision: 1,
      change: { kind: 'setEnabled', enabled: false },
    })
    expect(disabled).toMatchObject({ kind: 'committed', changed: true })
    await settledSession(tree, 'the holding is disabled')
    expect(calls).toHaveLength(2)

    holder.of = async () => undefined
    const waiting = await tree.startSession('the sources of the tenant are away')
    await new Promise(resolve => setTimeout(resolve, 2000))
    const ended = (entries: readonly Entry[]) =>
      entries.some(entry => entry.kind === 'run.terminal')
    expect(ended(await historyOf(tree, waiting))).toBe(false)
    holder.of = async () => stand.holdings
    await pollUntil(
      'the Run to end once the view can be read',
      () => historyOf(tree, waiting),
      ended,
    )

    const prefixes = new Set(requests.map(prefixOf))
    expect(requests.length).toBeGreaterThanOrEqual(8)
    expect([...prefixes]).toEqual([baseline])
  })
  expect(exit).toBe(0)
})
