import type { JsonValue } from '@omne-harness/sql-contract'
import { recordOf } from './session-reply.ts'

export const EXECUTION_RECORD_HANDLERS = {
  facts: 'execution-record.facts',
  openExecutions: 'execution-record.open-executions',
  events: 'execution-record.events',
  operation: 'execution-record.operation',
  blob: 'execution-record.blob',
  blobs: 'execution-record.blobs',
  openItems: 'execution-record.open-items',
  items: 'execution-record.items',
  preadmission: 'execution-record.preadmission',
  retired: 'execution-record.retired',
  sessionAdoption: 'execution-record.session-adoption',
  requestChoices: 'execution-record.request-choices',
} as const

export type ExecutionSessionAdoption = Readonly<{
  reference: string
  pub: string
  execution: string
  digest: string
  media: string
  payload: string
  adoption: Readonly<{ readonly [key: string]: JsonValue }>
}>

export function decodeExecutionSessionAdoption(
  output: JsonValue,
): Readonly<{ kind: 'adoption'; value: ExecutionSessionAdoption | null }> | null {
  const value = recordOf(output)
  if (value?.['kind'] !== 'adoption') return null
  if (value['value'] === null) return { kind: 'adoption', value: null }
  const row = recordOf(value['value'])
  const adoption = recordOf(row?.['adoption'])
  const { reference, pub, execution, digest, media, payload } = row ?? {}
  return typeof reference === 'string' &&
    typeof pub === 'string' &&
    typeof execution === 'string' &&
    typeof digest === 'string' &&
    typeof media === 'string' &&
    typeof payload === 'string' &&
    adoption !== null
    ? { kind: 'adoption', value: { reference, pub, execution, digest, media, payload, adoption } }
    : null
}

export function decodeExecutionRequestChoices(
  output: JsonValue,
): Readonly<{ kind: 'choices'; value: readonly JsonValue[] | null }> | null {
  const value = recordOf(output)
  const choices = value?.['value']
  if (value?.['kind'] !== 'choices') return null
  if (choices === null) return { kind: 'choices', value: null }
  return Array.isArray(choices) ? { kind: 'choices', value: choices as JsonValue[] } : null
}
