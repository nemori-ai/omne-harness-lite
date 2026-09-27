import { writeSync } from 'node:fs'
import { bootAssembly } from '@omne-harness-lite/kernel-basis/testing'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { modelProfileDirectoryPlugin } from '@omne-harness-lite/model-profile-directory/plugin'

const file = process.argv[2]
const manifest = JSON.parse(process.argv[3])
const actual = await openStorage({ dialect: 'sqlite', file })
let historyInserts = 0
const killOnSecondHistoryInsert = {
  transformQuery({ node }) {
    if (
      node.kind === 'InsertQueryNode' &&
      node.into?.table?.identifier?.name === 'model_profile_configuration' &&
      ++historyInserts === 2
    ) {
      writeSync(1, 'second-history-insert-before-commit\n')
      process.kill(process.pid, 'SIGKILL')
    }
    return node
  },
  async transformResult({ result }) {
    return result
  },
}
const storage = {
  read: actual.read.bind(actual),
  atomic: actual.atomic.bind(actual),
  write: fn => actual.write(tx => fn({ ...tx, db: tx.db.withPlugin(killOnSecondHistoryInsert) })),
}
await bootAssembly({
  services: [
    { name: 'storage', value: storage },
    { name: 'clock', value: { now: () => Date.now() } },
    {
      name: 'memberships',
      value: {
        standing: () => {
          throw new Error('not used by manifest')
        },
      },
    },
  ],
  plugins: [
    {
      plugin: modelProfileDirectoryPlugin,
      config: { faceMode: 'singleProcessCatalog', officialManifest: manifest },
    },
  ],
})
throw new Error('injection point was not reached')
