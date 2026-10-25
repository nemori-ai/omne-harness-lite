import { it, expect } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  createMemoryRuntimeContext,
  runtimeContextConformance,
  runConformanceCase,
} from '@omne-harness/runtime-context-contract/testing'
import type { RuntimeContextPorts } from '@omne-harness/runtime-context-contract/testing'
const first = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
const second = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000001',
  }),
)
if (!first.ok || !second.ok) throw new Error('Invalid fixture tenant')
const closers = new WeakMap<object, () => Promise<void>>()
const fixture = {
  tenant: first.value,
  otherTenant: second.value,
  principal: 'suite',
  retention: 64,
  replayCapacity: 8,
  subject: async (ports: RuntimeContextPorts<string>) => {
    const subject = createMemoryRuntimeContext<string>({ ...ports, retention: 64, replayCapacity: 8 })
    closers.set(subject, () => subject.close())
    return subject
  },
  close: async (subject: object) => {
    await closers.get(subject)?.()
  },
}
for (const c of runtimeContextConformance<string>())
  it(c.name, async () => {
    expect(await runConformanceCase(c, fixture)).toEqual({ kind: 'passed' })
  })
