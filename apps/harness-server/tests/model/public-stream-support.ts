// The public Model stream on the release tree (#1214): the login principal of the logged-in person,
// the stable reference of the newest main Model call read back from the session log, the two public
// stream services, a gateway answer that keeps the stream open until the test lets it go, a second
// person in another tenant, and the Model calls as the Model storage holds them (only to name a call
// before the session log does, for the measurement). No vitest import: the demonstration script
// uses this file too.
//
// The login principal is made the way the entry makes it for each request: the saved login proof
// is recognized by `identityOperations`, and the trusted issuer issues an acting-for-tenant
// principal with the `identity-login` work relation. The call reference is read the way the session
// contract tells an outside reader to read it (`session-contract` SPEC「稳定调用引用的读取」): the
// `reader` history face, backward over `call.bound`, the first entry whose kind is `model` and whose
// purpose is `main`. A registration has two stored shapes (flat and registered), both are read.
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Context } from '@deepseek-ai/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { identityOperationsKey } from '@omne-harness/identity/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { loginStateCodec, tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  type ModelInvocationRef,
  type ModelRuntime,
  type ModelStreamObservation,
  type ModelStreamReferences,
} from '@omne-harness/model-contract'
import {
  modelRuntimeKey,
  modelStreamObservationKey,
  modelStreamReferencesKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { readCallRegistration, type SessionId } from '@omne-harness/session-contract'
import { sessionKey, type SessionService } from '@omne-harness/session-cordis-contract/cordis'
import type { EntryEnv } from '../../src/types.ts'
import type { GatewayScript } from '../fixtures/model-gateway.ts'
import { runOmne, savedLoginProof, savedTenant } from '../r9/support.ts'

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

/**
 * The login principal of the person logged in through the CLI home `home` (the tree's own by
 * default), as the entry issues it for a request.
 */
export async function loginAccess(
  tree: Readonly<{ scope: Context; env: EntryEnv; home: string }>,
  home: string = tree.home,
): Promise<LoginAccess> {
  const identity = tree.scope.get(identityOperationsKey)
  if (identity === undefined) throw new Error('no identityOperations on the release tree')
  const recognized = await identity.recognizeLogin({ loginProof: savedLoginProof(home) })
  if (recognized.kind !== 'recognized') throw new Error(`login recognition: ${recognized.kind}`)
  const login = loginStateCodec.encode(recognized.login)
  if (!login.ok) throw new Error('the login state does not encode')
  const issuer = tree.env.readTrusted(principalIssuerKey).get(principalIssuerKey) as
    | PrincipalIssuer
    | undefined
  if (issuer === undefined) throw new Error('no principal issuer')
  const actor = issuer.issueSystem({ component: ENTRY_COMPONENT })
  if ('failure' in actor) throw new Error('the entry actor was not issued')
  const tenant = tenantOf(home)
  const principal = issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: LOGIN_WORK_OWNER, work: login.value },
  })
  if ('failure' in principal) throw new Error('the login principal was not issued')
  return { principal: principal.ok as ActingForTenantPrincipal, tenant }
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
      const found = readCallRegistration(entry.payload)
      if (found?.kind === 'model' && found.purpose === 'main' && found.reference !== null)
        return found.reference as ModelInvocationRef
    }
    if (page.ok.exhausted || page.ok.next === null) return null
    page = await service.history.next({ ...at, cursor: page.ok.next })
  }
}

/**
 * Registers and logs in another person through the CLI in a home of its own: a tenant of its own.
 * Answers the home, for `loginAccess`.
 */
export async function anotherPerson(
  tree: Readonly<{ port: number; home: string }>,
  name: string,
): Promise<string> {
  const home = join(tree.home, '..', `home-${name}`)
  mkdirSync(home, { recursive: true })
  const credential = `${name}-pw-public-stream-5d1e`
  const cli = (args: readonly string[]) =>
    runOmne({
      args: [...args],
      home,
      server: `http://127.0.0.1:${String(tree.port)}`,
      cwd: join(tree.home, '..'),
      credential,
    })
  for (const command of ['register', 'login']) {
    const done = await cli([command, '--login-identifier', name])
    if (done.status !== 0) throw new Error(`${command} ${name}: ${done.stderr}`)
  }
  return home
}

/** A reference of the same form as a real one that names no call of any tenant. */
export function absentReference(tenant: TenantId): ModelInvocationRef {
  const call = decodeModelCallId('mcall_public-stream-absent')
  const admission = decodeModelOperationId('mop_public-stream-absent')
  if ('failure' in call || 'failure' in admission) throw new Error('the absent ids do not decode')
  const reference = encodeModelInvocationRef({ tenant, call: call.ok, admission: admission.ok })
  if ('failure' in reference) throw new Error('the absent reference does not encode')
  return reference.ok
}

/** The Model calls of `tenant` as the Model storage under `storageRoot` holds them, read only. */
export function storedCalls(
  storageRoot: string,
  tenant: TenantId,
): readonly Readonly<{ call: string; reference: ModelInvocationRef }>[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(sqlite|db)$/.test(entry.name)) files.push(path)
    }
  }
  walk(storageRoot)
  const found: { call: string; reference: ModelInvocationRef }[] = []
  for (const file of files) {
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      const table = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'md_call'`)
        .get()
      if (table === undefined) continue
      for (const row of db.prepare('SELECT call, admission FROM md_call').all()) {
        const call = decodeModelCallId(String(row['call']))
        const admission = decodeModelOperationId(String(row['admission']))
        if ('failure' in call || 'failure' in admission) continue
        const reference = encodeModelInvocationRef({
          tenant,
          call: call.ok,
          admission: admission.ok,
        })
        if ('ok' in reference) found.push({ call: call.ok, reference: reference.ok })
      }
    } finally {
      db.close()
    }
  }
  return found
}

/** The Model runtime of the release tree. */
export function modelRuntime(scope: Context): ModelRuntime<unknown> {
  const runtime = scope.get(modelRuntimeKey) as ModelRuntime<unknown> | undefined
  if (runtime === undefined) throw new Error('modelRuntime is not installed')
  return runtime
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

/**
 * A gateway script whose every answer streams `first`, then holds the stream open until `release()`.
 * `release()` lets the held answers go on with `rest` and the end; when no answer is held yet (the
 * Model request has not reached the gateway), the next answer is not held at all. So a release does
 * not depend on whether it comes before or after the request.
 */
export function heldAnswer(
  first: string,
  rest: string,
): Readonly<{ script: GatewayScript; held(): number; release(): void }> {
  const waiting: (() => void)[] = []
  let releaseNext = false
  const script: GatewayScript = ({ body }) => {
    const serving = {
      model: (JSON.parse(body) as { model?: string }).model ?? 'm',
      provider: 'OpenAI',
    }
    const head = `data: ${JSON.stringify({ ...serving, choices: [{ delta: { content: first } }] })}\n\n`
    const tail = sse([
      { choices: [{ delta: { content: rest } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ])
    if (releaseNext) {
      releaseNext = false
      return { status: 200, contentType: 'text/event-stream', body: head + tail }
    }
    return {
      status: 200,
      contentType: 'text/event-stream',
      body: head,
      rest: { after: new Promise<void>(resolve => waiting.push(resolve)), body: tail },
    }
  }
  return {
    script,
    held: () => waiting.length,
    release() {
      if (waiting.length === 0) releaseNext = true
      for (const resolve of waiting.splice(0)) resolve()
    },
  }
}

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
