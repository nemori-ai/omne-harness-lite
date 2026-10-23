// The accounts conformance suite against the in-memory ModelCommands, and against altered copies of
// it that each break one account rule, so every failure the suite reports is shown to be reachable.
import { describe, expect, it } from 'vitest'
import {
  judgeFixedModelRequest,
  type CallAccountReport,
  type ModelCallId,
  type ModelCommands,
} from '@omne-harness/model-contract'
import {
  ACCOUNT_OBLIGATIONS,
  checkCommandsAccounts,
  createMemoryModelCommands,
  type AccountObligation,
  type CommandsAccountsSubject,
} from '@omne-harness/model/testing'
import { fixture, instance, proof, request } from './memory-fixture.ts'

type Principal = ReturnType<typeof fixture>['principal']

const OUTSIDER: Principal = Object.freeze({ subject: 'trusted' })

/** The request of every admission: two user messages, so kept message identities are visible. */
const REQUEST = (() => {
  const user = (id: string) => ({
    id: `msg_${id.padEnd(22, '0')}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: `b-${id}`, visibility: { toHuman: true, toModel: true }, text: 'hello' },
    ],
  })
  const judged = judgeFixedModelRequest({ ...request, messages: [user('u1'), user('u2')] })
  if (!('ok' in judged)) throw new Error(`fixture request: ${JSON.stringify(judged.failure)}`)
  return judged.ok
})()

function subjectOf(
  alter: (commands: ModelCommands<Principal>) => ModelCommands<Principal> = commands => commands,
): () => CommandsAccountsSubject<Principal> {
  return () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    return {
      commands: alter(commands),
      admit: { ...f.admit, request: REQUEST },
      instance: instance(),
      continuity: call => proof(call),
      lateSource: ({ call, dispatch }) => proof(`${call}/${dispatch}`, 'supplier'),
      completion: ({ call, result }) => proof(`${call}/${result}`, f.admit.consumer.owner),
      // A principal of the same tenant and the same claims that the authority did not mint.
      outsider: { principal: OUTSIDER, tenant: f.tenant },
    }
  }
}

function statusOf(
  results: readonly { obligation: AccountObligation; status: string }[],
  obligation: AccountObligation,
) {
  return results.find(result => result.obligation === obligation)?.status
}

describe('checkCommandsAccounts', () => {
  it('passes every account obligation against the in-memory ModelCommands', async () => {
    const report = await checkCommandsAccounts({ subject: subjectOf() })
    expect(report.results).toEqual(
      ACCOUNT_OBLIGATIONS.map(obligation => ({ obligation, status: 'pass' })),
    )
    expect(report.ok).toBe(true)
  })

  it('fails the receipt obligations when the reader sees every account as received', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => ({
        ...commands,
        async dispatches(input) {
          const read = await commands.dispatches(input)
          if ('failure' in read) return read
          return {
            ok: read.ok.map(record =>
              record.account === null
                ? record
                : { ...record, account: { ...record.account, receipt: 'received' } },
            ),
          }
        },
      })),
    })
    expect(report.ok).toBe(false)
    expect(statusOf(report.results, 'later-revision-replaces-and-is-late')).toBe('fail')
    expect(statusOf(report.results, 'account-completed-with-subject-and-receipt')).toBe('pass')
  })

  it('fails the event obligations when every delivery replaces the account', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => {
        const deliveries = new Map<string, number>()
        return {
          ...commands,
          // Gives each delivery a fresh event, as an implementation that does not deduplicate.
          async preserve(input) {
            return commands.preserve({
              ...input,
              facts: input.facts.map(fact => {
                if (fact.kind !== 'account') return fact
                const count = (deliveries.get(fact.event) ?? 0) + 1
                deliveries.set(fact.event, count)
                return {
                  ...fact,
                  event: `${fact.event}-${count}`,
                  value: { ...fact.value, revision: String(count) },
                }
              }),
            })
          },
        }
      }),
    })
    expect(statusOf(report.results, 'same-event-registered-once')).toBe('fail')
    expect(statusOf(report.results, 'same-event-other-report-refused')).toBe('fail')
  })

  it('fails the completion obligation when the reader gets the account without its subject', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => ({
        ...commands,
        // Keeps the report as the supplier sent it, as a provider that never completes it.
        async dispatches(input) {
          const read = await commands.dispatches(input)
          if ('failure' in read) return read
          return {
            ok: read.ok.map(record => {
              if (record.account === null) return record
              const { subject: _completed, ...account } = record.account
              return { ...record, account: account as typeof record.account }
            }),
          }
        },
      })),
    })
    expect(statusOf(report.results, 'account-completed-with-subject-and-receipt')).toBe('fail')
    expect(statusOf(report.results, 'unqualified-reader-refused')).toBe('pass')
  })

  it('fails the original-call obligation when dispatches shows the account of another call', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => {
        let accounted: ModelCallId | undefined
        return {
          ...commands,
          async preserve(input) {
            const kept = await commands.preserve(input)
            if ('ok' in kept && input.facts.some(fact => fact.kind === 'account'))
              accounted = input.call
            return kept
          },
          // Gives a call without an account the records of the call that has one, as a provider
          // that keys the accounts by tenant instead of by call.
          async dispatches(input) {
            const read = await commands.dispatches(input)
            if ('failure' in read || accounted === undefined || accounted === input.call)
              return read
            if (read.ok.some(record => record.account !== null)) return read
            return commands.dispatches({ ...input, call: accounted })
          },
        }
      }),
    })
    expect(statusOf(report.results, 'account-read-by-original-call')).toBe('fail')
    expect(statusOf(report.results, 'account-completed-with-subject-and-receipt')).toBe('pass')
  })

  it('fails the subject obligation when the commands drop the subject a report names', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => ({
        ...commands,
        // Removes the subject from the report and keeps the rest, as a provider that overwrites
        // the subject instead of refusing the report.
        preserve: input =>
          commands.preserve({
            ...input,
            facts: input.facts.map(fact => {
              if (fact.kind !== 'account') return fact
              const { subject: _named, ...value } = fact.value as CallAccountReport & {
                subject?: unknown
              }
              return { ...fact, value }
            }),
          }),
      })),
    })
    expect(statusOf(report.results, 'report-naming-subject-refused')).toBe('fail')
    expect(statusOf(report.results, 'account-completed-with-subject-and-receipt')).toBe('pass')
  })

  it('fails the reader obligation when dispatches ignores the qualification of the caller', async () => {
    const report = await checkCommandsAccounts({
      subject: () => {
        const subject = subjectOf()()
        const { commands } = subject
        return {
          ...subject,
          commands: {
            ...commands,
            dispatches: input =>
              commands.dispatches({ ...input, principal: subject.admit.principal }),
          },
        }
      },
    })
    expect(statusOf(report.results, 'unqualified-reader-refused')).toBe('fail')
  })

  it('fails the message obligation when the cleanup also drops the message identities', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => {
        const cleaned = new Set<string>()
        return {
          ...commands,
          async advanceCleanup(input) {
            const custody = await commands.advanceCleanup(input)
            if ('ok' in custody && custody.ok.kind === 'acknowledged') cleaned.add(input.call)
            return custody
          },
          // Releases the message identities with the request material, as a provider that keeps
          // them only while the request lives.
          async dispatches(input) {
            const read = await commands.dispatches(input)
            if ('failure' in read || !cleaned.has(input.call)) return read
            return { ok: read.ok.map(({ messages: _released, ...record }) => record) }
          },
        }
      }),
    })
    expect(statusOf(report.results, 'messages-outlive-cleanup')).toBe('fail')
    expect(statusOf(report.results, 'account-completed-with-subject-and-receipt')).toBe('pass')
  })

  it('fails the replay obligation when the commands fill in a replay format of their own', async () => {
    const report = await checkCommandsAccounts({
      subject: subjectOf(commands => ({
        ...commands,
        // Writes a format that the adapter never reported, so the reply settles.
        recordMaterialization: input =>
          commands.recordMaterialization({
            ...input,
            receipt: {
              ...input.receipt,
              replayFormat: input.receipt.replayFormat ?? 'invented-v1',
            },
          }),
      })),
    })
    expect(statusOf(report.results, 'state-reply-without-replay-format-refused')).toBe('fail')
    expect(statusOf(report.results, 'messages-outlive-cleanup')).toBe('pass')
  })

  it('reports a subject that throws as a failure of each obligation, without throwing', async () => {
    const report = await checkCommandsAccounts<Principal>({
      subject: () => {
        throw new Error('no store')
      },
    })
    expect(report.ok).toBe(false)
    expect(report.results.map(result => result.status)).toEqual(
      ACCOUNT_OBLIGATIONS.map(() => 'fail'),
    )
    const [first] = report.results
    expect(first?.status === 'fail' ? first.detail : '').toContain('no store')
  })
})
