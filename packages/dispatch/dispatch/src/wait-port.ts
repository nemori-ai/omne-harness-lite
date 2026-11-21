import type { Dispatch, TenantId, WaitAnswer } from '@omne-harness/dispatch-contract'

/** The outcome handed to the wait of the dispatching call. */
export type WaitOutcome = Pick<
  Dispatch,
  'id' | 'state' | 'session' | 'report' | 'failure' | 'expectation'
>

export interface ReportWaits {
  /** One commit of Tool decides: the wait took this outcome (now or before), it is closed, or it could not be read. */
  hand(
    tenant: TenantId,
    dispatch: Pick<Dispatch, 'id' | 'dispatcher' | 'call'>,
    outcome: WaitOutcome,
  ): Promise<WaitAnswer>
}
