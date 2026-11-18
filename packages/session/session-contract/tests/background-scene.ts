import type { Message } from '@omne-harness/message'
import type {
  ConsumptionId,
  ProducerRef,
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesStart,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  succeeded,
  userMessage,
} from '@omne-harness/session-contract/testing'
import { decodeEntry } from '../src/entries.ts'
import { open } from './scene.ts'

export const CALL = 'call-bg'
export const producer = { kind: 'tool', call: CALL } as const
export const reminder = (text = 'background done'): Message =>
  ({ ...userMessage(text, 'msg_bgreminder0000000000000'), role: 'system_reminder' }) as Message
const LABEL = { intent: 'build', tool: 'Shell', command: 'execute', preview: 'pnpm build' } as const
export const backgroundedOf = (of: ProducerRef): SessionEntriesInterpretation => ({
  kind: 'backgrounded',
  producer: of,
  source: evidence(`tool/placeholder/${of.call}`),
  label: LABEL,
  how: 'launched',
})
export const backgrounded = backgroundedOf(producer)
export const CALL_FIELDS = { ordinal: 1, label: LABEL, source: 'launched' } as const
export const outcomeOf = (
  of: ProducerRef,
  result: string,
  source = `tool/result/${of.call}/${result}`,
): SessionEntriesInterpretation => ({
  kind: 'background-outcome',
  producer: of,
  result,
  reminder: reminder(),
  source: evidence(source),
})
export const outcome = (result = 'rv-1'): SessionEntriesInterpretation =>
  outcomeOf(producer, result, `tool/result/${result}`)
export const executionOf = (of: ProducerRef, result = 'rv-1'): SessionEntriesInterpretation => ({
  kind: 'execution',
  producer: of,
  source: evidence(`tool/result/${of.call === CALL ? '' : `${of.call}/`}${result}`),
})
export const execution = executionOf(producer)

export type Scene = Awaited<ReturnType<typeof bound>>

/** Binds one more external call of the session; answers its consumption. */
export async function bindCall(
  s: Awaited<ReturnType<typeof open>>,
  of: ProducerRef,
): Promise<ConsumptionId> {
  const name = of.call === CALL ? 'bg' : of.call
  succeeded(
    await s.commit({
      kind: 'bindExternalCall',
      input: {
        ...s.base,
        operation: operationId(`bind-${name}`),
        expected: (await s.read()).revision,
        qualification: evidence('qualified'),
        binding: {
          producer: of,
          action: 'action',
          consumer: { owner: 'session', work: 'work', position: `at-${name}`, purpose: 'action' },
          request: evidence(`request-${name}`),
          initiatingAttempt: null,
        },
      },
    }),
    'bind',
  )
  return (await s.read()).consumptions.find(item => item.binding.producer.call === of.call)
    ?.id as ConsumptionId
}

export async function bound(extra: Parameters<typeof open>[0] = {}) {
  const s = await open(extra)
  const consumption = await bindCall(s, producer)
  const first = await s.active()
  return { s, run: first.run.run, execution: first.run.execution.execution, consumption }
}

export function observation(
  c: Scene,
  name: string,
  after: number,
  parts: readonly (readonly SessionEntriesInterpretation[])[],
): SessionEntriesObservation {
  const items: SessionEntriesItem[] = parts.map((interpretation, at) => ({
    ordinal: String(after + at + 1),
    key: `${name}-${at}`,
    fact: evidence(`agent/entry/${name}/${at}`),
    interpretation,
  }))
  const through = String(after + parts.length)
  return {
    tenant: c.s.base.tenant,
    session: c.s.base.session,
    run: c.run,
    execution: c.execution,
    channel: 'tool-received',
    operation: operationId(`entries-${name}`),
    after: String(after),
    through,
    position: through,
    boundary: {
      execution: c.execution,
      channel: 'tool-received',
      revision: through,
      executionEvidence: evidence(`agent/head/${through}`),
      count: through,
    },
    items,
  }
}

export async function commitEntries(c: Scene, value: SessionEntriesObservation) {
  const snapshot = await c.s.read()
  const saved = snapshot.entriesProgress?.find(item => item.execution === c.execution)
  const start: SessionEntriesStart =
    saved === undefined ? { kind: 'initial' } : { kind: 'saved', progress: saved }
  return c.s.port.commitEntries({ observation: value, start })
}

export async function newEntries(c: Scene, before: number) {
  const rows = c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).slice(before)
  return rows.map(row => {
    const decoded = decodeEntry(row)
    if (!('ok' in decoded)) throw new Error(JSON.stringify(decoded))
    return decoded.ok
  })
}

export const entryCount = (c: Scene) =>
  c.s.port.controls.entriesOf(c.s.base.tenant, c.s.base.session).length
