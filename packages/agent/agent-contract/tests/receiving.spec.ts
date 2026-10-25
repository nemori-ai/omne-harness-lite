// The receiving ports of SPEC "生产者接收面" through the `./testing` entry: each double passes its own
// conformance suite, and a provider that breaks one named rule fails the case of that rule. The
// second part keeps the suites honest: a suite that passes a broken provider would prove nothing.
import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  decodeExecutionRevision,
  type AgentAccountOutlet,
  type AgentJournalEntries,
  type Authority,
} from '@omne-harness/agent-contract'
import {
  agentAccountOutletConformance,
  agentJournalEntriesConformance,
  memoryAgentAccountOutletFixture,
  memoryAgentJournalEntriesFixture,
  type ConformanceCase,
} from '@omne-harness/agent-contract/testing'

function mintTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(`org_${organization.repeat(26)}`)
  const acc = accountCodec.parse(`acc_${account.repeat(26)}`)
  if (!org.ok || !acc.ok) throw new Error('the fixture identity text is invalid')
  return tenant(org.value, acc.value)
}

const access = { principal: 'ada', tenant: mintTenant('0', '1') }
const otherAccess = { principal: 'bob', tenant: mintTenant('2', '3') }

function caseNamed(cases: readonly ConformanceCase[], fragment: string): ConformanceCase {
  const found = cases.find(entry => entry.name.includes(fragment))
  if (found === undefined) throw new Error(`no case named like ${fragment}`)
  return found
}

/** Runs every case of a suite and names the first case that fails. */
async function runAll(cases: readonly ConformanceCase[]): Promise<void> {
  expect(cases.length).toBeGreaterThan(0)
  for (const entry of cases) {
    await entry.run().catch((error: unknown) => {
      throw new Error(`case "${entry.name}" failed`, { cause: error })
    })
  }
}

describe('the doubles of the receiving ports', () => {
  it('the double of AgentJournalEntries passes every case of its suite', async () => {
    await runAll(
      agentJournalEntriesConformance(memoryAgentJournalEntriesFixture(access, otherAccess)),
    )
  })

  it('the double of AgentAccountOutlet passes every case of its suite', async () => {
    await runAll(
      agentAccountOutletConformance(memoryAgentAccountOutletFixture(access, otherAccess)),
    )
  })
})

describe('the entries suite fails a provider that breaks a rule', () => {
  /** The fixture of the double, with its port replaced by `wrap` of the double's port. */
  function brokenCases(
    wrap: (port: AgentJournalEntries<string>) => AgentJournalEntries<string>,
  ): readonly ConformanceCase[] {
    const fixture = memoryAgentJournalEntriesFixture(access, otherAccess)
    return agentJournalEntriesConformance({ ...fixture, entries: wrap(fixture.double) })
  }

  it('fails the stale-advance case when a superseded attachment can write', async () => {
    // The broken provider writes an entry of a stale attachment under the current attachment.
    const fixture = memoryAgentJournalEntriesFixture(access, otherAccess)
    const latest = new Map<string, Authority>()
    const cases = agentJournalEntriesConformance({
      ...fixture,
      supersede: async (who, execution) => {
        const authority = await fixture.supersede(who, execution)
        latest.set(execution, authority)
        return authority
      },
      entries: {
        record: input => {
          if (input.authority === null) return fixture.double.record(input)
          const current = latest.get(input.execution) ?? input.authority
          return fixture.double.record({ ...input, authority: current })
        },
      },
    })
    await expect(caseNamed(cases, 'stale-advance').run()).rejects.toThrow(/stale-advance/u)
  })

  it('fails the tenant case when another tenant gets an answer other than missing', async () => {
    const cases = brokenCases(port => ({
      record: async input =>
        input.tenant === otherAccess.tenant
          ? { failure: { kind: 'unavailable', owner: 'agentJournal', diagnostic: 'exists' } }
          : port.record(input),
    }))
    await expect(caseNamed(cases, 'another tenant').run()).rejects.toThrow(
      /should fail with denied/u,
    )
  })

  it('fails the key case when a repeated delivery is written again', async () => {
    // A provider without key recognition: every push of a delivery becomes a new write.
    const cases = brokenCases(port => {
      let writes = 0
      return {
        record: async input => {
          const answer = await port.record(input)
          if (input.authority !== null || !('ok' in answer)) return answer
          writes += 1
          const revision = decodeExecutionRevision(`${answer.ok.revision}.${writes}`)
          if (!('ok' in revision)) throw new Error('the test revision is invalid')
          return { ok: { ...answer.ok, operation: input.operation, revision: revision.ok } }
        },
      }
    })
    await expect(caseNamed(cases, 'by its key').run()).rejects.toThrow(
      /recall the original receipt/u,
    )
  })
})

describe('the outlet suite fails a provider that breaks a rule', () => {
  it('fails the tenant case when a call of another tenant is received', async () => {
    const fixture = memoryAgentAccountOutletFixture(access, otherAccess)
    const lenient: AgentAccountOutlet<string> = {
      deliver: async () => ({ kind: 'received' }),
    }
    const cases = agentAccountOutletConformance({ ...fixture, outlet: lenient })
    await expect(caseNamed(cases, 'another tenant').run()).rejects.toThrow(
      /call of another tenant should be denied/u,
    )
  })

  it('fails the order case when a late lower revision replaces the higher one', async () => {
    const fixture = memoryAgentAccountOutletFixture(access, otherAccess)
    let last: string | null = null
    const lastWins: AgentAccountOutlet<string> = {
      deliver: async input => {
        last = input.handoff.account.revision
        return fixture.double.deliver(input)
      },
    }
    const cases = agentAccountOutletConformance({
      ...fixture,
      outlet: lastWins,
      current: async () => last,
    })
    await expect(caseNamed(cases, 'arrives late').run()).rejects.toThrow(
      /should not replace the higher one/u,
    )
  })
})
