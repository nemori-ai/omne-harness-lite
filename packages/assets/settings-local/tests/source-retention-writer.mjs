import {
  reserveSource,
  settleSource,
  beginSourceUpdate,
  finishSourceUpdate,
} from '../dist/source-retention-records.js'
function execute(command, port) {
  switch (command.kind) {
    case 'reserve':
      return reserveSource(port, command.request, command.snapshot)
    case 'settle':
      return settleSource(port, command.input)
    case 'begin':
      return beginSourceUpdate(port, command.update)
    case 'finish':
      return finishSourceUpdate(port, command.update, command.outcome)
    default:
      throw new Error('Unknown source retention fixture command')
  }
}
export default {
  participant: 'settings.source-retention',
  protocol: 'settings-source-retention/1',
  execute(facts, port) {
    let results
    try {
      results = facts.commands.map(command => execute(command, port))
    } catch (error) {
      return { kind: 'failed', diagnostic: String(error).slice(0, 1000) }
    }
    if (facts.rollback) return { kind: 'conflict', basis: { reason: 'fixture-rollback' } }
    return { kind: 'participated', response: results }
  },
}
