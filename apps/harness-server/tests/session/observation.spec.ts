// @module-tag slow
// Session observation on the release tree (#1248, RFC-0015 §8). Slow: each case starts the release
// tree in this process and runs the `omne` CLI as child processes; the Model supplier is the local
// gateway of the release-tree scenarios. The interval of the refresh policy is a minute here, so a
// state frame that comes within the case came from a commit notice, not from the interval.
import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeProviderName,
  type FixedModelRequest,
} from '@omne-harness/model-contract'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import type { SessionObservationFrame } from '@omne-harness/session-observation'
import {
  sessionObservationKey,
  type SessionObservationService,
} from '@omne-harness/session-observation/cordis'
import { onReleaseTree, pollUntil, type ReleaseTree } from '../support/release-tree.ts'
import {
  anotherPerson,
  heldAnswer,
  loginAccess,
  modelRuntime,
  type LoginAccess,
} from '../model/public-stream-support.ts'

const must = <T>(outcome: { ok: T } | { failure: unknown }): T => {
  if ('failure' in outcome) throw new Error(JSON.stringify(outcome.failure))
  return outcome.ok
}

const MINUTE = { interval: 60_000 }

function observation(tree: ReleaseTree): SessionObservationService<unknown> {
  const service = tree.scope.get(sessionObservationKey) as
    | SessionObservationService<unknown>
    | undefined
  if (service === undefined) throw new Error('sessionObservation is not on the tree')
  return service
}

/** The assistant messages of `session`, read as `access` through the reader history face. */
async function assistantMessages(
  tree: ReleaseTree,
  access: LoginAccess,
  session: string,
): Promise<string[]> {
  const service = tree.scope.intercept(sessionKey, { caller: 'reader' }).get(sessionKey) as
    | SessionService
    | undefined
  if (service === undefined) throw new Error('no Session service')
  const page = await service.history.begin({
    ...access,
    session: session as SessionId,
    kinds: ['message.assistant'],
    from: null,
    direction: 'forward',
    pageBytes: 65_536,
  })
  if (!('ok' in page)) throw new Error(JSON.stringify(page))
  return page.ok.entries.map(entry => writeJsonText(entry.payload))
}

function open(tree: ReleaseTree, access: LoginAccess, session: string, signal: AbortSignal) {
  return observation(tree).open({
    access: { ...access, session: session as SessionId },
    signal,
  })
}

describe('session observation on the release tree', () => {
  it('provides sessionObservation (defect: the row is not in the release)', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script }, async tree => {
      expect(typeof observation(tree).open).toBe('function')
    })
  })

  it('state frames follow the run: its number while it runs, a larger revision on each commit, null after it ends', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script, observationPolicy: MINUTE }, async tree => {
      const access = await loginAccess(tree)
      const session = await tree.startSession('say hello')
      await pollUntil(
        'the held answer',
        () => Promise.resolve(held.held()),
        n => n > 0,
      )
      const controller = new AbortController()
      const opened = await open(tree, access, session, controller.signal)
      if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
      const frames: SessionObservationFrame[] = []
      const first = await opened.frames.next()
      if (first.done === true) throw new Error('no first frame')
      frames.push(first.value)
      expect(first.value).toMatchObject({
        kind: 'state',
        target: { projection: 'model-output-v1' },
      })
      expect(first.value.kind === 'state' && first.value.run).toMatch(/^run_/u)
      held.release()
      for (;;) {
        const step = await opened.frames.next()
        if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
        frames.push(step.value)
        if (step.value.kind === 'state' && step.value.run === null) break
      }
      controller.abort()
      expect(await opened.frames.next()).toEqual({ done: true, value: undefined })
      const states = frames.filter(frame => frame.kind === 'state')
      const revisions = states.map(frame => Number(frame.revision))
      expect(revisions).toEqual([...revisions].sort((a, b) => a - b))
      expect(revisions.at(-1)).toBeGreaterThan(revisions[0] ?? 0)
    })
  })

  it('content frames: the snapshot of the running main call, then its deltas (C9b on the release tree)', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script, observationPolicy: MINUTE }, async tree => {
      const access = await loginAccess(tree)
      const session = await tree.startSession('say hello')
      await pollUntil(
        'the held answer',
        () => Promise.resolve(held.held()),
        n => n > 0,
      )
      const controller = new AbortController()
      const opened = await open(tree, access, session, controller.signal)
      if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
      const seen: SessionObservationFrame[] = []
      for (;;) {
        const step = await opened.frames.next()
        if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
        seen.push(step.value)
        if (step.value.kind === 'snapshot') break
      }
      held.release()
      for (;;) {
        const step = await opened.frames.next()
        if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
        seen.push(step.value)
        if (step.value.kind === 'state' && step.value.run === null) break
      }
      controller.abort()
      const kinds = seen.map(frame => frame.kind)
      expect(kinds[0]).toBe('state')
      expect(kinds.indexOf('snapshot')).toBeGreaterThan(0)
      expect(kinds).toContain('delta')
      const content = seen
        .filter(frame => frame.kind === 'snapshot' || frame.kind === 'delta')
        .map(frame => writeJsonText((frame as unknown as { value: never }).value))
        .join('')
      expect(content).toContain('one')
      expect(content).toContain(' two')
    })
  })

  it('an observation stopped midway leaves the Model call to settle and commit (C11b)', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script, observationPolicy: MINUTE }, async tree => {
      const access = await loginAccess(tree)
      const session = await tree.startSession('say hello')
      await pollUntil(
        'the held answer',
        () => Promise.resolve(held.held()),
        n => n > 0,
      )
      const controller = new AbortController()
      const opened = await open(tree, access, session, controller.signal)
      if (opened.kind !== 'opened') throw new Error(`open answered ${opened.kind}`)
      for (;;) {
        const step = await opened.frames.next()
        if (step.done === true || step.value.kind === 'snapshot') break
      }
      controller.abort()
      expect(await opened.frames.next()).toEqual({ done: true, value: undefined })
      held.release()
      const reader = await open(tree, access, session, new AbortController().signal)
      if (reader.kind !== 'opened') throw new Error(`open answered ${reader.kind}`)
      for (;;) {
        const step = await reader.frames.next()
        if (step.done === true) throw new Error(`ended: ${String(step.value)}`)
        if (step.value.kind === 'state' && step.value.run === null) break
      }
      await reader.frames.return(undefined)
      const terminal = await pollUntil(
        'the assistant message of the run',
        () => assistantMessages(tree, access, session),
        found => found.length > 0,
      )
      expect(terminal.join('')).toContain('one two')
    })
  })

  it('another tenant gets denied for a real session, the same as for an absent one', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script, observationPolicy: MINUTE }, async tree => {
      const session = await tree.startSession('say hello')
      const other = await loginAccess(tree, await anotherPerson(tree, 'frank'))
      const signal = new AbortController().signal
      const forReal = await open(tree, other, session, signal)
      const forAbsent = await open(tree, other, 'sess_absent', signal)
      expect(forReal).toEqual({ kind: 'denied' })
      expect(forAbsent).toEqual(forReal)
      held.release()
    })
  })

  it('the login principal an observation uses cannot admit a Model call (C18)', async () => {
    const held = heldAnswer('one', ' two')
    await onReleaseTree({ script: held.script, observationPolicy: MINUTE }, async tree => {
      const access = await loginAccess(tree)
      const adoption = { owner: 'o', name: 'observer-admit', revision: '1', digest: '0'.repeat(64) }
      const request: FixedModelRequest = {
        profile: adoption,
        suppliers: [
          {
            adoption,
            provider: must(decodeProviderName('test.invalid')),
            model: 'test',
            credential: { layer: 'official' },
          },
        ],
        fallback: false,
        retryPolicy: adoption,
        parameters: [],
        system: [],
        messages: [],
        tools: [],
        toolChoice: 'none',
        declarations: [
          {
            produces: 'test.invalid/test',
            accepts: ['test.invalid/test'],
            foreignThinking: 'omit',
          },
        ],
        representation: adoption,
        parameterAdoptions: [],
        source: adoption,
      }
      const admitted = await modelRuntime(tree.scope).calls.admit({
        ...access,
        call: must(decodeModelCallId('mcall_observer')),
        operation: must(decodeModelOperationId('mop_observer')),
        request,
        consumer: {
          owner: '@omne-harness/agent',
          work: 'w/step-1',
          position: 'I3',
          purpose: 'main',
        },
      })
      expect(admitted).toEqual({ failure: { kind: 'denied', action: 'admit' } })
      held.release()
    })
  })
})
