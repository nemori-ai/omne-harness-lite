// The answer primitives of the `./testing` entry, read as a provider author calls them: an answer is
// an untrusted value, a read without a handle names the handle it lacks, and the cross-tenant read
// finds an identifying value wherever the answer carries it.
import { AssertionError } from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import type { ToolFailure } from '@omne-harness/tool-contract'
import {
  completionOf,
  crossTenantAnswers,
  finalAnswer,
  isProgress,
  NotApplicable,
  type AnswerRow,
} from '@omne-harness/tool-contract/testing'

const ROW: AnswerRow = { clause: 'P06', progress: ['pending'], lostReply: ['commit-unknown'] }
const FINAL_ONLY: AnswerRow = { clause: 'P06', progress: [] }

describe('isProgress', () => {
  it('reads a value that is not an answer of the row as final, and never throws', () => {
    for (const answer of [
      null,
      undefined,
      'pending',
      7,
      {},
      { failure: null },
      { failure: 'commit-unknown' },
      { failure: {} },
      { failure: { kind: 7 } },
      { ok: null },
      { ok: 'pending' },
      { ok: { kind: 1 } },
      { kind: ['pending'] },
    ])
      expect(isProgress(answer, ROW), JSON.stringify(answer)).toBe(false)
  })

  it('reads a progress kind of a value or of an outcome, and a lost reply, as progress', () => {
    expect(isProgress({ kind: 'pending' }, ROW)).toBe(true)
    expect(isProgress({ ok: { kind: 'pending' } }, ROW)).toBe(true)
    expect(isProgress({ failure: { kind: 'commit-unknown' } }, ROW)).toBe(true)
  })

  it('reads a failure as final even when its kind is a progress kind of the row', () => {
    expect(isProgress({ failure: { kind: 'pending' } }, ROW)).toBe(false)
    expect(isProgress({ failure: { kind: 'commit-unknown' } }, FINAL_ONLY)).toBe(false)
  })
})

describe('finalAnswer', () => {
  it('fails, naming the answer, when a progress answer has no completion handle to drive it', async () => {
    const read = finalAnswer({
      ask: () => Promise.resolve({ ok: { kind: 'pending' } }),
      row: ROW,
      what: 'probe',
    })
    await expect(read).rejects.toBeInstanceOf(AssertionError)
    await expect(read).rejects.toThrow(/probe: .*pending.* no completion handle/u)
  })

  it('fails when the resend during progress goes back in the course of the operation', async () => {
    const ranked: AnswerRow = {
      clause: 'P07',
      progress: ['pending', 'accepted'],
      ranks: { accepted: 1 },
    }
    const answers = [{ kind: 'accepted' }, { kind: 'pending' }, { kind: 'stopped' }]
    const fixture = { settle: () => Promise.resolve() }
    const read = finalAnswer({
      ask: () => Promise.resolve(answers.shift()),
      row: ranked,
      completion: completionOf(fixture, 'settle'),
      what: 'probe',
    })
    await expect(read).rejects.toThrow(/probe: a resend during progress: the operation went back/u)
  })

  it('reports not applicable with the member name that the fixture lacks', async () => {
    const fixture: { settle?(): Promise<void> } = {}
    const read = finalAnswer({
      ask: () => Promise.resolve({ ok: { kind: 'pending' } }),
      row: ROW,
      completion: completionOf(fixture, 'settle'),
      what: 'probe',
    })
    await expect(read).rejects.toBeInstanceOf(NotApplicable)
    await expect(read).rejects.toMatchObject({ handle: 'settle' })
  })

  it('compares the answers during and after progress by the view, and returns the answer itself', async () => {
    // Answers that differ only in a part outside the view (a fresh capability).
    type Answer = Readonly<{ kind: string; evidence?: string; capability?: string }>
    const fixture = { settle: () => Promise.resolve() }
    const read = (
      row: AnswerRow,
      answers: readonly Answer[],
      view?: (answer: Answer | undefined) => unknown,
    ) => {
      const queue = [...answers]
      return finalAnswer({
        ask: () => Promise.resolve(queue.shift()),
        row,
        completion: completionOf(fixture, 'settle'),
        ...(view === undefined ? {} : { view }),
        what: 'probe',
      })
    }
    const withoutCapability = (answer: Answer | undefined) => ({
      kind: answer?.kind,
      evidence: answer?.evidence,
    })
    // A final answer during progress, and the final answer after the handle.
    const landed: readonly Answer[] = [
      { kind: 'pending' },
      { kind: 'prepared', evidence: 'e-1', capability: 'c-1' },
      { kind: 'prepared', evidence: 'e-1', capability: 'c-2' },
    ]
    await expect(read(ROW, landed)).rejects.toThrow(
      /probe: the answer that landed: an answer that was final/u,
    )
    await expect(read(ROW, landed, withoutCapability)).resolves.toEqual(landed[2])
    // A recalled progress answer, and the same progress during progress.
    const recalled: AnswerRow = {
      clause: 'P07',
      progress: ['pending', 'accepted'],
      ranks: { accepted: 1 },
      recalled: ['accepted'],
    }
    const accepted: readonly Answer[] = [
      { kind: 'accepted', evidence: 'e-1', capability: 'c-1' },
      { kind: 'accepted', evidence: 'e-1', capability: 'c-2' },
      { kind: 'stopped', evidence: 'e-2' },
    ]
    await expect(read(recalled, accepted)).rejects.toThrow(
      /probe: a resend during progress: the accepted answer changed its evidence/u,
    )
    await expect(read(recalled, accepted, withoutCapability)).resolves.toEqual(accepted[2])
  })
})

describe('completionOf', () => {
  it('names only a member of the fixture that is a completion handle', () => {
    const clock: { now(): string } = { now: () => 'now' }
    const fixture: { settle?(): Promise<void>; count(): number } = { count: () => 0 }
    // @ts-expect-error the fixture has no member of that name
    completionOf(clock, 'settle')
    // @ts-expect-error the member is no completion handle
    completionOf(fixture, 'count')
    expect(completionOf(fixture, 'settle')).toEqual({ name: 'settle', call: undefined })
  })

  it('calls the member on its fixture with the arguments it was given', async () => {
    const calls: unknown[] = []
    const fixture = {
      landed: 'no',
      complete(this: { landed: string }, start: string): Promise<void> {
        calls.push(start)
        this.landed = start
        return Promise.resolve()
      },
    }
    const completion = completionOf(fixture, 'complete', 'start-1')
    expect(completion.name).toBe('complete')
    await completion.call?.()
    expect(calls).toEqual(['start-1'])
    expect(fixture.landed).toBe('start-1')
  })
})

describe('crossTenantAnswers', () => {
  type Answer = Outcome<unknown, ToolFailure>
  const ask = (real: Answer, ghost: Answer = { ok: { kind: 'unknown' } }) => ({
    real: () => Promise.resolve(real),
    ghost: () => Promise.resolve(ghost),
  })
  /** The cross-tenant read of one answer about the real record. */
  const check = (
    real: Answer,
    identifying: readonly unknown[],
    submitted: readonly unknown[] = [],
  ): Promise<unknown> =>
    crossTenantAnswers({ ask: ask(real), row: FINAL_ONLY, identifying, submitted, what: 'probe' })
  const unknown = (extra: object): Answer => ({ ok: { kind: 'unknown', ...extra } })
  const TENANT = {
    name: 'TenantId',
    organization: { name: 'OrganizationId', text: 'org_conformance' },
    account: { name: 'AccountId', text: 'acc_conformance' },
  }
  const OTHER_TENANT = {
    name: 'TenantId',
    organization: { name: 'OrganizationId', text: 'org_conformance_other' },
    account: { name: 'AccountId', text: 'acc_conformance_other' },
  }

  it('fails when a text of the answer, at any depth, contains a long identifying value', async () => {
    const read = check(unknown({ notes: [{ diagnostic: 'seen as record-7 of another tenant' }] }), [
      'record-7',
    ])
    await expect(read).rejects.toBeInstanceOf(AssertionError)
    await expect(read).rejects.toThrow(/probe: the first answer: the answer carries "record-7"/u)
  })

  it('passes an answer that carries no identifying value, an empty one included', async () => {
    const answers = await crossTenantAnswers({
      ask: ask({ ok: { kind: 'unknown', diagnostic: 'no such record', note: '' } }),
      row: FINAL_ONLY,
      identifying: ['', 'record-7'],
      submitted: [],
      what: 'probe',
    })
    expect(answers.real).toEqual({
      ok: { kind: 'unknown', diagnostic: 'no such record', note: '' },
    })
    // An empty text that the other tenant sent hides nothing.
    await expect(
      check(unknown({ diagnostic: 'held as record-7' }), ['record-7'], ['']),
    ).rejects.toThrow(/carries "record-7"/u)
  })

  it('reads a kind that is not text as no kind, on both answers', async () => {
    await expect(
      crossTenantAnswers({
        ask: ask({ ok: { kind: 7 } }, { ok: {} }),
        row: FINAL_ONLY,
        identifying: [],
        submitted: [],
        what: 'probe',
      }),
    ).resolves.toMatchObject({ real: { ok: { kind: 7 } } })
  })

  it('reads an answer that refers to itself once, and still finds a value in it', async () => {
    const cyclic: { kind: string; self?: unknown; note?: string } = { kind: 'unknown' }
    cyclic.self = cyclic
    await expect(check({ ok: cyclic }, ['x7'])).resolves.toMatchObject({
      real: { ok: { kind: 'unknown' } },
    })
    cyclic.note = 'x7'
    await expect(check({ ok: cyclic }, ['x7'])).rejects.toBeInstanceOf(AssertionError)
  })

  it('finds a short identifying value only as a whole text', async () => {
    // A record named "1" is not told by an operation, a revision of another record or a digest.
    const ordinary = unknown({
      operation: 'ensure-1',
      evidence: { record: '2', revision: '17', digest: 'sha256:a1b1' },
      counts: [0, 1, 2],
    })
    await expect(check(ordinary, ['1'])).resolves.toBeDefined()
    await expect(check(unknown({ record: '1' }), ['1'])).rejects.toThrow(/carries "1"/u)
    // Seven characters are still short, eight are not.
    const told = unknown({ diagnostic: 'held as abcdefgh' })
    await expect(check(told, ['abcdefg'])).resolves.toBeDefined()
    await expect(check(told, ['abcdefgh'])).rejects.toThrow(/carries "abcdefgh"/u)
    // The value that the other tenant sent itself is an echo, even when it is the whole text.
    await expect(
      check(unknown({ revision: '1' }), ['1'], [{ revision: '1' }]),
    ).resolves.toBeDefined()
  })

  it('takes a text that the other tenant sent as an echo, and finds what lies outside it', async () => {
    const echo = unknown({ diagnostic: 'held by org_conformance_other' })
    await expect(check(echo, ['org_conformance'])).rejects.toThrow(/carries "org_conformance"/u)
    await expect(check(echo, ['org_conformance'], [OTHER_TENANT])).resolves.toBeDefined()
    // An identifying value anywhere inside an echo, not only at its start, tells nothing.
    const inside = unknown({ diagnostic: 'seen: x-registration/77' })
    await expect(check(inside, ['registration/77'], ['x-registration/77'])).resolves.toBeDefined()
    // An echo of a part of an identifying value does not hide the value around it.
    const sent = [{ owner: 'conformance', revision: '1' }]
    await expect(
      check(unknown({ diagnostic: 'held by acc_conformance' }), ['acc_conformance'], sent),
    ).rejects.toThrow(/carries "acc_conformance"/u)
    await expect(
      check(unknown({ digest: 'sha256:00112233' }), ['sha256:00112233'], sent),
    ).rejects.toThrow(/carries "sha256:00112233"/u)
  })

  /**
   * An error whose `name` is inherited from its prototype, not an own property, and whose stack
   * (which would repeat the name) is removed.
   */
  const namedError = (name: string): Error => {
    class Named extends Error {}
    Object.defineProperty(Named.prototype, 'name', { value: name })
    const error = new Named('held')
    delete error.stack
    return error
  }

  it('reads keys, symbol keys, maps, sets and errors, and not the positions of an array', async () => {
    const record = 'registration/7'
    for (const [form, extra] of [
      ['an object key', { seen: { [record]: true } }],
      ['a symbol key', { [Symbol(record)]: true }],
      ['a value under a symbol key', { [Symbol('x')]: record }],
      ['a map key', { seen: new Map([[record, true]]) }],
      ['a map value', { seen: new Map([['x', record]]) }],
      ['a set element', { seen: new Set([record]) }],
      ['an error message', { cause: new Error(`held as ${record}`) }],
      ['an error cause', { cause: new Error('held', { cause: record }) }],
      ['an inherited error name', { cause: namedError(record) }],
    ] as const)
      await expect(check(unknown(extra), [record]), form).rejects.toThrow(/carries/u)
    await expect(check(unknown({ list: ['a', 'b'] }), ['1'])).resolves.toBeDefined()
    await expect(check(unknown({ list: ['a', '1'] }), ['1'])).rejects.toThrow(/carries "1"/u)
    // A key that reads like a position is a text on an object that is no array.
    await expect(check(unknown({ seen: { 1: true } }), ['1'])).rejects.toThrow(/carries "1"/u)
  })

  it('finds a structured identifying value, unless the other tenant sent it', async () => {
    await expect(check(unknown({ owner: { ...TENANT } }), [TENANT])).rejects.toThrow(
      /carries \{"name":"TenantId"/u,
    )
    await expect(check(unknown({ owner: OTHER_TENANT }), [TENANT])).resolves.toBeDefined()
    await expect(
      check(unknown({ permit: { tenant: TENANT } }), [TENANT], [{ tenant: TENANT }]),
    ).resolves.toBeDefined()
  })
})
