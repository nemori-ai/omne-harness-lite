import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { JsonValue } from '@omne-harness/json-text'
import {
  accountCodec,
  accountEquals,
  organizationCodec,
  tenant,
  tenantCodec,
  type AccountId,
  type TenantId,
} from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  HistoryEntry,
  HistoryPage,
  SessionFailure,
  SessionHistory,
} from '@omne-harness/session-contract'
import { createSessionDiagnosticsContribution } from '../../src/contribution.ts'
import type {
  DiagnosticsPrincipals,
  SessionDiagnosticsFaces,
  SessionDiagnosticsSettings,
} from '../../src/ports.ts'
import type { DiagnosticPorts } from '../../src/session-view/index.ts'

export const KINDS = ['run.started', 'run.terminal', 'call.bound', 'message.user']

const adoption = { owner: 'fixture', name: 'thing', revision: '1', digest: 'sha256:thing' }
export const evidence = (record: string) => ({
  owner: 'fixture',
  record,
  revision: '1',
  digest: 'd',
})

function tree(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: tree(item) })),
  }
}

function entry(id: string, kind: string, payload: unknown): HistoryEntry {
  return {
    id: id as never,
    revision: '1' as never,
    kind,
    schema: adoption,
    payload: tree(payload),
    origin: { owner: 'session', via: null, source: evidence(id) },
  }
}

export const runEntries = (run: string, at: number): HistoryEntry[] => [
  entry(`e${at}`, 'run.started', {
    run,
    execution: `exec-${run}`,
    entry: 'interactive',
    first: 'in',
    predecessor: null,
    adoption,
  }),
  entry(`e${at + 1}`, 'call.bound', {
    consumption: `c${at}`,
    binding: {
      producer: { kind: 'model', call: 'mc' },
      action: 'a',
      consumer: { owner: 'agent', id: 'x' },
      request: evidence('r'),
      initiatingAttempt: null,
    },
    reference: `m-${run}`,
    purpose: 'main',
    kind: 'model',
  }),
  entry(`e${at + 2}`, 'run.terminal', {
    terminal: { run, outcome: 'failed', evidence: evidence('t') },
    sequence: null,
    cause: evidence('model-refused'),
    disposition: null,
    bounded: null,
  }),
]

export type FixtureLogin = Readonly<{
  account: AccountId
  loginText: string
  tenant: TenantId
  tenantText: string
}>

function parsed<T>(result: { ok: true; value: T } | { ok: false }, text: string): T {
  if (!result.ok) throw new Error(`fixture ${text} did not parse`)
  return result.value
}

const BODY = 'abcdefghjkmnpqrstvwxyz2345'

export function fixtureLogin(letter: string): FixtureLogin {
  const suffix = `${letter}${BODY.slice(1)}`
  const account = parsed(accountCodec.parse(`acc_${suffix}`), suffix)
  const organization = parsed(organizationCodec.parse(`org_${suffix}`), suffix)
  const minted = tenant(organization, account)
  const tenantText = tenantCodec.encode(minted)
  if (!tenantText.ok) throw new Error('fixture tenant did not encode')
  return { account, loginText: `login-${letter}`, tenant: minted, tenantText: tenantText.value }
}

export const loginIdentity = (login: FixtureLogin): LoginIdentity =>
  login as unknown as LoginIdentity

export type Refusal = 'denied' | 'basis-unavailable' | 'throw'

export type WorldOptions = Readonly<{
  settings?: Partial<SessionDiagnosticsSettings>
  ports?: boolean
  faces?: boolean
}>

export function createWorld(options: WorldOptions = {}) {
  const authority = inProcessPrincipalAuthority()
  const system = authority.issuer.issueSystem({ component: 'diagnostics-fixture' })
  if ('failure' in system) throw new Error('fixture system principal not issued')
  const members = new Set<string>()
  const sessions = new Map<string, string>()
  const entries: HistoryEntry[] = []
  const begins: unknown[] = []
  const calls: string[] = []
  const principalAsks: string[] = []
  const refusals = new Map<number, Refusal>()
  let upper = '7'
  let writes = 0
  let throwOnBegin = false
  let failure: SessionFailure | undefined

  const principals: DiagnosticsPrincipals = {
    async actingFor(login, tenantText) {
      const ask = principalAsks.length
      principalAsks.push(tenantText)
      const refusal = refusals.get(ask)
      if (refusal === 'throw') throw new Error('identity fault')
      if (refusal !== undefined) return { refused: refusal }
      const caller = login as unknown as FixtureLogin
      const target = tenantCodec.parse(tenantText)
      if (!target.ok || !accountEquals(target.value.account, caller.account))
        return { refused: 'denied' }
      members.add(tenantText)
      const issued = authority.issuer.issueActingForTenant({
        actor: system.ok,
        tenant: target.value,
        work: { owner: 'identity-login', work: caller.loginText },
      })
      if ('failure' in issued) throw new Error('fixture principal not issued')
      return { ok: issued.ok as unknown as Principal }
    },
  }

  const denied: SessionFailure = { kind: 'denied', action: 'history' }
  const page = (from: string | null): HistoryPage => {
    const end = from === null ? entries.length : entries.findIndex(item => item.id === from)
    return {
      source: 'double',
      interpreter: adoption,
      upper: upper as never,
      entries: entries.slice(0, end).reverse(),
      scannedThrough: 'pos:0',
      next: null,
      exhausted: true,
      annotations: [],
    }
  }
  const eligible = (input: { tenant: TenantId; session: string }) => {
    const text = tenantCodec.encode(input.tenant)
    return text.ok && members.has(text.value) && sessions.get(input.session) === text.value
  }
  const history: Pick<SessionHistory<Principal>, 'begin' | 'next'> = {
    async begin(input) {
      calls.push('history.begin')
      if (throwOnBegin) throw new Error('read lost')
      begins.push({
        kinds: input.kinds,
        from: input.from,
        direction: input.direction,
        pageBytes: input.pageBytes,
      })
      if (failure !== undefined) return fail(failure)
      if (!eligible(input)) return fail(denied)
      return succeed(page(input.from))
    },
    async next() {
      calls.push('history.next')
      return fail({ kind: 'invalid', field: 'cursor', reason: 'not expected' })
    },
  }

  const ports: DiagnosticPorts<Principal> =
    options.ports === false
      ? {}
      : {
          modelCalls: {
            inspect: async () => succeed({ kind: 'not-accepted', operation: 'op' }),
            dispatches: async () => {
              writes += 1
              return fail({ kind: 'denied', action: 'dispatches' })
            },
          } as never,
          modelDiagnostics: { list: async () => fail({ kind: 'denied', action: 'list' }) } as never,
          toolQueries: {
            lookup: async () => fail({ kind: 'denied', action: 'lookup' }),
            account: async () => fail({ kind: 'denied', action: 'account' }),
            readDiagnostics: async () => fail({ kind: 'denied', action: 'diagnostics' }),
          } as never,
          agentJournal: {
            readFinish: async () =>
              succeed({
                candidate: 'f1',
                conclusion: { kind: 'fail', cause: evidence('c') },
                inputWatermark: evidence('w'),
                obligations: null,
                beforeTerminal: null,
                failure: {
                  kind: 'model-refused',
                  call: 'mc',
                  failure: { kind: 'denied', action: 'admit' },
                  step: null,
                  at: '0',
                  source: evidence('f'),
                },
              }),
          } as never,
        }

  const faces: SessionDiagnosticsFaces = { history, ports }
  let present = options.faces !== false
  const settings: SessionDiagnosticsSettings = {
    maxPageBytes: 4096,
    diagnosticsKinds: KINDS,
    maxRuns: 1,
    maxCallsPerRun: 4,
    ...options.settings,
  }
  const currentFaces = () => (present ? faces : undefined)
  const contribution = createSessionDiagnosticsContribution({
    faces: currentFaces,
    principals,
    settings,
  })
  const handler = contribution.operations['read-session-diagnostics']
  const signal = new AbortController().signal

  return {
    principals,
    currentFaces,
    entries,
    begins,
    calls,
    principalAsks,
    writes: () => writes,
    addSession(login: FixtureLogin, session: string) {
      members.add(login.tenantText)
      sessions.set(session, login.tenantText)
    },
    forgetMembers: () => members.clear(),
    refuseAsk(ask: number, refusal: Refusal) {
      refusals.set(ask, refusal)
    },
    setUpper(next: string) {
      upper = next
    },
    failHistory(next: SessionFailure) {
      failure = next
    },
    throwOnBegin() {
      throwOnBegin = true
    },
    removeFaces() {
      present = false
    },
    read(login: FixtureLogin, body: Parameters<typeof handler>[1]) {
      return handler({ principal: loginIdentity(login), messageId: 'm-1', signal }, body)
    },
  }
}

export type World = ReturnType<typeof createWorld>
