// C2 续入 and the tail of 开 Run (SPEC C2, contract PM-02 item 3, PA-06 item 3, PA-09, PA-03): an
// input that waits for the active Run without a hand-over (SE35) is submitted to the Agent with the
// identity derived from the execution and the input and the source of its routed entry, then
// recorded with receive(input-handover). Its pending eligibility ends when the Agent takes it, not
// here; once handed in, a conditional finish of the Run is no longer blocked by it (PA-02).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  deriveDriveOperation,
  judgeCompletion,
  type AgentDrivePort,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  inputId,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { interceptReads, turn } from './fixtures/control-fixture.ts'
import { memoryBackend } from './fixtures/backends.ts'
import { sqlBackend } from './fixtures/sql.ts'
import { harness, TENANT_A, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, advance: true, ...options })
  open.push(h)
  return h
}

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

type Submitted = Parameters<AgentDrivePort['submit']>[0]

/** Records every submit; `answer` may replace the double's answer, `original` sends it on. */
function recordSubmits(
  h: Harness,
  answer?: (
    input: Submitted,
    original: AgentDrivePort['submit'],
  ) => ReturnType<AgentDrivePort['submit']>,
): Submitted[] {
  const submitted: Submitted[] = []
  const original = h.drive.submit.bind(h.drive)
  h.drive.submit = input => {
    submitted.push(input)
    return answer === undefined ? original(input) : answer(input, original)
  }
  return submitted
}

/** Accepts an input through the public port, so no local wake-up of this instance follows. */
async function acceptDirectly(h: Harness, input: string): Promise<void> {
  succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'accept',
        input: {
          ...h.access(),
          operation: operationId(`accept-${input}`),
          value: ordinaryInput(input),
        },
      },
      guards: [],
    }),
    `accept ${input} directly`,
  )
}

/** A commit notice of another process that names an accepted input. */
async function notice(h: Harness): Promise<void> {
  const snapshot = await read(h)
  h.instance.committed({
    tenant: TENANT_A,
    session: h.access().session,
    revision: snapshot.revision,
    source: snapshot.source,
    kinds: ['intake.routed'],
  })
}

/** Opens the Run with `input-1` and waits until its hand-over is recorded. */
async function running(h: Harness): Promise<string> {
  await h.create()
  await h.accept('input-1')
  await vi.waitFor(async () => {
    expect((await read(h)).handed).toEqual(['input-1'])
  })
  const snapshot = await read(h)
  if (snapshot.run.kind !== 'active') throw new Error('the Run is not active')
  return snapshot.run.execution.execution
}

describe('C2 续入: an input accepted while the Run is active is handed in', () => {
  it.each([memoryBackend, sqlBackend])(
    '$name: it is submitted with the derived identity and its routed source, recorded as handed, and stays pending until taken',
    async backend => {
      const h = await service({ backend })
      const execution = await running(h)
      const submitted = recordSubmits(h)
      await h.accept('input-2')
      await vi.waitFor(async () => {
        expect((await read(h)).handed).toEqual(['input-1', 'input-2'])
      })
      const snapshot = await read(h)
      const routed = snapshot.historyIndex?.inputs.find(item => item.input === 'input-2')?.source
      expect(routed).toBeDefined()
      expect(submitted).toHaveLength(1)
      expect(submitted[0]).toMatchObject({
        session: h.access().session,
        execution,
        operation: deriveDriveOperation({ kind: 'submit', execution, input: inputId('input-2') }),
        input: 'input-2',
        source: routed,
      })
      expect(snapshot.pending).toContain('input-2')
      expect(judgeCompletion(snapshot, execution)).toEqual({ kind: 'allowed' })
      expect(h.diagnostics()).toEqual([])
    },
  )

  it('opening a Run hands in the inputs already waiting after the first, in arrival order', async () => {
    const h = await service()
    await h.create()
    await acceptDirectly(h, 'input-1')
    await acceptDirectly(h, 'input-2')
    await acceptDirectly(h, 'input-3')
    const submitted = recordSubmits(h)
    await notice(h)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1', 'input-2', 'input-3'])
    })
    expect(submitted.map(item => item.input)).toEqual(['input-2', 'input-3'])
  })

  it('when the hand-over of the first input cannot be recorded, opening the Run still hands in the waiting inputs', async () => {
    const h = await service()
    await h.create()
    h.view.onCommit(async (input, next) => {
      const command = input.command
      if (
        command.kind === 'receive' &&
        command.input.fact.kind === 'input-handover' &&
        command.input.fact.input === 'input-1'
      )
        return fail({ kind: 'unavailable', owner: 'evidence', diagnostic: 'no producer source' })
      return next()
    })
    await acceptDirectly(h, 'input-1')
    await acceptDirectly(h, 'input-2')
    await acceptDirectly(h, 'input-3')
    const submitted = recordSubmits(h)
    await notice(h)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-2', 'input-3'])
    })
    expect(submitted.map(item => item.input)).toEqual(['input-2', 'input-3'])
    expect(h.diagnostics()).toContainEqual(
      expect.objectContaining({ step: 'receive', reason: 'unavailable' }),
    )
  })

  it('a waiting input left from before a restart is handed in when the startup scan finds the session', async () => {
    const h = await service()
    await running(h)
    await acceptDirectly(h, 'input-2')
    await turn()
    expect((await read(h)).handed).toEqual(['input-1'])
    const handle = succeeded(await h.instance.maintain(TENANT_A), 'maintain')
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1', 'input-2'])
    })
    await handle.release()
  })
})

describe('C2 续入: the failure branches of submit', () => {
  it('a submit refused by the message admission records a rejected hand-over; the input leaves pending and the next one is still handed in (PA-09)', async () => {
    const h = await service()
    await running(h)
    const submitted = recordSubmits(h, (input, original) =>
      input.input === 'input-2'
        ? Promise.resolve(
            fail({ kind: 'invalid' as const, reason: 'refused', rejection: evidence('agent/no') }),
          )
        : original(input),
    )
    await acceptDirectly(h, 'input-2')
    await acceptDirectly(h, 'input-3')
    await notice(h)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1', 'input-3'])
    })
    const snapshot = await read(h)
    expect(snapshot.pending).not.toContain('input-2')
    expect(snapshot.run.kind).toBe('active')
    expect(submitted.map(item => item.input)).toEqual(['input-2', 'input-3'])
  })

  it('a submit answered terminal is not retried and records nothing; it and the later inputs stay pending (PA-03)', async () => {
    const h = await service({ policy: { advance: { retryDelaysMs: [1000] } } })
    await running(h)
    const submitted = recordSubmits(h, () => Promise.resolve(fail({ kind: 'terminal' as const })))
    await acceptDirectly(h, 'input-2')
    await acceptDirectly(h, 'input-3')
    await notice(h)
    await vi.waitFor(() => {
      expect(submitted).toHaveLength(1)
    })
    h.clock.controls.advance(1000)
    await turn()
    expect(submitted.map(item => item.input)).toEqual(['input-2'])
    const snapshot = await read(h)
    expect(snapshot.pending).toEqual(['input-1', 'input-2', 'input-3'])
    expect(snapshot.handed).toEqual(['input-1'])
    expect(h.diagnostics()).toEqual([])
  })

  it('busy is retried with the same identity after the delay; when the delays run out submit records retries-exhausted and the next trigger sends the same identity', async () => {
    const h = await service({ policy: { advance: { retryDelaysMs: [1000] } } })
    await running(h)
    let busy = 2
    const submitted = recordSubmits(h, (input, original) => {
      if (busy === 0) return original(input)
      busy -= 1
      return Promise.resolve(fail({ kind: 'busy' as const }))
    })
    await h.accept('input-2')
    await vi.waitFor(() => {
      expect(submitted).toHaveLength(1)
    })
    h.clock.controls.advance(1000)
    await vi.waitFor(() => {
      expect(h.diagnostics()).toContainEqual(
        expect.objectContaining({ owner: 'C2', step: 'submit', reason: 'retries-exhausted' }),
      )
    })
    expect(submitted).toHaveLength(2)
    expect((await read(h)).handed).toEqual(['input-1'])
    await notice(h)
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1', 'input-2'])
    })
    expect(new Set(submitted.map(item => item.operation)).size).toBe(1)
  })

  it('an unknown outcome that the Agent already knows is sent again at once with the same identity', async () => {
    const h = await service({ policy: { advance: { retryDelaysMs: [30000] } } })
    await running(h)
    let lost = true
    const submitted = recordSubmits(h, async (input, original) => {
      const answer = await original(input)
      if (!lost) return answer
      lost = false
      return fail({ kind: 'commit-unknown' as const, operation: input.operation })
    })
    await h.accept('input-2')
    await vi.waitFor(async () => {
      expect((await read(h)).handed).toEqual(['input-1', 'input-2'])
    })
    expect(submitted).toHaveLength(2)
    expect(submitted[1]?.operation).toBe(submitted[0]?.operation)
  })

  it('without the Agent drive port nothing is submitted and agent-absent is recorded', async () => {
    const h = await service()
    await running(h)
    const submitted = recordSubmits(h)
    h.setDrive(false)
    await h.accept('input-2')
    await vi.waitFor(() => {
      expect(h.diagnostics()).toContainEqual(
        expect.objectContaining({ step: 'submit', reason: 'agent-absent' }),
      )
    })
    expect(submitted).toEqual([])
  })

  it('a snapshot without the routed entry of the input sends nothing and records source-unavailable', async () => {
    const h = await service()
    await running(h)
    const submitted = recordSubmits(h)
    interceptReads(h, async input => {
      const snapshot = await h.backend.transactions.readWork(input)
      if ('failure' in snapshot) return snapshot
      const { historyIndex: _index, ...rest } = snapshot.ok
      return succeed(rest)
    })
    await h.accept('input-2')
    await vi.waitFor(() => {
      expect(h.diagnostics()).toContainEqual(
        expect.objectContaining({ step: 'submit', reason: 'source-unavailable' }),
      )
    })
    expect(submitted).toEqual([])
  })
})

describe('an answer of the Agent that this instance read is not asked for again', () => {
  /** No hand-over can be recorded, as with an evidence source that does not answer. */
  function unrecorded(h: Harness): void {
    const bridge = h.evidence as { prepare: Harness['evidence']['prepare'] }
    const prepare = bridge.prepare
    bridge.prepare = async (command, access) =>
      command.kind === 'receive'
        ? fail({ kind: 'unavailable', owner: 'evidence', diagnostic: 'no source' })
        : prepare(command, access)
  }

  it('without a recorded hand-over and with the inputs still pending, the Run is invoked once and each waiting input is submitted once', async () => {
    const h = await service()
    await h.create()
    unrecorded(h)
    const invoked: string[] = []
    h.drive.invoke = async input => {
      invoked.push(input.operation)
      return succeed({ revision: 'revision-1', evidence: evidence('accepted') })
    }
    const submitted = recordSubmits(h, async () =>
      succeed({ revision: 'revision-2', evidence: evidence('submitted') }),
    )

    await h.accept('input-1')
    await vi.waitFor(() => expect(invoked).toHaveLength(1))
    // Each later input is a new trigger of S1, which reads the same pending inputs again.
    await h.accept('input-2')
    await vi.waitFor(() => expect(submitted.map(item => item.input)).toContain('input-2'))
    await h.accept('input-3')
    await vi.waitFor(() => expect(submitted.map(item => item.input)).toContain('input-3'))
    await notice(h)
    await new Promise(resolve => setImmediate(resolve))

    expect(invoked).toHaveLength(1)
    expect(submitted.map(item => item.input)).toEqual(['input-2', 'input-3'])
    const snapshot = await read(h)
    expect(snapshot.handed).toEqual([])
    expect(snapshot.pending).toEqual(['input-1', 'input-2', 'input-3'])
  })
})
