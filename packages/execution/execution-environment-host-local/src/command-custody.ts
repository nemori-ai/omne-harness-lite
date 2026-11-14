import type {
  ResidueReport,
  ResidueStopReason,
  RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import type { RetainedReservation } from './host-retained-processes.ts'

const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a disposition by its deadline. */ performance.now()

export type CustodyBinding = Readonly<{
  closed(): boolean
  reserve(): RetainedReservation | 'capacity' | 'unavailable'
  plan(): Promise<Awaited<ReturnType<RetainedProcessLedger['plan']>>>
  adopt(): Promise<Awaited<ReturnType<RetainedProcessLedger['adopt']>>>
}>

export type DispositionInput = Readonly<{
  members: number | null
  binding: CustodyBinding | 'policy' | 'unbound'
  deadline: number
  interrupted(): boolean
}>

export type Disposition =
  | Readonly<{ kind: 'stop'; residue: Extract<ResidueReport, { kind: 'none' | 'stopping' }> }>
  | Readonly<{ kind: 'retained'; reservation: RetainedReservation }>
  | Readonly<{ kind: 'retainedInterrupted'; reservation: RetainedReservation }>
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

const stopping = (reason: ResidueStopReason): Disposition => ({
  kind: 'stop',
  residue: { kind: 'stopping', reason },
})

export async function bounded<T extends string>(
  work: () => Promise<T>,
  deadline: number,
): Promise<T | 'unavailable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'unavailable'>(resolve => {
    timer = setTimeout(resolve, Math.max(0, deadline - monotonicMs()), 'unavailable')
  })
  try {
    return await Promise.race([work(), late])
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}

async function commitHandover(
  binding: CustodyBinding,
  reservation: RetainedReservation,
  deadline: number,
  interrupted: () => boolean,
): Promise<Disposition> {
  const adopted = await bounded(binding.adopt, deadline)
  if (adopted === 'confirmed')
    return interrupted() || binding.closed()
      ? { kind: 'retainedInterrupted', reservation }
      : { kind: 'retained', reservation }
  if (adopted === 'closed') {
    reservation.abort()
    return stopping('closed')
  }
  return { kind: 'unknown', reservation }
}

export async function decideDisposition(input: DispositionInput): Promise<Disposition> {
  if (input.members === 0) return { kind: 'stop', residue: { kind: 'none' } }
  const binding = input.binding
  if (typeof binding === 'string') return stopping(binding)
  if (binding.closed()) return stopping('closed')
  if (input.interrupted()) return stopping('closed')
  const reservation = binding.reserve()
  if (reservation === 'capacity') return stopping('capacity')
  if (reservation === 'unavailable') return stopping('policy')
  const planned = await bounded(binding.plan, input.deadline)
  if (planned !== 'recorded') {
    reservation.abort()
    return stopping(planned === 'closed' ? 'closed' : 'unbound')
  }
  if (binding.closed() || input.interrupted()) {
    reservation.abort()
    return stopping('closed')
  }
  return commitHandover(binding, reservation, input.deadline, input.interrupted)
}

export function resolveUnknownHandover(input: {
  binding: CustodyBinding
  reservation: RetainedReservation
  deadline: number
  interrupted(): boolean
}): Promise<Disposition> {
  return commitHandover(input.binding, input.reservation, input.deadline, input.interrupted)
}
