// Design-mechanism probe only: no product, Sonic, flock or business data implementation.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const sandbox = path.resolve(process.argv[2] ?? '')
assert(process.argv[2], 'pass a fresh sandbox path')
await fs.mkdir(sandbox) // EEXIST deliberately fails a non-fresh replay
const cases = []
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return {promise, resolve} }

// Concrete in-memory quota arithmetic under test, not a proposed public abstraction.
class Ledger {
  constructor(directory, maxBytes, maxFiles, initialBytes = 0, initialFiles = 0) {
    Object.assign(this, {directory, maxBytes, maxFiles, charged: initialBytes, reserved: 0,
      files: initialFiles, slots: 0, sources: new Map()})
  }
  invariant() {
    assert(this.charged <= this.maxBytes)
    assert(this.files + this.slots <= this.maxFiles)
    assert(this.reserved >= 0 && this.reserved <= this.charged)
  }
  create(id, {gate, failBefore = false, failAfter = false} = {}) {
    if (this.sources.has(id)) return this.sources.get(id).promise
    if (this.files + this.slots >= this.maxFiles) return Promise.resolve({status: 'capacity'})
    this.slots++ // before any await or actual open
    const s = {id, file: path.join(this.directory, id), fd: null, charge: 0, reserved: 0, closed: false}
    this.sources.set(id, s)
    s.promise = (async () => {
      try {
        if (gate) await gate
        if (failBefore) throw new Error('injected_before_open')
        s.fd = await fs.open(s.file, 'wx', 0o600)
        this.slots--; this.files++
        if (failAfter) throw new Error('injected_after_open')
        return {status: 'created', source: s}
      } catch (error) {
        if (s.fd) { await s.fd.close(); s.fd = null; s.closed = true }
        else { this.slots--; this.sources.delete(id) }
        return {status: 'failed', error: error.message, source: s}
      } finally { this.invariant() }
    })()
    return s.promise
  }
  reserve(s, bytes, sourceCap = 60) {
    if (s.closed || s.charge + bytes > sourceCap || this.charged + bytes > this.maxBytes) return false
    s.charge += bytes; s.reserved += bytes; this.charged += bytes; this.reserved += bytes
    this.invariant(); return true
  }
  async writePrefix(s, bytes) {
    assert(s.fd && bytes <= s.reserved)
    const result = await s.fd.write(Buffer.alloc(bytes, 0x78))
    assert.equal(result.bytesWritten, bytes)
    s.reserved -= bytes; this.reserved -= bytes // charge does not change
    this.invariant()
  }
  releaseUnsubmitted(s, bytes) {
    assert(bytes <= s.reserved)
    s.charge -= bytes; s.reserved -= bytes; this.charged -= bytes; this.reserved -= bytes
    this.invariant()
  }
  async closeAndReconcile(s, failStat = false) {
    if (s.fd) { await s.fd.close(); s.fd = null; s.closed = true }
    // The probe has no remaining callbacks after awaiting writePrefix.
    if (failStat) return 'blocked'
    const size = (await fs.stat(s.file)).size
    assert(size <= s.charge)
    this.charged -= s.charge - size; this.reserved -= s.reserved
    s.charge = size; s.reserved = 0
    this.invariant(); return 'closed' // file and materialized slot deliberately remain
  }
  snapshot() { return {charged: this.charged, reserved: this.reserved, files: this.files, slots: this.slots} }
}

const bytesDir = path.join(sandbox, 'bytes')
await fs.mkdir(bytesDir)
await fs.writeFile(path.join(bytesDir, 'historical'), Buffer.alloc(40, 0x68))
const ledger = new Ledger(bytesDir, 100, 4, 40, 1)
const a = (await ledger.create('old-generation')).source
assert(ledger.reserve(a, 35)) // still no actual write; absent from physical lstat
const b = (await ledger.create('new-generation')).source
assert.equal((await fs.stat(a.file)).size, 0)
assert.equal(ledger.reserve(b, 26), false)
assert(ledger.reserve(b, 25))
const heldPending = ledger.snapshot()
assert.deepEqual(heldPending, {charged: 100, reserved: 60, files: 3, slots: 0})
await ledger.writePrefix(a, 10) // real 10-byte prefix, then inject unknown/error for the remainder
await ledger.writePrefix(b, 25)
assert.equal(await ledger.closeAndReconcile(a, true), 'blocked')
assert.equal(ledger.reserve(b, 1), false) // failed final stat cannot free the unwritten 25
const failedReconcile = ledger.snapshot()
assert.deepEqual(failedReconcile, {charged: 100, reserved: 25, files: 3, slots: 0})
assert.equal(await ledger.closeAndReconcile(a), 'closed')
assert.deepEqual(ledger.snapshot(), {charged: 75, reserved: 0, files: 3, slots: 0})
assert(ledger.reserve(b, 25))
await ledger.writePrefix(b, 25)
await ledger.closeAndReconcile(b)
const actualBytes = (await Promise.all((await fs.readdir(bytesDir)).map(async f => (await fs.stat(path.join(bytesDir, f))).size))).reduce((a,b) => a+b, 0)
assert.equal(actualBytes, 100)
cases.push({name: 'pending-old-new-and-partial-write-reconcile', heldPending, failedReconcile, final: ledger.snapshot(), actualBytes})

const slotDir = path.join(sandbox, 'slots')
await fs.mkdir(slotDir)
const one = new Ledger(slotDir, 100, 1)
const hold = deferred()
const first = one.create('only', {gate: hold.promise})
const duplicate = one.create('only')
assert.equal(first, duplicate)
assert.equal((await one.create('competing')).status, 'capacity')
assert.equal((await fs.readdir(slotDir)).length, 0)
assert.deepEqual(one.snapshot(), {charged: 0, reserved: 0, files: 0, slots: 1})
hold.resolve()
const [created, joined] = await Promise.all([first, duplicate])
assert.equal(created.source, joined.source)
await one.closeAndReconcile(created.source)
assert.equal((await one.create('after-close')).status, 'capacity')
assert.equal((await fs.readdir(slotDir)).length, 1)
cases.push({name: 'pending-slot-duplicate-and-retained-file', final: one.snapshot(), actualFiles: 1})

const failDir = path.join(sandbox, 'prepare-failure')
await fs.mkdir(failDir)
const failed = new Ledger(failDir, 100, 1)
assert.equal((await failed.create('pre-open', {failBefore: true})).status, 'failed')
assert.deepEqual(failed.snapshot(), {charged: 0, reserved: 0, files: 0, slots: 0})
assert.equal((await failed.create('post-open', {failAfter: true})).status, 'failed')
assert.equal((await failed.create('third')).status, 'capacity')
assert.deepEqual(await fs.readdir(failDir), ['post-open'])
cases.push({name: 'prepare-failure-retains-empty-original', final: failed.snapshot(), actualFiles: 1})

const dropDir = path.join(sandbox, 'unsubmitted')
await fs.mkdir(dropDir)
const drop = new Ledger(dropDir, 20, 1)
const d = (await drop.create('drop')).source
assert(drop.reserve(d, 20))
drop.releaseUnsubmitted(d, 20) // deliberately no fs submission before this release
assert.equal((await fs.stat(d.file)).size, 0)
assert(drop.reserve(d, 20))
await drop.writePrefix(d, 20)
await drop.closeAndReconcile(d)
cases.push({name: 'confirmed-unsubmitted-reservation-release', final: drop.snapshot(), actualBytes: 20})

assert([...ledger.sources.values(), ...one.sources.values(), ...failed.sources.values(), ...drop.sources.values()].every(s => !s.fd))
console.log(JSON.stringify({status: 'passed', kind: 'design-mechanism-only', node: process.version,
  platform: process.platform, arch: process.arch, release: os.release(), sandbox, cases,
  cleanup: {openFileHandles: 0, artifactsRetained: true},
  notMeasured: ['product D1-R1 GREEN', 'Sonic callback/drop integration', 'flock integration',
    'fd close ambiguity', 'root owner shutdown', 'crash/restart', 'native installation']}, null, 2))
