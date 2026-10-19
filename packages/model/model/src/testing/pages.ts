import type { ResultPart, ResultPage, Settlement } from '@omne-harness/model-contract'
import type { MemoryCall } from './state.ts'
import { canonical } from './value.ts'

export const MAX_TERMINATION_BYTES = 4096
export const MAX_SETTLEMENT_BYTES = 8192
export const MAX_CUSTODY_BYTES = 12288
export const MAX_CONTROL_BYTES = 1024
export const MAX_PAGE_CURSOR = String(Number.MAX_SAFE_INTEGER)

export function encodedBytes(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}
export function resultParts(call: MemoryCall): readonly ResultPart[] {
  return call.dispatches.flatMap(dispatch =>
    dispatch.blocks.flatMap((block): ResultPart[] => {
      const trims = dispatch.trims.get(block.index) ?? []
      if (block.kind === 'sealed') return [{ kind: 'sealed', block: block.block, trims }]
      return dispatch.hadContent.has(block.index) || trims.length > 0
        ? [{ kind: 'partial', content: block.content, value: block.value, trims }]
        : []
    }),
  )
}
export function pageEnd(
  parts: readonly ResultPart[],
  offset: number,
  limit: number,
  target: number,
): number {
  let end = Math.min(offset + 1, parts.length)
  while (
    end < parts.length &&
    end - offset < limit &&
    encodedBytes(parts.slice(offset, end + 1)) <= target
  )
    end += 1
  return end
}
export function makePage(
  parts: readonly ResultPart[],
  offset: number,
  limit: number,
  target: number,
  settlement: Settlement,
): ResultPage {
  const end = pageEnd(parts, offset, limit, target)
  return {
    parts: parts.slice(offset, end),
    next: end < parts.length ? String(end) : null,
    settlement,
  }
}

export function materialBytes(call: MemoryCall): bigint {
  const settlement = call.state.phase === 'settled' ? call.state.settlement : null
  const reads = [...call.reads.values()].map(r => ({
    id: r.id,
    lastProgress: r.lastProgress,
    furthest: MAX_PAGE_CURSOR,
    state: r.state.kind === 'reading' ? { kind: 'reading', offset: MAX_PAGE_CURSOR } : r.state,
  }))
  const stored = encodedBytes({
    request: call.request,
    initiator: call.initiator,
    owner: call.owner,
    capacity: call.capacity,
    state: {
      ...call.state,
      phase: 'settled',
      revision: MAX_PAGE_CURSOR,
      settlement,
      dispatch: 'x'.repeat(256),
      firstContent: 'none-proven',
    },
    output: call.dispatches.map(d => ({
      record: d.record,
      blocks: d.blocks,
      nextSeq: [...d.nextSeq],
      trims: [...d.trims],
      hadContent: [...d.hadContent],
      windows: [...d.windows],
      events: [...d.events],
    })),
    snapshots: [...call.snapshots.values()],
    reads,
    retry: call.retry,
    retryPosition: call.retryPosition,
    retrySource: call.retrySource,
    finalParts: resultParts(call),
  })
  const terminalReserve = call.dispatches.reduce(
    (sum, d) => sum + Math.max(0, MAX_TERMINATION_BYTES - encodedBytes(d.record.terminal)),
    0,
  )
  const latest = call.dispatches.at(-1)
  const finalConfirmation =
    latest && latest.record.terminal === null
      ? encodedBytes({
          call: call.state.call,
          cursor: MAX_PAGE_CURSOR,
          blocks: latest.blocks,
          state: { ...call.state, revision: MAX_PAGE_CURSOR },
        }) + Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control))
      : 0
  const openWindowBytes = latest
    ? [...latest.windows]
        .filter(([, state]) => state === 'open')
        .reduce((total, entry) => total + encodedBytes(entry) + 1, 0)
    : 0
  const finalWindow =
    latest && latest.record.terminal === null ? Math.max(0, 350 - openWindowBytes) : 0
  return BigInt(
    stored +
      terminalReserve +
      finalConfirmation +
      finalWindow +
      Math.max(0, MAX_SETTLEMENT_BYTES - encodedBytes(settlement)) +
      Math.max(0, MAX_CUSTODY_BYTES - encodedBytes(call.state.custody)) +
      Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control)) +
      Math.max(0, 1024 - encodedBytes(reads)) +
      64,
  )
}
