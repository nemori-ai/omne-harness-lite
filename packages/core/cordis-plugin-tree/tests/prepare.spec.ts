import { expect, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { composePluginTree } from '../src/index.ts'
import { preparePluginTree } from '../src/cordis.ts'

it('accepts a Standard Schema success result with an explicit undefined issues property', async () => {
  const Config: StandardSchemaV1 = {
    '~standard': { version: 1, vendor: 'test', validate: value => ({ value, issues: undefined }) },
  }
  const plugin = {
    name: 'test',
    Config,
    assemblyLifecycle: 1,
    apply() {},
    describeAssembly: () => ({ provides: [], requires: [], optional: [], claims: [] }),
  }
  const prepared = await preparePluginTree(
    composePluginTree([
      { id: 'a', plugin: { package: 'provider', export: 'Managed' }, config: {} },
    ]),
    { externalServices: [], resolveModule: async () => ({ Managed: plugin }) },
  )
  expect(prepared.ids).toEqual(['a'])
})
