import { expect, it } from 'vitest'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  executionEnvironmentConformance,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'
import { accessA, accessB, recovery, scope1 } from './doubles.ts'

for (const test of executionEnvironmentConformance({
  subject() {
    const environment = createEnvironmentRegistry<string>({ recovery })
    return {
      environment,
      access: accessA,
      otherAccess: accessB,
      scope: scope1,
      hooks: { close: () => environment.close().then(() => {}) },
      dispose: () => environment.close().then(() => {}),
    }
  },
}))
  it('public contract: ' + test.name, async () => {
    expect(await runConformanceCase(test)).toEqual({ name: test.name, status: 'pass' })
  })
