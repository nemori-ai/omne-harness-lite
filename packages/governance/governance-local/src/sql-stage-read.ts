import type { ReadHandlerModule } from '@omne-harness/sql-contract/worker'
import { stageRequestSchema } from './sql-stage-schema.ts'
import { readSqlStage } from './sql-stage.ts'
import { json } from './encoding.ts'
export const STAGE_HANDLER = {
  handler: 'governance.sql-stage',
  protocol: 'governance-sql-stage-read/1',
}
export default {
  ...STAGE_HANDLER,
  read(raw, port) {
    const input = stageRequestSchema.parse(raw)
    return { kind: 'read', output: json(readSqlStage(port, input.binding, input.stage)) }
  },
} satisfies ReadHandlerModule
