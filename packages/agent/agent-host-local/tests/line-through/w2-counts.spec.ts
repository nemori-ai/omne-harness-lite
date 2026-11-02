// J6: the read and write counts of a fixed round shape over 200 rounds, the receives per round
// (R2-D42) and the measurement events (R2-D17). Counts are deterministic and prove nothing beyond
// this shape: J6 does not decide E9.
//
// State: placeholder. A second round needs the Run of the first to end, and that needs AD-02 and the
// AD-05 trigger of C-ADAPTERS (main closure, `srun-w2-adapters`); the measurement events need the
// `measure?` parameters of C-MEASURE (`srun-w2-measure`). Neither is in the parent branch yet, and
// the world does not stand in for them. The counting frame (`w2-measure.ts`) and the round shape
// are in place and run in `w2-rounds.spec.ts` for the first round (J2), whose shape is the one of J6.
// @module-tag slow
// Why slow: 200 rounds of real Workers and real files.
import { describe, it } from 'vitest'

describe('J6: fixed round counts', () => {
  const adapters = 'awaits C-ADAPTERS: AD-02 interpretation and AD-05 trigger'
  const measure = 'awaits C-MEASURE: measure? events of Session, Context and Agent'
  it.todo(`J6 counts rounds 11-30 and 181-200 equal, round by round, on every item (${adapters})`)
  it.todo(`J6 receives two Model results and one Tool result per round (${adapters})`)
  it.todo(`J6 keeps the receivers' records within the configured limit after 200 rounds (${adapters})`)
  it.todo(`J6 writes counts.json for 200 rounds (${adapters})`)
  it.todo(`J6 writes round-complete and segment events to e9-events.jsonl (${measure})`)
})
