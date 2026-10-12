import { emptyTrims, toolAccount, unknownModelAccount } from './account.ts'
import { settleBlock, snapshotBlock } from './blocks.ts'
import { AssemblyState } from './state.ts'
import type { AssemblyResult, AssemblySettlement, AssemblySnapshot } from './types.ts'
import { ownTarget } from './values.ts'

export function start(target: unknown): AssemblyResult<AssemblyState, 'malformed'> {
  const owned = ownTarget(target)
  return owned === undefined
    ? Object.freeze({ rejected: 'malformed' } as const)
    : Object.freeze({
        ok: AssemblyState.create({
          target: owned,
          blocks: Object.freeze([]),
          position: 0,
          acceptedFrames: 0,
          trims: emptyTrims(),
          previousLongTrim: false,
        }),
      })
}

export function snapshot(state: AssemblyState): AssemblySnapshot {
  const data = AssemblyState.read(state)
  return Object.freeze({
    blocks: Object.freeze(data.blocks.map(snapshotBlock)),
    position: data.position,
    ...(data.firstContentAt === undefined ? {} : { firstContentAt: data.firstContentAt }),
  })
}

export function closeOut(
  state: AssemblyState,
): AssemblyResult<AssemblySettlement, 'stream_not_finished'> {
  const data = AssemblyState.read(state)
  if (data.finish === undefined) return Object.freeze({ rejected: 'stream_not_finished' } as const)
  const blocks = []
  for (const record of data.blocks) {
    const block = settleBlock(record)
    if (block !== undefined) blocks.push(block)
  }
  const account =
    data.target.kind === 'tool_execution'
      ? toolAccount(data.acceptedFrames, data.trims)
      : data.reported === undefined
        ? unknownModelAccount(data.trims)
        : Object.freeze({ usage: data.reported.usage, cost: data.reported.cost, trims: data.trims })
  const { t: _event, ...finish } = data.finish
  return Object.freeze({
    ok: Object.freeze({
      blocks: Object.freeze(blocks),
      account,
      ending: Object.freeze({
        ...finish,
        ...(data.firstContentAt === undefined ? {} : { firstContentAt: data.firstContentAt }),
      }),
    }),
  })
}
