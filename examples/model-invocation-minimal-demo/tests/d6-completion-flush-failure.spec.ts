import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {createDiagnosticCollector} from '@omne-harness-lite/model-request-runtime-local'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 actual JSONL flush failure', () => {
  it('keeps the accepted and written watermarks separate from a failed fsync and reports incomplete close', async () => {
    const parent = resolve('tmp/d6-completion')
    await fs.mkdir(parent, { recursive: true, mode: 0o700 })
    const directory = await fs.mkdtemp(join(parent, 'flush-'))
    const rootDir = join(directory, 'local')
    const tenant = unwrap(parseTenantId({ organization: 'd6-organization', account: 'd6-account' }))
    const base = createDemoDiagnosticConfig(directory, tenant, demoRetirement())
    const scope = { kind: 'local' as const }
    const store = await createDiagnosticJournal({
      ...base.collector,
      rootDir,
      collectorId: 'd6-flush-failure',
      scope,
      fs: {
        ...fs,
        open: async (path, flags, mode) => {
          const handle = await fs.open(path, flags, mode)
          if (
            flags !==
            (constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW)
          )
            return handle
          return new Proxy(handle, {
            get(target, key) {
              if (key === 'sync')
                return async () => {
                  throw new Error('controlled fsync EIO')
                }
              const value: unknown = Reflect.get(target, key, target)
              return typeof value === 'function' ? value.bind(target) : value
            },
          })
        },
      },
    })
    const collector = createDiagnosticCollector({
      ...base.collector,
      collectorId: 'd6-flush-failure',
      scope,
      store,
    })
    const accepted = collector.record(
      {
        source: 'assembly',
        stage: 'assembly',
        outcome: 'started',
        facts: { kind: 'diagnostics', reason: 'close_incomplete' },
      },
      scope,
    )
    expect(accepted).toEqual({ recorded: { collectorId: 'd6-flush-failure', sequence: '1' } })
    await expect.poll(() => collector.health().writtenSequence).toBe('1')
    expect(collector.health().flushedSequence).toBeUndefined()
    const closed = await collector.close()
    expect(closed).toMatchObject({ incomplete: { flushFailed: true }, coverage: 'degraded' })
    expect(collector.health()).toMatchObject({
      acceptedSequence: '1',
      writtenSequence: '1',
      flushFailures: 1,
      coverage: 'degraded',
    })
    expect(collector.health().flushedSequence).toBeUndefined()
    const names = await fs.readdir(join(rootDir, 'd6-flush-failure'))
    expect(names).toHaveLength(1)
    const file = join(rootDir, 'd6-flush-failure', names[0]!)
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
  })
})
