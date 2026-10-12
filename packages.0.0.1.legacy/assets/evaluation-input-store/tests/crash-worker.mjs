// OS-process fault injector. All mutations go through the built public publisher and real SQLite.
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { publishLocalInputs } from '@omne-harness-lite/evaluation-input-store/publication'

process.once('message', async ({ file, deployedOfficial, payload, mode }) => {
  try {
    const decoded = readJsonStrict(payload)
    if ('failed' in decoded) throw new Error('invalid crash fixture payload')
    const storage = await openStorage({ dialect: 'sqlite', file })
    const sessionTenancy = createSessionTenancyReader(storage)
    const atomic = storage.atomic.bind(storage)
    const never = () => new Promise(() => {})
    storage.atomic = async callback => {
      if (mode === 'before_commit')
        return atomic(async unit => {
          const result = await callback(unit)
          process.send({ stage: 'before_commit' })
          await never()
          return result
        })
      const result = await atomic(callback)
      process.send({ stage: 'after_commit_before_ack' })
      await never()
      return result
    }
    await publishLocalInputs(
      {
        storage,
        sessionTenancy,
        storeKey: 'local-model-inputs',
        deployedOfficial,
        // Publishing is a trusted assembly write and must never consult this read-only port.
        memberships: {
          participate() {
            throw new Error('publisher unexpectedly consulted membership')
          },
        },
        diagnostics() {},
        onDiagnosticFailure() {},
        monotonicNow: process.hrtime.bigint,
      },
      decoded.ok,
    )
    throw new Error('kill checkpoint was not reached')
  } catch (error) {
    process.send({ failure: error instanceof Error ? error.name : 'unexpected failure' })
    process.exitCode = 1
  }
})
