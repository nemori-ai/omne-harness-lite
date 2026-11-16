const fs = require('node:fs')
const path = require('node:path')
const { syncBuiltinESMExports } = require('node:module')

const control = process.env.SLOT_PUBLICATION_CONTROL
const actor = process.env.SLOT_PUBLICATION_ACTOR
const scenario = process.env.SLOT_PUBLICATION_CASE
const original = {
  openSync: fs.openSync,
  mkdirSync: fs.mkdirSync,
  readFileSync: fs.readFileSync,
  rmSync: fs.rmSync,
}
const used = new Set()
let acquired = 0
let ownerReads = 0

/** 队列锁目录里的条目 queue.lock/owner-<进程号>-<随机串>。 */
const isQueueEntry = file =>
  typeof file === 'string' &&
  path.basename(file).startsWith('owner-') &&
  path.basename(path.dirname(file)) === 'queue.lock'

/** 令牌 1 目录里的条目 core-1/owner-<进程号>-<随机串>。 */
const isTokenEntry = file =>
  typeof file === 'string' &&
  path.basename(file).startsWith('owner-') &&
  path.basename(path.dirname(file)) === 'core-1'

/** 别人的条目：对侧的进程号 1，登记不完整（不会按进程号判死，停留 30 秒以内不算失效）。 */
function foreignEntry(lock) {
  fs.writeFileSync(path.join(lock, 'owner-1-0bad'), 'pid=1\nside=other@fixture\n')
  mark('owner-conflict.ready')
}

function mark(name, value = '') {
  fs.writeFileSync(path.join(control, name), value)
}

function pause(name) {
  if (used.has(name)) return
  used.add(name)
  mark(`${name}.ready`)
  const deadline = performance.now() + 10_000
  while (!fs.existsSync(path.join(control, `${name}.continue`))) {
    if (performance.now() > deadline) throw new Error(`publication control timed out: ${name}`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}

fs.openSync = function (file, ...args) {
  const fd = original.openSync.call(fs, file, ...args)
  // 自己的条目刚建好，别人的条目随即出现：只有自己的条目才算持有，这时要退出重来。
  if (scenario === 'owner-replaced' && args[0] === 'wx' && isQueueEntry(file) && !used.has('replaced')) {
    used.add('replaced')
    foreignEntry(path.dirname(file))
  }
  if (scenario === 'publication' && actor === 'C' && args[0] === 'wx') {
    if (isQueueEntry(file)) pause('C-owner-open')
    if (isTokenEntry(file)) pause('C-slot-open')
  }
  return fd
}

fs.readFileSync = function (file, ...args) {
  const text = original.readFileSync.call(fs, file, ...args)
  if (actor === 'B' && isQueueEntry(file)) {
    mark('B-owner-read.ready')
    ownerReads += 1
    if (ownerReads >= 2) mark('B-owner-read-twice.ready')
    if (
      fs.existsSync(path.join(control, 'C-slot-open.ready')) &&
      !String(text).includes(`pid=${process.pid}\n`)
    )
      mark('B-owner-after-slot.ready')
  }
  if (actor === 'B' && isTokenEntry(file) && fs.existsSync(path.join(control, 'C.started')))
    mark('B-held-slot-read.ready')
  return text
}

fs.mkdirSync = function (file, ...args) {
  const result = original.mkdirSync.call(fs, file, ...args)
  if (path.basename(file) !== 'queue.lock' || args[0]?.recursive) return result
  acquired += 1
  mark(`${actor}-queue-acquisitions`, String(acquired))
  if (scenario === 'publication' && actor === 'B') pause('B-queue-created')
  // 建好目录、还没放自己的条目时，别人的条目已经在里面。
  if (scenario === 'owner-exists' && acquired === 1) foreignEntry(file)
  if (scenario === 'owner-missing' && acquired === 1) {
    original.rmSync.call(fs, file, { recursive: true })
    mark('owner-missing.ready')
  }
  return result
}

fs.rmSync = function (file, ...args) {
  const result = original.rmSync.call(fs, file, ...args)
  if (scenario === 'publication' && actor === 'B' && isTokenEntry(file)) pause('B-slot-removed')
  return result
}

syncBuiltinESMExports()
