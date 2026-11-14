// @module-tag slow
import { describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import type { ModelInvocationRef } from '@omne-harness/model-contract'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import {
  absentReference,
  anotherPerson,
  heldAnswer,
  loginAccess,
  modelRuntime,
  newestMainCall,
  publicStream,
  textAnswer,
  type LoginAccess,
} from './public-stream-support.ts'

function services(tree: ReleaseTree) {
  const { references, observation } = publicStream(tree.scope)
  if (references === undefined || observation === undefined)
    throw new Error('the public Model stream is not installed')
  return { references, observation }
}

async function mainCall(tree: ReleaseTree, access: LoginAccess): Promise<ModelInvocationRef> {
  const session = await tree.startSession('say hello')
  const reference = await pollUntil(
    'the main call registration',
    () => newestMainCall(tree.scope, access, session),
    found => found !== null,
  )
  if (reference === null) throw new Error('unreachable')
  return reference
}

async function currentStream(
  tree: ReleaseTree,
  access: LoginAccess,
  reference: ModelInvocationRef,
) {
  const selection = await pollUntil(
    'a current stream',
    () => services(tree).references.current({ access, reference }),
    answer => 'ok' in answer && answer.ok.current !== null,
  )
  if (!('ok' in selection) || selection.ok.current === null) throw new Error('unreachable')
  return selection.ok.current
}

describe('the public Model stream on the release tree', () => {
  it('publishes modelStreamReferences and modelStreamObservation (defect: the host row opens no observation)', async () => {
    await onReleaseTree({ script: textAnswer('done') }, async tree => {
      const { references, observation } = publicStream(tree.scope)
      expect(references, 'modelStreamReferences').toBeDefined()
      expect(observation, 'modelStreamObservation').toBeDefined()
    })
  })

  it('C3: the logged-in person takes the current stream of the main call and gets a snapshot, then deltas', async () => {
    const gateway = heldAnswer('Hello', ' world')
    await onReleaseTree({ script: gateway.script }, async tree => {
      const access = await loginAccess(tree)
      const reference = await mainCall(tree, access)
      const current = await currentStream(tree, access, reference)
      const stop = new AbortController()
      const kinds: string[] = []
      let text = ''
      for await (const frame of services(tree).observation.observe({
        ref: current.ref,
        access,
        signal: stop.signal,
      })) {
        kinds.push(frame.kind)
        if (frame.kind === 'snapshot') gateway.release()
        if (frame.kind === 'delta') text = JSON.stringify(frame.value)
        if (text.includes('Hello world') || frame.kind === 'ended' || frame.kind === 'gap') break
      }
      stop.abort()
      expect(kinds[0]).toBe('snapshot')
      expect(kinds).toContain('delta')
      expect(text).toContain('Hello world')
    })
  })

  it('C2: another tenant gets for a real reference exactly what it gets for an absent one; no login principal is denied', async () => {
    const gateway = heldAnswer('Hello', ' world')
    await onReleaseTree({ script: gateway.script }, async tree => {
      const access = await loginAccess(tree)
      const reference = await mainCall(tree, access)
      await currentStream(tree, access, reference)
      const { references } = services(tree)
      const other = await loginAccess(tree, await anotherPerson(tree, 'frank'))
      expect(other.tenant).not.toEqual(access.tenant)
      const forReal = await references.current({ access: other, reference })
      const forAbsent = await references.current({
        access: other,
        reference: absentReference(other.tenant),
      })
      expect(forReal).toEqual(forAbsent)
      expect(forReal).toHaveProperty('failure')
      const issuer = tree.env.readTrusted(principalIssuerKey).get(principalIssuerKey) as
        | PrincipalIssuer
        | undefined
      if (issuer === undefined) throw new Error('no principal issuer')
      const system = issuer.issueSystem({ component: 'server-entry' })
      if ('failure' in system) throw new Error('no system principal')
      for (const principal of [{ ...access.principal }, system.ok])
        expect(
          await references.current({ access: { principal, tenant: access.tenant }, reference }),
        ).toEqual({ failure: { kind: 'denied', action: 'current' } })
      gateway.release()
    })
  })

  it('C5: an observation that stops midway leaves the Model call to settle as it would', async () => {
    const gateway = heldAnswer('Hello', ' world')
    await onReleaseTree({ script: gateway.script }, async tree => {
      const access = await loginAccess(tree)
      const reference = await mainCall(tree, access)
      const current = await currentStream(tree, access, reference)
      const stop = new AbortController()
      const kinds: string[] = []
      for await (const frame of services(tree).observation.observe({
        ref: current.ref,
        access,
        signal: stop.signal,
      })) {
        kinds.push(frame.kind)
        if (frame.kind === 'snapshot') stop.abort()
      }
      expect(kinds[0]).toBe('snapshot')
      gateway.release()
      const runtime = modelRuntime(tree.scope)
      const settled = await pollUntil(
        'the call to settle',
        () => runtime.calls.inspect({ ...access, reference }),
        answer =>
          'ok' in answer && answer.ok.kind === 'found' && answer.ok.state.phase === 'settled',
      )
      if (!('ok' in settled) || settled.ok.kind !== 'found' || settled.ok.state.phase !== 'settled')
        throw new Error('unreachable')
      expect(settled.ok.state.control).toEqual({ kind: 'none' })
      expect(settled.ok.state.settlement.termination).toMatchObject({ kind: 'completed' })
    })
  })
})
