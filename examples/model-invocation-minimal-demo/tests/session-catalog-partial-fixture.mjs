import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const [dir, session, tenantJson] = process.argv.slice(2)
if (!dir || !session || !tenantJson || !process.send)
  throw new Error('invalid partial write fixture')
const probe = await open(join(dir, '..', 'partial-write-probe'), 'w')
const prototype = Object.getPrototypeOf(probe)
await probe.close()
const write = prototype.write
prototype.write = async function (...args) {
  const bytes = args[0]
  if (
    ArrayBuffer.isView(bytes) &&
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
      Buffer.from('"oc1FirstCommit":true'),
    )
  ) {
    await write.call(this, bytes.subarray(0, Math.floor(bytes.byteLength / 2)))
    await this.datasync()
    process.send('partial-written')
    await new Promise(() => {})
  }
  return write.apply(this, args)
}
// The parent kills this actual writer and waits for its exit before authorizing recovery.
setInterval(() => {}, 1000)
const log = await openJsonlSessionLog({
  dir,
  processOwnership: { current: 'catalog-partial-child', observeExit: async () => 'unknown' },
})
await log.append(
  session,
  [{ tenant: JSON.parse(tenantJson), readKeys: [], payload: { oc1FirstCommit: true } }],
  { kind: 'unfenced' },
  { kind: 'unconditional' },
)
throw new Error('partial writer unexpectedly completed')
