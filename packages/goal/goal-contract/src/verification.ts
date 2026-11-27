import type { Criterion } from './body.ts'

/** Who reads a criterion, as where its evidence comes from fixes it. A body never names the reader. */
export type Verification = 'system' | 'judge' | 'rerun' | 'examination' | 'person'

export function verificationOf(criterion: Pick<Criterion, 'evidence' | 'pass'>): Verification {
  const { evidence, pass } = criterion
  switch (evidence.kind) {
    case 'metric':
      return 'system'
    case 'command':
      return pass?.kind === 'exit-zero' ? 'system' : 'judge'
    case 'file':
    case 'activity':
      return 'judge'
    case 'rerun':
    case 'examination':
    case 'person':
      return evidence.kind
  }
}

/** A criterion read this way has no reading on the spot: its evidence is taken by somebody else, later. */
export const awaited = (verification: Verification): boolean =>
  verification === 'rerun' || verification === 'examination' || verification === 'person'

/** A criterion the examining side reads or runs: what goes out in a batch. */
export const examined = (verification: Verification): boolean =>
  verification === 'rerun' || verification === 'examination'
