import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionPrincipalBindingSource,
  SessionWorkPrincipals,
} from '@omne-harness/session-contract'
import {
  SessionWorkPrincipalsService,
  sessionPrincipalBindingsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { sessionWorkIssuerOf, type SessionWorkIssue } from './principals.ts'

type Unavailable = Extract<SessionFailure, { kind: 'unavailable' }>
type WorkFailure = Extract<SessionFailure, { kind: 'denied' | 'unavailable' | 'quarantined' }>
type ForSession = SessionWorkPrincipals<Principal>['forSession']
type ForSessionInput = Parameters<ForSession>[0]
type BindingReading = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>

export type SessionWorkPrincipalsOptions = Readonly<{
  issue: SessionWorkIssue
  readBindings: () => SessionPrincipalBindingSource | undefined
}>

const BINDINGS = 'sessionPrincipalBindings'
const DENIED_ACTION = 'sessionWorkPrincipals.forSession'

const unavailable = (owner: string, diagnostic: string): Unavailable => ({
  kind: 'unavailable',
  owner,
  diagnostic,
})

function readSource(
  readBindings: SessionWorkPrincipalsOptions['readBindings'],
): Outcome<SessionPrincipalBindingSource, WorkFailure> {
  let source: SessionPrincipalBindingSource | undefined
  try {
    source = readBindings()
  } catch {
    return fail(unavailable(BINDINGS, 'the session principal bindings read port is not reachable'))
  }
  if (source === undefined)
    return fail(unavailable(BINDINGS, 'the session principal bindings read port is not provided'))
  return succeed(source)
}

async function readBinding(
  source: SessionPrincipalBindingSource,
  input: ForSessionInput,
): Promise<BindingReading> {
  try {
    return await source.read({ tenant: input.tenant, session: input.session })
  } catch {
    return fail(
      unavailable(
        BINDINGS,
        'the session principal bindings read threw; its message is not reported',
      ),
    )
  }
}

export function createSessionWorkPrincipals(
  options: SessionWorkPrincipalsOptions,
): SessionWorkPrincipals<Principal> {
  const forSession: ForSession = async input => {
    const source = readSource(options.readBindings)
    if ('failure' in source) return source
    const reading = await readBinding(source.ok, input)
    if ('failure' in reading) return reading
    const binding = reading.ok
    if (binding.kind === 'not-bound') return fail({ kind: 'denied', action: DENIED_ACTION })
    if (!tenantEquals(binding.tenant, input.tenant) || binding.session !== input.session)
      return fail({
        kind: 'quarantined',
        diagnostic: 'the session principal binding names another tenant or session',
      })
    const issued = options.issue({ tenant: input.tenant, session: input.session })
    if ('failure' in issued)
      return fail(
        unavailable(
          'identity',
          `the principal issuer refused the work principal (${issued.failure.field}: ${issued.failure.reason})`,
        ),
      )
    return succeed(issued.ok)
  }
  return Object.freeze({ forSession })
}

class EntrySessionWorkPrincipals extends SessionWorkPrincipalsService<Principal> {
  readonly forSession: ForSession
  constructor(ctx: Context, work: SessionWorkPrincipals<Principal>) {
    super(ctx)
    this.forSession = input => work.forSession(input)
  }
}

function bindingsReader(env: EntryEnv): SessionWorkPrincipalsOptions['readBindings'] {
  return () => {
    const source: SessionPrincipalBindingSource | undefined = env
      .readTrusted(sessionPrincipalBindingsKey)
      .get(sessionPrincipalBindingsKey)
    return source
  }
}

export const sessionWorkPrincipals: EntryObjectModule = {
  name: sessionWorkPrincipalsKey,
  implementation: 'real',
  install(scope, env) {
    const work = createSessionWorkPrincipals({
      issue: sessionWorkIssuerOf(env),
      readBindings: bindingsReader(env),
    })
    new EntrySessionWorkPrincipals(scope, work)
  },
}
