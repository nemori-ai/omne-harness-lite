import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createScheduleToolDetails,
  type ScheduleToolDisclosurePolicy,
  type ScheduleToolDetailRef,
} from '@omne-harness/schedule-tools'
import {
  defaultResultPolicy,
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import {
  encodeToolInvocationRef,
  resolveToolInvocationRef,
  type ToolInvocationQueries,
  type ToolResult,
} from '@omne-harness/tool-contract'
import { INITIAL_REVISION, type CallRecord, type ResultRecord } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  context,
  services,
  scheduleId,
  view,
  value,
  run,
  access,
  operationId,
  request,
  evidence,
  ledger,
} from './world.ts'
import { scheduleToolParameterCodec } from '@omne-harness/schedule-tools'
export const hash = (value: unknown) =>
  createHash('sha256')
    .update(canonicalize(value) ?? '')
    .digest('hex')
export async function detailsWorld(options: { bytes?: number; timeout?: number } = {}) {
  const args = { action: 'get', input: { scheduleId } }
  const rendered = await run(
    args,
    {
      schedule: succeed({
        context,
        arguments: value(
          scheduleToolParameterCodec.parse({
            original: '',
            effective: JSON.stringify(args),
            complete: true,
          }),
        ),
        write: null,
      }),
    },
    {
      ...services,
      queries: { ...services.queries, get: async () => ({ kind: 'ok', value: view }) },
    },
  )
  const resultValue: ToolResult<ToolMessageContentBlock> = {
    ...value(rendered.rendered),
    original: { kind: 'none' },
    content: [0, 1, 2].map(i => {
      const block = value(
        defaultResultPolicy.judge({
          kind: 'text',
          id: `block-${i}`,
          visibility: { toHuman: true, toModel: true },
          text: 'x'.repeat(250),
        } as never),
      )
      if (block.kind !== 'text') throw new Error('Expected text')
      return block
    }),
  }
  const result = value(decodeToolResultVersion('version-one'))
  const invocation = value(
    encodeToolInvocationRef({
      tenant: access().tenant,
      call: access().call,
      admission: operationId('admission'),
    }),
  )
  const invAccess = {
    principal: access().principal,
    tenant: access().tenant,
    reference: invocation,
  }
  const revision = value(decodeToolRevision('1'))
  const fixed = await request(args)
  const delivery = {
    kind: 'pending' as const,
    delivery: value(decodeToolDeliveryId('delivery')),
    consumer: fixed.consumer,
  }
  const call: CallRecord = {
    tenant: access().tenant,
    call: access().call,
    admission: operationId('admission'),
    request: fixed,
    initiator: { owner: 'fixture', subject: 'alice', revision: '1' },
    state: {
      call: access().call,
      revision,
      source: evidence('state'),
      foreground: null,
      effect: { kind: 'not-occurred', evidence: evidence('read') },
      execution: { kind: 'ended', evidence: evidence('end') },
      timing: { kind: 'closed', accumulatedMs: '0' },
      queue: { kind: 'none' },
      controls: [],
      delivery,
      supplements: [],
      phase: 'settled',
      wait: { kind: 'none' },
      result,
      relation: 'foreground',
      terminal: { kind: 'completed' },
    },
    preparations: [],
    environment: null,
    start: null,
    startRejection: null,
    execution: null,
  }
  const row: ResultRecord = {
    tenant: call.tenant,
    call: call.call,
    result,
    relation: 'original',
    terminal: { kind: 'completed' },
    actual: null,
    effect: call.state.effect,
    value: resultValue,
    delivery,
    source: evidence('result'),
    settledBy: operationId('settlement'),
    custody: { kind: 'synthetic' },
  }
  const store = createMemoryToolLedgerStore()
  const seeded = await store.commit({
    domain: { kind: 'call', tenant: call.tenant, call: call.call },
    expected: INITIAL_REVISION,
    revision,
    writes: [
      { kind: 'put', record: { kind: 'call', call } },
      { kind: 'put', record: { kind: 'result', result: row } },
    ],
  })
  if (seeded.kind !== 'committed') throw new Error(`fixture records: ${seeded.kind}`)
  const reference: ScheduleToolDetailRef = {
    authority: 'local-schedule',
    invocation,
    result,
    projection: 'full',
  }
  const state = {
    revoked: false,
    changed: false,
    wrongDigest: false,
    wrongIds: false,
    unavailable: false,
    queryDrift: false,
    loop: false,
    calls: 0,
  }
  const observation = () => ({
    reference,
    revision: 'r1',
    resultDigest: state.wrongDigest ? '0'.repeat(64) : hash(rendered.returned),
    owner: context.owner,
    scheduleIds: state.wrongIds ? [] : [scheduleId],
    source: evidence('disclosure'),
  })
  const disclosure: ScheduleToolDisclosurePolicy<string> = {
    observe: async () =>
      state.unavailable
        ? fail({ kind: 'unavailable', dependency: 'disclosure', diagnostic: 'unknown' })
        : succeed(observation()),
    confirm: async () =>
      succeed({
        ...observation(),
        source: state.changed ? evidence('different-source') : evidence('disclosure'),
      }),
    qualifyCall: async () =>
      state.revoked ? { kind: 'denied', reason: 'revoked' } : { kind: 'allowed' },
  }
  let realLedger: ReturnType<typeof ledger>
  const queries: Pick<ToolInvocationQueries<string, ToolMessageContentBlock>, 'readResult'> = {
    async readResult(input) {
      state.calls++
      const decoded = resolveToolInvocationRef(input.reference, input.tenant)
      if ('failure' in decoded || decoded.ok.admission !== call.admission)
        return fail({ kind: 'invalid', field: 'reference', reason: 'admission' })
      const page = await realLedger.reads.result({
        principal: input.principal,
        tenant: input.tenant,
        call: decoded.ok.call,
        result: input.result,
        after: input.after,
      })
      if ('failure' in page) return page
      return succeed({
        ...page.ok,
        source: state.queryDrift && input.after !== null ? evidence('drift') : page.ok.source,
        next: state.loop && input.after !== null ? input.after : page.ok.next,
      })
    },
  }
  const cursorKey = new Uint8Array(32).fill(42)
  const details = createScheduleToolDetails({
    cursorKey,
    authority: reference.authority,
    queries,
    baseGuard: {
      qualify: async input =>
        input.principal === 'alice' ? { kind: 'allowed' } : { kind: 'denied', reason: 'principal' },
    },
    disclosure,
    limits: { maxBytes: options.bytes ?? 4_194_304, timeoutMs: options.timeout ?? 1000 },
  })
  realLedger = ledger(details.guard, store)
  return {
    details,
    state,
    cursorKey,
    access: invAccess,
    reference,
    row,
    ledger: realLedger,
    rendered: rendered.returned,
    queries,
    disclosure,
  }
}
