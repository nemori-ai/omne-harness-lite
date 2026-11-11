import type { ParticipantPort } from '@omne-harness/sql-contract/worker'
import type { CheckpointRequest } from './checkpoint-schema.ts'
import { allocateSettingsIntent } from './intent-records.ts'
import {
  planStandingCustody,
  requestStandingCustody,
  recordStandingHeld,
  recordStandingSettled,
} from './standing-custody.ts'
import { planSourceCustody, requestSourceCustody, recordSourceCustody } from './source-custody.ts'

function checkpoint(port: ParticipantPort, command: CheckpointRequest['command']) {
  switch (command.kind) {
    case 'allocate':
      return allocateSettingsIntent(port, command.input)
    case 'standing-plan':
      return planStandingCustody(port, command.input)
    case 'standing-request':
      return requestStandingCustody(port, command.input)
    case 'standing-held':
      return recordStandingHeld(port, command.input)
    case 'standing-settled':
      return recordStandingSettled(port, command.input)
    case 'sources-plan':
      return planSourceCustody(port, command.input)
    case 'source-request':
      return requestSourceCustody(port, command.input)
    case 'source-record':
      return recordSourceCustody(port, command.input)
  }
}
export function applySettingsCheckpoint(port: ParticipantPort, request: CheckpointRequest) {
  const result = checkpoint(port, request.command)
  if (result.kind === 'rejected' || result.kind === 'not_found')
    throw new Error('Settings checkpoint could not persist its bound result')
  return { request, result }
}
