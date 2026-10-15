import { imageBudget, open, type ImageBudget } from '@omne-harness/image'

const created = imageBudget({
  formats: ['image/png'],
  maxWidth: 1,
  maxHeight: 1,
  maxDecodedBytes: 4,
  maxConcurrentDecodes: 1,
  maxInFlightBytes: 4,
})

if (created.kind === 'budget') {
  const accepted: ImageBudget = created.budget
  void open({ bytes: new Uint8Array(), budget: accepted })
}

type CeilingKeys = 'maxWidth' extends keyof ImageBudget ? true : false
const ceilingsAreHidden: CeilingKeys = false
void ceilingsAreHidden

const forged = { heldReservation: () => ({ count: 0, bytes: 0 }) }
// @ts-expect-error a literal object is not a budget
const rejected: ImageBudget = forged
void rejected
