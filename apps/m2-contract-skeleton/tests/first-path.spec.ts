// The connected tenant path over the `./testing` doubles: the first round reaches every hop, each
// failure stops at the hop that owns it without faking the later ones, and every probe of CS v2
// records the public refusal it meets instead of building the missing behavior.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { HistoryPage } from '@omne-harness/session-contract'
import { memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  runFirstTenantPath,
  messageOf,
  wireSessionOf,
  type PathDependencies,
  type PathPrincipal,
  type SessionAssembly,
} from '../src/path.ts'
import { runContractSkeleton } from '../src/index.ts'
import {
  agentDouble,
  assembleWithMemorySources,
  firstRequest,
  identityDouble,
  pathDependencies,
  REPLY_TEXT,
  REPLY_TEXTS,
  REQUEST_TEXTS,
  sessionAssembly,
  skeletonInputs,
} from './first-path-doubles.ts'

const FIRST_ROUND = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08'] as const
const LATER = ['H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const
/** The hops of CS v2 that the upstream public entries refuse on this track. */
const PROBED = ['H09', 'H10', 'H11', 'H12', 'H13'] as const

/** A Session store whose transaction port is wrapped by `wrap`; the evidence bridge stays. */
function wrappedStore(
  wrap: (assembly: SessionAssembly) => SessionAssembly['transactions'],
): Pick<PathDependencies, 'session'> {
  const build = sessionAssembly()
  return {
    session: input => {
      const assembly = build(input)
      return { ...assembly, transactions: wrap(assembly) }
    },
  }
}

describe('connected tenant path, first round', () => {
  it('connects every hop of the first round and reads the scripted Model reply back through the session codec', async () => {
    const pages: HistoryPage[] = []
    const observed = await runFirstTenantPath(
      pathDependencies(
        wrappedStore(({ transactions }) => ({
          ...transactions,
          history: {
            ...transactions.history,
            begin: async (input: Parameters<typeof transactions.history.begin>[0]) => {
              const page = await transactions.history.begin(input)
              if ('ok' in page) pages.push(page.ok)
              return page
            },
          },
        })),
      ),
    )
    for (const hop of FIRST_ROUND) expect(observed[hop].connected).toBe(true)
    const main = pages.filter(page =>
      page.entries.some(entry => entry.kind === 'message.assistant'),
    )
    const last = main.at(-1)
    const messages = (last?.entries ?? []).flatMap(entry => {
      const message = messageOf(entry)
      return message === null ? [] : [message]
    })
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(JSON.stringify(messages[1]?.blocks)).toContain(REPLY_TEXT)
    expect(observed.H03.evidence).toContain(
      'public-contract:create-session response read with the wire session',
    )
    expect(observed.H04.evidence).toContain(
      'public-contract:send-input request read with the wire session',
    )
    expect(observed.H08.evidence).toContain(
      'public-contract:read-history request and response read with the wire session',
    )
  })

  it('derives a 64-hex wire session for the session codec', () => {
    expect(wireSessionOf('session-cs-first' as never)).toMatch(/^[0-9a-f]{64}$/)
    expect(wireSessionOf('session-cs-first' as never)).not.toBe(
      wireSessionOf('session-cs-tool' as never),
    )
  })

  it('keeps the session of the first tenant invisible to another tenant', async () => {
    let port: SessionAssembly['transactions'] | null = null
    await runFirstTenantPath(
      pathDependencies(
        wrappedStore(({ transactions }) => {
          port = transactions
          return transactions
        }),
      ),
    )
    if (port === null) throw new Error('the Session store was not built')
    const foreign = await (port as SessionAssembly['transactions']).history.begin({
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
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionAssembly('contract-memory', bridge => bridge.controls.unavailable(true)),
      }),
    )
    expect(observed.H03).toEqual({ connected: false, evidence: ['session-create:unavailable'] })
    expect(observed.H04.connected).toBe(false)
  })

  it('refuses startRun with login-required when the evidence bridge gives no login confirmation', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionAssembly('contract-memory', bridge => bridge.controls.loginEntry(false)),
      }),
    )
    expect(observed.H03.connected).toBe(true)
    expect(observed.H04).toEqual({
      connected: false,
      evidence: ['session-startRun:login-required'],
    })
    for (const hop of ['H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const)
      expect(observed[hop]).toEqual({ connected: false, evidence: ['not-reached'] })
  })

  it('does not claim a Model result, reply or history entry when the Model never settles', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({ agent: agentDouble({ parts: null }), replyTurns: 50 }),
    )
    expect(observed.H04.connected).toBe(true)
    // The call was sent (H05); nothing after it may be claimed.
    expect(observed.H05.connected).toBe(true)
    for (const hop of ['H06', 'H07', 'H08'] as const) expect(observed[hop].connected).toBe(false)
    expect(observed.H08.evidence.join(' ')).toContain('has no assistant message')
    expect(observed.H06.evidence).toContain('agent:no reply of the journal Model call')
    for (const hop of ['H10', 'H11', 'H12'] as const)
      expect(observed[hop]).toEqual({ connected: false, evidence: ['not-reached'] })
  })

  it('fails H08 when the Session history does not carry the Model reply text', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies(
        wrappedStore(({ transactions }) => ({
          ...transactions,
          history: {
            ...transactions.history,
            begin: async (input: Parameters<typeof transactions.history.begin>[0]) => {
              const page = await transactions.history.begin(input)
              if ('failure' in page) return page
              return {
                ok: {
                  ...page.ok,
                  entries: page.ok.entries.filter(entry => entry.kind !== 'message.assistant'),
                },
              }
            },
          },
        })),
      ),
    )
    expect(observed.H07.connected).toBe(true)
    expect(observed.H08.connected).toBe(false)
  })

  it('reports an incomplete path with the first round verified, without message bodies or credentials', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    expect(report.checksPassed).toBe(false)
    expect(report.gaps).toEqual([...PROBED])
    expect(report.fullPath).toBe('incomplete')
    for (const hop of report.hops)
      expect(hop.state).toBe((PROBED as readonly string[]).includes(hop.hopId) ? 'gap' : 'verified')
    const text = JSON.stringify(report)
    for (const forbidden of [...REPLY_TEXTS, ...REQUEST_TEXTS])
      expect(text).not.toContain(forbidden)
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
    const identity = identityDouble()
    const refused = await runContractSkeleton(
      skeletonInputs({
        path: pathDependencies({
          session: sessionAssembly('contract-memory', bridge => bridge.controls.loginEntry(false)),
        }),
      }),
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
      for (const forbidden of [secret, login.credential, login.loginIdentifier, ...REQUEST_TEXTS])
        expect(text).not.toContain(forbidden)
    }
  })
})

describe('the injected Session access check (#680 B-1)', () => {
  it('stays pending before H03 when no sessionAccessCheck is injected', async () => {
    let built = 0
    const build = sessionAssembly()
    const observed = await runFirstTenantPath(
      pathDependencies({
        sessionAccessCheck: undefined as never,
        session: input => {
          built += 1
          return build(input)
        },
      }),
    )
    expect(observed.H02.connected).toBe(true)
    expect(observed.H03).toEqual({
      connected: false,
      evidence: ['session-assembly:pending:sessionAccessCheck'],
    })
    expect(built).toBe(0)
    for (const hop of ['H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H13'] as const)
      expect(observed[hop]).toEqual({ connected: false, evidence: ['not-reached'] })
  })

  it('asks the injected check for the session commands and stops at H03 when it denies', async () => {
    const asked: string[] = []
    const observed = await runFirstTenantPath(
      pathDependencies({
        sessionAccessCheck: {
          async check(request) {
            asked.push(request.operation)
            return { kind: 'denied' }
          },
        },
      }),
    )
    expect(asked).toContain('create')
    expect(observed.H03).toEqual({ connected: false, evidence: ['session-create:denied'] })
  })
})

describe('the later rounds, the probes and the Session log (CS v2)', () => {
  it('drives the later rounds until the Session refuses the next Run, and records the submit route', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H09.connected).toBe(false)
    expect(observed.H09.evidence[0]).toBe('session-contract:1 of 3 rounds replied')
    expect(observed.H09.evidence).toContain('round 2: session-startRun:run-active')
    expect(observed.H09.evidence).toContain('round 2: agent:input.submit unavailable')
    // The second input was accepted by Session before the Run start was refused.
    expect(observed.H08.evidence[1]).toContain('message.user,')
  })

  it('records that the Agent loop refuses the tool-call reply before any Tool invocation', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H10.connected).toBe(false)
    expect(observed.H10.evidence).toContain(
      'agent:the tool-call reply was admitted and handed over to Session',
    )
    expect(observed.H10.evidence).toContain(
      'caller-reported: Tool runtime invocations 0, Model admissions 1',
    )
    expect(observed.H10.evidence.join(' ')).toContain('agent:journal stopped at I4')
  })

  it('records that quiesce, detach and resume are unavailable during the Model call, with one admission', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H11.connected).toBe(false)
    expect(observed.H11.evidence).toContain('caller-reported: Model admissions 1 during the call')
    expect(observed.H11.evidence).toContain('agent:control.quiesce unavailable')
    expect(observed.H11.evidence).toContain('agent:recovery.detach unavailable')
    expect(observed.H11.evidence).toContain('agent:runtime.resume unavailable')
    expect(observed.H11.evidence).toContain(
      'agent:the original driver continued from the received entry after the Model settled',
    )
  })

  it('records that the Agent loop refuses a received result with reasoning parts', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H12.connected).toBe(false)
    expect(observed.H12.evidence).toContain(
      'model-contract:the public pusher delivered the reasoning result to the host receiver',
    )
    expect(observed.H12.evidence.join(' ')).toContain('agent:no reply handed over')
  })

  it('reports the Session log hop as a gap while the Agent keeps its own memory Journal', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H13.connected).toBe(false)
    expect(observed.H13.evidence[0]).toContain('GAP-SESSION-LOG-TARGETS')
  })

  it('reads the Agent records from the Session log of #756, and stops at H06 without reception targets', async () => {
    const observed = await runFirstTenantPath(pathDependencies({}, 'session-log'))
    for (const hop of ['H01', 'H02', 'H03', 'H04', 'H05', 'H13'] as const)
      expect(observed[hop].connected).toBe(true)
    expect(observed.H13.evidence).toContain(
      'session-contract:readWork binds the Run to the same execution',
    )
    expect(observed.H13.evidence).toContain(
      'session-contract:history carries the hand-over or batch-taken entry of the execution',
    )
    expect(observed.H06.connected).toBe(false)
    expect(observed.H06.evidence).toContain('agent:journal has no received Model result')
    for (const hop of ['H07', 'H08', 'H09'] as const) expect(observed[hop].connected).toBe(false)
  })

  it('declares the realization of every row a hop crosses', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    for (const hop of report.hops) {
      expect(hop.rows.length).toBeGreaterThan(0)
      expect(hop.realization.map(row => row.row)).toEqual([...hop.rows])
      for (const row of hop.realization) expect(row.realization).not.toBe('undeclared')
    }
    expect(report.hops.find(hop => hop.hopId === 'H04')?.realization).toContainEqual({
      row: 'agent-host',
      realization: 'real',
    })
    expect(report.hops.find(hop => hop.hopId === 'H06')?.realization).toContainEqual({
      row: 'model-host',
      realization: 'double',
    })
    const undeclared = await runContractSkeleton(skeletonInputs({ realization: {} }))
    expect(undeclared.hops[0]?.realization[0]?.realization).toBe('undeclared')
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
      'model-contract:the public pusher delivered the result to the host receiver, which wrote the received entry and its material',
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
