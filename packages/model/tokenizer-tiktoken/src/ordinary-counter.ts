import type { Tiktoken } from 'js-tiktoken/lite'

type RankLookup = (bytes: Uint8Array, start: number, end: number) => number | undefined
type EngineSnapshot = Readonly<{
  pattern: string
  lookup: RankLookup
  finite: boolean
}>
type Part = {
  readonly start: number
  end: number
  previous: Part | undefined
  next: Part | undefined
  epoch: number
  alive: boolean
}
type Edge = Readonly<{
  left: Part
  right: Part
  leftEpoch: number
  rightEpoch: number
  rank: number
}>
type MergeState = { head: Part | undefined; heap: Edge[] }

/** The only adapter for runtime members omitted from js-tiktoken 1.0.21's declarations. */
function snapshotPinnedEngine(engine: unknown): EngineSnapshot {
  const incompatible = () => new TypeError('incompatible js-tiktoken 1.0.21 runtime shape')
  if (
    typeof engine !== 'object' ||
    engine === null ||
    !('patStr' in engine) ||
    typeof engine.patStr !== 'string' ||
    !('rankMap' in engine) ||
    !(engine.rankMap instanceof Map)
  )
    throw incompatible()
  const entries: ReadonlyMap<unknown, unknown> = engine.rankMap
  let maxTokenBytes = 0
  let finite = true
  for (const [key, rank] of entries) {
    if (typeof key !== 'string' || typeof rank !== 'number') throw incompatible()
    maxTokenBytes = Math.max(maxTokenBytes, key === '' ? 0 : key.split(',').length)
    finite &&= Number.isFinite(rank)
  }
  const ranks = entries as ReadonlyMap<string, number>
  return {
    pattern: engine.patStr,
    finite,
    lookup: (bytes, start, end) =>
      end - start > maxTokenBytes ? undefined : ranks.get(bytes.subarray(start, end).join(',')),
  }
}

type ReusePiece = (piece: Readonly<{ text: string; calculate: () => number }>) => number
export function createOrdinaryCounter(
  engine: Tiktoken,
): (text: string, reuse?: ReusePiece, cancelled?: () => void) => number {
  const snapshot = snapshotPinnedEngine(engine)
  if (!snapshot.finite) return text => (text === '' ? 0 : engine.encode(text, [], []).length)
  return (text, reuse, cancelled = () => {}) => countOrdinary(snapshot, text, reuse, cancelled)
}

function countOrdinary(
  snapshot: EngineSnapshot,
  text: string,
  reuse: ReusePiece | undefined,
  cancelled: () => void,
): number {
  if (text === '') return 0
  const pattern = new RegExp(snapshot.pattern, 'ug')
  const encoder = new TextEncoder()
  let count = 0
  for (const match of text.matchAll(pattern)) {
    cancelled()
    const calculate = () => countPiece(snapshot, encoder.encode(match[0]), cancelled)
    count += reuse === undefined ? calculate() : reuse({ text: match[0], calculate })
  }
  return count
}

function countPiece(snapshot: EngineSnapshot, bytes: Uint8Array, cancelled: () => void): number {
  if (snapshot.lookup(bytes, 0, bytes.length) !== undefined || bytes.length === 1) return 1
  const state = newMergeState(bytes.length, cancelled)
  for (let part = state.head; part !== undefined; part = part.next) {
    cancelled()
    enqueuePair(snapshot, bytes, state, part)
  }
  for (let edge = heapPop(state.heap); edge !== undefined; edge = heapPop(state.heap)) {
    cancelled()
    if (!isCurrent(edge)) continue
    mergeEdge(edge)
    enqueuePair(snapshot, bytes, state, edge.left.previous)
    enqueuePair(snapshot, bytes, state, edge.left)
  }
  let count = 0
  for (let part = state.head; part !== undefined; part = part.next) {
    cancelled()
    if (snapshot.lookup(bytes, part.start, part.end) !== undefined) count++
  }
  return count
}

function newMergeState(length: number, cancelled: () => void): MergeState {
  const state: MergeState = { head: undefined, heap: [] }
  let previous: Part | undefined
  for (let start = 0; start < length; start++) {
    cancelled()
    const part: Part = { start, end: start + 1, previous, next: undefined, epoch: 0, alive: true }
    if (previous === undefined) state.head = part
    else previous.next = part
    previous = part
  }
  return state
}

function enqueuePair(
  snapshot: EngineSnapshot,
  bytes: Uint8Array,
  state: MergeState,
  left: Part | undefined,
): void {
  const right = left?.next
  if (left === undefined || right === undefined) return
  const rank = snapshot.lookup(bytes, left.start, right.end)
  if (rank === undefined) return
  heapPush(state.heap, { left, right, leftEpoch: left.epoch, rightEpoch: right.epoch, rank })
}

function isCurrent(edge: Edge): boolean {
  return (
    edge.left.alive &&
    edge.right.alive &&
    edge.left.next === edge.right &&
    edge.left.epoch === edge.leftEpoch &&
    edge.right.epoch === edge.rightEpoch
  )
}

function mergeEdge({ left, right }: Edge): void {
  left.end = right.end
  left.epoch++
  right.alive = false
  right.epoch++
  left.next = right.next
  if (right.next !== undefined) right.next.previous = left
}

function earlier(a: Edge, b: Edge): boolean {
  return a.rank < b.rank || (a.rank === b.rank && a.left.start < b.left.start)
}

function heapPush(heap: Edge[], edge: Edge): void {
  let index = heap.length
  heap.push(edge)
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2)
    const parent = heap[parentIndex]
    if (parent === undefined || !earlier(edge, parent)) break
    heap[index] = parent
    index = parentIndex
  }
  heap[index] = edge
}

function heapPop(heap: Edge[]): Edge | undefined {
  const first = heap[0]
  const last = heap.pop()
  if (last === undefined || heap.length === 0) return first
  let index = 0
  while (true) {
    const leftIndex = index * 2 + 1
    const left = heap[leftIndex]
    if (left === undefined) break
    const right = heap[leftIndex + 1]
    const childIndex = right !== undefined && earlier(right, left) ? leftIndex + 1 : leftIndex
    const child = heap[childIndex]
    if (child === undefined || !earlier(child, last)) break
    heap[index] = child
    index = childIndex
  }
  heap[index] = last
  return first
}
