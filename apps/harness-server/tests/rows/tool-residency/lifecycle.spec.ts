import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import { toolResidencyRow } from '../../../src/rows/tool-residency/index.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { assembly, deferred, emptyPage, key, type Read } from './support.ts'

const live: Awaited<ReturnType<typeof assembly>>[] = []
afterEach(async () => {
  for (const app of live.splice(0).reverse()) await app.dispose()
})

it('waits for both dependencies and closes pending reads when the principal provider leaves', async () => {
  const root = new Context()
  const pending = root.plugin(toolResidencyRow)
  expect(pending.state).toBe(0)
  expect(root.get('toolResidencyReader')).toBeUndefined()
  await pending.dispose()

  const app = await assembly()
  live.push(app)
  const source = deferred<Awaited<ReturnType<Read>>>()
  app.setRead(() => source.promise)
  const read = app.reader.referencing({ scope: 'system', key: key(), after: null })
  await app.principalFiber.dispose()
  const timed = new Promise<'hung'>(resolve => {
    const timer = setTimeout(() => resolve('hung'), 100)
    timer.unref()
  })
  expect(await Promise.race([read, timed])).toMatchObject({ failure: { kind: 'unavailable' } })
  expect(app.row.state).toBe(0)
  expect(app.root.get('toolResidencyReader')).toBeUndefined()
})

it('withdrawal settles all pending reads without waiting for the source, rejects old calls and isolates a replacement', async () => {
  const app = await assembly()
  live.push(app)
  const never = deferred<Awaited<ReturnType<Read>>>()
  const late = deferred<Awaited<ReturnType<Read>>>()
  let calls = 0
  app.setRead(() => (++calls === 1 ? never.promise : late.promise))
  const one = app.reader.referencing({ scope: 'system', key: key(), after: null })
  const two = app.reader.referencing({ scope: 'system', key: key(), after: null })
  await app.row.dispose()
  // A bounded race makes a missing disposer a behavioral failure instead of hanging the test.
  const timed = new Promise<'hung'>(resolve => {
    const timer = setTimeout(() => resolve('hung'), 100)
    timer.unref()
  })
  const results = await Promise.race([Promise.all([one, two]), timed])
  expect(results).toEqual([
    { failure: { kind: 'unavailable', diagnostic: 'tool-residency: removed' } },
    { failure: { kind: 'unavailable', diagnostic: 'tool-residency: removed' } },
  ])
  late.resolve(succeed(emptyPage()))
  expect(await two).toEqual({
    failure: { kind: 'unavailable', diagnostic: 'tool-residency: removed' },
  })
  expect(await app.reader.referencing({ scope: 'system', key: key(), after: null })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  expect(calls).toBe(2)
  app.setRead(async () => succeed(emptyPage()))
  const replacement = await app.root.plugin(toolResidencyRow)
  expect(
    await app.root.toolResidencyReader.referencing({ scope: 'system', key: key(), after: null }),
  ).toEqual(succeed({ items: [], next: null }))
  expect(app.inputs.at(-1)?.limit).toBe(100)
  expect(await app.reader.referencing({ scope: 'system', key: key(), after: null })).toMatchObject({
    failure: { kind: 'unavailable' },
  })
  await replacement.dispose()
})

it('declares only the Session and entry principal dependencies and validates pageSize', async () => {
  expect(rowDeclarationOf(toolResidencyRow)).toEqual({
    row: 'tool-residency',
    implementation: 'real',
    manifest: {
      provides: ['toolResidencyReader'],
      injects: ['session', 'toolResidencyPrincipal'],
      sameProviderGroup: null,
      phase: null,
    },
    lifecycle: { kind: 'none' },
  })
  const app = await assembly()
  live.push(app)
  await app.row.dispose()
  for (const pageSize of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(app.root.plugin(toolResidencyRow, { pageSize })).rejects.toBeDefined()
  }
  await expect(
    app.root.plugin(toolResidencyRow, { pageSize: 1, unknown: true }),
  ).rejects.toBeDefined()
})
