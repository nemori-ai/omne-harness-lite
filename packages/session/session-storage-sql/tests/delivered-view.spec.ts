import { expect, it } from 'vitest'
import { app, TENANT_A } from './fixtures/app.ts'
import { deliver, startRun } from './fixtures/real-provider.ts'

async function viewOf(a: Awaited<ReturnType<typeof app>>) {
  const view = await a.port.history.readModelView({
    ...a.access(TENANT_A),
    basis: null,
    after: null,
    pageBytes: 100_000,
  })
  if (!('ok' in view) || view.ok.kind !== 'page') throw new Error('no model view')
  return view.ok
}

it('an accepted input enters the model view when a step takes it, not when it is accepted', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'first')).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'second')).toHaveProperty('ok')
  expect((await viewOf(a)).rows).toEqual([])

  expect(await startRun(a, 'start')).toHaveProperty('ok')
  expect((await viewOf(a)).rows).toEqual([])
  expect(await deliver(a, 'step', ['second', 'first'])).toHaveProperty('ok')
  const view = await viewOf(a)
  expect(view.rows.map(row => JSON.stringify(row.message))).toEqual([
    expect.stringContaining('input second'),
    expect.stringContaining('input first'),
  ])

  const context = await a.port.history.readCompactionContext({
    ...a.access(TENANT_A),
    basis: view.basis,
    coverTo: null,
  })
  expect(context).toMatchObject({
    ok: {
      kind: 'context',
      value: { open: expect.arrayContaining(view.rows.map(row => row.entry)) },
    },
  })
})

it('a delivery that names an input Session never admitted is refused for good, and nothing enters the model view', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'first')).toHaveProperty('ok')
  expect(await startRun(a, 'start')).toHaveProperty('ok')
  expect(await deliver(a, 'step', ['first', 'never-admitted'])).toMatchObject({
    failure: { kind: 'invalid', field: 'value.inputs' },
  })
  expect((await viewOf(a)).rows).toEqual([])
})
