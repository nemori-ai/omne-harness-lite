// The connected tenant path over the `./testing` doubles: the first round reaches every hop, each
// failure stops at the hop that owns it without faking the later ones, and every probe of CS v2
// records the public refusal it meets instead of building the missing behavior.
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { HistoryPage, RunId } from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  memoryOtherAccess,
} from '@omne-harness/session-contract/testing'
import { createMemorySessionJournal } from '@omne-harness/session-adapters/testing'
import {
  evidenceOf,
  NOT_REACHED,
  runFirstTenantPath,
  messageOf,
  wireSessionOf,
  type FirstPathHop,
  type FirstPathObservation,
  type PathDependencies,
  type PathPrincipal,
  type SessionAssembly,
} from '../src/path.ts'
import { runContractSkeleton } from '../src/index.ts'
import type { PathReport } from '../src/path-report.ts'
import {
  agentDouble,
  assembleWithMemorySources,
  executionEnvironmentDouble,
  firstRequest,
  identityDouble,
  pathDependencies,
  reasoningStateParts,
  replyParts,
  REPLY_TEXT,
  REPLY_TEXTS,
  REQUEST_TEXTS,
  sessionAccessCheckDouble,
  sessionAssembly,
  skeletonInputs,
} from './first-path-doubles.ts'

const FIRST_ROUND = ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08'] as const
const LATER = ['H03', 'H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const
/** The hops of CS v2 that the upstream public entries refuse on this track. */
const PROBED = ['H09', 'H10', 'H11', 'H12', 'H13'] as const

const kindAt = (observed: FirstPathObservation, hop: FirstPathHop) =>
  (observed[hop] ?? NOT_REACHED).kind
const evidenceAt = (observed: FirstPathObservation, hop: FirstPathHop) =>
  evidenceOf(observed[hop] ?? NOT_REACHED)

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
    for (const hop of FIRST_ROUND) expect(kindAt(observed, hop)).toBe('connected')
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
    expect(evidenceAt(observed, 'H03')).toContain(
      'public-contract:create-session response read with the wire session',
    )
    expect(evidenceAt(observed, 'H04')).toContain(
      'public-contract:send-input request read with the wire session',
    )
    expect(evidenceAt(observed, 'H08')).toContain(
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
    expect(kindAt(observed, 'H01')).toBe('connected')
    expect(observed.H02).toEqual({
      kind: 'refused',
      evidence: ['identity-login:uniform-auth-failure'],
    })
    for (const hop of LATER) expect(observed[hop]).toBeUndefined()
  })

  it('stops at H03 when the Session evidence bridge is unavailable', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionAssembly('contract-memory', bridge => bridge.controls.unavailable(true)),
      }),
    )
    expect(observed.H03).toEqual({ kind: 'refused', evidence: ['session-create:unavailable'] })
    expect(kindAt(observed, 'H04')).not.toBe('connected')
  })

  it('refuses startRun with login-required when the evidence bridge gives no login confirmation', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionAssembly('contract-memory', bridge => bridge.controls.loginEntry(false)),
      }),
    )
    expect(kindAt(observed, 'H03')).toBe('connected')
    expect(observed.H04).toEqual({ kind: 'refused', evidence: ['session-startRun:login-required'] })
    for (const hop of ['H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const)
      expect(observed[hop]).toBeUndefined()
  })

  it('does not claim a Model result, reply or history entry when the Model never settles', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({ agent: agentDouble({ parts: null }), replyTurns: 50 }),
    )
    expect(kindAt(observed, 'H04')).toBe('connected')
    // The call was sent (H05); nothing after it may be claimed.
    expect(kindAt(observed, 'H05')).toBe('connected')
    for (const hop of ['H06', 'H07', 'H08'] as const)
      expect(kindAt(observed, hop)).not.toBe('connected')
    expect(evidenceAt(observed, 'H08').join(' ')).toContain('has no assistant message')
    expect(evidenceAt(observed, 'H06')).toContain('agent:no reply of the journal Model call')
    expect(evidenceAt(observed, 'H06').join(' ')).not.toContain('MODEL-ACK-ARRIVAL')
    expect(evidenceAt(observed, 'H07')).toContain('agent:no reply within 50 event-loop turns')
    for (const hop of ['H10', 'H11', 'H12'] as const) expect(observed[hop]).toBeUndefined()
  })

  it('stops the path at H04 when Session refuses the hand-over of the input', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies(
        wrappedStore(({ transactions }) => ({
          ...transactions,
          commit: (async (input: Parameters<typeof transactions.commit>[0]) =>
            input.command.kind === 'receive'
              ? { failure: { kind: 'conflict', operation: input.command.input.operation } }
              : transactions.commit(input)) as typeof transactions.commit,
        })),
      ),
    )
    // Session refused the hand-over with a named failure: a refusal, not a disconnection.
    expect(kindAt(observed, 'H04')).toBe('refused')
    expect(evidenceAt(observed, 'H04')).toContain(
      'session-contract:commit(receive input-handover) conflict',
    )
    for (const hop of ['H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const)
      expect(observed[hop]).toBeUndefined()
  })

  it('reports the step that stopped a probe session, with the kind that step gave', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies(
        wrappedStore(({ transactions }) => ({
          ...transactions,
          commit: (async (input: Parameters<typeof transactions.commit>[0]) =>
            input.command.kind === 'receive' && String(input.access.session) === 'session-cs-tool'
              ? { failure: { kind: 'conflict', operation: input.command.input.operation } }
              : transactions.commit(input)) as typeof transactions.commit,
        })),
      ),
    )
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(observed.H10).toEqual({
      kind: 'refused',
      evidence: ['probe-tool:session-contract:commit(receive input-handover) conflict'],
    })
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
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(kindAt(observed, 'H08')).not.toBe('connected')
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
    expect(kindAt(observed, 'H05')).not.toBe('connected')
    expect(evidenceAt(observed, 'H05')).toContain(
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
        sessionAccessCheck: undefined,
        session: input => {
          built += 1
          return build(input)
        },
      }),
    )
    expect(kindAt(observed, 'H02')).toBe('connected')
    expect(observed.H03).toEqual({
      kind: 'disconnected',
      evidence: ['session-assembly:pending:sessionAccessCheck'],
    })
    expect(built).toBe(0)
    for (const hop of ['H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H13'] as const)
      expect(observed[hop]).toBeUndefined()
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
    expect(observed.H03).toEqual({ kind: 'refused', evidence: ['session-create:denied'] })
  })
})

describe('the later rounds, the probes and the Session log (CS v2)', () => {
  it('drives the later rounds until the Session refuses the next Run, and records the submit route', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    // Session refused the Run with a named failure, so H09 is a refusal.
    expect(kindAt(observed, 'H09')).toBe('refused')
    expect(evidenceAt(observed, 'H09')[0]).toBe('session-contract:1 of 3 rounds replied')
    expect(evidenceAt(observed, 'H09')).toContain('round 2: session-startRun:run-active')
    expect(evidenceAt(observed, 'H09')).toContain('round 2: agent:input.submit unavailable')
    // The second input was accepted by Session before the Run start was refused.
    expect(evidenceAt(observed, 'H08')[1]).toContain('message.user,')
  })

  it('records that the Agent loop stops at I4 with the tool-call reply before any Tool invocation', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(kindAt(observed, 'H10')).toBe('refused')
    expect(evidenceAt(observed, 'H10')).toEqual([
      'agent:the tool-call reply was admitted and handed over to Session',
      'caller-reported: Tool runtime invocations 0, execution-environment effects none, Model admissions 1',
      'agent:journal state advancing at I4',
      'agent:the loop stopped at I4 with the tool-call reply (GAP-TOOL-LOOP)',
      'agent:no Model request carried a tool result',
    ])
  })

  it('claims no I4 refusal when the tool-call reply never arrives', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: input =>
          input.scenario === 'tool-call'
            ? agentDouble({ parts: () => null })(input)
            : original(input),
      }),
    )
    expect(kindAt(observed, 'H10')).toBe('disconnected')
    expect(evidenceAt(observed, 'H10')).toContain('agent:the tool-call reply was not handed over')
    expect(evidenceAt(observed, 'H10')).toContain(
      'agent:no tool-call reply within 50 event-loop turns',
    )
    expect(evidenceAt(observed, 'H10')).toContain(
      'agent:no second reply within 50 event-loop turns',
    )
    expect(evidenceAt(observed, 'H10').join(' ')).not.toContain('I4')
  })

  it('judges the I4 stop of H10 from the last journal snapshot it read', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: async input => {
          const agent = await original(input)
          if (input.scenario !== 'tool-call') return agent
          let loads = 0
          return {
            ...agent,
            journal: {
              ...agent.journal,
              // The first read sees the loop before I4; the next one sees it at I4.
              async load(request) {
                const snapshot = await agent.journal.load(request)
                loads += 1
                if ('failure' in snapshot || loads > 1) return snapshot
                const checkpoint = { ...snapshot.ok.checkpoint, position: 'I3' }
                return { ok: { ...snapshot.ok, checkpoint } }
              },
            },
          }
        },
      }),
    )
    expect(kindAt(observed, 'H10')).toBe('refused')
    expect(evidenceAt(observed, 'H10')).toContain('agent:journal state advancing at I4')
    expect(evidenceAt(observed, 'H10')).toContain(
      'agent:the loop stopped at I4 with the tool-call reply (GAP-TOOL-LOOP)',
    )
  })

  it('runs one Tool invocation as a file read, a file write and one command in the #791 doubles', async () => {
    const environment = executionEnvironmentDouble({
      principal: 'p',
      tenant: memoryOtherAccess<PathPrincipal>('p').tenant,
    })
    await environment.run()
    expect(environment.effects).toEqual([
      'files.read:done',
      'files.write:done',
      'command.start:done',
    ])
    expect(new TextDecoder().decode(environment.files.peek('notes.txt'))).toBe(
      'notes after the tool',
    )
    expect(environment.command.calls.map(call => call.executable)).toEqual(['cat'])
  })

  it('records quiesce, detach and resume as unavailable and one Model admission after the Model settled', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(kindAt(observed, 'H11')).toBe('refused')
    expect(evidenceAt(observed, 'H11')).toEqual([
      'caller-reported: Model admissions 1 after the Model settled',
      'agent:control.quiesce unavailable',
      'agent:recovery.detach unavailable',
      'agent:runtime.resume unavailable',
      'agent:the original driver continued from the received entry after the Model settled',
      'observation:no public entry supplies the server-entry observation path; frame continuity on the observation connection after reassembly is not observed (GAP-AGENT-REASSEMBLY)',
    ])
  })

  it('does not connect H11 without observation continuity, even when the withdrawal and the resume succeed', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        agent: async input => {
          const agent = await original(input)
          if (input.scenario !== 'held') return agent
          const { provider } = agent
          type Quiesced = Awaited<ReturnType<typeof provider.control.quiesce>>
          type Resumed = Awaited<ReturnType<typeof provider.runtime.resume>>
          return {
            ...agent,
            provider: {
              ...provider,
              control: { quiesce: async () => ({ ok: null }) as unknown as Quiesced },
              runtime: {
                ...provider.runtime,
                resume: async () => ({ ok: null }) as unknown as Resumed,
              },
            },
          }
        },
      }),
    )
    expect(kindAt(observed, 'H11')).toBe('disconnected')
    expect(evidenceAt(observed, 'H11')).toContain('agent:control.quiesce succeeded')
    expect(evidenceAt(observed, 'H11')).toContain('agent:runtime.resume succeeded')
    // After a successful withdrawal the original driver is no longer what the evidence may name.
    expect(evidenceAt(observed, 'H11')).toContain(
      'agent:the resumed execution ended from the received entry after the Model settled',
    )
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('original driver')
    expect(evidenceAt(observed, 'H11').join(' ')).toContain('frame continuity')
  })

  it('records the timeout when the reassembly probe gets no reply after the Model was released', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: async input => {
          const agent = await original(input)
          return input.scenario === 'held' ? { ...agent, releaseModel: () => {} } : agent
        },
      }),
    )
    expect(kindAt(observed, 'H11')).not.toBe('connected')
    expect(evidenceAt(observed, 'H11')).toContain(
      'agent:no reply within 50 event-loop turns after the Model was released',
    )
  })

  it('answers the withdrawal, the resume and the submit as not implemented by #502, not as an access refusal', async () => {
    const diagnostics: string[] = []
    const note = <T extends { ok: unknown } | { failure: unknown }>(reply: T): T => {
      if ('failure' in reply && typeof reply.failure === 'object' && reply.failure !== null)
        diagnostics.push('diagnostic' in reply.failure ? String(reply.failure.diagnostic) : '')
      return reply
    }
    const original = agentDouble()
    await runFirstTenantPath(
      pathDependencies({
        agent: async input => {
          const agent = await original(input)
          const { provider } = agent
          return {
            ...agent,
            provider: {
              ...provider,
              control: { quiesce: async request => note(await provider.control.quiesce(request)) },
              recovery: {
                ...provider.recovery,
                detach: async request => note(await provider.recovery.detach(request)),
              },
              runtime: {
                ...provider.runtime,
                resume: async request => note(await provider.runtime.resume(request)),
                invoke: async request => {
                  const invoked = await provider.runtime.invoke(request)
                  if ('failure' in invoked) return invoked
                  const handle = invoked.ok
                  return {
                    ok: {
                      ...handle,
                      input: { submit: async value => note(await handle.input.submit(value)) },
                    },
                  }
                },
              },
            },
          }
        },
      }),
    )
    expect(diagnostics).toEqual([
      'submit is not implemented yet; #502 assigns it no stage',
      'quiesce is not implemented until #502 stage 5',
      'detach is not implemented until #502 stage 5',
      'resume is not implemented until #502 stage 5',
    ])
  })

  it('records where the Agent loop holds a received result with reasoning parts', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(kindAt(observed, 'H12')).toBe('refused')
    expect(evidenceAt(observed, 'H12')).toEqual([
      'model-contract:the public pusher delivered the reasoning result to the host receiver',
      'agent:journal state waiting at M6',
      'agent:no reply within 2000 event-loop turns',
      'agent:the loop holds the received result with reasoning parts at M6 and handed over no reply (GAP-REASONING-REPLAY)',
      'agent:no second request was sent',
    ])
  })

  it('drives round 2 of the reasoning probe once the first reply is handed over, and records where it stops', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        agent: input =>
          input.scenario === 'reasoning'
            ? agentDouble({ parts: () => [...replyParts('reply without reasoning')] })(input)
            : original(input),
      }),
    )
    expect(kindAt(observed, 'H12')).toBe('disconnected')
    expect(evidenceAt(observed, 'H12')).toContain('agent:the reasoning reply was handed over')
    expect(evidenceAt(observed, 'H12')).toContain('round 2: session-startRun:run-active')
  })

  it('cannot carry a sealed reasoning_state part through the scripted Model producer of #683', async () => {
    const refusals: string[] = []
    const original = agentDouble()
    await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: input =>
          input.scenario === 'reasoning'
            ? agentDouble({
                parts: () => reasoningStateParts(),
                onSettleRefused: reason => refusals.push(reason),
              })(input)
            : original(input),
      }),
    )
    expect(refusals).toEqual(['invalid-script'])
  })

  it('does not probe H13 on a store that keeps the Agent Journal outside the Session log', async () => {
    const observed = await runFirstTenantPath(pathDependencies())
    expect(observed.H13).toEqual({
      kind: 'disconnected',
      evidence: [
        'agent-journal:this store keeps the Agent Journal outside the Session log, so it does not probe H13 (GAP-SESSION-LOG-TARGETS)',
      ],
    })
  })

  it('finds no Model reception targets on the same-log provider of session-adapters/testing (GAP-SESSION-LOG-TARGETS)', () => {
    // When #756's successor exposes the targets, this test turns red and the gap must be revisited.
    const backend = createMemorySessionJournal<PathPrincipal>({
      initialization: createMemoryInitializationSource(),
      accessCheck: sessionAccessCheckDouble(),
      authorize: () => 'allowed',
    })
    const access = memoryOtherAccess<PathPrincipal>('p', 'session-cs-first')
    const view = backend.forSession(access)
    expect('targets' in view).toBe(false)
    expect('targets' in view.controls).toBe(false)
    expect('targets' in backend).toBe(false)
  })

  it('does not take an invalid hand-over for the Agent taking the input unless Session says the input is not pending', async () => {
    const build = sessionAssembly('session-log')
    const observed = await runFirstTenantPath(
      pathDependencies(
        {
          session: input => {
            const assembly = build(input)
            const { transactions } = assembly
            return {
              ...assembly,
              transactions: {
                ...transactions,
                commit: (async (request: Parameters<typeof transactions.commit>[0]) => {
                  const committed = await transactions.commit(request)
                  return request.command.kind === 'receive' && 'failure' in committed
                    ? {
                        failure: { kind: 'invalid', field: 'fact.execution', reason: 'other' },
                      }
                    : committed
                }) as typeof transactions.commit,
              },
            }
          },
        },
        'session-log',
      ),
    )
    expect(kindAt(observed, 'H04')).toBe('refused')
    expect(evidenceAt(observed, 'H04')).toContain(
      'session-contract:commit(receive input-handover) invalid',
    )
  })

  it('does not take a terminal Run of another execution for the same execution in H13', async () => {
    const build = sessionAssembly('session-log')
    const observed = await runFirstTenantPath(
      pathDependencies(
        {
          session: input => {
            const assembly = build(input)
            const { transactions } = assembly
            return {
              ...assembly,
              transactions: {
                ...transactions,
                readWork: async access => {
                  const work = await transactions.readWork(access)
                  if ('failure' in work || work.ok.run.kind !== 'active') return work
                  // A RunId is minted by Session only; this one names a Run the path never started.
                  const terminal = {
                    run: 'run_cs-another' as RunId,
                    outcome: 'completed' as const,
                    evidence: { owner: 'cs-test', record: 'terminal', revision: '1', digest: 'x' },
                  }
                  return { ok: { ...work.ok, run: { kind: 'terminal' as const, terminal } } }
                },
              },
            }
          },
        },
        'session-log',
      ),
    )
    expect(kindAt(observed, 'H13')).toBe('disconnected')
    expect(evidenceAt(observed, 'H13')).toContain(
      'session-contract:readWork binds the Run to another execution',
    )
  })

  it('reads the Agent records from the Session log of #756, and stops at H06 without reception targets', async () => {
    const observed = await runFirstTenantPath(pathDependencies({}, 'session-log'))
    for (const hop of ['H01', 'H02', 'H03', 'H04', 'H05', 'H13'] as const)
      expect(kindAt(observed, hop)).toBe('connected')
    expect(evidenceAt(observed, 'H13')).toContain(
      'session-contract:readWork binds the Run to the same execution',
    )
    expect(evidenceAt(observed, 'H13')).toContain(
      'session-contract:history carries the hand-over or batch-taken entry of the execution',
    )
    expect(kindAt(observed, 'H06')).not.toBe('connected')
    expect(evidenceAt(observed, 'H06')).toContain('agent:journal has no received Model result')
    for (const hop of ['H07', 'H08', 'H09'] as const)
      expect(kindAt(observed, hop)).not.toBe('connected')
  })

  it('declares the realization of every row a hop crosses', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    for (const hop of report.hops) {
      expect(hop.rows.length).toBeGreaterThan(0)
      expect(hop.realization.map(row => row.row)).toEqual([...hop.rows])
      for (const row of hop.realization) expect(row.realization).not.toBe('undeclared')
    }
    const rowOf = (path: PathReport, hopId: string, row: string) =>
      path.hops.find(hop => hop.hopId === hopId)?.realization.find(item => item.row === row)
    // The Agent runtime runs over its test dependencies; the agent-host-local plugin is not loaded.
    expect(rowOf(report, 'H04', 'agent-host')?.realization).toBe('double')
    expect(rowOf(report, 'H06', 'model-host')?.realization).toBe('double')
    expect(rowOf(report, 'H05', 'request-context')?.realization).toBe('double')
    // The default store has no same-log participant; the Session log store of #756 does.
    expect(rowOf(report, 'H07', 'session-ad01')?.realization).toBe('absent')
    const sessionLog = await runContractSkeleton(skeletonInputs({}, 'session-log'))
    expect(rowOf(sessionLog, 'H07', 'session-ad01')?.realization).toBe('double')
    // H11 needs the observation of the server entry to stay continuous after reassembly.
    expect(report.hops.find(hop => hop.hopId === 'H11')?.rows).toContain('server-entry')
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
  expect(kindAt(observed, 'H06')).not.toBe('connected')
  expect(evidenceAt(observed, 'H06')).toContain('agent:journal has no received Model result')
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
    expect(kindAt(observed, 'H06')).not.toBe('connected')
    expect(evidenceAt(observed, 'H06')).toContain(
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
  expect(kindAt(observed, 'H06')).toBe('connected')
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
  expect(kindAt(observed, 'H06')).not.toBe('connected')
  expect(evidenceAt(observed, 'H06')).toContain('agent:no reply of the journal Model call')
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
  expect(kindAt(observed, 'H06')).not.toBe('connected')
})
