// A5: the state is in the database files, not in the adapter. A real ledger admits a call and
// settles it; the storage is closed and a new one opens the same files. A ledger over the reopened
// store finds the call and its result, and a repeated admission recalls the original without a
// second record.
import { afterEach, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'

import type { LedgerRecord } from '@omne-harness/tool'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import { ledgerWorld } from './fixtures/ledger.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer)
    throw new Error(`expected success, got ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

const instance = ok(decodeToolInstanceId('instance-1'))
const rejectOperation = ok(decodeToolOperationId('reject-1'))

it('a reopened store answers lookup and readResult, and recalls the admission without a second record', async () => {
  const first = await openApp({ keep: true })
  opened.push(first)
  const world = await ledgerWorld(TENANT_A)
  const ledger = world.ledgerOver(first.store)
  const admitted = ok(await ledger.admissions.admit(world.input))
  expect(admitted.recovered).toBe(false)
  const settled = ok(
    await ledger.commands.rejectPending({
      ...world.access,
      instance,
      generation: '1',
      operation: rejectOperation,
      expected: admitted.state.revision,
      reason: 'the host excluded the invocation',
      exclusion: { owner: 'test', record: 'exclusion', revision: '1', digest: 'sha256:exclusion' },
    }),
  )
  if (settled.phase !== 'settled') throw new Error('rejectPending must settle the call')
  const lookup = ok(
    await ledger.reads.lookup({ ...world.access, admission: world.input.operation }),
  )
  const page = ok(
    await ledger.reads.result({ ...world.access, result: settled.result, after: null }),
  )
  const domain = { kind: 'call', tenant: TENANT_A, call: world.access.call } as const
  const before = await first.store.read(domain)
  first.close()

  const second = await openApp({ directory: first.directory })
  opened.push(second)
  const again = world.ledgerOver(second.store)
  expect(
    ok(await again.reads.lookup({ ...world.access, admission: world.input.operation })),
  ).toEqual(lookup)
  expect(
    ok(await again.reads.result({ ...world.access, result: settled.result, after: null })),
  ).toEqual(page)
  const recalled = ok(await again.admissions.admit(world.input))
  expect(recalled.recovered).toBe(true)
  expect(await second.store.read(domain)).toEqual(before)
  const operations = (read: typeof before) =>
    read.kind === 'complete'
      ? read.records.filter(
          (record: LedgerRecord) =>
            record.kind === 'operation' &&
            [world.input.operation, rejectOperation].includes(record.operation.operation),
        )
      : []
  expect(operations(before)).toHaveLength(2)
})
