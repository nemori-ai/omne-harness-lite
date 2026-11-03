import { detailPageSchema } from './detail-metadata.ts'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import {
  ScheduleOwnerSchema,
  ScheduleIdSchema,
  type ScheduleView,
} from '@omne-harness/schedule-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  resolveToolInvocationRef,
  type InvocationAccess,
  type Reply,
  type ResultPage,
  type ToolFailure,
  type ToolInvocationQueries,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  decodeToolInvocationRef,
  decodeToolResultVersion,
  defaultResultPolicy,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import type { ToolHostAccess } from '@omne-harness/tool-host-local'
import { scheduleToolResultIdentity } from './author.ts'
import {
  evidenceSchema,
  toolIdentitySchema,
  scheduleToolResultSchema,
  scheduleToolAdoption,
  same,
  digest,
  canonical,
  nativeJson,
  jsonTree,
  freeze,
  resultLimits,
  invalid,
  unavailable,
  type ScheduleToolResult,
} from './protocol.ts'

export const scheduleToolDetailRefSchema = z.strictObject({
  authority: z.string().min(1),
  invocation: toolIdentitySchema(decodeToolInvocationRef),
  result: toolIdentitySchema(decodeToolResultVersion),
  projection: z.literal('full'),
})
export type ScheduleToolDetailRef = z.infer<typeof scheduleToolDetailRefSchema>
const observationSchema = z.strictObject({
  reference: scheduleToolDetailRefSchema,
  revision: z.string().min(1),
  resultDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  owner: ScheduleOwnerSchema,
  scheduleIds: z.array(ScheduleIdSchema),
  source: evidenceSchema,
})
export type ScheduleToolDisclosureObservation = z.infer<typeof observationSchema>
export interface ScheduleToolDisclosurePolicy<P> {
  observe(
    input: Readonly<{ access: InvocationAccess<P>; reference: ScheduleToolDetailRef }>,
  ): Reply<ScheduleToolDisclosureObservation>
  confirm(
    input: Readonly<{ access: InvocationAccess<P>; observed: ScheduleToolDisclosureObservation }>,
  ): Reply<ScheduleToolDisclosureObservation>
  qualifyCall(
    input: Parameters<ToolHostAccess<P>['guard']['qualify']>[0],
  ): ReturnType<ToolHostAccess<P>['guard']['qualify']>
}
export type ScheduleToolDetailsConfiguration<P> = Readonly<{
  authority: string
  cursorKey: Uint8Array
  queries: Pick<ToolInvocationQueries<P, ToolMessageContentBlock>, 'readResult'>
  baseGuard: ToolHostAccess<P>['guard']
  disclosure: ScheduleToolDisclosurePolicy<P>
  limits: Readonly<{ maxBytes: number; timeoutMs: number }>
}>
type Page = ResultPage<ToolMessageContentBlock>
const cursorSchema = z.strictObject({
  reference: scheduleToolDetailRefSchema,
  baseline: z.string().regex(/^[a-f0-9]{64}$/u),
  resultDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  after: z.string().min(1),
  seen: z.array(z.string().min(1)),
  bytes: z.int().nonnegative(),
})
type Cursor = z.infer<typeof cursorSchema>
const verdictSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allowed') }),
  z.strictObject({ kind: z.literal('denied'), reason: z.string() }),
  z.strictObject({ kind: z.literal('unavailable'), diagnostic: z.string() }),
])
const protectedActions = new Set(['read-result', 'read-content', 'read-raw', 'read-raw-content'])
function guardFor<P>(
  base: ToolHostAccess<P>['guard'],
  disclosure: ScheduleToolDisclosurePolicy<P>,
): ToolHostAccess<P>['guard'] {
  return {
    async qualify(provided) {
      const input = Object.freeze({ ...provided })
      try {
        const baseVerdict = verdictSchema.parse(await base.qualify(Object.freeze({ ...input })))
        if (baseVerdict.kind !== 'allowed' || !protectedActions.has(input.action))
          return baseVerdict
        return verdictSchema.parse(await disclosure.qualifyCall(Object.freeze({ ...input })))
      } catch {
        return { kind: 'unavailable', diagnostic: 'schedule-disclosure-unavailable' }
      }
    },
  }
}
function normalized(value: unknown): ScheduleToolDisclosureObservation {
  const parsed = observationSchema.parse(value)
  return freeze({ ...parsed, scheduleIds: [...new Set(parsed.scheduleIds)].sort() })
}
function scopeMatches(
  value: ScheduleToolResult,
  observed: ScheduleToolDisclosureObservation,
): boolean {
  const ids = new Set<string>()
  let ownersMatch = true
  const owner = (candidate: ScheduleView['owner']) => {
    if (!same(candidate, observed.owner)) ownersMatch = false
  }
  const view = (candidate: ScheduleView) => {
    owner(candidate.owner)
    ids.add(candidate.scheduleId)
    if (candidate.predecessorId !== null) ids.add(candidate.predecessorId)
    if (candidate.successorId !== null) ids.add(candidate.successorId)
  }
  if (value.kind === 'result') {
    if (
      value.operation?.kind === 'identity' &&
      value.operation.identity.aggregate.kind === 'entity'
    )
      ids.add(value.operation.identity.aggregate.id)
    switch (value.action) {
      case 'create':
      case 'execute':
        if (value.result.kind === 'committed' || value.result.kind === 'noChange')
          view(value.result.value)
        break
      case 'queryOperation':
        if (value.result.kind === 'ok' && value.result.value.result !== null)
          view(value.result.value.result)
        break
      case 'get':
        if (value.result.kind === 'ok') view(value.result.value)
        break
      case 'list':
        if (value.result.kind === 'ok') value.result.value.items.forEach(view)
        break
      case 'revisions':
      case 'executions':
        if (value.result.kind === 'ok')
          value.result.value.items.forEach(row => ids.add(row.scheduleId))
        break
      case 'agenda':
        if (value.result.kind === 'ok')
          value.result.value.items.forEach(row => {
            ids.add(row.scheduleId)
            owner(row.owner)
          })
        break
      case 'preview':
        break
    }
  }
  return ownersMatch && same([...ids].sort(), observed.scheduleIds)
}
function baseline(page: Page): string {
  return digest({
    result: page.result,
    source: page.source,
    delivery: page.delivery,
    terminal: page.terminal,
    actualTerminal: page.actualTerminal,
    effect: page.effect,
    relation: page.relation,
    data: page.value.data,
    original: page.value.original,
    attachments: page.value.attachments,
  })
}
function checkPage(
  page: Page,
  reference: ScheduleToolDetailRef,
  observed: ScheduleToolDisclosureObservation,
): Outcome<Page, ToolFailure> {
  if (page.result !== reference.result || !detailPageSchema.safeParse(page).success)
    return fail(invalid('result', 'version-or-source-mismatch'))
  const judged = defaultResultPolicy.judgeResult(page.value)
  if ('failure' in judged) return fail(invalid('result', 'bad-result-shape'))
  if (
    page.value.data.kind !== 'json' ||
    !same(page.value.data.contract, scheduleToolAdoption) ||
    !same(page.value.data.schema, scheduleToolResultIdentity)
  )
    return fail(invalid('result', 'adoption-mismatch'))
  const parsed = scheduleToolResultSchema.safeParse(nativeJson(page.value.data.value))
  if (
    !parsed.success ||
    digest(parsed.data) !== observed.resultDigest ||
    !scopeMatches(parsed.data, observed)
  )
    return fail(invalid('result', 'digest-or-disclosure-mismatch'))
  try {
    jsonTree(parsed.data)
  } catch {
    return fail(unavailable('output_limit'))
  }
  if (page.next !== null && (typeof page.next !== 'string' || page.next.length === 0))
    return fail(invalid('result', 'bad-cursor'))
  return succeed(page)
}
function elapsedNow(): number {
  return /* wall-clock: operation-timing -- bounds provider reads, never business time */ performance.now()
}
async function bounded<T>(
  work: () => Promise<Outcome<T, ToolFailure>>,
  timeoutMs: number,
): Reply<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<Outcome<T, ToolFailure>>(resolve => {
        timer = setTimeout(() => resolve(fail(unavailable('deadline_exceeded'))), timeoutMs)
      }),
    ])
  } catch {
    return fail(unavailable('detail-provider-unavailable'))
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
function cursorCodec(key: Uint8Array) {
  if (!(key instanceof Uint8Array) || key.byteLength < 32)
    throw new TypeError('cursorKey must contain at least 32 bytes')
  const secret = Buffer.from(key)
  const sign = (text: string) => createHmac('sha256', secret).update(text).digest('hex')
  return {
    encode(value: Cursor): string {
      const text = Buffer.from(canonical(value)).toString('base64url')
      return `${text}.${sign(text)}`
    },
    decode(value: string): Cursor {
      if (value.length > resultLimits.maxBytes) throw new TypeError('cursor-limit')
      const [text, signature, extra] = value.split('.')
      if (
        text === undefined ||
        signature === undefined ||
        extra !== undefined ||
        !/^[a-f0-9]{64}$/u.test(signature) ||
        !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(text), 'hex'))
      )
        throw new TypeError('cursor-signature')
      return cursorSchema.parse(JSON.parse(Buffer.from(text, 'base64url').toString('utf8')))
    },
  }
}
export function createScheduleToolDetails<P>(configuration: ScheduleToolDetailsConfiguration<P>) {
  const authority = z.string().min(1).parse(configuration.authority)
  const limits = z
    .strictObject({
      maxBytes: z.int().min(1).max(resultLimits.maxBytes),
      timeoutMs: z.int().min(1).max(2_147_483_647),
    })
    .parse(configuration.limits)
  const {
    queries: suppliedQueries,
    disclosure: suppliedDisclosure,
    baseGuard: suppliedGuard,
  } = configuration
  const queries = Object.freeze({ readResult: suppliedQueries?.readResult?.bind(suppliedQueries) })
  const disclosure = Object.freeze({
    observe: suppliedDisclosure?.observe?.bind(suppliedDisclosure),
    confirm: suppliedDisclosure?.confirm?.bind(suppliedDisclosure),
    qualifyCall: suppliedDisclosure?.qualifyCall?.bind(suppliedDisclosure),
  })
  const baseGuard = Object.freeze({ qualify: suppliedGuard?.qualify?.bind(suppliedGuard) })
  if (
    typeof queries?.readResult !== 'function' ||
    typeof baseGuard?.qualify !== 'function' ||
    typeof disclosure?.observe !== 'function' ||
    typeof disclosure?.confirm !== 'function' ||
    typeof disclosure?.qualifyCall !== 'function'
  )
    throw new TypeError('Missing fixed-result host ports')
  const guard = guardFor(baseGuard, disclosure)
  const cursors = cursorCodec(configuration.cursorKey)
  const read = async (
    provided: Readonly<{
      access: InvocationAccess<P>
      reference: ScheduleToolDetailRef
      after: string | null
    }>,
  ): Reply<Page> => {
    const input = Object.freeze({ ...provided, access: Object.freeze({ ...provided.access }) })
    const parsed = scheduleToolDetailRefSchema.safeParse(input.reference)
    if (
      !parsed.success ||
      parsed.data.authority !== authority ||
      parsed.data.invocation !== input.access.reference
    )
      return fail(invalid('reference', 'authority-or-invocation-mismatch'))
    const reference = freeze(parsed.data)
    let cursor: Cursor | null = null
    if (input.after !== null) {
      try {
        cursor = cursors.decode(input.after)
      } catch {
        return fail({ kind: 'invalid-cursor', reason: 'malformed' })
      }
      if (!same(cursor.reference, reference))
        return fail({ kind: 'invalid-cursor', reason: 'reference-mismatch' })
    }
    const deadline = elapsedNow() + limits.timeoutMs
    const call = <T>(work: () => Promise<Outcome<T, ToolFailure>>): Reply<T> => {
      const remaining = deadline - elapsedNow()
      return remaining <= 0
        ? Promise.resolve(fail(unavailable('deadline_exceeded')))
        : bounded(work, remaining)
    }
    try {
      const invocation = resolveToolInvocationRef(reference.invocation, input.access.tenant)
      if ('failure' in invocation) return fail(invalid('reference', 'foreign-tenant'))
      const qualified = await call(async () => {
        const verdict = await guard.qualify({
          principal: input.access.principal,
          tenant: input.access.tenant,
          call: invocation.ok.call,
          action: 'read-result',
        })
        if (verdict.kind === 'allowed') return succeed(undefined)
        return fail(
          verdict.kind === 'denied'
            ? { kind: 'denied', action: 'read-result' }
            : unavailable(verdict.diagnostic),
        )
      })
      if ('failure' in qualified) return qualified
      const observation = await call(() =>
        disclosure.observe(
          Object.freeze({ access: Object.freeze({ ...input.access }), reference }),
        ),
      )
      if ('failure' in observation) return observation
      const observed = normalized(observation.ok)
      if (!same(observed.reference, reference))
        return fail(invalid('disclosure', 'reference-mismatch'))
      const first = await call(() =>
        queries.readResult(
          Object.freeze({ ...input.access, result: reference.result, after: null }),
        ),
      )
      if ('failure' in first) return first
      const firstPage = freeze(structuredClone(first.ok))
      const checked = checkPage(firstPage, reference, observed)
      if ('failure' in checked) return checked
      const original = baseline(firstPage)
      let page = firstPage
      let bytes = Buffer.byteLength(canonical(firstPage))
      if (bytes > limits.maxBytes) return fail(unavailable('output_limit'))
      if (cursor !== null) {
        if (cursor.baseline !== original || cursor.resultDigest !== observed.resultDigest)
          return fail({ kind: 'invalid-cursor', reason: 'fixed-result-mismatch' })
        const next = await call(() =>
          queries.readResult(
            Object.freeze({ ...input.access, result: reference.result, after: cursor.after }),
          ),
        )
        if ('failure' in next) return next
        const nextPage = freeze(structuredClone(next.ok))
        const nextChecked = checkPage(nextPage, reference, observed)
        if ('failure' in nextChecked) return nextChecked
        if (baseline(nextPage) !== original) return fail(invalid('result', 'page-metadata-drift'))
        page = nextPage
        bytes += cursor.bytes + Buffer.byteLength(canonical(page))
      }
      if (bytes > limits.maxBytes) return fail(unavailable('output_limit'))
      const seen = cursor === null ? [] : [...cursor.seen, cursor.after]
      if (page.next !== null && seen.includes(page.next))
        return fail({ kind: 'invalid-cursor', reason: 'provider-cursor-cycle' })
      const confirmation = await call(() =>
        disclosure.confirm(Object.freeze({ access: Object.freeze({ ...input.access }), observed })),
      )
      if ('failure' in confirmation) return confirmation
      if (!same(observed, normalized(confirmation.ok)))
        return fail(invalid('disclosure', 'changed'))
      if (elapsedNow() > deadline) return fail(unavailable('deadline_exceeded'))
      const next =
        page.next === null
          ? null
          : cursors.encode({
              reference,
              baseline: original,
              resultDigest: observed.resultDigest,
              after: page.next,
              seen,
              bytes,
            })
      return succeed(freeze({ ...structuredClone(page), next }))
    } catch {
      return fail(unavailable('detail-provider-unavailable'))
    }
  }
  return {
    guard,
    async reference(
      input: Readonly<{ access: InvocationAccess<P>; result: ToolResultVersion }>,
    ): Reply<ScheduleToolDetailRef> {
      const parsed = scheduleToolDetailRefSchema.safeParse({
        authority,
        invocation: input.access.reference,
        result: input.result,
        projection: 'full',
      })
      if (!parsed.success) return fail(invalid('reference', 'bad-shape'))
      const verified = await read({ access: input.access, reference: parsed.data, after: null })
      return 'failure' in verified ? verified : succeed(freeze(parsed.data))
    },
    read,
  }
}
