import { sessionEpochOf } from './history-epoch.ts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
  Access,
  AgentExecutionId,
  CompactionInputStore,
  DurableEvidence,
  Failure,
  Reply,
} from '@omne-harness/agent-contract'
import { decodeAgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionAccessCheck, SessionId } from '@omne-harness/session-contract'
import {
  decodeExecutionRecordBlob,
  executionRecordBlobFacts,
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_COMPACTION_INPUT_CHECK_HANDLER,
  SESSION_ENTRY_MESSAGE_HANDLER,
  SESSION_READ_PROTOCOL,
} from '@omne-harness/session-storage-sql/participants'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import {
  commitJournal,
  refusalFailure,
  standingOf,
  type JournalCombination,
} from '../journal-commit.ts'
import { createSessionCompactionInputs } from '../compaction-inputs.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from '../testing/canonical.ts'
import { readOutput } from './journal-read.ts'

export type SessionCompactionInputsOptions<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  sessionAccessCheck: SessionAccessCheck<P>
  combination: JournalCombination
  sessionOf(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<SessionId>
}>

const OWNER = '@omne-harness/session-adapters/compaction-inputs'
const VERSION = 'session/compaction-input/1'
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const sourceRecord = z.tuple([z.literal(VERSION), z.string(), z.string(), z.string(), digest])
const rootSchema = z
  .object({
    schema: z.literal(VERSION),
    tenant: z.string(),
    session: z.string(),
    execution: z.string(),
    preparation: z.string(),
    manifest: digest,
    originals: z.array(z.object({ digest, entry: z.string() }).strict()),
  })
  .strict()
const entryMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), message: z.unknown() }).strict(),
  z.object({ kind: z.literal('changed') }).strict(),
  z.object({ kind: z.literal('absent') }).strict(),
])
const hash = (payload: string) => `sha256:${createHash('sha256').update(payload).digest('hex')}`
const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})
const invalid = (reason: string): Failure => ({
  kind: 'invalid',
  field: 'compaction-input',
  reason,
})
const denied = (): Failure => ({ kind: 'denied', action: 'read-compaction-input' })

type Scope = Readonly<{ tenant: string; session: SessionId; domain: DomainRef }>

async function scopeOf<P>(
  options: SessionCompactionInputsOptions<P>,
  input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
): Reply<Scope> {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail(denied())
  const session = await options.sessionOf(input)
  if ('failure' in session) return session
  try {
    const allowed = await options.sessionAccessCheck.check({
      access: input,
      operation: 'history.readModelView',
      target: { kind: 'session', session: session.ok },
    })
    if (allowed.kind === 'denied') return fail(denied())
    if (allowed.kind === 'unavailable') return fail(unavailable(allowed.diagnostic))
    const domain = await options.tenantDomainLookup.lookup({ tenant: tenant.value })
    if (domain.kind !== 'ready')
      return fail(
        unavailable(
          domain.kind === 'unregistered'
            ? 'the tenant has no transaction domain'
            : domain.diagnostic,
        ),
      )
    return succeed({ tenant: tenant.value, session: session.ok, domain: domain.domain })
  } catch {
    return fail(unavailable('the input access or domain check threw'))
  }
}

async function blob(storage: SqlStorage, scope: Scope, wanted: string): Reply<string> {
  const result = await readOutput(storage, {
    domain: scope.domain,
    handler: EXECUTION_RECORD_HANDLERS.blob,
    protocol: EXECUTION_RECORD_PROTOCOL,
    input: { tenant: scope.tenant, digest: wanted },
  })
  if (result.kind === 'unread') return fail(unavailable(result.reason))
  const decoded = decodeExecutionRecordBlob(result.output)
  if (decoded === null) return fail(unavailable('the frozen input body is missing'))
  if (decoded.kind === 'denied') return fail(denied())
  if (decoded.digest !== wanted || hash(decoded.payload) !== wanted)
    return fail(invalid('the frozen input body digest differs'))
  return succeed(decoded.payload)
}

async function original(
  storage: SqlStorage,
  scope: Scope,
  entry: string,
  frozenEpoch: string,
  wanted: string,
): Reply<string> {
  const result = await readOutput(storage, {
    domain: scope.domain,
    handler: SESSION_ENTRY_MESSAGE_HANDLER,
    protocol: SESSION_READ_PROTOCOL,
    input: { tenant: scope.tenant, session: scope.session, entry, epoch: null, frozenEpoch },
  })
  if (result.kind === 'unread') return fail(unavailable(result.reason))
  const decoded = entryMessageSchema.safeParse(result.output)
  if (!decoded.success) return fail(invalid('the history entry response does not decode'))
  if (decoded.data.kind === 'changed') return fail({ kind: 'changed' })
  if (decoded.data.kind === 'absent')
    return fail(unavailable('the original history message is missing'))
  const payload = canonical(decoded.data.message)
  return hash(payload) === wanted
    ? succeed(payload)
    : fail(invalid('the original history message differs'))
}

async function boundSource<P>(
  options: SessionCompactionInputsOptions<P>,
  input: Access<P> & Readonly<{ source: DurableEvidence }>,
) {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) return fail(denied())
  let raw: unknown
  try {
    raw = JSON.parse(input.source.record)
  } catch {
    return fail(invalid('invalid source record'))
  }
  const record = sourceRecord.safeParse(raw)
  if (!record.success || input.source.owner !== OWNER || input.source.revision !== '1')
    return fail(invalid('unknown input source'))
  const [, recordedTenant, executionText, session, rootDigest] = record.data
  if (recordedTenant !== tenant.value) return fail(denied())
  if (rootDigest !== input.source.digest) return fail(invalid('source digest differs'))
  const execution = decodeAgentExecutionId(executionText)
  if ('failure' in execution) return fail(invalid('invalid execution identity'))
  const scope = await scopeOf(options, { ...input, execution: execution.ok })
  if ('failure' in scope) return scope
  if (scope.ok.session !== session) return fail(denied())
  const body = await blob(options.storage, scope.ok, rootDigest)
  if ('failure' in body) return body
  let root: unknown
  try {
    root = JSON.parse(body.ok)
  } catch {
    return fail(invalid('invalid source body'))
  }
  const parsed = rootSchema.safeParse(root)
  if (
    !parsed.success ||
    parsed.data.tenant !== recordedTenant ||
    parsed.data.session !== session ||
    parsed.data.execution !== executionText
  )
    return fail(invalid('source ownership differs'))
  return succeed({
    scope: scope.ok,
    manifest: parsed.data.manifest,
    originals: parsed.data.originals,
  })
}

export function createSqlCompactionInputs<P>(
  options: SessionCompactionInputsOptions<P>,
): CompactionInputStore<P> {
  const generations = new Map<string, number>()

  return createSessionCompactionInputs({
    async publish(input) {
      const scope = await scopeOf(options, input)
      if ('failure' in scope) return scope
      const manifest = input.blobs.find(body => body.digest === input.manifest)
      if (manifest === undefined) return fail(invalid('the frozen input manifest is missing'))
      const history = z
        .object({ history: z.object({ epoch: z.string() }).passthrough() })
        .safeParse(JSON.parse(manifest.payload))
      if (!history.success) return fail(invalid('invalid input manifest'))
      const check = await readOutput(options.storage, {
        domain: scope.ok.domain,
        handler: SESSION_COMPACTION_INPUT_CHECK_HANDLER,
        protocol: SESSION_READ_PROTOCOL,
        input: {
          tenant: scope.ok.tenant,
          session: scope.ok.session,
          history: {
            ...history.data.history,
            epoch: sessionEpochOf(history.data.history.epoch),
          } as JsonValue,
        },
      })
      if (check.kind === 'unread') return fail(unavailable(check.reason))
      const checked = z
        .object({
          kind: z.enum(['verified', 'changed', 'invalid', 'unavailable']),
          reason: z.string().optional(),
        })
        .safeParse(check.output)
      if (!checked.success) return fail(invalid('invalid history validation response'))
      if (checked.data.kind === 'changed') return fail({ kind: 'changed' })
      if (checked.data.kind === 'invalid')
        return fail(invalid(checked.data.reason ?? 'the history differs'))
      if (checked.data.kind !== 'verified')
        return fail(unavailable('the current history evidence is unavailable'))
      const originals: { digest: string; entry: string }[] = []
      for (const body of input.blobs) {
        if (body.history === undefined) continue
        originals.push({ digest: body.digest, entry: body.history.entry })
      }
      const payload = canonical({
        schema: VERSION,
        tenant: scope.ok.tenant,
        session: scope.ok.session,
        execution: input.execution,
        preparation: input.preparation,
        manifest: input.manifest,
        originals,
      })
      const rootDigest = hash(payload)
      const source = {
        owner: OWNER,
        record: JSON.stringify([
          VERSION,
          scope.ok.tenant,
          input.execution,
          scope.ok.session,
          rootDigest,
        ]),
        revision: '1',
        digest: rootDigest,
      }
      const operation = `compaction-input:${rootDigest}`
      const commands = [
        executionRecordBlobFacts({
          tenant: input.tenant,
          blobs: [
            ...input.blobs.filter(body => body.history === undefined),
            { digest: rootDigest, payload },
          ].map(body => ({
            digest: body.digest,
            payload: body.payload,
            media: 'application/json',
          })),
        }),
      ]
      let result
      try {
        result = await commitJournal({
          storage: options.storage,
          domain: scope.ok.domain,
          combination: options.combination,
          operation,
          recall: undefined,
          commands,
          generations,
        })
      } catch {
        return fail(unavailable('publication outcome is unknown; retain the original input'))
      }
      if (result.kind === 'committed') return succeed(source)
      if (result.kind === 'unknown') {
        const standing = await standingOf(
          options.storage,
          scope.ok.domain,
          operation,
          result.attempt,
          undefined,
        )
        return standing === 'committed'
          ? succeed(source)
          : fail(unavailable('publication is not yet established under the original operation'))
      }
      if (result.kind === 'refused') return fail(refusalFailure(result.reason))
      return fail(
        unavailable(
          result.kind === 'rolled-back' ? 'input publication rolled back' : result.diagnostic,
        ),
      )
    },
    async open(input) {
      const source = await boundSource(options, input)
      if ('failure' in source) return source
      const manifest = await blob(options.storage, source.ok.scope, source.ok.manifest)
      if ('failure' in manifest) return manifest
      const history = z
        .object({ history: z.object({ epoch: z.string() }) })
        .safeParse(JSON.parse(manifest.ok))
      if (!history.success) return fail(invalid('invalid frozen history epoch'))
      const epoch = sessionEpochOf(history.data.history.epoch)
      const originals = new Map(source.ok.originals.map(body => [body.digest, body.entry]))
      return succeed({
        manifest: manifest.ok,
        read: (digest: string) => {
          const entry = originals.get(digest)
          return entry === undefined
            ? blob(options.storage, source.ok.scope, digest)
            : original(options.storage, source.ok.scope, entry, epoch, digest)
        },
      })
    },
  })
}
