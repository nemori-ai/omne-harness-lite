import { writeCompactionIndex } from '../src/worker/compaction-index.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'
import { expect, it } from 'vitest'
import { parseRecordEntryRef } from '@omne-harness/message'
import { app, TENANT_A } from './fixtures/app.ts'
import { deliver, startRun } from './fixtures/real-provider.ts'
import { evidence, operationId } from '@omne-harness/session-contract/testing'

it('reads current compaction evidence from indices maintained with real Session commits', async () => {
  const a = await app()
  const created = await a.create(TENANT_A)
  expect(created).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'next-input')).toHaveProperty('ok')
  expect(await startRun(a, 'start')).toHaveProperty('ok')
  expect(await deliver(a, 'next', ['next-input'])).toHaveProperty('ok')
  const access = a.access(TENANT_A)
  const view = await a.port.history.readModelView({
    ...access,
    basis: null,
    after: null,
    pageBytes: 100000,
  })
  if (!('ok' in view) || view.ok.kind !== 'page') throw new Error('no model view')
  const coverTo = parseRecordEntryRef(view.ok.rows.at(-1)!.entry)
  if (coverTo === null) throw new Error('no model-visible entry')
  const start = a.provider.readSql.length
  const answer = await a.port.history.readCompactionContext({
    ...access,
    basis: view.ok.basis,
    coverTo,
  })
  expect(answer).toMatchObject({
    ok: {
      kind: 'context',
      basis: view.ok.basis,
      value: {
        base: { kind: 'initial', pairings: [] },
        after: [],
        open: expect.arrayContaining(view.ok.rows.map(row => row.entry)),
      },
    },
  })
  expect(
    a.provider.readSql
      .slice(start)
      .some(sql => /\b(?:sl_entry|sl_state|sl_state_item)\b/.test(sql)),
  ).toBe(false)
  a.provider.seed('dom_0', 'UPDATE sl_compaction_head SET covered = 0')
  expect(
    await a.port.history.readCompactionContext({ ...access, basis: view.ok.basis, coverTo }),
  ).toHaveProperty('failure.kind', 'unavailable')
})

it('resumes a current model view after its observed end and reads only newly committed rows', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'next-input')).toHaveProperty('ok')
  expect(await startRun(a, 'start')).toHaveProperty('ok')
  const read = (after: string | null) =>
    a.port.history.readModelView({
      ...a.access(TENANT_A),
      after,
      basis: null,
      resumeAtEnd: true,
      pageBytes: 100000,
    })
  const before = await read(null)
  if ('failure' in before || before.ok.kind !== 'page' || !before.ok.resume)
    throw new Error('missing tail cursor')
  expect(before.ok.next).toBeNull()
  expect(await read(before.ok.resume)).toMatchObject({ ok: { kind: 'page', next: null, rows: [] } })
  expect(await deliver(a, 'next', ['next-input'])).toHaveProperty('ok')
  const tail = await read(before.ok.resume)
  if ('failure' in tail || tail.ok.kind !== 'page') throw new Error('tail unavailable')
  expect(tail.ok.rows).toHaveLength(1)
  expect(BigInt(tail.ok.rows[0]!.seq)).toBe(BigInt(before.ok.basis.upper) + 1n)
})

it('keeps a call protected until every reported result version is processed', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'pending')).toHaveProperty('ok')
  expect(await startRun(a, 'start')).toHaveProperty('ok')
  expect(await deliver(a, 'pending', ['pending'])).toHaveProperty('ok')
  const access = a.access(TENANT_A)
  const read = async () => {
    const answer = await a.port.readWork(access)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    return answer.ok
  }
  const binding = {
    producer: { kind: 'tool' as const, call: 'multiple-results' },
    action: 'external-action',
    consumer: { owner: 'external', work: 'work', position: 'original', purpose: 'action' },
    request: evidence('request'),
    initiatingAttempt: null,
  }
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'bindExternalCall',
        input: {
          ...access,
          operation: operationId('bind'),
          expected: (await read()).revision,
          binding,
          qualification: evidence('qualified'),
        },
      },
    }),
  ).toHaveProperty('ok')
  const consumption = (await read()).consumptions[0]?.id
  if (consumption === undefined) throw new Error('missing consumption')
  const result = (version: string) => ({
    producer: binding.producer,
    version,
    delivery: version,
    source: evidence(version),
  })
  for (const version of ['1', '2'])
    expect(
      await a.port.commit({
        access,
        guards: [],
        command: {
          kind: 'preserveResult',
          input: {
            ...access,
            operation: operationId(`preserve-${version}`),
            consumption,
            result: result(version),
            custody: evidence(`custody-${version}`),
            participation: null,
          },
        },
      }),
    ).toHaveProperty('ok')
  const registered = (await read()).workEntryIndex?.calls.find(
    call => call.consumption === consumption,
  )?.registered
  if (registered === undefined) throw new Error('missing original call entry')
  const open = async () => {
    const view = await a.port.history.readModelView({
      ...access,
      basis: null,
      after: null,
      pageBytes: 100000,
    })
    if ('failure' in view || view.ok.kind !== 'page') throw new Error('missing view')
    const context = await a.port.history.readCompactionContext({
      ...access,
      basis: view.ok.basis,
      coverTo: null,
    })
    if ('failure' in context || context.ok.kind !== 'context') throw new Error('missing protection')
    return context.ok.value.open
  }
  expect(await open()).toContain(registered)
  for (const version of ['1', '2']) {
    expect(
      await a.port.commit({
        access,
        guards: [],
        command: {
          kind: 'completeExternalConsumption',
          input: {
            ...access,
            operation: operationId(`process-${version}`),
            expected: (await read()).revision,
            qualification: evidence('qualified'),
            completion: {
              consumption,
              result: result(version),
              position: binding.consumer.position,
              processing: evidence(`processed-${version}`),
              message: null,
            },
          },
        },
      }),
    ).toHaveProperty('ok')
    if (version === '1') expect(await open()).toContain(registered)
    else expect(await open()).not.toContain(registered)
  }
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'preserveResult',
        input: {
          ...access,
          operation: operationId('late-result'),
          consumption,
          result: result('3'),
          custody: evidence('custody-3'),
          participation: null,
        },
      },
    }),
  ).toHaveProperty('ok')
  expect(await open()).toContain(registered)
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'completeExternalConsumption',
        input: {
          ...access,
          operation: operationId('late-processing'),
          expected: (await read()).revision,
          qualification: evidence('qualified'),
          completion: {
            consumption,
            result: result('3'),
            position: binding.consumer.position,
            processing: evidence('processed-3'),
            message: null,
          },
        },
      },
    }),
  ).toHaveProperty('ok')
  expect(await open()).not.toContain(registered)
  expect(
    await a.port.commit({
      access,
      guards: [],
      command: {
        kind: 'preserveResult',
        input: {
          ...access,
          operation: operationId('repeated-custody'),
          consumption,
          result: result('3'),
          custody: evidence('custody-3'),
          participation: null,
        },
      },
    }),
  ).toHaveProperty('ok')
  expect(await open()).not.toContain(registered)
})

it('maintains protection without enumerating the historical consumption collection', async () => {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  const work = await a.port.readWork(a.access(TENANT_A))
  if ('failure' in work) throw new Error('missing work')
  const { port, db } = migratedPort()
  try {
    port.execute('INSERT INTO sl_compaction_head VALUES (?, ?, ?, ?, ?, ?)', [
      't',
      's',
      BigInt(work.ok.revision),
      '1',
      '[]',
      null,
    ])
    const current = {
      ...work.ok,
      pending: [],
      taken: [],
      get consumptions(): never {
        throw new Error('enumerated historical consumption identities')
      },
    }
    expect(() =>
      writeCompactionIndex(port, {
        tenant: 't',
        session: 's',
        previous: current,
        snapshot: current,
        entries: [],
      }),
    ).not.toThrow()
  } finally {
    db.close()
  }
})
