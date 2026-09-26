import { createRequire } from 'node:module'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ActionIntent, ActionReport } from '@omne-harness-lite/governance-client-operations'
const require = createRequire(import.meta.url)
const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  validateFormats: false,
})
ajv.addKeyword('x-counterexamples')
for (const name of [
  '@omne-harness-lite/identity-values/schema',
  '@omne-harness-lite/offer-expiry/schema',
  '@omne-harness-lite/governance-center-client/schema',
  '@omne-harness-lite/governance-client-operations/schema',
  '@omne-harness-lite/governance-client-operations/schema/v2',
])
  ajv.addSchema(require(name))
const schema: { $id: string } = require('@omne-harness-lite/governance-client-operations/schema/v2')
const intent = ajv.compile({ $ref: `${schema.$id}#/$defs/Intent` }),
  report = ajv.compile({ $ref: `${schema.$id}#/$defs/Output` })
export function validIntent(value: unknown): value is ActionIntent {
  return intent(value)
}
export function validReport(value: unknown): value is ActionReport {
  return report(value)
}
