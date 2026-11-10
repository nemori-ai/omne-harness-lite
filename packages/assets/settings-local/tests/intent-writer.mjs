import { readySettingsIntent } from '../dist/intent-ready.js'
import { settleSettingsIntent } from '../dist/intent-settlement.js'
import {
  planSourceCustody,
  requestSourceCustody,
  recordSourceCustody,
} from '../dist/source-custody.js'
import { allocateSettingsIntent } from '../dist/intent-records.js'
import {
  planStandingCustody,
  requestStandingCustody,
  recordStandingHeld,
  recordStandingSettled,
} from '../dist/standing-custody.js'
function standing(command, port) {
  switch (command.kind) {
    case 'plan':
      return planStandingCustody(port, command.input)
    case 'request':
      return requestStandingCustody(port, command.input)
    case 'held':
      return recordStandingHeld(port, command.input)
    case 'settled':
      return recordStandingSettled(port, command.input)
    default:
      throw new Error('Unknown standing custody test command')
  }
}
function source(command, port) {
  switch (command.kind) {
    case 'plan':
      return planSourceCustody(port, command.input)
    case 'request':
      return requestSourceCustody(port, command.input)
    case 'record':
      return recordSourceCustody(port, command.input)
    default:
      throw new Error('Unknown source custody test command')
  }
}
export default {
  participant: 'settings.persistence',
  protocol: 'settings-sql/1',
  execute(facts, port) {
    const response = facts.ready
      ? readySettingsIntent(port, facts.ready)
      : facts.settlement
        ? settleSettingsIntent(port, facts.settlement)
        : facts.source
          ? source(facts.source, port)
          : facts.standing
            ? standing(facts.standing, port)
            : allocateSettingsIntent(port, facts.input)
    if (facts.rollback) return { kind: 'conflict', basis: { reason: 'fixture-rollback' } }
    return { kind: 'participated', response }
  },
}
