// The receiving ports of SPEC "生产者接收面" through the `./testing` entry: each double passes its own
// conformance suite, and a provider that breaks one named rule fails the case of that rule. The
// second part keeps the suites honest: a suite that passes a broken provider would prove nothing.
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  decodeExecutionRevision,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  type AgentAccountOutlet,
  type AgentJournalEntries,
  type Authority,
  type ExecutionAttachmentId,
  type ReceivedCommitInput,
} from '@omne-harness/agent-contract'
import {
  agentAccountOutletConformance,
  agentJournalEntriesConformance,
  memoryAgentAccountOutletFixture,
  memoryAgentJournalEntriesFixture,
  memoryReceivedCommitFixture,
  sampleReceivedModelResult,
  type ReceivedCommitFixture,
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

  it('fails the replay case when a recalled operation allocates another event', async () => {
    // A provider that projects every call, also the one that only recalls the original receipt.
    const fixture = memoryAgentJournalEntriesFixture(access, otherAccess)
    const calls = new Map<string, number>()
    const cases = agentJournalEntriesConformance({
      ...fixture,
      entries: {
        record: async input => {
          const answer = await fixture.double.record(input)
          if ('ok' in answer) calls.set(input.execution, (calls.get(input.execution) ?? 0) + 1)
          return answer
        },
      },
      events: async (who, execution) => {
        const events = await fixture.events(who, execution)
        const extra = (calls.get(execution) ?? 0) - events.length
        return [...events, ...events.slice(0, Math.max(0, extra))]
      },
    })
    await expect(caseNamed(cases, 'replayed').run()).rejects.toThrow(
      /replay should allocate no event/u,
    )
  })

  it('fails the after-the-end case when an entry event follows the end', async () => {
    // A provider that keeps projecting entries after ended.
    const fixture = memoryAgentJournalEntriesFixture(access, otherAccess)
    const attachments = new Map<string, ExecutionAttachmentId>()
    const ended = new Set<string>()
    const cases = agentJournalEntriesConformance({
      ...fixture,
      open: async (who, execution) => {
        const authority = await fixture.open(who, execution)
        attachments.set(execution, authority.executionAttachment)
        return authority
      },
      end: async (who, execution) => {
        await fixture.end(who, execution)
        ended.add(execution)
      },
      events: async (who, execution) => {
        const events = await fixture.events(who, execution)
        const attachment = attachments.get(execution)
        if (!ended.has(execution) || attachment === undefined) return events
        const entries = (await fixture.read(who, execution)) ?? []
        return [
          ...events,
          ...entries.slice(events.length).map(entry => ({
            execution,
            sequence: String(events.length + 1),
            executionAttachment: attachment,
            schema: { owner: 'test', name: 'x', revision: '1', digest: 'x' },
            cause: { owner: 'test', record: 'x', revision: '1', digest: 'x' },
            body: { kind: 'entry' as const, entry },
          })),
        ]
      },
    })
    await expect(caseNamed(cases, 'after the end without an event').run()).rejects.toThrow(
      /no event should follow the end/u,
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

describe('joint received custody through the original conformance entry', () => {
  it('runs the required profile and all original entry cases against one shared provider', async () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    const cases = agentJournalEntriesConformance(fixture, {
      received: 'required',
      joint: fixture.joint,
    })
    expect(cases.filter(test => test.name.startsWith('received ')).length).toBeGreaterThanOrEqual(
      11,
    )
    await runAll(cases)
  })

  it('requires the explicitly selected fixture immediately', () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    expect(() =>
      Reflect.apply(agentJournalEntriesConformance, undefined, [fixture, { received: 'required' }]),
    ).toThrow(/needs a joint fixture/u)
    expect(() =>
      agentJournalEntriesConformance(fixture, {
        received: 'required',
        joint: { ...fixture.joint, received: {} } as unknown as ReceivedCommitFixture<
          string,
          ContentBlock
        >,
      }),
    ).toThrow(/lacks commit/u)
    expect(() =>
      agentJournalEntriesConformance(fixture, {
        received: 'required',
        joint: { ...fixture.joint, entries: { record: fixture.entries.record } },
      }),
    ).toThrow(/share the entries port/u)
  })

  it('detects material exposed before joint publication through the public read', async () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    const joint = {
      ...fixture.joint,
      materials: {
        ...fixture.joint.materials,
        read: async () => ({ ok: fixture.joint.material('visibility') }),
      },
    }
    const cases = agentJournalEntriesConformance(fixture, { received: 'required', joint })
    await expect(caseNamed(cases, 'joint publication').run()).rejects.toThrow(
      /material must not be visible before publication/u,
    )
  })

  it('detects rewriting the original receipt operation on a duplicate', async () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    const joint = {
      ...fixture.joint,
      received: {
        ...fixture.joint.received,
        async commit(input: ReceivedCommitInput<string, ContentBlock>) {
          const reply = await fixture.joint.received.commit(input)
          if ('failure' in reply || reply.ok.kind !== 'committed') return reply
          return {
            ok: {
              ...reply.ok,
              value: {
                ...reply.ok.value,
                receipt: { ...reply.ok.value.receipt, operation: input.operation },
              },
            },
          }
        },
      },
    }
    const cases = agentJournalEntriesConformance(fixture, { received: 'required', joint })
    await expect(caseNamed(cases, 'concurrent and cross-operation').run()).rejects.toThrow(
      /concurrent retry must recall the complete original receipt/u,
    )
  })

  it('detects minting a new revision for retry', async () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    let replies = 0
    const joint = {
      ...fixture.joint,
      received: {
        ...fixture.joint.received,
        async commit(input: ReceivedCommitInput<string, ContentBlock>) {
          const reply = await fixture.joint.received.commit(input)
          if ('failure' in reply || reply.ok.kind !== 'committed') return reply
          replies += 1
          const revision = decodeExecutionRevision(`bad-${replies}`)
          if (!('ok' in revision)) throw new Error('invalid negative control revision')
          return {
            ok: {
              ...reply.ok,
              value: {
                ...reply.ok.value,
                receipt: { ...reply.ok.value.receipt, revision: revision.ok },
              },
            },
          }
        },
      },
    }
    const cases = agentJournalEntriesConformance(fixture, { received: 'required', joint })
    await expect(caseNamed(cases, 'concurrent and cross-operation').run()).rejects.toThrow(
      /concurrent retry must recall the complete original receipt/u,
    )
  })
})

describe('reference material custody', () => {
  it('checks the current principal for both joint and independently preserved materials', async () => {
    const fixture = memoryReceivedCommitFixture(access, otherAccess)
    const execution = decodeAgentExecutionId('material-custody')
    const operation = decodeAgentOperationId('material-custody')
    if (!('ok' in execution) || !('ok' in operation)) throw new Error('invalid fixture identity')
    await fixture.open(access, execution.ok)
    const { material: _source, ...entry } = sampleReceivedModelResult(access.tenant, 'custody')
    const input = {
      ...access,
      execution: execution.ok,
      operation: operation.ok,
      entry,
      material: fixture.joint.material('custody'),
    }
    await fixture.joint.bind(input)
    const committed = await fixture.joint.received.commit(input)
    if (!('ok' in committed) || committed.ok.kind !== 'committed')
      throw new Error('fixture commit failed')
    const value = committed.ok.value
    const legacy = await fixture.joint.materials.preserve({
      ...access,
      identity: 'legacy-custody',
      consumer: entry.consumer,
      value: input.material,
    })
    if (!('ok' in legacy)) throw new Error('fixture preserve failed')
    const stranger = { tenant: access.tenant, principal: 'unqualified-principal' }
    for (const source of [value.entry.material, legacy.ok]) {
      expect(await fixture.joint.materials.read({ ...stranger, source })).toMatchObject({
        failure: { kind: 'denied' },
      })
      expect(await fixture.joint.materials.read({ ...access, source })).toEqual({
        ok: input.material,
      })
      fixture.joint.qualify(access, input.execution, 'denied')
      expect(await fixture.joint.materials.read({ ...access, source })).toMatchObject({
        failure: { kind: 'denied' },
      })
      fixture.joint.qualify(access, input.execution, 'allowed')
    }
    expect(value.saved.owner).toBe(entry.consumer.owner)
    expect(
      new Set([value.saved.record, value.receipt.evidence.record, value.entry.material.record])
        .size,
    ).toBe(3)
  })
})

describe('the entries suite reports a case it cannot drive as uncovered, never as passed', () => {
  it.each(['detach', 'failNextRecord'] as const)(
    'marks the case that needs %s uncovered and rejects its run',
    async control => {
      const { [control]: _absent, ...fixture } = memoryAgentJournalEntriesFixture(
        access,
        otherAccess,
      )
      const cases = agentJournalEntriesConformance(fixture)
      const fragment = control === 'detach' ? 'after a detach' : 'record reply is lost'
      const found = caseNamed(cases, fragment)
      expect(found.uncovered).toMatch(new RegExp(`uncovered: .*${control}`, 'u'))
      await expect(found.run()).rejects.toThrow(/uncovered/u)
      expect(cases.filter(entry => entry.uncovered !== undefined)).toHaveLength(1)
    },
  )

  it('leaves no case uncovered when the fixture has every control', () => {
    const cases = agentJournalEntriesConformance(
      memoryAgentJournalEntriesFixture(access, otherAccess),
    )
    expect(cases.filter(entry => entry.uncovered !== undefined)).toEqual([])
  })
})
