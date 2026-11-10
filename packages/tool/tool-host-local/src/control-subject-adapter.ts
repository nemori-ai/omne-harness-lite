import { tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  hostKey,
  isTenantShape,
  type AccessVerdict,
  type LedgerDomain,
  type LedgerRecordRead,
  type ToolAccessGuard,
  type ToolControlSubjects,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import {
  decodeToolCallId,
  type DurableEvidence,
  type Reply,
  type ToolCallId,
  type ToolFailure,
  type ToolRevision,
} from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { callHostDomain } from './host-domains.ts'

type TenantId = LedgerDomain['tenant']

/** A projection issued only after the identity owner verifies the current principal. */
export type LocalToolControlSubject = Readonly<{
  tenant: TenantId
  kind: 'acting-for-tenant'
  actor: Readonly<{ component: 'sessionWorkPrincipals' }>
  work: Readonly<{ owner: 'session'; work: string }>
}>

export type LocalToolControlSubjectsInput<P> = Readonly<{
  store: ToolLedgerStore
  project(principal: P): Reply<LocalToolControlSubject>
  resolveSessionWork(input: Readonly<{ tenant: TenantId; session: string }>): Reply<P>
  qualify: ToolAccessGuard<P>['qualify']
  commitAttempts: number
}>

type Context = Readonly<{ tenant: TenantId; call: ToolCallId }>
type SubjectBody = Readonly<{
  kind: 'control-subject'
  schema: 1
  tenant: readonly [string, string]
  call: ToolCallId
  subject: Readonly<{
    kind: 'acting-for-tenant'
    actor: Readonly<{ component: 'sessionWorkPrincipals' }>
    work: Readonly<{ owner: 'session'; work: string }>
  }>
}>
type Binding = SubjectBody & Readonly<{ evidence: DurableEvidence }>
const OWNER = '@omne-harness/tool-host-local'
const PREFIX = 'control-subjects:'
const UNAVAILABLE = 'the original controller association or its current authority is unavailable'
const denied = () => fail({ kind: 'denied', action: 'control' } as const)
const unavailable = () =>
  fail({
    kind: 'unavailable',
    dependency: 'control-subjects',
    diagnostic: UNAVAILABLE,
  } as const)

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

/** Freeze the scope before any asynchronous dependency can observe the caller's object. */
function fixContext(input: Context): Outcome<Context, ToolFailure> {
  const { tenant, call } = input
  if (!isTenantShape(tenant) || !tenantEquals(tenant, tenant)) return denied()
  const decoded = decodeToolCallId(call)
  return 'failure' in decoded ? denied() : succeed(Object.freeze({ tenant, call: decoded.ok }))
}

function subjectValue(value: unknown): SubjectBody['subject'] | null {
  if (!isRecord(value) || value.kind !== 'acting-for-tenant') return null
  const { actor, work } = value
  if (
    !isRecord(actor) ||
    !hasKeys(actor, ['component']) ||
    actor.component !== 'sessionWorkPrincipals'
  )
    return null
  if (!isRecord(work) || !hasKeys(work, ['owner', 'work']) || work.owner !== 'session') return null
  if (typeof work.work !== 'string' || work.work.length === 0) return null
  return Object.freeze({
    kind: 'acting-for-tenant',
    actor: Object.freeze({ component: 'sessionWorkPrincipals' }),
    work: Object.freeze({ owner: 'session', work: work.work }),
  })
}

function bodyOf(context: Context, subject: SubjectBody['subject']): SubjectBody {
  return {
    kind: 'control-subject',
    schema: 1,
    tenant: [context.tenant.organization.text, context.tenant.account.text],
    call: context.call,
    subject,
  }
}

function keyOf(body: SubjectBody): string {
  return `subject:${canonicalDigest([
    ...body.tenant,
    body.call,
    body.subject.kind,
    body.subject.actor.component,
    body.subject.work.owner,
    body.subject.work.work,
  ])}`
}

function evidenceOf(body: SubjectBody, revision: string): DurableEvidence {
  return Object.freeze({
    owner: OWNER,
    record: `${PREFIX}${JSON.stringify([...body.tenant, body.call, keyOf(body)])}`,
    revision,
    digest: canonicalDigest(body),
  })
}

function parseEvidence(value: unknown): DurableEvidence | null {
  if (!isRecord(value) || !hasKeys(value, ['owner', 'record', 'revision', 'digest'])) return null
  const { owner, record, revision, digest } = value
  if (owner !== OWNER || typeof record !== 'string' || !record.startsWith(PREFIX)) return null
  if (typeof revision !== 'string' || !/^[1-9][0-9]*$/u.test(revision)) return null
  if ('failure' in decodeToolRevision(revision)) return null
  if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(digest)) return null
  return Object.freeze({ owner, record, revision, digest })
}

function referenceKey(context: Context, evidence: DurableEvidence): string | null {
  const parts: unknown = JSON.parse(evidence.record.slice(PREFIX.length))
  if (!Array.isArray(parts) || parts.length !== 4) return null
  const [organization, account, call, key]: unknown[] = parts
  if (
    organization !== context.tenant.organization.text ||
    account !== context.tenant.account.text ||
    call !== context.call
  )
    return null
  return typeof key === 'string' && /^subject:sha256:[0-9a-f]{64}$/u.test(key) ? key : null
}

/** The stored body and its first evidence are checked together, including the original key. */
function parseBinding(value: unknown, context: Context, key: string): Binding | null {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['kind', 'schema', 'tenant', 'call', 'subject', 'evidence'])
  )
    return null
  if (value.kind !== 'control-subject' || value.schema !== 1) return null
  const subject = subjectValue(value.subject)
  const evidence = parseEvidence(value.evidence)
  if (subject === null || evidence === null) return null
  const body = bodyOf(context, subject)
  if (
    keyOf(body) !== key ||
    canonicalDigest(evidenceOf(body, evidence.revision)) !== canonicalDigest(evidence)
  )
    return null
  const binding = { ...body, evidence }
  return canonicalDigest(binding) === canonicalDigest(value) ? binding : null
}

function failureVerdict(failure: ToolFailure): AccessVerdict {
  return failure.kind === 'denied'
    ? { kind: 'denied', reason: 'controller-binding-mismatch' }
    : { kind: 'unavailable', diagnostic: UNAVAILABLE }
}

/** Callback failures keep denial distinct; unsupported or malformed answers fail closed. */
function callbackReply<T>(value: Outcome<T, ToolFailure>): Outcome<T, ToolFailure> {
  const raw: unknown = value
  if (!isRecord(raw)) return unavailable()
  if (hasKeys(raw, ['ok']) && 'ok' in value) return succeed(value.ok)
  if (hasKeys(raw, ['failure']) && isRecord(raw.failure)) {
    if (raw.failure.kind === 'denied' && typeof raw.failure.action === 'string') return denied()
  }
  return unavailable()
}

async function guarded<T>(ask: () => Promise<Outcome<T, ToolFailure>>): Reply<T> {
  try {
    return await ask()
  } catch {
    return unavailable()
  }
}

/** The store owns durability. Missing callbacks disable their operations, never authorize them. */
export function createLocalToolControlSubjects<P>(
  input: LocalToolControlSubjectsInput<P>,
): ToolControlSubjects<P> {
  const { store, project, resolveSessionWork, qualify, commitAttempts } = input
  if (!Number.isSafeInteger(commitAttempts) || commitAttempts <= 0)
    throw new TypeError('commitAttempts: range')

  /** The controller associations of one call live in that call's `control@<call>` host domain. */
  const domain = (context: Context): LedgerDomain =>
    callHostDomain(context.tenant, 'control', context.call)

  const projectBody = async (context: Context, principal: P): Reply<SubjectBody> => {
    const projected = callbackReply(await project(principal))
    if ('failure' in projected) return projected
    const value = projected.ok
    if (!isRecord(value) || !hasKeys(value, ['tenant', 'kind', 'actor', 'work']))
      return unavailable()
    if (!isTenantShape(value.tenant) || !tenantEquals(value.tenant, value.tenant))
      return unavailable()
    if (!tenantEquals(context.tenant, value.tenant)) return denied()
    if (
      isRecord(value.actor) &&
      typeof value.actor.component === 'string' &&
      value.actor.component !== 'sessionWorkPrincipals'
    )
      return denied()
    if (
      isRecord(value.work) &&
      typeof value.work.owner === 'string' &&
      value.work.owner !== 'session'
    )
      return denied()
    const subject = subjectValue(value)
    return subject === null ? unavailable() : succeed(bodyOf(context, subject))
  }

  const currentQualification = async (context: Context, principal: P): Reply<null> => {
    const verdict = await qualify({ ...context, principal, action: 'control' })
    if (!isRecord(verdict)) return unavailable()
    if (verdict.kind === 'allowed' && hasKeys(verdict, ['kind'])) return succeed(null)
    if (verdict.kind === 'denied' && typeof verdict.reason === 'string') return denied()
    return unavailable()
  }

  type BindingRead = Readonly<{ revision: ToolRevision; binding: Binding | null }>

  /** The association stored under `key` for this call, by key, with its domain revision. */
  const readBinding = async (context: Context, key: string): Reply<BindingRead> => {
    let read: LedgerRecordRead
    try {
      read = await store.readRecord(domain(context), hostKey(key))
    } catch {
      return unavailable()
    }
    if (read.kind !== 'complete' || !/^(0|[1-9][0-9]*)$/u.test(read.revision)) return unavailable()
    const revision = decodeToolRevision(read.revision)
    if ('failure' in revision) return unavailable()
    const record = read.record
    if (record === null) return succeed({ revision: revision.ok, binding: null })
    if (record.kind !== 'host') return unavailable()
    const binding = parseBinding(record.host.value, context, key)
    if (binding === null || BigInt(binding.evidence.revision) > BigInt(read.revision))
      return unavailable()
    return succeed({ revision: revision.ok, binding })
  }

  const recall = async (context: Context, body: SubjectBody): Reply<DurableEvidence> => {
    const read = await readBinding(context, keyOf(body))
    if ('failure' in read) return read
    const binding = read.ok.binding
    return binding === null || canonicalDigest(body) !== binding.evidence.digest
      ? unavailable()
      : succeed(binding.evidence)
  }

  const persist = async (context: Context, body: SubjectBody): Reply<DurableEvidence> => {
    const key = keyOf(body)
    for (let attempt = 0; attempt < commitAttempts; attempt += 1) {
      const read = await readBinding(context, key)
      if ('failure' in read) return read
      const known = read.ok.binding
      if (known !== null)
        return known.evidence.digest === canonicalDigest(body)
          ? succeed(known.evidence)
          : unavailable()
      const revision = decodeToolRevision(String(BigInt(read.ok.revision) + 1n))
      if ('failure' in revision) return unavailable()
      const evidence = evidenceOf(body, revision.ok)
      let committed: Awaited<ReturnType<typeof store.commit>>
      try {
        committed = await store.commit({
          domain: domain(context),
          expected: read.ok.revision,
          revision: revision.ok,
          writes: [
            { kind: 'put', record: { kind: 'host', host: { key, value: { ...body, evidence } } } },
          ],
        })
      } catch {
        return recall(context, body)
      }
      if (committed.kind === 'committed') return succeed(evidence)
      if (committed.kind === 'unknown') return recall(context, body)
      if (committed.kind === 'rejected')
        return fail({ kind: 'invalid', field: 'storage', reason: committed.reason })
      if (committed.kind !== 'conflict') return unavailable()
    }
    // The final losing commit can still have an identical winner to recall.
    return recall(context, body)
  }

  const load = async (context: Context, reference: DurableEvidence): Reply<Binding> => {
    const evidence = parseEvidence(reference)
    if (evidence === null) return denied()
    let key: string | null
    try {
      key = referenceKey(context, evidence)
    } catch {
      return denied()
    }
    if (key === null) return denied()
    const read = await readBinding(context, key)
    if ('failure' in read) return read
    const binding = read.ok.binding
    if (binding === null) return unavailable()
    return canonicalDigest(evidence) === canonicalDigest(binding.evidence)
      ? succeed(binding)
      : denied()
  }

  return Object.freeze({
    capture: input =>
      guarded(async () => {
        const context = fixContext(input)
        const principal = input.principal
        if ('failure' in context) return context
        const body = await projectBody(context.ok, principal)
        if ('failure' in body) return body
        const current = await currentQualification(context.ok, principal)
        return 'failure' in current ? current : persist(context.ok, body.ok)
      }),
    matches: async input => {
      const result = await guarded(async () => {
        const context = fixContext(input)
        const principal = input.principal
        const subject = parseEvidence(input.subject)
        if ('failure' in context) return context
        if (subject === null) return denied()
        const body = await projectBody(context.ok, principal)
        if ('failure' in body) return body
        const binding = await load(context.ok, subject)
        if ('failure' in binding) return binding
        return canonicalDigest(body.ok) === binding.ok.evidence.digest ? succeed(null) : denied()
      })
      return 'failure' in result ? failureVerdict(result.failure) : { kind: 'allowed' }
    },
    qualify: async input => {
      const result = await guarded(async () => {
        const context = fixContext(input)
        const subject = parseEvidence(input.subject)
        if ('failure' in context) return context
        if (subject === null) return denied()
        const binding = await load(context.ok, subject)
        if ('failure' in binding) return binding
        const resolved = callbackReply(
          await resolveSessionWork({
            tenant: context.ok.tenant,
            session: binding.ok.subject.work.work,
          }),
        )
        if ('failure' in resolved) return resolved
        const body = await projectBody(context.ok, resolved.ok)
        if ('failure' in body) return body
        if (canonicalDigest(body.ok) !== binding.ok.evidence.digest) return denied()
        return currentQualification(context.ok, resolved.ok)
      })
      return 'failure' in result ? failureVerdict(result.failure) : { kind: 'allowed' }
    },
  } satisfies ToolControlSubjects<P>)
}
