import { performance } from 'node:perf_hooks'
import { ExactDecimal } from '../../packages/core/call-accounts/dist/index.js'
import { LosslessNumber } from '../../packages/core/content-blocks/dist/index.js'

// Structural probe, not the product assembler. No protocol or domain claims.
function materialize(record) {
  const fragments = []
  for (let item = record.fragments; item !== undefined; item = item.previous) fragments.push(item.text)
  return fragments.reverse().join('')
}
const samples = []
for (const count of [32, 256, 2048]) {
  for (let repetition = 0; repetition < 7; repetition++) {
    globalThis.gc?.()
    const heapBefore = process.memoryUsage().heapUsed
    let records = Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
      index: new LosslessNumber(String(index)), fragments: undefined,
    })))
    const old = records
    const begin = performance.now()
    for (let i = 0; i < 256; i++) {
      const index = new LosslessNumber(`${i % count}.0`)
      const sought = ExactDecimal.from(index)
      const slot = records.findIndex(record => ExactDecimal.from(record.index).compare(sought) === 0)
      const previous = records[slot]
      if (previous === undefined) throw new Error('record missing')
      const fragment = Object.freeze({ text: 'abcdefghijklmnopqrstuvwxyz012345', previous: previous.fragments })
      const replacement = Object.freeze({ ...previous, fragments: fragment })
      records = Object.freeze(records.map((record, position) => position === slot ? replacement : record))
    }
    const fillMs = performance.now() - begin
    const viewStart = performance.now()
    const view = Object.freeze(records.map(record => Object.freeze({ index: record.index, content: materialize(record) })))
    const snapshotMs = performance.now() - viewStart
    const settleStart = performance.now()
    const settlement = Object.freeze(records.map(record => Object.freeze({ kind: 'text', text: materialize(record) })))
    const settleMs = performance.now() - settleStart
    if (old.some(record => record.fragments !== undefined)) throw new Error('old candidate mutated')
    if (settlement.reduce((n, record) => n + record.text.length, 0) !== 256 * 32) throw new Error('content lost')
    samples.push({ count, repetition, fills: 256, fillMs, snapshotMs, settleMs,
      heapUsedDeltaBeforeSecondGcBytes: process.memoryUsage().heapUsed - heapBefore,
      viewBlocks: view.length, settlementBlocks: settlement.length })
  }
}
console.log(JSON.stringify({ node: process.version,
  boundary: 'mathematical-index linear lookup, frozen array update, immutable fragment chain; independent text materialization only; no protocol/product validation; heap delta is not retained memory', samples }, null, 2))
