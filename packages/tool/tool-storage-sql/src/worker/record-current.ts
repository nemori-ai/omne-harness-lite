import { canonicalDigest } from '@omne-harness/tool'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import {
  parseToolRecordsCurrent,
  TOOL_RECORD_CURRENT,
  TOOL_RECORDS_CURRENT_FACT,
  type ToolRecordObservation,
} from '../record-current.ts'
import { oneRow, text } from './support.ts'

function matches(port: ParticipantPort, tenant: string, record: ToolRecordObservation): boolean {
  const row = oneRow(
    port,
    'SELECT record FROM tl_record WHERE tenant = ? AND kind = ? AND name = ? AND key = ? LIMIT 1',
    [tenant, record.kind, record.name, record.key],
  )
  return row !== undefined && canonicalDigest(JSON.parse(text(row['record']))) === record.digest
}

export default {
  participant: TOOL_RECORD_CURRENT,
  protocol: '1',
  execute(facts, port) {
    const request = parseToolRecordsCurrent(facts)
    if (request === null) return { kind: 'unsupported', basis: { reason: 'record-current-input' } }
    if (!request.records.every(record => matches(port, request.tenant, record)))
      return { kind: 'conflict', basis: { reason: 'tool-record-not-current' } }
    port.provideFact(TOOL_RECORDS_CURRENT_FACT, request)
    return { kind: 'participated', response: request }
  },
} satisfies ParticipantModule
