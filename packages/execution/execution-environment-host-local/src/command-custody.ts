// Custody: what becomes of a domain after its main process exited. The decision is the same on
// every platform that hands domains over; the platform supplies the member count and the binding.
import type {
  ResidueReport,
  ResidueStopReason,
  RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import type { RetainedReservation } from './host-retained-processes.ts'

/** Milliseconds on the monotonic clock, for the disposition's deadline. */
const monotonicMs = () =>
  /* wall-clock: operation-timing -- Bound a disposition by its deadline. */ performance.now()

/** The retention binding of one exited command, as the disposition sees it. */
export type CustodyBinding = Readonly<{
  /** The retention scope is closed: its release signal or its ledger's close signal fired. */
  closed(): boolean
  /** Takes a place in the retention scope's index, synchronously; `capacity` when it is full. */
  reserve(): RetainedReservation | 'capacity' | 'unavailable'
  plan(): Promise<Awaited<ReturnType<RetainedProcessLedger['plan']>>>
  adopt(): Promise<Awaited<ReturnType<RetainedProcessLedger['adopt']>>>
}>

export type DispositionInput = Readonly<{
  /** The gate's reading of the unit's other members; null when it could not read them. */
  members: number | null
  /** The binding, or the reason there is none: the policy forbids, or the acquisition is unbound. */
  binding: CustodyBinding | 'policy' | 'unbound'
  /** The monotonic deadline of the whole disposition. */
  deadline: number
  /** True once the acquisition released the domain or a stop was requested; read synchronously. */
  interrupted(): boolean
}>

export type Disposition =
  /** The domain stays with the acquisition and is stopped; `residue` says why. */
  | Readonly<{ kind: 'stop'; residue: Extract<ResidueReport, { kind: 'none' | 'stopping' }> }>
  /** The commit took effect: the retention scope owns the domain. */
  | Readonly<{ kind: 'retained'; reservation: RetainedReservation }>
  /** The commit took effect, but the domain was released, stopped or its scope closed meanwhile. */
  | Readonly<{ kind: 'retainedInterrupted'; reservation: RetainedReservation }>
  /** The commit's result could not be read; the reservation stays until it is. */
  | Readonly<{ kind: 'unknown'; reservation: RetainedReservation }>

const stopping = (reason: ResidueStopReason): Disposition => ({
  kind: 'stop',
  residue: { kind: 'stopping', reason },
})

/** Waits for `work` until `deadline`; a late answer or a throw reads as `unavailable`. */
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

/**
 * The commit of a handover, in the command's common order: the reservation is held, `adopt` is
 * asked, and the two rechecks run again after the answer. A confirmed commit whose domain was
 * interrupted or whose scope closed meanwhile belongs to the retention scope but is stopped at once.
 * This reading is the decision's; the facility reads both again in the very step that changes the
 * custody, so an interruption between the two readings is not lost.
 */
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

/**
 * Decides the disposition of a domain whose main process exited (the contract's table and its five
 * conditions, then the handover). The reservation is taken before the first asynchronous wait, and
 * the scope closure and the interruption are read again right before the commit.
 */
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

/** Asks the commit again with the same reservation, to learn whether an unknown handover took effect. */
export function resolveUnknownHandover(input: {
  binding: CustodyBinding
  reservation: RetainedReservation
  deadline: number
  interrupted(): boolean
}): Promise<Disposition> {
  return commitHandover(input.binding, input.reservation, input.deadline, input.interrupted)
}
