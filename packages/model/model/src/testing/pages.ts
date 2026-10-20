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

function receiveReserve(call: MemoryCall): number {
  return call.dispatches.reduce((total, dispatch) => {
    const open = [...dispatch.windows].filter(([, state]) => state === 'open')
    const futureWindow = dispatch.logicalTerminal === null && open.length === 0
    const confirmations = open.length + Number(futureWindow)
    const snapshot =
      encodedBytes({
        call: call.state.call,
        cursor: MAX_PAGE_CURSOR,
        blocks: dispatch.blocks,
        state: { ...call.state, revision: MAX_PAGE_CURSOR, firstContent: 'none-proven' },
      }) + Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control))
    const closedWindows = open.reduce(
      (bytes, [id, state]) => bytes + encodedBytes([id, 'unproven']) - encodedBytes([id, state]),
      0,
    )
    const newWindow = futureWindow ? encodedBytes(['x'.repeat(254), 'unproven']) + 1 : 0
    return total + confirmations * (snapshot + 1) + closedWindows + newWindow
  }, 0)
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
    resultPaging: call.resultPaging,
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
      logicalTerminal: d.logicalTerminal,
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
    (sum, d) =>
      sum +
      Math.max(0, MAX_TERMINATION_BYTES - encodedBytes(d.record.terminal)) +
      (d.logicalTerminal === null ? MAX_TERMINATION_BYTES - encodedBytes(null) : 0),
    0,
  )
  return BigInt(
    stored +
      // Reserve the entire bounded configuration from admission, including keys and wrapping.
      encodedBytes({
        resultPageParts: Number.MAX_SAFE_INTEGER,
        resultPageTargetBytes: Number.MAX_SAFE_INTEGER,
      }) -
      encodedBytes(call.resultPaging) +
      terminalReserve +
      receiveReserve(call) +
      Math.max(0, MAX_SETTLEMENT_BYTES - encodedBytes(settlement)) +
      Math.max(0, MAX_CUSTODY_BYTES - encodedBytes(call.state.custody)) +
      Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control)) +
      Math.max(0, 1024 - encodedBytes(reads)) +
      64,
  )
}
