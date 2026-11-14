import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { json } from './encoding.ts'
import { captureSource } from './source-capture.ts'
import {
  SOURCE_SNAPSHOT_READ,
  sourceObservationSchema,
  sourceSnapshotReadSchema,
} from './source-retention-schema.ts'

export default {
  ...SOURCE_SNAPSHOT_READ,
  read(raw, port) {
    const { source } = sourceSnapshotReadSchema.parse(raw)
    return {
      kind: 'read',
      output: json(sourceObservationSchema.parse(captureSource(port, source))),
    }
  },
} satisfies ReadHandlerModule
