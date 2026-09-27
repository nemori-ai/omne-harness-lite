import { openClientLocalState } from '../src/open.ts'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { join } from 'node:path'

const directory = process.argv[2]!
const state = await openClientLocalState({ directory })
const read = await state.read()
if (read.kind !== 'read') throw new Error('worker cannot read')
const original = read.snapshot
process.send?.({ kind: 'ready', storeId: original.storeId, revision: original.revision })
process.on('message', async (message: { kind: string; value?: unknown; operationId?: string }) => {
  if (message.kind === 'replace') {
    const result = await state.compareAndReplace(
      original.token,
      message.value,
      message.operationId!,
    )
    process.send?.({ kind: 'result', outcome: result.kind })
  } else if (message.kind === 'hold') {
    const storage = await openStorage({
      dialect: 'sqlite',
      file: join(directory, 'client.sqlite'),
      synchronous: 'full',
    })
    await storage.write(async tx => {
      await tx.db
        .updateTable('client_local_state')
        .set({ revision: 987, operation_id: 'uncommitted-killed-process' })
        .where('singleton', '=', 1)
        .execute()
      process.send?.({ kind: 'holding' })
      await new Promise<void>(() => {})
    })
  } else if (message.kind === 'close') {
    await state.close()
    process.disconnect()
  }
})
