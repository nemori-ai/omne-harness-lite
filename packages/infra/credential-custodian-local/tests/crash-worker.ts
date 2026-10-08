// A real child process killed at an actual SQLite mutation/commit boundary; no product source edits.
import { openStorage } from '@omne-harness-lite/storage-sql'
import { createModelReplicaCustodian } from '../src/model-replica.ts'
import { bodyA, fixtureReader, instant, login, refA, tenant } from './support.ts'

const [file, keyFile, phase] = process.argv.slice(2)
if (file === undefined || keyFile === undefined || (phase !== 'upserted' && phase !== 'committed'))
  throw new Error('crash worker input invalid')
const storage = await openStorage({ dialect: 'sqlite', file })
process.stdin.resume()
const hold = () => new Promise<void>(resolve => process.stdin.once('data', () => resolve()))
if (phase === 'upserted') {
  const atomic = storage.atomic.bind(storage)
  storage.atomic = fn =>
    atomic(unit => {
      const mutate = unit.mutate.bind(unit)
      let mutations = 0
      unit.mutate = async operation => {
        const result = await mutate(operation)
        mutations++
        if (mutations === 2) {
          process.stdout.write('upserted\n')
          await hold()
        }
        return result
      }
      return fn(unit)
    })
}
const c = await createModelReplicaCustodian({
  storage,
  keyFile,
  clock: { now: async () => instant },
  readCredentialBindingIn: fixtureReader(storage),
  diagnostics: { record() {}, sinkFailure() {} },
})
const result = await c.storeBoundReplica({
  tenant,
  loginState: login,
  sourceRef: refA,
  body: bodyA,
})
if (!('stored' in result) || !result.stored) throw new Error('crash worker did not store')
process.stdout.write('committed\n')
await hold()
await c.close()
await storage.close()
process.stdin.pause()
