import { expect, it } from 'vitest'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import { createRecoveryAccess } from '@omne-harness/execution-environment-contract'
import {
  executionEnvironmentConformance,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'
import { accessA, accessB, recovery, scope1 } from './doubles.ts'

for (const test of executionEnvironmentConformance<string>({
  subject(ports) {
    const environment = createEnvironmentRegistry<string>({ recovery, ...ports })
    return {
      environment,
      access: accessA,
      otherAccess: accessB,
      scope: scope1,
      recoveryAccess: createRecoveryAccess(),
      hooks: { close: () => environment.close().then(() => {}) },
      dispose: () => environment.close().then(() => {}),
    }
  },
}))
  it('public contract: ' + test.name, async () => {
    expect(await runConformanceCase(test)).toEqual({ name: test.name, status: 'pass' })
  })
