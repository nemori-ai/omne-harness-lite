// The connected first tenant path over the `./testing` doubles: the happy path reaches every hop,
// and each failure stops at the hop that owns it without faking the later ones.
import { describe, expect, it } from 'vitest'
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
  identityDouble,
  loginGateEvidence,
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
    const memory = createMemorySessionEvidenceBridge()
    memory.controls.unavailable(true)
    const observed = await runFirstTenantPath(
      pathDependencies({ evidence: loginGateEvidence(memory) }),
    )
    expect(observed.H03).toEqual({ connected: false, evidence: ['session-create:unavailable'] })
    expect(observed.H04.connected).toBe(false)
  })

  // Enabled after the #536 head whose `decide` checks the login gate on `startRun` is merged.
  it.todo(
    'refuses startRun with login-required when the evidence bridge gives no login-entry guard',
  )

  it('does not claim a Model result, reply or history entry when the Model never settles', async () => {
    const observed = await runFirstTenantPath(
      pathDependencies({ agent: agentDouble({ reply: null }), replyTurns: 50 }),
    )
    expect(observed.H04.connected).toBe(true)
    for (const hop of ['H05', 'H06', 'H07', 'H08'] as const)
      expect(observed[hop].connected).toBe(false)
    expect(observed.H08.evidence.join(' ')).toContain('has no assistant message')
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

  it('keeps the path incomplete on the blocking H06 gap and reports no message body', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    expect(report.checksPassed).toBe(true)
    expect(report.gaps).toEqual(['H06'])
    expect(report.fullPath).toBe('incomplete')
    const text = JSON.stringify(report)
    expect(text).not.toContain(REPLY_TEXT)
    expect(text).not.toContain('hello, first request')
  })
})
