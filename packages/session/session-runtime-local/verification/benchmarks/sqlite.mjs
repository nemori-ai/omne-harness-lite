import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { at, tenant, user } from './data.mjs'

export async function openFixture(modules, directory, historyPolicy, seedDirectory) {
  const root = await mkdtemp(join(directory, 'session-log-'))
  const resources = []
  const counters = {
    sourceReads: 0,
    prefixReads: 0,
    suffixReads: 0,
    rowsReturned: 0,
    appendCalls: 0,
    rowsAppended: 0,
  }
  const { storage: sql, runtime: local, log: logModule } = modules
  try {
    let seedState
    if (seedDirectory) {
      seedState = JSON.parse(await readFile(join(seedDirectory, 'state.json'), 'utf8'))
      for (const name of ['tenant.sqlite', 'root.sqlite'])
        await cp(join(seedDirectory, name), join(root, name))
    }
    const storage = await sql.openStorage({
      dialect: 'sqlite',
      file: join(root, 'tenant.sqlite'),
      synchronous: 'full',
    })
    resources.push(() => storage.close())
    const rootStorage = await sql.openStorage({
      dialect: 'sqlite',
      file: join(root, 'root.sqlite'),
      synchronous: 'full',
    })
    resources.push(() => rootStorage.close())
    if (!seedState) {
      for (const fragment of local.admissionMigrations)
        await rootStorage.write(tx => fragment.migration.up(tx.db))
      for (const fragment of [
        ...local.admissionUseMigrations,
        ...logModule.sessionLogMigrations,
        ...local.sessionStateMigrations,
        ...local.operationReceiptMigrations,
        ...local.sessionRuntimeMigrations,
      ]) {
        await storage.write(tx => fragment.migration.up(tx.db))
      }
    }
    const source = {
      centerId: 'a'.repeat(32),
      accountId: 'benchmark',
      loginStateHandle: 'benchmark-login',
    }
    const admission = await local.createLocalAdmission(
      rootStorage,
      {
        verify: async (_source, target) =>
          target.purpose === 'startRun'
            ? { kind: 'valid' }
            : { kind: 'memberValid', role: 'member' },
      },
      { maxLogins: 8, maxTickets: 32, maxRecordBytes: 8192 },
    )
    resources.push(() => admission.close())
    let log
    const runtime = local.createLocalSessionIngress({
      storage,
      admission,
      source,
      tenant,
      principal: 'benchmark',
      policy: {
        maxSessions: 4,
        maxRecordBytes: 8192,
        maxInFlight: 8,
        maxSteps: 32,
        state: { maxPendingPerSession: 8, maxBatchSize: 8, maxRecordBytes: 8192 },
        receipts: { maxRecords: 32, maxRecordBytes: 8192 },
        modelHistory: historyPolicy,
      },
      log: authority => {
        log = logModule.openSqlSessionLog({ storage, authority, operationLimit: 32 })
        resources.push(() => log.close())
        const participant = { ...log.participant }
        for (const [method, counter] of [
          ['sourceIn', 'sourceReads'],
          ['readPrefixIn', 'prefixReads'],
          ['readSinceIn', 'suffixReads'],
        ]) {
          participant[method] = async (...args) => {
            counters[counter]++
            const result = await log.participant[method](...args)
            if ('entries' in result) counters.rowsReturned += result.entries.length
            return result
          }
        }
        return participant
      },
      bootstrap: { initialize: async () => 'ready' },
      now: async () => at,
      workSettledIn: async () => 'settled',
    })
    resources.push(() => runtime.close())
    const state = seedState ?? (await startRun(runtime))
    const scope = { tenant, session: state.session }
    const borrowed = await runtime.runJournal.borrow(
      runtime.coordinationAuthority,
      scope,
      state.run,
    )
    assert.ok('journal' in borrowed, JSON.stringify(borrowed))
    const journal = borrowed.journal
    resources.push(() => journal.close())
    const initial = await journal.readPrefix()
    assert.ok('entries' in initial, JSON.stringify(initial))
    return {
      runtime,
      journal,
      session: state.session,
      initial,
      counters,
      async append(entries) {
        counters.appendCalls++
        const result = await log.append(
          state.session,
          entries,
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        assert.ok('positions' in result, JSON.stringify(result))
        assert.equal(result.positions.length, entries.length)
        counters.rowsAppended += result.positions.length
        return result
      },
      async close(exportDirectory) {
        for (const close of resources.reverse()) await close()
        if (exportDirectory) {
          await mkdir(exportDirectory)
          for (const name of ['tenant.sqlite', 'root.sqlite'])
            await cp(join(root, name), join(exportDirectory, name))
          await writeFile(join(exportDirectory, 'state.json'), JSON.stringify(state))
        }
        await rm(root, { recursive: true })
      },
    }
  } catch (error) {
    const cleanup = []
    for (const close of resources.reverse()) {
      try {
        await close()
      } catch (failure) {
        cleanup.push(failure)
      }
    }
    if (cleanup.length) throw new AggregateError([error, ...cleanup], 'Fixture and cleanup failed')
    await rm(root, { recursive: true })
    throw error
  }
}

async function startRun(runtime) {
  const created = await runtime.operations.createSession(runtime.access, {
    operationKey: 'create',
    definition: { category: 'agent_definition', name: 'benchmark' },
    executionType: 'interactive',
    mode: 'never',
    collaboration: 'co-work',
  })
  assert.equal(created.kind, 'created', JSON.stringify(created))
  const submitted = await runtime.operations.submitInput(
    runtime.access,
    created.session,
    'input',
    user(-1),
  )
  assert.equal(submitted.kind, 'accepted', JSON.stringify(submitted))
  const scope = { tenant, session: created.session }
  const work = await runtime.readWork(runtime.coordinationAuthority, scope, 1)
  assert.equal(work.kind, 'work', JSON.stringify(work))
  const started = await runtime.lifecycle.commitStep(
    runtime.coordinationAuthority,
    scope,
    work.source,
    { kind: 'startRun', stepKey: 'start', inputPosition: work.inputs[0] },
  )
  assert.equal(started.kind, 'committed', JSON.stringify(started))
  return { session: created.session, run: started.receipt.run }
}
