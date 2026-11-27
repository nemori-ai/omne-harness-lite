import type { LiveMedia, ModelFailure, ModelLiveCalls } from '@omne-harness/model-contract'
import type { ConformanceLive } from '@omne-harness/model-contract/conformance'
import { checkModelProviderConformance } from '@omne-harness/model-contract/conformance'
import {
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import { operationId } from '../src/conformance/conformance-kit.ts'
import { failures, type Subject } from './conformance-support.ts'

type Calls = ModelLiveCalls<ScriptedPrincipal>
type CommandAnswer = Awaited<ReturnType<Calls['command']>>

type Live = ConformanceLive<ScriptedPrincipal>

function withLivePart(subject: Subject, patch: (live: Live) => Live): Subject {
  const { live } = subject
  if (live === undefined) throw new Error('the scripted subject has no live part')
  return { ...subject, live: patch(live) }
}
/** The live part with its calls patched, knowing which calls the test has opened upstream. */
function withOpened(
  subject: Subject,
  patch: (live: Live, opened: ReadonlySet<string>) => Calls,
): Subject {
  return withLivePart(subject, live => {
    const opened = new Set<string>()
    return {
      ...live,
      async upstream(input) {
        if (input.step === 'open') opened.add(input.call)
        return live.upstream(input)
      },
      calls: patch(live, opened),
    }
  })
}
const withLive = (subject: Subject, patch: (calls: Calls) => Calls) =>
  withLivePart(subject, live => ({ ...live, calls: patch(live.calls) }))
const breaking = (patch: (calls: Calls) => Calls) => failures(subject => withLive(subject, patch))
const NO_MEDIA: LiveMedia = {
  write: () => 'dropped',
  frames: (async function* () {})(),
  release() {},
}
const LIVE = (name: string) => name.startsWith('live-')
const refusedFor = (answer: Outcome<unknown, ModelFailure>, reason: string) =>
  'failure' in answer && answer.failure.kind === 'invalid' && answer.failure.reason === reason

/** The command answers of the double, with one kind of answer replaced. */
function commandsAnswering(replaced: (answer: CommandAnswer) => boolean, instead: CommandAnswer) {
  return (calls: Calls): Calls => ({
    ...calls,
    async command(input) {
      const answer = await calls.command(input)
      return replaced(answer) ? instead : answer
    },
  })
}

describe('the conformance suite on live calls', () => {
  it('passes the controlled live double on every live obligation', async () => {
    const report = await checkModelProviderConformance({
      subject: () => createScriptedConformanceSubject(),
      waitMs: 300,
    })
    const live = report.results.filter(result => LIVE(result.obligation))
    expect(live).toHaveLength(10)
    expect(live.filter(result => result.status !== 'pass')).toEqual([])
  })

  it('does not apply the live obligations to a subject without live calls', async () => {
    const report = await checkModelProviderConformance({
      subject: () => {
        const { live: _, ...rest } = createScriptedConformanceSubject()
        return rest
      },
      waitMs: 300,
    })
    const live = report.results.filter(result => LIVE(result.obligation))
    expect(new Set(live.map(result => result.status))).toEqual(new Set(['not-applicable']))
  })

  it('fails a double that takes a command before the session opened', async () => {
    const { failing } = await breaking(
      commandsAnswering(answer => refusedFor(answer, 'not-open'), succeed({ state: 'taken' })),
    )
    expect(failing).toEqual(['live-command-before-open-refused'])
  })

  it.each([
    ['another phase', { kind: 'invalid', field: 'phase', reason: 'closing' }],
    ['another field', { kind: 'invalid', field: 'call', reason: 'not-open' }],
  ] as const)(
    'fails a double that refuses a command before open with %s',
    async (_case, refusal) => {
      const { failing } = await breaking(
        commandsAnswering(answer => refusedFor(answer, 'not-open'), fail(refusal)),
      )
      expect(failing).toEqual(['live-command-before-open-refused'])
    },
  )

  it('fails a double that answers a first command as seen', async () => {
    const taken = (answer: CommandAnswer) => 'ok' in answer && answer.ok.state === 'taken'
    const { failing } = await breaking(
      commandsAnswering(taken, succeed({ state: 'seen', outcome: 'pending' })),
    )
    expect(failing).toEqual(['live-command-taken-once'])
  })

  it('fails a double that takes a seen command again; the same rule holds while closing', async () => {
    const seen = (answer: CommandAnswer) => 'ok' in answer && answer.ok.state === 'seen'
    const { failing } = await breaking(commandsAnswering(seen, succeed({ state: 'taken' })))
    expect(failing).toEqual(['live-command-taken-once', 'live-end-durable-and-idempotent'])
  })

  it('fails a double that refuses a foreign modality as a phase', async () => {
    const { failing } = await breaking(
      commandsAnswering(
        answer => refusedFor(answer, 'modality'),
        fail({ kind: 'invalid', field: 'phase', reason: 'not-open' }),
      ),
    )
    expect(failing).toEqual(['live-command-outside-profile-refused'])
  })

  it.each([
    ['another reason', { kind: 'invalid', field: 'content', reason: 'type' }],
    ['another field', { kind: 'invalid', field: 'call', reason: 'modality' }],
  ] as const)('fails a double that refuses a foreign modality with %s', async (_case, refusal) => {
    const { failing } = await breaking(
      commandsAnswering(answer => refusedFor(answer, 'modality'), fail(refusal)),
    )
    expect(failing).toEqual(['live-command-outside-profile-refused'])
  })

  it('fails a double that judges the phase before the modality of a command', async () => {
    const { failing } = await failures(subject =>
      withOpened(subject, (live, opened) => ({
        ...live.calls,
        async command(input) {
          const answer = await live.calls.command(input)
          return refusedFor(answer, 'modality') && !opened.has(input.call)
            ? fail({ kind: 'invalid', field: 'phase', reason: 'not-open' })
            : answer
        },
      })),
    )
    expect(failing).toEqual(['live-command-outside-profile-refused'])
  })

  it('fails a double that answers a command after settle as seen', async () => {
    const { failing } = await breaking(
      commandsAnswering(
        answer => refusedFor(answer, 'settled'),
        succeed({ state: 'seen', outcome: 'pending' }),
      ),
    )
    expect(failing).toEqual(['live-command-after-settle-refused'])
  })

  it('fails a double that accepts an end before the session opened', async () => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async end(input) {
        const answer = await calls.end(input)
        return 'failure' in answer ? succeed({ kind: 'none' }) : answer
      },
    }))
    expect(failing).toEqual(['live-end-before-open-refused'])
  })

  it('fails a double whose repeated end answers its own operation', async () => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async end(input) {
        const answer = await calls.end(input)
        return 'ok' in answer && answer.ok.kind === 'requested'
          ? succeed({ ...answer.ok, operation: input.operation })
          : answer
      },
    }))
    expect(failing).toEqual(['live-end-durable-and-idempotent'])
  })

  it.each([
    ['as a cancel', { intent: 'cancel' }],
    ['under another operation', { operation: operationId('another-end') }],
  ] as const)('fails a double that records an end %s', async (_case, change) => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async end(input) {
        const answer = await calls.end(input)
        return 'ok' in answer && answer.ok.kind === 'requested'
          ? succeed({ ...answer.ok, ...change })
          : answer
      },
    }))
    expect(failing).toEqual(['live-end-durable-and-idempotent'])
  })

  it('fails a double that answers an end while open with no control', async () => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async end(input) {
        const answer = await calls.end(input)
        return 'ok' in answer && answer.ok.kind === 'requested' ? succeed({ kind: 'none' }) : answer
      },
    }))
    expect(failing).toEqual(['live-end-durable-and-idempotent'])
  })

  it('fails a double that records an end after settle', async () => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async end(input) {
        const answer = await calls.end(input)
        return 'ok' in answer && answer.ok.kind === 'none'
          ? succeed({
              kind: 'requested',
              intent: 'end',
              operation: input.operation,
              propagation: 'pending',
              upstream: 'unknown',
            })
          : answer
      },
    }))
    expect(failing).toEqual(['live-end-after-settle-idempotent'])
  })

  it('fails a double that sends media before the session opened', async () => {
    const { failing } = await failures(subject =>
      withOpened(subject, (live, opened) => ({
        ...live.calls,
        async media(input) {
          const answer = await live.calls.media(input)
          if (!('ok' in answer)) return answer
          const media = answer.ok
          return succeed({
            ...media,
            write: frame => {
              const written = media.write(frame)
              return written === 'dropped' && !opened.has(input.call) ? 'sent' : written
            },
          })
        },
      })),
    )
    expect(failing).toEqual(['live-media-by-phase-and-modality'])
  })

  it('fails a double that takes a foreign modality once the session is open', async () => {
    const { failing } = await failures(subject =>
      withOpened(subject, (live, opened) => ({
        ...live.calls,
        async command(input) {
          const answer = await live.calls.command(input)
          return refusedFor(answer, 'modality') && opened.has(input.call)
            ? succeed({ state: 'taken' })
            : answer
        },
      })),
    )
    expect(failing).toEqual(['live-command-outside-profile-refused'])
  })

  it('fails a double whose media are dropped while open, or sent while closing', async () => {
    const dropping = await breaking(calls => ({
      ...calls,
      async media(input) {
        const answer = await calls.media(input)
        if (!('ok' in answer)) return answer
        const media = answer.ok
        return succeed({
          ...media,
          write: frame => (media.write(frame) === 'sent' ? 'dropped' : media.write(frame)),
        })
      },
    }))
    expect(dropping.failing).toEqual(['live-media-by-phase-and-modality'])
    const ended = new Set<string>()
    const closing = await breaking(calls => ({
      ...calls,
      async end(input) {
        ended.add(input.call)
        return calls.end(input)
      },
      async media(input) {
        const answer = await calls.media(input)
        if (!('ok' in answer)) return answer
        const media = answer.ok
        return succeed({
          ...media,
          write: frame => {
            const written = media.write(frame)
            return written === 'dropped' && ended.has(input.call) ? 'sent' : written
          },
        })
      },
    }))
    expect(closing.failing).toEqual(['live-media-by-phase-and-modality'])
  })

  it('fails a double that tells another tenant the call is there', async () => {
    const { failing } = await failures(subject =>
      withLive(subject, calls => ({
        ...calls,
        async command(input) {
          return input.tenant === subject.otherTenant
            ? fail({ kind: 'denied', action: 'live-command' })
            : calls.command(input)
        },
      })),
    )
    expect(failing).toEqual(['live-call-of-another-tenant-unknown'])
  })

  it('fails a double that hands out the media of a call whose live body is elsewhere', async () => {
    const { failing } = await breaking(calls => ({
      ...calls,
      async media(input) {
        const answer = await calls.media(input)
        return 'failure' in answer && answer.failure.kind === 'unavailable'
          ? succeed(NO_MEDIA)
          : answer
      },
    }))
    expect(failing).toEqual(['live-lost-body-unavailable'])
  })

  it('fails a double that answers a lost body as settled', async () => {
    const { failing } = await breaking(
      commandsAnswering(
        answer => 'failure' in answer && answer.failure.kind === 'unavailable',
        fail({ kind: 'invalid', field: 'phase', reason: 'settled' }),
      ),
    )
    expect(failing).toEqual(['live-lost-body-unavailable'])
  })
})
