import { expect, it } from 'vitest'
import { evidence, ok, operation, operationId } from './fixtures/common-journal.ts'
import { resultCall } from './fixtures/result-call.ts'

it('projects an original Tool release receipt after custody without repeating the result or either answer', async () => {
  const s = await resultCall('release-original')
  ok(await s.view.journal.recordResult(s.request))
  const request = {
    ...s.request,
    operation: operation('producer-release'),
    transfer: { kind: 'none' as const },
    release: { kind: 'confirmed' as const, receipt: evidence('producer-release') },
  }
  const confirmation = ok(await s.view.journal.recordResult(request)),
    agent = ok(await s.view.journal.load(request)),
    before = ok(await s.backend.transactions.readWork(s.access)),
    reconcile = { ...s.access, execution: s.execution, operation: operationId('reconcile') }
  expect(agent.results[0]?.release).toEqual(request.release)
  expect(before.consumptions[0]?.results[0]?.release).toBe('pending')
  const receipt = ok(await s.backend.controls.reconcile(reconcile)),
    after = ok(await s.backend.transactions.readWork(s.access))
  expect(after.consumptions[0]?.results[0]?.release).toBe('confirmed')
  expect(receipt).not.toBeNull()
  const root = s.view.controls.root()
  expect(ok(await s.view.journal.recordResult(request))).toEqual(confirmation)
  expect(ok(await s.backend.controls.reconcile(reconcile))).toMatchObject({
    ...receipt,
    recovered: true,
  })
  expect(
    ok(
      await s.backend.controls.reconcile({
        ...reconcile,
        operation: operationId('already-released'),
      }),
    ),
  ).toBeNull()
  expect(s.view.controls.root()).toBe(root)
  expect(ok(await s.view.journal.load(request))).toEqual(agent)
  expect(after.consumptions[0]?.results).toHaveLength(1)
})
