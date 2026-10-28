// The connected first tenant path over the `./testing` doubles: the happy path reaches every hop,
// and each failure stops at the hop that owns it without faking the later ones.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { HistoryPage } from '@omne-harness/session-contract'
import {
  createMemorySessionEvidenceBridge,
  createMemorySessionTransactions,
  memoryOtherAccess,
} from '@omne-harness/session-contract/testing'
import { runFirstTenantPath, messageOf, type PathPrincipal } from '../src/path.ts'
import { runContractSkeleton } from '../src/index.ts'
import {
  agentDouble,
  assembleWithMemorySources,
  firstRequest,
  identityDouble,
  pathDependencies,
  REPLY_TEXT,
  skeletonInputs,
} from './first-path-doubles.ts'

const LATER = ['H03', 'H04', 'H05', 'H06', 'H07', 'H08'] as const

describe('connected first tenant path', () => {
  it('connects every hop and reads the scripted Model reply back from Session history', async () => {
    const session = createMemorySessionTransactions<PathPrincipal>()
    const pages: HistoryPage[] = []
    const watched = {
      ...session,
      history: {
        ...session.history,
        begin: async (input: Parameters<typeof session.history.begin>[0]) => {
          const page = await session.history.begin(input)
          if ('ok' in page) pages.push(page.ok)
          return page
        },
      },
    }
    const observed = await runFirstTenantPath(pathDependencies({ session: watched }))
    for (const hop of ['H01', 'H02', ...LATER] as const) expect(observed[hop].connected).toBe(true)
    const last = pages.at(-1)
    const messages = (last?.entries ?? []).flatMap(entry => {
      const message = messageOf(entry)
      return message === null ? [] : [message]
    })
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant'])
    expect(JSON.stringify(messages[1]?.blocks)).toContain(REPLY_TEXT)
  })

  it('keeps the session of the first tenant invisible to another tenant', async () => {
    const session = createMemorySessionTransactions<PathPrincipal>()
    await runFirstTenantPath(pathDependencies({ session }))
    const foreign = await session.history.begin({
      ...memoryOtherAccess<PathPrincipal>('stranger', 'session-cs-first'),
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1_000_000,
    })
    expect('failure' in foreign && foreign.failure.kind).toBe('denied')
  })

  it('stops at H02 when identity refuses the login, and reports no later hop as connected', async () => {
    const identity = identityDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        identity: {
          ...identity,
          issueLogin: input => identity.issueLogin({ ...input, credential: 'wrong credential' }),
        },
      }),
    )
    expect(observed.H01.connected).toBe(true)
    expect(observed.H02).toEqual({
      connected: false,
      evidence: ['identity-login:uniform-auth-failure'],
    })
    for (const hop of LATER)
      expect(observed[hop]).toEqual({ connected: false, evidence: ['not-reached'] })
  })

  it('stops at H03 when the Session evidence bridge is unavailable', async () => {
    const evidence = createMemorySessionEvidenceBridge()
    evidence.controls.unavailable(true)
    const observed = await runFirstTenantPath(pathDependencies({ evidence }))
    expect(observed.H03).toEqual({ connected: false, evidence: ['session-create:unavailable'] })
    expect(observed.H04.connected).toBe(false)
  })

  it('refuses startRun with login-required when the evidence bridge gives no login confirmation', async () => {
    const evidence = createMemorySessionEvidenceBridge()
    evidence.controls.loginEntry(false)
    const observed = await runFirstTenantPath(pathDependencies({ evidence }))
    expect(observed.H03.connected).toBe(true)
    expect(observed.H04).toEqual({
      connected: false,
      evidence: ['session-startRun:login-required'],
    })
    for (const hop of ['H05', 'H06', 'H07', 'H08'] as const)
      expect(observed[hop]).toEqual({ connected: false, evidence: ['not-reached'] })
  })

  it('does not claim a Model result, reply or history entry when the Model never settles', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({ agent: agentDouble({ reply: null }), replyTurns: 50 }),
    )
    expect(observed.H04.connected).toBe(true)
    for (const hop of ['H05', 'H06', 'H07', 'H08'] as const)
      expect(observed[hop].connected).toBe(false)
    expect(observed.H08.evidence.join(' ')).toContain('has no assistant message')
    expect(observed.H06.evidence).toContain('agent:no reply of the journal Model call')
  })

  it('fails H08 when the Session history does not carry the Model reply text', async () => {
    const session = createMemorySessionTransactions<PathPrincipal>()
    const altered = {
      ...session,
      history: {
        ...session.history,
        begin: async (input: Parameters<typeof session.history.begin>[0]) => {
          const page = await session.history.begin(input)
          if ('failure' in page) return page
          return {
            ok: {
              ...page.ok,
              entries: page.ok.entries.filter(entry => entry.kind !== 'message.assistant'),
            },
          }
        },
      },
    }
    const observed = await runFirstTenantPath(pathDependencies({ session: altered }))
    expect(observed.H07.connected).toBe(true)
    expect(observed.H08.connected).toBe(false)
  })

  it('reports a complete path without message bodies or credentials', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    expect(report.checksPassed).toBe(true)
    expect(report.gaps).toEqual([])
    expect(report.fullPath).toBe('complete')
    const text = JSON.stringify(report)
    expect(text).not.toContain(REPLY_TEXT)
    expect(text).not.toContain('hello, first request')
  })

  it('takes the lease counts from the Request Context testing counter, and fails H05 without a lease', async () => {
    const assembled = await assembleWithMemorySources({
      tenant: memoryOtherAccess<PathPrincipal>('p').tenant,
      history: [{ entry: 'entry:1' as never, message: firstRequest() }],
    })
    expect(['candidate-fixable', 'candidate-before-extension']).toContain(assembled.result.kind)
    expect(assembled.lease.acquired).toBeGreaterThan(0)
    expect(assembled.lease.planned).toBeGreaterThan(0)
    expect(assembled.lease.outstanding).toBe(0)
    const observed = await runFirstTenantPath(
      pathDependencies({
        assemble: async input => {
          const real = await assembleWithMemorySources(input)
          return { ...real, lease: { acquired: 0, planned: 0, outstanding: 0 } }
        },
      }),
    )
    expect(observed.H05.connected).toBe(false)
    expect(observed.H05.evidence).toContain(
      'caller-reported: Request Context lease counts acquired=0, planned=0, outstanding=0',
    )
  })

  it('keeps supplier and port free text out of a failing report', async () => {
    const secret = 'private supplier diagnostic text'
    const evidence = createMemorySessionEvidenceBridge()
    evidence.controls.loginEntry(false)
    const identity = identityDouble()
    const refused = await runContractSkeleton(
      skeletonInputs({ path: pathDependencies({ evidence }) }),
    )
    expect(refused.hops.find(hop => hop.hopId === 'H04')?.state).toBe('failed')
    const thrown = await runContractSkeleton(
      skeletonInputs({
        path: pathDependencies({
          identity: {
            ...identity,
            issueLogin: async () => {
              throw new Error(secret)
            },
          },
        }),
      }),
    )
    expect(thrown.structureErrors).toContain('first-path-threw:unknown')
    const { login } = pathDependencies()
    for (const report of [refused, thrown]) {
      expect(report.fullPath).toBe('incomplete')
      const text = JSON.stringify(report)
      for (const forbidden of [
        secret,
        login.credential,
        login.loginIdentifier,
        'hello, first request',
      ])
        expect(text).not.toContain(forbidden)
    }
  })
})

it.each([
  'missing-snapshot',
  'missing-entries',
  'empty',
  'start-fence',
  'tool-account',
  'model-account',
] as const)('does not claim H06 for %s instead of the received Model result', async variant => {
  const original = agentDouble()
  const { sampleStartFence, sampleReceivedToolAccount, sampleReceivedModelAccount } =
    await import('@omne-harness/agent-contract/testing')
  const observed = await runFirstTenantPath(
    pathDependencies({
      agent: async input => {
        const agent = await original(input)
        return {
          ...agent,
          journal: {
            ...agent.journal,
            async load(request) {
              const snapshot = await agent.journal.load(request)
              if ('failure' in snapshot) return snapshot
              if (variant === 'missing-snapshot')
                return {
                  failure: { kind: 'unavailable', owner: 'test', diagnostic: 'no snapshot' },
                }
              if (variant === 'missing-entries') {
                const { entries: _, ...rest } = snapshot.ok
                return { ok: rest }
              }
              const entries =
                variant === 'empty'
                  ? []
                  : variant === 'start-fence'
                    ? [sampleStartFence('wrong')]
                    : variant === 'tool-account'
                      ? [sampleReceivedToolAccount(input.tenant, 'wrong')]
                      : [sampleReceivedModelAccount(input.tenant, 'wrong')]
              return { ok: { ...snapshot.ok, entries } }
            },
          },
        }
      },
    }),
  )
  expect(observed.H06.connected).toBe(false)
  expect(observed.H06.evidence).toContain('agent:journal has no received Model result')
})

it.each(['unreadable', 'wrong-schema'] as const)(
  'does not claim H06 when received material is %s',
  async variant => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        agent: async input => {
          const agent = await original(input)
          return {
            ...agent,
            materials: {
              ...agent.materials,
              async read(request) {
                const material = await agent.materials.read(request)
                if ('failure' in material) return material
                if (variant === 'unreadable')
                  return {
                    failure: { kind: 'unavailable', owner: 'test', diagnostic: 'lost material' },
                  }
                if (material.ok.kind !== 'facts') throw new Error('expected received facts')
                return {
                  ok: {
                    ...material.ok,
                    schema: { ...material.ok.schema, revision: 'unsupported' },
                  },
                }
              },
            },
          }
        },
      }),
    )
    expect(observed.H06.connected).toBe(false)
    expect(observed.H06.evidence).toContain(
      'agent:journal records received Model material and its original binding',
    )
  },
)

it('selects the result after unrelated entries rather than adopting the first entry', async () => {
  const original = agentDouble()
  const { sampleStartFence, sampleReceivedToolAccount, sampleReceivedModelAccount } =
    await import('@omne-harness/agent-contract/testing')
  const observed = await runFirstTenantPath(
    pathDependencies({
      agent: async input => {
        const agent = await original(input)
        return {
          ...agent,
          journal: {
            ...agent.journal,
            async load(request) {
              const snapshot = await agent.journal.load(request)
              if ('failure' in snapshot) return snapshot
              return {
                ok: {
                  ...snapshot.ok,
                  entries: [
                    sampleStartFence('other'),
                    sampleReceivedToolAccount(input.tenant, 'other'),
                    sampleReceivedModelAccount(input.tenant, 'other'),
                    ...(snapshot.ok.entries ?? []),
                  ],
                },
              }
            },
          },
        }
      },
    }),
  )
  expect(observed.H06.connected).toBe(true)
  expect(observed.H06.evidence).toContain(
    'agent:journal records received Model material and its original binding',
  )
})

it('does not claim H06 when readable received material names another original call', async () => {
  const original = agentDouble()
  const { decodeModelCallId, encodeModelInvocationRef, resolveModelInvocationRef } =
    await import('@omne-harness/model-contract')
  const observed = await runFirstTenantPath(
    pathDependencies({
      agent: async input => {
        const agent = await original(input)
        let replacement: { from: string; to: string } | null = null
        return {
          ...agent,
          journal: {
            ...agent.journal,
            async load(request) {
              const snapshot = await agent.journal.load(request)
              if ('failure' in snapshot) return snapshot
              const entries = snapshot.ok.entries?.map(entry => {
                if (
                  entry.kind !== 'received' ||
                  entry.delivery.producer !== 'model' ||
                  entry.delivery.key.kind !== 'result' ||
                  !('accounts' in entry.delivery)
                )
                  return entry
                const ref = resolveModelInvocationRef(entry.delivery.key.reference, input.tenant)
                const call = decodeModelCallId('mcall_other-original')
                if ('failure' in ref || 'failure' in call)
                  throw new Error('valid original reference required')
                const changed = encodeModelInvocationRef({
                  ...ref.ok,
                  tenant: input.tenant,
                  call: call.ok,
                })
                if ('failure' in changed) throw new Error('valid replacement required')
                replacement = { from: entry.delivery.key.reference, to: changed.ok }
                return {
                  ...entry,
                  delivery: {
                    ...entry.delivery,
                    key: { ...entry.delivery.key, reference: changed.ok },
                  },
                }
              })
              return { ok: { ...snapshot.ok, ...(entries === undefined ? {} : { entries }) } }
            },
          },
          materials: {
            ...agent.materials,
            async read(request) {
              const material = await agent.materials.read(request)
              if ('failure' in material || material.ok.kind !== 'facts' || replacement === null)
                return material
              const replace = (json: JsonValue): JsonValue => {
                if (json.kind === 'string')
                  return {
                    ...json,
                    value: json.value === replacement?.from ? replacement.to : json.value,
                  }
                if (json.kind === 'array') return { ...json, items: json.items.map(replace) }
                if (json.kind === 'object')
                  return {
                    ...json,
                    entries: json.entries.map(entry => ({ ...entry, value: replace(entry.value) })),
                  }
                return json
              }
              return { ok: { ...material.ok, value: replace(material.ok.value) } }
            },
          },
        }
      },
    }),
  )
  expect(observed.H06.connected).toBe(false)
  expect(observed.H06.evidence).toContain('agent:no reply of the journal Model call')
})

it('rejects a received reference encoded for another tenant', async () => {
  const original = agentDouble()
  const { encodeModelInvocationRef, resolveModelInvocationRef } =
    await import('@omne-harness/model-contract')
  const observed = await runFirstTenantPath(
    pathDependencies({
      agent: async input => {
        const agent = await original(input)
        return {
          ...agent,
          journal: {
            ...agent.journal,
            async load(request) {
              const snapshot = await agent.journal.load(request)
              if ('failure' in snapshot) return snapshot
              const entries = snapshot.ok.entries?.map(entry => {
                if (entry.kind !== 'received' || entry.delivery.producer !== 'model') return entry
                const ref = resolveModelInvocationRef(entry.delivery.key.reference, input.tenant)
                if ('failure' in ref) throw new Error('original reference required')
                const foreign = encodeModelInvocationRef({
                  ...ref.ok,
                  tenant: memoryOtherAccess<PathPrincipal>('foreign').tenant,
                })
                if ('failure' in foreign) throw new Error('foreign reference required')
                if ('accounts' in entry.delivery)
                  return {
                    ...entry,
                    delivery: {
                      producer: 'model' as const,
                      key: { ...entry.delivery.key, reference: foreign.ok },
                      accounts: entry.delivery.accounts,
                    },
                  }
                return {
                  ...entry,
                  delivery: {
                    producer: 'model' as const,
                    key: { ...entry.delivery.key, reference: foreign.ok },
                    account: entry.delivery.account,
                  },
                }
              })
              return { ok: { ...snapshot.ok, ...(entries === undefined ? {} : { entries }) } }
            },
          },
        }
      },
    }),
  )
  expect(observed.H06.connected).toBe(false)
})
