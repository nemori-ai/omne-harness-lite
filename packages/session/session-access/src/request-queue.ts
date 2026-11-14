export type RequestCandidate = Readonly<{
  tenant: string
  session: string
  acceptId: string
  inputId: string
  message: string
  login: string
}>

export type QueuedRequest = RequestCandidate & Readonly<{ seq: number }>

export type RequestQueue = ReadonlyMap<string, ReadonlyMap<string, readonly QueuedRequest[]>>

export type Enqueued =
  | Readonly<{ kind: 'appended'; request: QueuedRequest; queue: RequestQueue }>
  | Readonly<{ kind: 'same'; request: QueuedRequest }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'limited' }>

export const EMPTY_QUEUE: RequestQueue = new Map()

const NO_REQUESTS: readonly QueuedRequest[] = []

function laneOf(queue: RequestQueue, tenant: string, session: string): readonly QueuedRequest[] {
  return queue.get(tenant)?.get(session) ?? NO_REQUESTS
}

function withLane(
  queue: RequestQueue,
  tenant: string,
  session: string,
  lane: readonly QueuedRequest[],
): RequestQueue {
  const sessions = new Map(queue.get(tenant))
  if (lane.length === 0) sessions.delete(session)
  else sessions.set(session, lane)
  const next = new Map(queue)
  if (sessions.size === 0) next.delete(tenant)
  else next.set(tenant, sessions)
  return next
}

function sameContent(queued: QueuedRequest, candidate: RequestCandidate): boolean {
  return (
    queued.inputId === candidate.inputId &&
    queued.message === candidate.message &&
    queued.login === candidate.login
  )
}

export function enqueue(queue: RequestQueue, candidate: RequestCandidate, limit: number): Enqueued {
  const { tenant, session, acceptId, inputId, message, login } = candidate
  const lane = laneOf(queue, tenant, session)
  const found = lane.find(request => request.acceptId === acceptId)
  if (found !== undefined)
    return sameContent(found, candidate) ? { kind: 'same', request: found } : { kind: 'conflict' }
  if (lane.length >= limit) return { kind: 'limited' }
  const seq = (lane.at(-1)?.seq ?? -1) + 1
  const request = { tenant, session, acceptId, inputId, message, login, seq }
  return { kind: 'appended', request, queue: withLane(queue, tenant, session, [...lane, request]) }
}

export function headOf(
  queue: RequestQueue,
  tenant: string,
  session: string,
): QueuedRequest | undefined {
  return laneOf(queue, tenant, session)[0]
}

export function settles(outcome: string): boolean {
  return outcome !== 'basis-unavailable' && outcome !== 'unknown'
}

export function isQueued(
  queue: RequestQueue,
  tenant: string,
  session: string,
  acceptId: string,
): boolean {
  return laneOf(queue, tenant, session).some(request => request.acceptId === acceptId)
}

export function leave(
  queue: RequestQueue,
  tenant: string,
  session: string,
  acceptId: string,
): RequestQueue {
  const lane = laneOf(queue, tenant, session)
  return withLane(
    queue,
    tenant,
    session,
    lane.filter(request => request.acceptId !== acceptId),
  )
}

export function restore(requests: readonly QueuedRequest[]): RequestQueue {
  let queue = EMPTY_QUEUE
  for (const request of requests) {
    const lane = [...laneOf(queue, request.tenant, request.session), request]
    lane.sort((left, right) => left.seq - right.seq)
    queue = withLane(queue, request.tenant, request.session, lane)
  }
  return queue
}

export function lanesOf(queue: RequestQueue): readonly (readonly [string, string])[] {
  return [...queue].flatMap(([tenant, sessions]) =>
    [...sessions.keys()].map(session => [tenant, session] as const),
  )
}
