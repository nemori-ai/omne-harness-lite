import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  readSourceReservation,
  recoverSourceHolds,
  recoverSourceUpdates,
  recoverOneSourceHolds,
  sourceUpdateReadiness,
} from './source-retention-records.ts'
import { SOURCE_SERVICE_READ, sourceServiceReadSchema } from './source-service-schema.ts'
import { json } from './encoding.ts'
export default {
  ...SOURCE_SERVICE_READ,
  read(raw, port) {
    const input = sourceServiceReadSchema.parse(raw)
    const output = read(input, port)
    return { kind: 'read', output: json(output) }
  },
} satisfies ReadHandlerModule

function read(input: ReturnType<typeof sourceServiceReadSchema.parse>, port: ReadPort) {
  switch (input.kind) {
    case 'reservation':
      return readSourceReservation(port, input.request)
    case 'holds':
      return recoverSourceHolds(port, input.page)
    case 'source-holds':
      return recoverOneSourceHolds(port, input.source, input.page)
    case 'update-readiness':
      return sourceUpdateReadiness(port, input.update)
    case 'updates':
      return recoverSourceUpdates(port, input.page)
  }
}
