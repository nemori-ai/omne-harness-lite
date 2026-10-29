import { expect, it } from 'vitest'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { resultCall } from './fixtures/result-call.ts'

for (const kind of ['custody', 'processed'] as const)
  for (const changed of ['delivery', 'source', 'both'] as const)
    it(`rejects ${kind} with a different ${changed} before any preparation or joint publication`, async () => {
      const s = await resultCall(`identity-${kind}-${changed}`),
        result = {
          ...s.request.result,
          ...(changed !== 'source' ? { delivery: 'other-delivery' } : {}),
          ...(changed !== 'delivery' ? { source: evidence('other-source') } : {}),
        },
        request = {
          ...s.request,
          transfer:
            kind === 'custody'
              ? { ...s.request.transfer, result }
              : { kind, consumption: s.request.consumption, result, completion: evidence('done') },
        },
        before = {
          root: s.view.controls.root(),
          agent: ok(await s.view.journal.load(request)),
          session: ok(await s.backend.transactions.readWork(s.access)),
          rows: s.backend.controls.entriesOf(s.access.tenant, s.access.session),
          answer: await s.view.journal.query(request),
        }
      expect(await s.view.journal.recordResult(request)).toMatchObject({
        failure: { kind: 'conflict' },
      })
      expect(s.view.controls.root()).toBe(before.root)
      expect(ok(await s.view.journal.load(request))).toEqual(before.agent)
      expect(ok(await s.backend.transactions.readWork(s.access))).toEqual(before.session)
      expect(s.backend.controls.entriesOf(s.access.tenant, s.access.session)).toEqual(before.rows)
      expect(await s.view.journal.query(request)).toEqual(before.answer)
    })

for (const kind of ['custody', 'processed'] as const)
  it(`preserves one complete ${kind} result and its original answer across retries and same-key conflicts`, async () => {
    const s = await resultCall(`identity-existing-${kind}`),
      request = {
        ...s.request,
        transfer:
          kind === 'custody'
            ? s.request.transfer
            : {
                kind,
                consumption: s.request.consumption,
                result: s.request.result,
                completion: evidence('done'),
              },
      },
      receipt = ok(await s.view.journal.recordResult(request)),
      root = s.view.controls.root()
    expect(ok(await s.view.journal.recordResult(request))).toEqual(receipt)
    for (const changed of ['delivery', 'source'] as const) {
      const result = {
        ...request.result,
        ...(changed === 'delivery'
          ? { delivery: 'other-delivery' }
          : { source: evidence('other') }),
      }
      for (const op of [request.operation, operation(`other-${changed}`)])
        expect(
          await s.view.journal.recordResult({
            ...request,
            operation: op,
            result,
            transfer: { kind: 'none' },
          }),
        ).toMatchObject({ failure: { kind: 'conflict' } })
    }
    expect(s.view.controls.root()).toBe(root)
    const results = ok(await s.view.journal.load(request)).results
    expect(results).toHaveLength(1)
    expect(results[0]?.result).toEqual(request.result)
  })
