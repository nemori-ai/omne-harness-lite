import { performance } from 'node:perf_hooks'

// A structure-only probe: no protocol validation, parsing, audio or domain result
// claims. All numbers below measure this candidate, not production throughput.
const samples = []
for (const count of [32, 256, 2048]) {
  for (let repetition = 0; repetition < 7; repetition++) {
    globalThis.gc?.()
    const heapBefore = process.memoryUsage().heapUsed
    const setup = performance.now()
    let records = Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
      index, fragments: undefined,
    })))
    const setupMs = performance.now() - setup
    const old = records
    const begin = performance.now()
    for (let i = 0; i < 256; i++) {
      const index = i % count
      const previous = records[index]
      const fragment = Object.freeze({ text: 'abcdefghijklmnopqrstuvwxyz012345', previous: previous.fragments })
      const replacement = Object.freeze({ ...previous, fragments: fragment })
      records = Object.freeze(records.map((record, slot) => slot === index ? replacement : record))
    }
    const fillMs = performance.now() - begin
    const viewStart = performance.now()
    const view = Object.freeze(records.map(record => {
      const fragments = []
      for (let item = record.fragments; item !== undefined; item = item.previous) fragments.push(item.text)
      return Object.freeze({ index: record.index, content: fragments.reverse().join('') })
    }))
    const snapshotMs = performance.now() - viewStart
    const settleStart = performance.now()
    const settlement = Object.freeze(view.map(record => Object.freeze({ kind: 'text', text: record.content })))
    const settleMs = performance.now() - settleStart
    if (old.some(record => record.fragments !== undefined)) throw new Error('old candidate mutated')
    if (settlement.reduce((n, record) => n + record.text.length, 0) !== 256 * 32) throw new Error('content lost')
    samples.push({ count, repetition, fills: 256, setupMs, fillMs, snapshotMs, settleMs, retainedHeapDeltaBytes: process.memoryUsage().heapUsed - heapBefore })
  }
}
console.log(JSON.stringify({ node: process.version, boundary: 'frozen record array + immutable fragment chain only; protocol work excluded', samples }, null, 2))
