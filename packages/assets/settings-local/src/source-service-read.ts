import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import {
  readSourceReservation,
  recoverSourceHolds,
  recoverSourceUpdates,
} from './source-retention-records.ts'
import { SOURCE_SERVICE_READ, sourceServiceReadSchema } from './source-service-schema.ts'
import { json } from './encoding.ts'
export default {
  ...SOURCE_SERVICE_READ,
  read(raw, port) {
    const input = sourceServiceReadSchema.parse(raw)
    const output =
      input.kind === 'reservation'
        ? readSourceReservation(port, input.request)
        : input.kind === 'holds'
          ? recoverSourceHolds(port, input.page)
          : recoverSourceUpdates(port, input.page)
    return { kind: 'read', output: json(output) }
  },
} satisfies ReadHandlerModule
