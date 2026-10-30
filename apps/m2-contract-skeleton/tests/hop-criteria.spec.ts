// The connection criterion of each hop, seen as its callers see it: the kind of the observation
// and the evidence labels that name the step where a hop stopped. The cases inject the failure at
// the public entry that owns it, through the doubles of first-path-doubles.ts.
import { describe, expect, it } from 'vitest'
import {
  evidenceOf,
  NOT_REACHED,
  runFirstTenantPath,
  type FirstPathHop,
  type FirstPathObservation,
  type PathAgent,
  type PathDependencies,
} from '../src/path.ts'
import {
  agentDouble,
  agentWithoutAdmission,
  assembleWithoutAssistantRows,
  closingRuns,
  pathDependencies,
  replyParts,
  requests,
  sessionClosingRuns,
  sessionWithEarlierInput,
  wrappedSession,
} from './first-path-doubles.ts'

const kindAt = (observed: FirstPathObservation, hop: FirstPathHop) =>
  (observed[hop] ?? NOT_REACHED).kind
const evidenceAt = (observed: FirstPathObservation, hop: FirstPathHop) =>
  evidenceOf(observed[hop] ?? NOT_REACHED)
const AFTER_H03 = ['H04', 'H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const

describe('H03, the creation of a session', () => {
  it('names every step of the connected creation, in order', async () => {
    const observed = await runFirstTenantPath(pathDependencies({ replyTurns: 50 }))
    expect(observed.H03).toEqual({
      kind: 'connected',
      evidence: [
        'public-contract:create-session request read with the acting tenant',
        'session-contract:commit(create) committed for the identity tenant',
        'public-contract:create-session response read with the wire session',
        'session-contract:readWork returns the session',
      ],
    })
  })

  it('refuses the hop with the failure kind when readWork fails after the create committed', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: wrappedSession(({ transactions }) => ({
          ...transactions,
          readWork: async () => ({
            failure: { kind: 'unavailable', owner: 'cs-test', diagnostic: 'private' },
          }),
        })),
      }),
    )
    expect(observed.H03).toEqual({ kind: 'refused', evidence: ['session-readWork:unavailable'] })
    for (const hop of AFTER_H03) expect(observed[hop]).toBeUndefined()
  })

  it('disconnects the hop when readWork returns another session', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: wrappedSession(({ transactions }) => ({
          ...transactions,
          readWork: async access => {
            const work = await transactions.readWork(access)
            return 'failure' in work
              ? work
              : { ok: { ...work.ok, session: 'session-cs-another' as typeof work.ok.session } }
          },
        })),
      }),
    )
    expect(observed.H03).toEqual({
      kind: 'disconnected',
      evidence: ['session-contract:readWork returns another session'],
    })
    for (const hop of AFTER_H03) expect(observed[hop]).toBeUndefined()
  })
})

describe('H04, the hand-over of the first input', () => {
  it('names every step of the connected hand-over, in order', async () => {
    const observed = await runFirstTenantPath(pathDependencies({ replyTurns: 50 }))
    expect(observed.H04).toEqual({
      kind: 'connected',
      evidence: [
        'public-contract:send-input request read with the wire session',
        'session-contract:commit(accept ordinary) committed the request',
        'session-contract:commit(startRun) fixed the request and opened the Run',
        'agent:runtime.invoke accepted the Session execution and input',
        'agent:message hand-over admitted the external input',
        'session-contract:commit(receive input-handover) committed after the Agent accepted the invoke',
      ],
    })
  })

  it('disconnects the hop when Session fixed an earlier input for the Run', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionWithEarlierInput('session-cs-first'),
        agent: agentWithoutAdmission(agentDouble()),
        replyTurns: 50,
      }),
    )
    expect(kindAt(observed, 'H04')).toBe('disconnected')
    expect(evidenceAt(observed, 'H04')).toContain(
      'session-contract:commit(startRun) fixed another input',
    )
    expect(evidenceAt(observed, 'H04')).not.toContain(
      'session-contract:commit(startRun) fixed the request and opened the Run',
    )
    for (const hop of ['H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const)
      expect(observed[hop]).toBeUndefined()
  })

  it('disconnects the hop when the Agent never asked the hand-over to admit the input', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({ agent: agentWithoutAdmission(agentDouble()), replyTurns: 50 }),
    )
    expect(kindAt(observed, 'H04')).toBe('disconnected')
    expect(evidenceAt(observed, 'H04')).toContain(
      'agent:message hand-over did not admit the external input',
    )
    expect(evidenceAt(observed, 'H04')).toContain(
      'session-contract:commit(startRun) fixed the request and opened the Run',
    )
    expect(evidenceAt(observed, 'H04')).not.toContain(
      'agent:message hand-over admitted the external input',
    )
    for (const hop of ['H05', 'H06', 'H07', 'H08', 'H09', 'H10', 'H11', 'H12', 'H13'] as const)
      expect(observed[hop]).toBeUndefined()
  })
})

describe('a probe that stops in its own session names the step that stopped it', () => {
  it('keeps the refusal of the create commit of the probe session', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: wrappedSession(({ transactions }) => ({
          ...transactions,
          commit: (async (input: Parameters<typeof transactions.commit>[0]) =>
            input.command.kind === 'create' && String(input.access.session) === 'session-cs-tool'
              ? { failure: { kind: 'conflict', operation: input.command.input.operation } }
              : transactions.commit(input)) as typeof transactions.commit,
        })),
        replyTurns: 50,
      }),
    )
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(observed.H10).toEqual({
      kind: 'refused',
      evidence: ['probe-tool:session-create:conflict'],
    })
    expect(kindAt(observed, 'H11')).toBe('refused')
  })

  it('keeps the disconnection of a probe session that reads back another session', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: wrappedSession(({ transactions }) => ({
          ...transactions,
          readWork: async access => {
            const work = await transactions.readWork(access)
            return 'failure' in work || String(access.session) !== 'session-cs-tool'
              ? work
              : { ok: { ...work.ok, session: 'session-cs-another' as typeof work.ok.session } }
          },
        })),
        replyTurns: 50,
      }),
    )
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(observed.H10).toEqual({
      kind: 'disconnected',
      evidence: ['probe-tool:session-contract:readWork returns another session'],
    })
  })

  it('names the earlier input that the Run of the probe fixed', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        session: sessionWithEarlierInput('session-cs-tool'),
        agent: agentWithoutAdmission(agentDouble(), 'tool-call'),
        replyTurns: 50,
      }),
    )
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(observed.H10).toEqual({
      kind: 'disconnected',
      evidence: ['probe-tool:session-contract:commit(startRun) fixed another input'],
    })
  })

  it('names the missing admission of the external input', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        agent: agentWithoutAdmission(agentDouble(), 'tool-call'),
        replyTurns: 50,
      }),
    )
    expect(kindAt(observed, 'H07')).toBe('connected')
    expect(observed.H10).toEqual({
      kind: 'disconnected',
      evidence: ['probe-tool:agent:message hand-over did not admit the external input'],
    })
  })

  it('stops each probe with its own label when the first request is no longer supplied', async () => {
    const supplied = requests()
    let reads = 0
    const shrinking = [...supplied]
    Object.defineProperty(shrinking, 0, {
      get: () => (++reads === 1 ? supplied[0] : undefined),
    })
    const observed = await runFirstTenantPath(pathDependencies({ requests: shrinking }))
    expect(kindAt(observed, 'H07')).toBe('connected')
    for (const [hop, probe] of [
      ['H10', 'tool'],
      ['H11', 'reassembly'],
      ['H12', 'reasoning'],
    ] as const)
      expect(observed[hop]).toEqual({
        kind: 'disconnected',
        evidence: [`probe-${probe}:no request`],
      })
  })
})

/** The Agent of the main rounds with its own scripted replies; the probes keep their scripts. */
function mainAgent(
  parts: (ordinal: number) => ReturnType<typeof replyParts> | null,
): PathDependencies['agent'] {
  const original = agentDouble()
  const scripted = agentDouble({ parts: (_scenario, ordinal) => parts(ordinal) })
  return input => (input.scenario === 'reply' ? scripted(input) : original(input))
}

describe('H09, the later rounds of the main session', () => {
  const later = (overrides: Partial<PathDependencies>) =>
    runFirstTenantPath(
      pathDependencies({
        session: sessionClosingRuns(),
        assemble: assembleWithoutAssistantRows,
        ...overrides,
      }),
    )

  it('connects when every round replied', async () => {
    const observed = await later({ replyTurns: 50 })
    expect(observed.H09).toEqual({
      kind: 'connected',
      evidence: [
        'session-contract:3 of 3 rounds replied',
        'round 2: Run started, Agent replied, reply recorded',
        'round 3: Run started, Agent replied, reply recorded',
      ],
    })
    expect(kindAt(observed, 'H08')).toBe('connected')
  })

  it('disconnects with the wait that timed out when a round gets no reply', async () => {
    const observed = await later({
      replyTurns: 50,
      agent: mainAgent(ordinal => (ordinal === 0 ? replyParts('first reply') : null)),
    })
    expect(observed.H09).toEqual({
      kind: 'disconnected',
      evidence: [
        'session-contract:1 of 3 rounds replied',
        'round 2: agent:no reply within 50 event-loop turns',
      ],
    })
  })

  it('disconnects with the bridge failure when the reply of a round is not recorded', async () => {
    let recorded = 0
    const observed = await later({
      replyTurns: 50,
      session: wrappedSession(assembly => {
        const closing = closingRuns(assembly)
        return {
          ...closing,
          commit: (async (input: Parameters<typeof closing.commit>[0]) =>
            input.command.kind === 'recordMessage' && (recorded += 1) === 2
              ? { failure: { kind: 'conflict', operation: input.command.input.operation } }
              : closing.commit(input)) as typeof closing.commit,
        }
      }),
    })
    expect(observed.H09).toEqual({
      kind: 'disconnected',
      evidence: [
        'session-contract:1 of 3 rounds replied',
        'round 2: bridge:session-recordMessage:conflict',
      ],
    })
  })
})

/** The Agent of the reassembly probe, changed by `change`; the other probes and rounds stay. */
function reassemblyAgent(change: (agent: PathAgent) => PathAgent): PathDependencies['agent'] {
  const original = agentDouble()
  return async input => {
    const agent = await original(input)
    return input.scenario === 'held' ? change(agent) : agent
  }
}

describe('H11, the reassembly probe', () => {
  it('names the wait for a Model call that was not admitted', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: reassemblyAgent(agent => ({ ...agent, admitted: () => 0 })),
      }),
    )
    expect(kindAt(observed, 'H11')).not.toBe('connected')
    expect(evidenceAt(observed, 'H11')).toContain(
      'caller-reported: Model admissions 0 after the Model settled',
    )
    expect(evidenceAt(observed, 'H11')).toContain(
      'agent:the Model admitted no call within 50 event-loop turns',
    )
  })

  it('does not name a timeout of the admission wait when the Model admitted the call', async () => {
    const observed = await runFirstTenantPath(pathDependencies({ replyTurns: 50 }))
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('admitted no call')
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('no reply within')
  })

  it('names the journal state where the execution stopped when the reply never came', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: reassemblyAgent(agent => ({ ...agent, releaseModel: () => {} })),
      }),
    )
    expect(evidenceAt(observed, 'H11')).toContain(
      'agent:journal state waiting at M6 after the Model settled',
    )
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('execution ended')
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('original driver')
  })

  it('names an unread journal when the journal cannot be loaded', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        agent: reassemblyAgent(agent => ({
          ...agent,
          journal: {
            ...agent.journal,
            load: async () =>
              ({ failure: { kind: 'unavailable', diagnostic: 'private' } }) as Awaited<
                ReturnType<typeof agent.journal.load>
              >,
          },
        })),
      }),
    )
    expect(kindAt(observed, 'H11')).not.toBe('connected')
    expect(evidenceAt(observed, 'H11')).toContain('agent:journal unread after the Model settled')
    expect(evidenceAt(observed, 'H11').join(' ')).not.toContain('execution ended')
  })
})

describe('H12, the reasoning probe', () => {
  it('drives round 2 on the same Agent once the first reply is handed over', async () => {
    const original = agentDouble()
    const observed = await runFirstTenantPath(
      pathDependencies({
        replyTurns: 50,
        session: sessionClosingRuns(),
        assemble: assembleWithoutAssistantRows,
        agent: input =>
          input.scenario === 'reasoning'
            ? agentDouble({ parts: () => [...replyParts('reply without reasoning')] })(input)
            : original(input),
      }),
    )
    expect(kindAt(observed, 'H12')).toBe('disconnected')
    expect(evidenceAt(observed, 'H12')).toContain('agent:the reasoning reply was handed over')
    expect(evidenceAt(observed, 'H12')).not.toContain('agent:no reply within 50 event-loop turns')
    expect(evidenceAt(observed, 'H12').at(-1)).toBe(
      'agent:the second request does not carry the reasoning part',
    )
    expect(evidenceAt(observed, 'H12').join(' ')).not.toContain('round 2:')
  })
})
