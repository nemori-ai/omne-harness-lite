// The public Model stream on the release tree (#1214): the login principal of the logged-in person,
// the stable reference of the newest main Model call read back from the session log, and the two
// public stream services. No vitest import: the demonstration script uses this file too.
//
// The login principal is made the way the entry makes it for each request: the saved login proof
// is recognized by `identityOperations`, and the trusted issuer issues an acting-for-tenant
// principal with the `identity-login` work relation. The call reference is read the way the session
// contract tells an outside reader to read it (`session-contract` SPEC「稳定调用引用的读取」): the
// `reader` history face, backward over `call.bound`, the first entry whose kind is `model` and whose
// purpose is `main`. A registration has two stored shapes (flat and registered), both are read.
import type { Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { writeJsonText } from '@omne-harness/json-text'
import { identityOperationsKey } from '@omne-harness/identity/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { loginStateCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelInvocationRef } from '@omne-harness/model-contract'
import type { ModelStreamObservation, ModelStreamReferences } from '@omne-harness/model-contract'
import {
  modelStreamObservationKey,
  modelStreamReferencesKey,
} from '@omne-harness/model-cordis-contract/cordis'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv } from '../../src/types.ts'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { savedLoginProof, savedTenant } from '../r9/support.ts'

/** The issuer component of the entry: the login principal of a request names it as its actor. */
const ENTRY_COMPONENT = 'server-entry'
const LOGIN_WORK_OWNER = 'identity-login'
const PAGE_BYTES = 65_536

export type LoginAccess = Readonly<{ principal: ActingForTenantPrincipal; tenant: TenantId }>

/** The saved tenant of the CLI home, parsed. */
export function tenantOf(home: string): TenantId {
  const parsed = tenantCodec.parse(savedTenant(home))
  if (!parsed.ok) throw new Error('the saved tenant does not parse')
  return parsed.value
}

/** The login principal of the logged-in person of `home`, as the entry issues it for a request. */
export async function loginAccess(
  tree: Readonly<{ scope: Context; env: EntryEnv; home: string }>,
): Promise<LoginAccess> {
  const identity = tree.scope.get(identityOperationsKey)
  if (identity === undefined) throw new Error('no identityOperations on the release tree')
  const recognized = await identity.recognizeLogin({ loginProof: savedLoginProof(tree.home) })
  if (recognized.kind !== 'recognized') throw new Error(`login recognition: ${recognized.kind}`)
  const login = loginStateCodec.encode(recognized.login)
  if (!login.ok) throw new Error('the login state does not encode')
  const issuer = tree.env.readTrusted(principalIssuerKey).get(principalIssuerKey) as
    | PrincipalIssuer
    | undefined
  if (issuer === undefined) throw new Error('no principal issuer')
  const actor = issuer.issueSystem({ component: ENTRY_COMPONENT })
  if ('failure' in actor) throw new Error('the entry actor was not issued')
  const tenant = tenantOf(tree.home)
  const principal = issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: LOGIN_WORK_OWNER, work: login.value },
  })
  if ('failure' in principal) throw new Error('the login principal was not issued')
  return { principal: principal.ok as ActingForTenantPrincipal, tenant }
}

type Payload = Readonly<Record<string, unknown>>

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Payload)[key] : undefined

/** Kind, reference and purpose of a `call.bound` payload (as plain JSON), from either stored shape. */
export function registrationOf(
  payload: unknown,
): Readonly<{ kind: unknown; reference: unknown; purpose: unknown }> {
  const registration = field(payload, 'registration')
  const binding = field(registration, 'binding')
  const producer = field(binding, 'producer')
  return {
    kind: field(payload, 'kind') ?? field(producer, 'kind'),
    reference: field(payload, 'reference') ?? field(producer, 'call'),
    purpose:
      field(payload, 'purpose') ??
      field(registration, 'purpose') ??
      field(field(binding, 'consumer'), 'purpose'),
  }
}

/**
 * The reference of the newest main Model call of `session`, read as `access` through the reader
 * history face; null when the session log has none yet. A failed read throws with its failure.
 */
export async function newestMainCall(
  scope: Context,
  access: LoginAccess,
  session: string,
): Promise<ModelInvocationRef | null> {
  const service = scope.intercept(sessionKey, { caller: 'reader' }).get(sessionKey) as
    | SessionService
    | undefined
  if (service === undefined) throw new Error('no Session service')
  const at = { ...access, session: session as SessionId }
  let page = await service.history.begin({
    ...at,
    kinds: ['call.bound'],
    from: null,
    direction: 'backward',
    pageBytes: PAGE_BYTES,
  })
  for (;;) {
    if ('failure' in page) throw new Error(`history: ${JSON.stringify(page.failure)}`)
    for (const entry of page.ok.entries) {
      const found = registrationOf(JSON.parse(writeJsonText(entry.payload)))
      if (found.kind === 'model' && found.purpose === 'main' && typeof found.reference === 'string')
        return found.reference as ModelInvocationRef
    }
    if (page.ok.exhausted || page.ok.next === null) return null
    page = await service.history.next({ ...at, cursor: page.ok.next })
  }
}

/** The two public stream services of the release tree, or undefined for each that is absent. */
export function publicStream(scope: Context): Readonly<{
  references: ModelStreamReferences<unknown> | undefined
  observation: ModelStreamObservation<unknown> | undefined
}> {
  return {
    references: scope.get(modelStreamReferencesKey) as ModelStreamReferences<unknown> | undefined,
    observation: scope.get(modelStreamObservationKey) as
      | ModelStreamObservation<unknown>
      | undefined,
  }
}

const sse = (events: readonly unknown[]): string =>
  `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`

/** A gateway script that answers every request at once with the assistant text `text`. */
export function textAnswer(text: string): GatewayScript {
  return ({ body }) => ({
    status: 200,
    contentType: 'text/event-stream',
    body: sse([
      {
        model: (JSON.parse(body) as { model?: string }).model ?? 'm',
        provider: 'OpenAI',
        choices: [{ delta: { content: text } }],
      },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]),
  })
}
