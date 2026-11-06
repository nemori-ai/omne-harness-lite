import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { ConsumeDecisionSchema, RegisterRequestSchema } from '@omne-harness/human-intervention'
import { IndependentCommandSchema } from '../src/independent-schema.ts'
import { SqlCommandResultSchema, SqlCommandSchema } from '../src/request-schema.ts'
import { RecoveryResultSchemas } from '../src/operation-schema.ts'
import { HitlSqlBindingSchema } from '../src/terminal-schema.ts'

const fixtureSchema = z.object({
  cases: z.array(
    z.object({
      scenario: z.string(),
      registration: RegisterRequestSchema,
      prepare: IndependentCommandSchema,
      registered: SqlCommandResultSchema.optional(),
      decisions: z.array(z.object({ input: SqlCommandSchema, result: SqlCommandResultSchema })),
      receipts: z.array(
        z.object({ command: ConsumeDecisionSchema, result: RecoveryResultSchemas.consumeDecision }),
      ),
    }),
  ),
  sealed: HitlSqlBindingSchema,
})
export const legacyFixture = fixtureSchema.parse(
  JSON.parse(readFileSync(new URL('./fixtures/legacy.json', import.meta.url), 'utf8')),
)
export function legacyCopy() {
  const parent = fileURLToPath(
    new URL('../../../../tmp/hitl-r1-c2-relational/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'upgrade-'))
  mkdirSync(join(root, 'domains'))
  const path = join(root, 'domains', '6869746c2e74657374.sqlite')
  copyFileSync(new URL('./fixtures/legacy.sqlite', import.meta.url), path)
  return { root, path }
}
export function database(root: string) {
  return new DatabaseSync(join(root, 'domains', '6869746c2e74657374.sqlite'))
}
