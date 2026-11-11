import {
  readSourceGate,
  readSourceReservation,
  sourceUpdateReadiness,
  recoverSourceHolds,
  recoverSourceUpdates,
} from '../dist/source-retention-records.js'
function read(input, port) {
  switch (input.kind) {
    case 'gate':
      return readSourceGate(port, input.source)
    case 'reservation':
      return readSourceReservation(port, input.request)
    case 'readiness':
      return sourceUpdateReadiness(port, input.update)
    case 'holds':
      return recoverSourceHolds(port, input.page)
    case 'updates':
      return recoverSourceUpdates(port, input.page)
    default:
      throw new Error('Unknown source retention fixture read')
  }
}
export default {
  handler: 'fixture.source-retention.read',
  protocol: 'fixture-source-retention/1',
  read(input, port) {
    return { kind: 'read', output: read(input, port) }
  },
}
