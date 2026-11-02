// J5: after the process is killed, the admission record is read back under its original identity
// (R5 item 2; M-GENERATION SaveIntent and Lookup). The child process writes the record on a real
// sqlite-provider in a temporary directory and is killed with SIGKILL; this process opens the same
// directory.
//
// State: placeholder. The scenario needs the handoff plugin `createSessionMessageHandoffPlugin`,
// which C-ADAPTERS (main closure, `srun-w2-adapters`) delivers and the parent branch does not have
// yet. The world does not stand in for it (C-JOINT, "不要用替身冒充"). The child file
// `w2-handoff-child.ts` is written together with the scenario, when the plugin's public signature is
// in the parent branch.
// @module-tag slow
// Why slow: a child process, real Workers and real files.
import { describe, it } from 'vitest'

describe('J5: the admission record is read back under its original identity after a kill', () => {
  const awaiting = 'awaits C-ADAPTERS: createSessionMessageHandoffPlugin (handoff plugin)'
  it.todo(`J5 reads the whole record back by the original H, after SIGKILL (${awaiting})`)
  it.todo(`J5 reads the same record back by the original Ki (${awaiting})`)
  it.todo(`J5 prepares again with the same Ki: the original H and result, no new record (${awaiting})`)
  it.todo(`J5 starts no effect through lookup: Model and Tool doubles count 0 (${awaiting})`)
  it.todo(`J5 does not read the record for another tenant, by H or by Ki (${awaiting})`)
})
