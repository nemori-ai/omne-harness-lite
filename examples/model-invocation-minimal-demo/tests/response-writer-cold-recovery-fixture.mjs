import { writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'

// Loaded only in the controlled child through NODE_OPTIONS. The hit file is a
// test synchronization point, never a durability or process-exit authority.
const marker = process.env.OMNE_TEST_RESPONSE_WRITER_MARKER
const mode = process.env.OMNE_TEST_RESPONSE_WRITER_MODE
if (!marker || (mode !== 'after-write' && mode !== 'before-write'))
  throw new Error('response writer fault fixture is unconfigured')

const probe = await open(`${marker}.probe`, 'w')
const fileHandle = Object.getPrototypeOf(probe)
await probe.close()
const originalWrite = fileHandle.write
const originalDatasync = fileHandle.datasync
const originalTruncate = fileHandle.truncate
const responseFiles = new WeakSet()
let hit = false
let repairFailed = false
const fault = () => Object.assign(new Error('controlled response writer fault'), { code: 'EIO' })

function markHit(point) {
  if (hit) return
  hit = true
  writeFileSync(marker, point, { flag: 'wx', mode: 0o600 })
}

fileHandle.write = async function (...args) {
  const bytes = args[0]
  const responseBatch =
    ArrayBuffer.isView(bytes) &&
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
      Buffer.from('"category":"response"'),
    )
  if (responseBatch) responseFiles.add(this)
  if (responseBatch && mode === 'before-write') {
    markHit('before-response-write')
    throw fault()
  }
  return originalWrite.apply(this, args)
}

fileHandle.datasync = async function (...args) {
  if (mode === 'after-write' && responseFiles.has(this)) {
    markHit('after-response-write-before-datasync')
    throw fault()
  }
  return originalDatasync.apply(this, args)
}

fileHandle.truncate = async function (...args) {
  if (responseFiles.has(this)) {
    if (!repairFailed) {
      repairFailed = true
      writeFileSync(`${marker}.repair-failed`, 'response-repair-failed', {
        flag: 'wx',
        mode: 0o600,
      })
    }
    throw fault()
  }
  return originalTruncate.apply(this, args)
}
