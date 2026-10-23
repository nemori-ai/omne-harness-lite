// The accounts conformance suite against the in-memory ModelCommands, and against altered copies of
// it that each break one account rule, so every failure the suite reports is shown to be reachable.
import { describe, expect, it } from 'vitest'
import type { ModelCommands } from '@omne-harness/model-contract'
import {
  ACCOUNT_OBLIGATIONS,
  checkCommandsAccounts,
  createMemoryModelCommands,
  type AccountObligation,
  type CommandsAccountsSubject,
} from '@omne-harness/model/testing'
import { fixture, instance, proof } from './memory-fixture.ts'

type Principal = ReturnType<typeof fixture>['principal']

const OUTSIDER: Principal = Object.freeze({ subject: 'trusted' })

function subjectOf(
  alter: (commands: ModelCommands<Principal>) => ModelCommands<Principal> = commands => commands,
): () => CommandsAccountsSubject<Principal> {
  return () => {
    const f = fixture()
    const { commands } = createMemoryModelCommands(f.options)
    return {
      commands: alter(commands),
      admit: f.admit,
      instance: instance(),
      continuity: call => proof(call),
      lateSource: ({ call, dispatch }) => proof(`${call}/${dispatch}`, 'supplier'),
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
      ACCOUNT_OBLIGATIONS.map(obligation => ({ obligation, status: 'pass', detail: '' })),
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
    expect(report.results[0]?.detail).toContain('no store')
  })
})
