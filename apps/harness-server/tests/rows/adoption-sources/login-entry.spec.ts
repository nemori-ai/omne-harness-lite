// The login confirmation of `startRun` that the `adoption-sources` row prepares (assembly page
// 「桥接责任」, the login gate; session-adapters SPEC AD-10). The confirmation comes only from the
// first input's origin as the Session log holds it; a read that fails stays a failure.
import { fail, succeed } from '@omne-harness/operation-result'
import { deriveSessionOperation } from '@omne-harness/session-contract'
import type {
  AdoptionEvidenceCommand,
  DurableEvidence,
  InputId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { describe, expect, test } from 'vitest'
import {
  LOGIN_ENTRY_OWNER,
  LOGIN_SOURCE_OWNER,
  loginConfirmationOf,
  type SessionWorkReads,
} from '../../../src/rows/adoption-sources/login-entry.ts'
import {
  access,
  candidateOf,
  factsOf,
  mappingConfig,
  entryConfig,
  withLiveTree,
} from '../adoptions/support.ts'

type StartRun = Extract<AdoptionEvidenceCommand, { kind: 'startRun' }>

const FIRST = 'input-first' as InputId
const LATER = 'input-later' as InputId

/** The operation identity of a start formed for `first` (session-contract OP-00), as C2 forms it. */
const operationFor = (first: InputId, predecessor: string | null = null) =>
  deriveSessionOperation({
    kind: 'startRun',
    session: access.session,
    first,
    predecessor: predecessor as never,
  })

const startOf = (
  entry: 'interactive' | 'dispatch',
  session = access.session,
  first: InputId = FIRST,
  predecessor: string | null = null,
): StartRun => ({
  kind: 'startRun',
  input: {
    tenant: access.tenant,
    session,
    operation: operationFor(first, predecessor),
    entry,
    candidate: candidateOf('alpha'),
    instance: { owner: 'agent', id: 'instance-1' },
  },
})

const loginOrigin: DurableEvidence = {
  owner: 'login-entry',
  record: 'login-state-text',
  revision: '1',
  digest: 'sha256:login',
}

/**
 * The fields `judgeRunStart` reads, as a dormant session with two pending inputs. The rest of the
 * snapshot is not read by the source, so it is left out of this stand-in.
 */
function snapshotOf(patch: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    lifecycle: 'dormant',
    frozen: null,
    run: { kind: 'none' },
    pending: [FIRST, LATER],
    ...patch,
  } as unknown as WorkSnapshot
}

/** Reads over one snapshot and one origin per input, recording what was asked. */
function readsOf(
  options: Readonly<{
    snapshot?: WorkSnapshot
    origins?: Readonly<Record<string, DurableEvidence>>
    work?: Awaited<ReturnType<SessionWorkReads<unknown>['readWork']>>
    input?: Awaited<ReturnType<SessionWorkReads<unknown>['readInput']>>
  }> = {},
) {
  const asked: string[] = []
  const reads: SessionWorkReads<unknown> = {
    readWork: () => {
      asked.push('readWork')
      return Promise.resolve(options.work ?? succeed(options.snapshot ?? snapshotOf()))
    },
    readInput: request => {
      asked.push(`readInput:${request.input}`)
      if (options.input !== undefined) return Promise.resolve(options.input)
      const origin = options.origins?.[request.input] ?? loginOrigin
      return Promise.resolve(
        succeed({
          kind: 'ordinary' as const,
          input: request.input,
          message: {} as never,
          origin,
        }),
      )
    },
  }
  return { reads, asked }
}

describe('the confirmation comes from the first input that the decision will take', () => {
  test('an interactive start whose first input came through a login gets the confirmation', async () => {
    const { reads, asked } = readsOf({ origins: { [LATER]: { ...loginOrigin, owner: 'other' } } })
    const answer = await loginConfirmationOf(reads, startOf('interactive'), access)
    if (!('ok' in answer) || answer.ok === null) throw new Error('expected a confirmation')
    expect(answer.ok.owner).toBe(LOGIN_ENTRY_OWNER)
    expect(answer.ok.participant).toBe('session-evidence')
    expect(factsOf(answer.ok)).toEqual({
      version: 1,
      session: access.session,
      input: FIRST,
      operation: operationFor(FIRST),
      origin: 'sha256:login',
    })
    // The login state text of the origin is not copied into the material.
    expect(JSON.stringify(answer.ok)).not.toContain('login-state-text')
    expect(asked).toEqual(['readWork', `readInput:${FIRST}`])
  })

  test('a first input whose origin is not the login entry gives no confirmation', async () => {
    // A later input that did come through a login does not stand in for the first one.
    const { reads } = readsOf({
      origins: { [FIRST]: { ...loginOrigin, owner: 'business-intake' }, [LATER]: loginOrigin },
    })
    expect(await loginConfirmationOf(reads, startOf('interactive'), access)).toEqual(succeed(null))
  })

  test('a start that the decision refuses before the gate reads no input and gets no confirmation', async () => {
    for (const snapshot of [
      snapshotOf({ pending: [] }),
      snapshotOf({ lifecycle: 'initializing' }),
      snapshotOf({ run: { kind: 'active' } as never }),
    ]) {
      const { reads, asked } = readsOf({ snapshot })
      expect(await loginConfirmationOf(reads, startOf('interactive'), access)).toEqual(
        succeed(null),
      )
      expect(asked).toEqual(['readWork'])
    }
  })

  test('a start formed for another first input than the one read gets no confirmation', async () => {
    // The first input changed after the start was formed: the log now holds LATER first. The
    // confirmation of the start for FIRST would vouch for an input the start did not name.
    const changed = readsOf({ snapshot: snapshotOf({ pending: [LATER] }) })
    expect(await loginConfirmationOf(changed.reads, startOf('interactive'), access)).toEqual(
      succeed(null),
    )
    expect(changed.asked).toEqual(['readWork'])
    // The same holds for the predecessor: a start formed before the last Run ended names none.
    const ended = snapshotOf({
      run: { kind: 'terminal', terminal: { run: 'run-earlier' } } as never,
    })
    expect(
      await loginConfirmationOf(readsOf({ snapshot: ended }).reads, startOf('interactive'), access),
    ).toEqual(succeed(null))
    const named = await loginConfirmationOf(
      readsOf({ snapshot: ended }).reads,
      startOf('interactive', access.session, FIRST, 'run-earlier'),
      access,
    )
    expect('ok' in named && named.ok?.owner).toBe(LOGIN_ENTRY_OWNER)
  })

  test('a dispatch start needs no gate and reads nothing', async () => {
    const { reads, asked } = readsOf()
    expect(await loginConfirmationOf(reads, startOf('dispatch'), access)).toEqual(succeed(null))
    expect(asked).toEqual([])
  })
})

describe('what the source cannot read stays a failure, never a missing confirmation', () => {
  test('without the Session read face the start is unavailable', async () => {
    const answer = await loginConfirmationOf(undefined, startOf('interactive'), access)
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: LOGIN_SOURCE_OWNER } })
  })

  test('without the access of the call the start is unavailable and nothing is read', async () => {
    const { reads, asked } = readsOf()
    const answer = await loginConfirmationOf(reads, startOf('interactive'), undefined)
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: LOGIN_SOURCE_OWNER } })
    expect(asked).toEqual([])
  })

  test('an access for another session is denied before any read', async () => {
    const { reads, asked } = readsOf()
    const answer = await loginConfirmationOf(
      reads,
      startOf('interactive', 'another-session' as never),
      access,
    )
    expect(answer).toEqual(fail({ kind: 'denied', action: 'startRun' }))
    expect(asked).toEqual([])
  })

  test('a refused or unavailable Session read is handed back as it is', async () => {
    const denied = fail({ kind: 'denied' as const, action: 'readWork' })
    const down = fail({ kind: 'unavailable' as const, owner: 'session', diagnostic: 'down' })
    expect(
      await loginConfirmationOf(readsOf({ work: denied }).reads, startOf('interactive'), access),
    ).toEqual(denied)
    expect(
      await loginConfirmationOf(readsOf({ input: down }).reads, startOf('interactive'), access),
    ).toEqual(down)
  })
})

describe('the row reads the Session face per call', () => {
  test('in a tree without Session the row stays up and an interactive start is unavailable', async () => {
    const config = mappingConfig(entryConfig('alpha'))
    const { value } = await withLiveTree(config, async ({ source }) => ({
      interactive: await source.prepare(startOf('interactive'), access),
      dispatch: await source.prepare(startOf('dispatch'), access),
    }))
    expect(value.interactive).toMatchObject({
      failure: { kind: 'unavailable', owner: LOGIN_SOURCE_OWNER },
    })
    // The mapping material alone, as before: a dispatch start does not ask for the gate.
    if (!('ok' in value.dispatch)) throw new Error('expected material')
    expect(value.dispatch.ok.map(guard => guard.owner)).toEqual(['definition-mapping'])
  })
})
