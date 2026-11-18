// @module-tag slow
import { expect, it } from 'vitest'
import type { LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import type { AssetsLocal } from '@omne-harness/assets-local'
import type {
  BuiltinExtensions,
  EnabledExtensionsViews,
} from '@omne-harness/loop-extension-contract'
import type { GatewayScript } from '../../fixtures/model-gateway.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  type Entry,
  type ReleaseTree,
} from '../../support/release-tree.ts'
import {
  SHELL,
  faceOf,
  settledSession,
  shellScript,
} from '../../governance/tenant-settings-support.ts'
import { assetOf, runSwitch, tenantOf } from './support.ts'

const NAME = 'probe'
const DECLARATION: LoopExtensionDeclaration = {
  name: NAME,
  position: 'before_model_call',
  power: 'observe',
  implementation: { kind: 'builtin', builtinName: NAME },
}

/** What the model was given, without the conversation: the system prompt and the tool declarations. */
function prefixOf(body: string): string {
  const request = JSON.parse(body) as { messages?: { role: string }[]; tools?: unknown }
  return JSON.stringify([
    (request.messages ?? []).filter(message => message.role === 'system'),
    request.tools,
  ])
}

const service = <T>(tree: ReleaseTree, key: string): T => {
  const found = tree.scope.get(key) as T | undefined
  if (found === undefined) throw new Error(`${key} is not provided`)
  return found
}

it('a tenant extension runs from the next pass after it is enabled and not after it is disabled, a Run waits while the view cannot be read, and the model sees the same system prompt and tools throughout', async () => {
  const requests: string[] = []
  let onRequest: (() => Promise<void>) | undefined
  const script: GatewayScript = async input => {
    requests.push(input.body)
    if (!input.body.includes('"role":"tool"')) await onRequest?.()
    return shellScript(input)
  }
  const exit = await onReleaseTree({ script }, async tree => {
    const tenant = await tenantOf(tree)
    const { access } = tenant
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

    const version = await tenant.publish(DECLARATION)
    // The settings entry describes the run setting of the extension, and refuses to write it: the
    // writer plans only for the release tools. The stand-in below turns it on in its place.
    expect(await tenant.run(NAME, true)).toEqual({ kind: 'denied' })
    const stand = runSwitch(tree)
    const views = service<EnabledExtensionsViews<unknown>>(tree, 'loopExtensionViews')
    expect(await views.read(access)).toMatchObject({ kind: 'view', view: { members: [] } })
    await settledSession(tree, 'held, and run is off')
    expect(calls).toEqual([])

    // The setting changes while the model answers the first request: the next pass of this Run reads it.
    onRequest = async () => stand.set(NAME, true)
    await settledSession(tree, 'start: echo enable')
    expect(calls).toEqual(['before_model_call'])

    onRequest = async () => stand.set(NAME, false)
    await settledSession(tree, 'start: echo disable')
    expect(calls).toEqual(['before_model_call', 'before_model_call'])

    onRequest = undefined
    stand.set(NAME, true)
    expect(await views.read(access)).toMatchObject({
      kind: 'view',
      view: { members: [{ capability: NAME, version }] },
    })
    const basisOf = async () => {
      const read = await views.read(access)
      if (read.kind !== 'view') throw new Error(JSON.stringify(read))
      return read.view.basis.settings
    }
    const seen = await basisOf()
    const face = faceOf(tree)
    const item = { ...access, owner: SHELL, item: 'invoke' }
    const described = await face.describe(item)
    if (described.kind !== 'described') throw new Error(JSON.stringify(described))
    const written = await face.set({
      ...item,
      operation: 'deny-shell',
      expectedRevision: described.item.revision,
      value: { kind: 'permission', pick: 'deny' },
    })
    expect(written).toMatchObject({ kind: 'written' })
    expect(await basisOf()).not.toBe(seen)
    if (written.kind !== 'written') throw new Error(JSON.stringify(written))
    await face.clear({ ...item, operation: 'clear-shell', expectedRevision: written.revision })

    // The release has no entry to disable a holding: the tenant's own local assets do it.
    const assets = await service<{ open(tenantRef: string): Promise<AssetsLocal | undefined> }>(
      tree,
      'tenantAssets',
    ).open(tenant.tenantRef)
    const holding = await assets?.readHolding({
      holdingRef: assetOf(NAME),
      scopeRef: tenant.tenantRef,
    })
    if (assets === undefined || holding?.kind !== 'holding') throw new Error('no holding')
    const disabled = await assets.changeHolding({
      operationId: 'disable-probe',
      holdingRef: assetOf(NAME),
      scopeRef: tenant.tenantRef,
      expectedRevision: holding.holding.revision,
      change: { kind: 'setEnabled', enabled: false },
    })
    expect(disabled).toMatchObject({ kind: 'committed', changed: true })
    await settledSession(tree, 'the holding is disabled')
    expect(calls).toHaveLength(2)

    // The sources of the tenant go away: the view is unavailable, never empty, and a Run waits.
    stand.away(true)
    const waiting = await tree.startSession('the sources of the tenant are away')
    await new Promise(resolve => setTimeout(resolve, 2000))
    const ended = (entries: readonly Entry[]) =>
      entries.some(entry => entry.kind === 'run.terminal')
    expect(ended(await historyOf(tree, waiting))).toBe(false)
    stand.away(false)
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
