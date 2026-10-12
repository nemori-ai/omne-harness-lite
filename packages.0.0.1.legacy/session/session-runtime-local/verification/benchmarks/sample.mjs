import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { mkdir } from 'node:fs/promises'
import { loadArtifacts, createAdapter } from './artifacts.mjs'
import {
  at,
  seed,
  tenant,
  user,
  group,
  history,
  prepare,
  locate,
  digest,
  checkCut,
  integer,
} from './data.mjs'
import { openFixture } from './sqlite.mjs'

export async function runSample(options) {
  const modules = await loadArtifacts(options.root)
  if (options.seedOnly) {
    const fixture = await openFixture(modules, options.directory, options.historyPolicy)
    const initialDigest = digest(fixture.initial.entries)
    await fixture.close(options.seedDirectory)
    return {
      seed: options.seedDirectory,
      initialDigest,
      hashes: modules.hashes,
      unexpectedErrors: 0,
    }
  }
  const adapter = createAdapter(modules, options.adapter)
  const records = []
  const rejections = []
  let sink = 0
  async function measure(name, operation, check) {
    const before = process.memoryUsage()
    const cpu = process.cpuUsage()
    const start = performance.now()
    const value = await operation()
    const elapsedMs = performance.now() - start
    const used = process.cpuUsage(cpu)
    const after = process.memoryUsage()
    const work = check(value)
    sink += work.rows ?? 1
    records.push({
      name,
      elapsedMs,
      cpuUserMs: used.user / 1000,
      cpuSystemMs: used.system / 1000,
      heapUsedDelta: after.heapUsed - before.heapUsed,
      rssAfter: after.rss,
      ...work,
    })
    return value
  }
  const session = 'benchmark-session'
  const source = tail => ({ tenant, session, journalGeneration: 'benchmark-generation', tail })
  const generated = history(modules, session, options.groups)
  const initialEntries = locate(generated, session)
  const initialRead = { entries: initialEntries, source: source(initialEntries.length) }
  let cut
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    cut = await measure(
      'codec.cold-capture-inspect',
      () => adapter.capture(null, initialRead),
      value => checkCut(adapter, value, initialEntries, modules.values),
    )
  }
  const oldCut = cut
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    cut = await measure(
      'codec.same-tail-capture-inspect',
      () =>
        options.adapter === 'owned'
          ? adapter.capture(cut, { entries: [], source: source(initialEntries.length) })
          : adapter.capture(null, initialRead),
      value => {
        checkCut(adapter, value, initialEntries, modules.values)
        return { rows: 0, prefixRows: initialEntries.length, bytes: 0 }
      },
    )
  }
  let expected = initialEntries
  let nextGroup = options.groups
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const entry = prepare(modules, session, 'message', user(nextGroup++), { kind: 'message' })
    const suffix = locate([entry], session, expected.length)
    expected = [...expected, ...suffix]
    cut = await measure(
      'codec.append-single-capture-inspect',
      () => adapter.capture(cut, { entries: suffix, source: source(expected.length) }),
      value => ({ ...checkCut(adapter, value, expected, modules.values), appendedRows: 1 }),
    )
    const batch = locate(group(modules, session, nextGroup++), session, expected.length)
    expected = [...expected, ...batch]
    cut = await measure(
      'codec.append-batch-capture-inspect',
      () => adapter.capture(cut, { entries: batch, source: source(expected.length) }),
      value => ({
        ...checkCut(adapter, value, expected, modules.values),
        appendedRows: batch.length,
      }),
    )
    checkOldCut(adapter, oldCut, initialEntries, modules.values)
  }
  checkCut(adapter, cut, expected, modules.values)
  await queries('codec', cut, expected, adapter, measure, options.iterations)
  checkFailures(modules, adapter, initialRead, rejections)

  const finalCodec = checkCut(adapter, cut, expected, modules.values)
  checkCapacity(finalCodec, options.historyPolicy)
  const finish = (sqlite = null, seedDigest = null) => ({
    version: 1,
    adapter: options.adapter,
    groups: options.groups,
    initialRows: initialEntries.length,
    iterations: options.iterations,
    seed,
    at,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    hashes: modules.hashes,
    records,
    expectedRejections: rejections,
    unexpectedErrors: 0,
    sink,
    finalCodec,
    seedDigest,
    historyPolicy: options.historyPolicy,
    sqlite,
    memoryNote:
      'Heap deltas include allocation and GC. RSS is a process observation, not a retained-size or hard-bound claim.',
    countersNote:
      'Read counters observe real public participant calls and returned row counts. Decoder, copy, SQL statement and tree-node counts are not exposed.',
  })
  if (!options.sqlite) return finish()

  await mkdir(options.directory, { recursive: true })
  const fixture = await openFixture(
    modules,
    options.directory,
    options.historyPolicy,
    options.seedDirectory,
  )
  let sqliteSummary
  try {
    const dbGenerated = history(modules, fixture.session, options.groups)
    await fixture.append(dbGenerated)
    let dbExpected = [
      ...fixture.initial.entries,
      ...locate(dbGenerated, fixture.session, fixture.initial.entries.length),
    ]
    const beforeCold = { ...fixture.counters }
    let dbCut = await measure(
      'sqlite.cold-read-capture-inspect',
      () => adapter.read(fixture.runtime, fixture.journal),
      value => ({
        ...checkCut(adapter, value, dbExpected, modules.values),
        ...checkedReadCounters(fixture.counters, beforeCold, dbExpected.length),
      }),
    )
    const dbOldCut = dbCut
    const dbOldExpected = dbExpected
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      const before = { ...fixture.counters }
      dbCut = await measure(
        'sqlite.same-tail-read-inspect',
        () => adapter.read(fixture.runtime, fixture.journal),
        value => {
          checkCut(adapter, value, dbExpected, modules.values)
          return {
            rows: 0,
            prefixRows: dbExpected.length,
            ...checkedReadCounters(
              fixture.counters,
              before,
              options.adapter === 'owned' ? 0 : dbExpected.length,
            ),
          }
        },
      )
    }
    nextGroup = options.groups
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      for (const kind of ['single', 'batch']) {
        const append =
          kind === 'single'
            ? [prepare(modules, fixture.session, 'message', user(nextGroup++), { kind: 'message' })]
            : group(modules, fixture.session, nextGroup++)
        await measure(
          `sqlite.append-${kind}`,
          () => fixture.append(append),
          result => {
            assert.equal(integer(result.tail), dbExpected.length + append.length)
            return {
              rows: append.length,
              bytes: Buffer.byteLength(modules.values.writeJsonLossless(append)),
            }
          },
        )
        dbExpected = [...dbExpected, ...locate(append, fixture.session, dbExpected.length)]
        const before = { ...fixture.counters }
        dbCut = await measure(
          `sqlite.suffix-${kind}-read-inspect`,
          () => adapter.read(fixture.runtime, fixture.journal),
          value => ({
            ...checkCut(adapter, value, dbExpected, modules.values),
            appendedRows: append.length,
            ...checkedReadCounters(
              fixture.counters,
              before,
              options.adapter === 'owned' ? append.length : dbExpected.length,
            ),
          }),
        )
        checkOldCut(adapter, dbOldCut, dbOldExpected, modules.values)
      }
    }
    await queries('sqlite-owned-cut', dbCut, dbExpected, adapter, measure, options.iterations)
    sqliteSummary = {
      ...checkCut(adapter, dbCut, dbExpected, modules.values),
      counters: fixture.counters,
    }
    checkCapacity(sqliteSummary, options.historyPolicy)
    await fixture.journal.close()
    const closed = await fixture.journal.readPrefix()
    assert.equal(closed.failure, 'unavailable')
    rejections.push({ case: 'closed-journal-read', result: closed, expected: true })
  } finally {
    await fixture.close()
  }
  return finish(sqliteSummary, digest(fixture.initial.entries))
}

function checkCapacity(cut, policy) {
  assert.ok(cut.rows <= policy.maxEntries, 'Fixture exceeds the configured entry limit')
  assert.ok(cut.bytes <= policy.maxContentBytes, 'Fixture exceeds the configured content limit')
  if (cut.indexReferences !== null)
    assert.ok(
      cut.indexReferences <= policy.maxIndexReferences,
      'Fixture exceeds the configured index-reference limit',
    )
}

function counterDelta(current, before) {
  return Object.fromEntries(Object.keys(current).map(key => [key, current[key] - before[key]]))
}

function checkedReadCounters(current, before, rows) {
  const delta = counterDelta(current, before)
  assert.equal(delta.sourceReads, 1, 'Each read must obtain its actual current source')
  assert.equal(
    delta.prefixReads + delta.suffixReads,
    1,
    'Each read must obtain a real prefix or suffix',
  )
  assert.equal(delta.rowsReturned, rows, 'Public journal row count differs from expected work')
  return delta
}

function checkOldCut(adapter, cut, expected, values) {
  checkCut(adapter, cut, expected, values)
  assert.equal(adapter.at(cut, expected.length + 1), undefined)
  for (const [kind, id] of [
    ['message', 'user-0'],
    ['response', 'response-0'],
  ]) {
    const entries = adapter.select(cut, { kind, id }).map(item => item.entry)
    const raw = expected.filter(entry =>
      kind === 'message'
        ? entry.payload.kind === 'message' && entry.payload.value.id === id
        : entry.payload.value?.category === 'response' && entry.payload.value.value.id === id,
    )
    assert.equal(digest(entries), digest(raw), 'An old cut changed its identity answer')
  }
}

async function queries(prefix, cut, expected, adapter, measure, iterations) {
  const dispatched = expected.find(
    entry => entry.payload?.value?.value?.kind === 'model_call_dispatched',
  )
  assert.ok(dispatched)
  const record = dispatched.payload.value.value
  const opened = expected.find(
    entry =>
      entry.payload?.value?.value?.kind === 'model_call_opened' &&
      entry.payload.value.value.call === record.call,
  )
  assert.ok(opened)
  const callEntries = expected.filter(entry => {
    const value = entry.payload?.value
    return value?.value?.call === record.call || value?.value?.call?.callId === record.call
  })
  const responseEntries = expected.filter(
    entry =>
      entry.payload?.value?.category === 'response' &&
      entry.payload.value.value.id === record.response,
  )
  const messageEntries = expected.filter(
    entry =>
      entry.payload?.kind === 'message' &&
      entry.payload.value.id === `assistant-${record.call.slice(5)}`,
  )
  for (let iteration = 0; iteration < iterations; iteration++) {
    await measure(
      `${prefix}.lookup-missing`,
      () => ({
        position: adapter.at(cut, expected.length + 1),
        message: adapter.select(cut, { kind: 'message', id: 'missing-message' }),
        response: adapter.select(cut, { kind: 'response', id: 'missing-response' }),
        call: adapter.select(cut, { kind: 'call', call: 'missing-call' }),
      }),
      value => {
        assert.deepEqual(value, { position: undefined, message: [], response: [], call: [] })
        return { rows: 0, digest: digest(value) }
      },
    )
    const position = Math.floor(expected.length / 2) + 1
    await measure(
      `${prefix}.lookup-position`,
      () => adapter.at(cut, position),
      value => {
        assert.equal(digest(value), digest(expected[position - 1]))
        return { rows: 1, digest: digest(value) }
      },
    )
    for (const [kind, selector, rows] of [
      ['message', { kind: 'message', id: messageEntries[0].payload.value.id }, messageEntries],
      ['response', { kind: 'response', id: record.response }, responseEntries],
      ['call', { kind: 'call', call: record.call }, callEntries],
    ]) {
      await measure(
        `${prefix}.lookup-${kind}`,
        () => adapter.select(cut, selector),
        value => {
          const entries = value.map(item => item.entry)
          assert.equal(
            digest(entries),
            digest(rows),
            `${prefix} ${kind} query differs from raw input`,
          )
          return { rows: entries.length, digest: digest(entries) }
        },
      )
    }
    await measure(
      `${prefix}.settlement-prepare`,
      () =>
        cut.inspector.inspectSettlementMembers({
          target: { call: record.call, dispatch: 1, response: record.response },
          anchors: { dispatched, opened, intent: null },
          current: null,
        }),
      value => {
        assert.ok('completeMembers' in value, JSON.stringify(value))
        const entries = value.completeMembers.entries
        assert.equal(
          digest(entries),
          digest(
            expected.filter(
              entry => responseEntries.includes(entry) || messageEntries.includes(entry),
            ),
          ),
        )
        return { rows: entries.length, digest: digest(entries) }
      },
    )
  }
}

function checkFailures(modules, adapter, initialRead, rejections) {
  const malformed = {
    ...initialRead,
    entries: [{ ...initialRead.entries[0], position: 2 }, ...initialRead.entries.slice(1)],
  }
  assert.throws(() => adapter.capture(null, malformed))
  rejections.push({ case: 'noncontiguous-position', expected: true })
  const unknown = {
    ...initialRead,
    entries: [
      {
        ...initialRead.entries[0],
        payload: {
          owner: 'model-request-runtime',
          version: 'mrr/unknown',
          kind: 'fact',
          value: { category: 'record', value: {} },
        },
      },
      ...initialRead.entries.slice(1),
    ],
  }
  assert.throws(() => adapter.capture(null, unknown))
  rejections.push({ case: 'unsupported-model-format', expected: true })
  assert.notEqual(
    digest(initialRead.entries),
    digest(initialRead.entries.slice(1)),
    'Digest must detect a dropped row',
  )
  const valid = adapter.capture(null, initialRead)
  assert.throws(
    () => checkCut(adapter, valid, initialRead.entries.slice(1), modules.values),
    'Oracle must reject a dropped row',
  )
  rejections.push({ case: 'oracle-dropped-row-negative-control', expected: true })
}
