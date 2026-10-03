import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { entryValidator } from '../src/routing/schema.ts'

const require = createRequire(import.meta.url)
const schema = require('../schema/governance-center-entry.schema.json') as {
  $defs: Record<string, unknown>
}
it('keeps the resolved target metadata of an aliased definition', () => {
  expect(entryValidator('Result_AI_S15').schema).toEqual(schema.$defs['LoginResult'])
  expect(entryValidator('Result_AI_S15').schema).not.toEqual(schema.$defs['Result_AI_S15'])
})
