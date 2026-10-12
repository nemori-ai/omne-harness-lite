import { openCliCatalog } from '../src/catalog-open.ts'
import { centerProfile } from '../src/catalog-values.ts'

const home = process.argv[2]
if (home === undefined) throw new Error('missing worker home')
const owned = await openCliCatalog(home, {
  maxCenters: 8,
  maxCreations: 8,
  maxRecordBytes: 64 * 1024,
})
process.send?.({ kind: 'ready', snapshot: await owned.catalog.readSelection() })
process.on('message', async (message: unknown) => {
  if (typeof message !== 'object' || message === null || !('kind' in message))
    throw new Error('invalid worker message')
  if (message.kind === 'register' && 'profile' in message) {
    process.send?.({
      kind: 'result',
      outcome: await owned.catalog.registerCenter(centerProfile(message.profile)),
    })
  } else if (message.kind === 'close') {
    await owned.close()
    process.disconnect()
  } else throw new Error('unknown worker message')
})
