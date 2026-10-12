import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations } from '@omne-harness-lite/storage'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { assemblyManifestMigrations, createAssemblyManifestStore } from '../dist/index.js'

process.once('message', async message => {
  try {
    const storage = await openStorage({
      dialect: 'sqlite',
      file: message.file,
      migrations: composeMigrations(assemblyManifestMigrations),
      upgrade: false,
    })
    const actual = storage.write.bind(storage)
    const pause = () => new Promise(() => {})
    const wrapped = {
      read: storage.read.bind(storage),
      write: async fn => {
        const result = await actual(async tx => {
          const value = await fn(tx)
          if (message.when === 'before') {
            process.send({ stage: 'before_commit' })
            await pause()
          }
          return value
        })
        if (message.when === 'after') {
          process.send({ stage: 'committed_before_ack' })
          await pause()
        }
        return result
      },
    }
    const parsed = readJsonStrict(message.body)
    if ('failed' in parsed) throw new Error('invalid IPC JSON input')
    await createAssemblyManifestStore(wrapped).append('session', 0, parsed.ok)
    throw new Error('crash stage was not reached')
  } catch (error) {
    process.send({ failure: error instanceof Error ? error.name : 'unexpected' })
    process.exitCode = 1
  }
})
