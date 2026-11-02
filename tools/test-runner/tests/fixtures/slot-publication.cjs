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
  if (
    scenario === 'owner-replaced' &&
    args[0] === 'wx' &&
    path.basename(file) === 'owner' &&
    !used.has('replaced')
  ) {
    used.add('replaced')
    original.rmSync.call(fs, path.dirname(file), { recursive: true })
    original.mkdirSync.call(fs, path.dirname(file))
    fs.writeFileSync(file, 'pid=1\nside=other@fixture\n')
    mark('owner-conflict.ready')
  }
  if (scenario === 'publication' && actor === 'C' && args[0] === 'wx') {
    if (path.basename(file) === 'owner') pause('C-owner-open')
    if (path.basename(file) === 'slot-1.lock') pause('C-slot-open')
  }
  return fd
}

fs.readFileSync = function (file, ...args) {
  const text = original.readFileSync.call(fs, file, ...args)
  if (actor === 'B' && typeof file === 'string' && path.basename(file) === 'owner') {
    mark('B-owner-read.ready')
    ownerReads += 1
    if (ownerReads >= 2) mark('B-owner-read-twice.ready')
    if (
      fs.existsSync(path.join(control, 'C-slot-open.ready')) &&
      !String(text).includes(`pid=${process.pid}\n`)
    )
      mark('B-owner-after-slot.ready')
  }
  if (
    actor === 'B' &&
    typeof file === 'string' &&
    path.basename(file) === 'slot-1.lock' &&
    fs.existsSync(path.join(control, 'C.started'))
  )
    mark('B-held-slot-read.ready')
  return text
}

fs.mkdirSync = function (file, ...args) {
  const result = original.mkdirSync.call(fs, file, ...args)
  if (path.basename(file) !== 'queue.lock' || args[0]?.recursive) return result
  acquired += 1
  mark(`${actor}-queue-acquisitions`, String(acquired))
  if (scenario === 'publication' && actor === 'B') pause('B-queue-created')
  if (scenario === 'owner-exists' && acquired === 1) {
    fs.writeFileSync(path.join(file, 'owner'), 'pid=1\nside=other@fixture\n')
    mark('owner-conflict.ready')
  }
  if (scenario === 'owner-missing' && acquired === 1) {
    original.rmSync.call(fs, file, { recursive: true })
    mark('owner-missing.ready')
  }
  return result
}

fs.rmSync = function (file, ...args) {
  const result = original.rmSync.call(fs, file, ...args)
  if (scenario === 'publication' && actor === 'B' && path.basename(file) === 'slot-1.lock')
    pause('B-slot-removed')
  return result
}

syncBuiltinESMExports()
