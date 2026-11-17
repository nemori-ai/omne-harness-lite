import { setImmediate as nextTurn } from 'node:timers/promises'
import v8 from 'node:v8'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { emptyFinishing } from '../src/testing/journal-finishing.ts'
import type { MemoryExecution } from '../src/testing/journal.ts'
import { createCell } from '../src/testing/root.ts'

v8.setFlagsFromString('--expose-gc')
const gc: unknown = vm.runInNewContext('gc')

async function collectGarbage(): Promise<void> {
  if (typeof gc !== 'function') throw new Error('the garbage collector is not exposed')
  for (let round = 0; round < 4; round += 1) {
    await nextTurn()
    gc()
  }
}

const access = memoryAccess('tester', 'root-versions')
const id = 'exec-root-versions' as AgentExecutionId

function execution(): MemoryExecution {
  return {
    id,
    tenant: access.tenant,
    revision: 0,
    attachments: [],
    inputs: [],
    inputRevisions: new Map(),
    events: [],
    controls: [],
    results: [],
    resultRevisions: new Map(),
    effects: [],
    observations: [],
    stageReceipts: new Map(),
    observed: new Map(),
    admissions: [],
    entries: [],
    handoffs: [],
    custodyAttempts: new Map(),
    finishing: emptyFinishing(),
  } as unknown as MemoryExecution
}

it('an execution version that later writes replaced is not kept alive by the root', async () => {
  const cell = createCell<string>(access.tenant, access.session, {
    authorize: () => undefined,
    advances: () => false,
    participate: () => undefined,
    committed: () => undefined,
  })
  const tenant = tenantCodec.encode(access.tenant)
  if (!tenant.ok) throw new Error('unminted tenant')
  const at = JSON.stringify([tenant.value, id])
  cell.mutate(() => {
    cell.state().agent.executions.set(at, execution())
    cell.touch()
  })
  const first = new WeakRef(cell.current().agent.executions.get(at)!)
  for (let write = 0; write < 3; write += 1) cell.mutateExecution(id, () => undefined)
  expect(cell.current().agent.executions.get(at)).not.toBe(first.deref())
  await collectGarbage()
  expect(first.deref()).toBeUndefined()
})
