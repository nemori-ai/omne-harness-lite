import { simulatedTime } from '@omne-harness/time-source/simulated'
import { createSchedulePredictionService } from '@omne-harness/schedule'
import {
  createScheduleCalculationWorker,
  createScheduleDispatcher,
} from '@omne-harness/schedule-local'
import { openWorld } from '../storage/world.ts'
import { localOptions } from '../assembly/fixture.ts'
import { context } from '../storage/data.ts'
import { MINUTE, START } from './world.ts'

const [root, marker, phase] = process.argv.slice(2)
if (root === undefined || marker === undefined) throw new Error('Missing crash fixture arguments')
const world = await openWorld({
  root,
  configure: false,
  wrap: storage => ({
    ...storage,
    commit(input) {
      const admit = input.identity.operation === 'schedule.dispatch.admit'
      return storage.commit(
        phase === 'in-transaction' && admit
          ? {
              ...input,
              commands: [
                ...input.commands,
                { participant: 'fixture.schedule.after', facts: { mode: 'pause', marker } },
              ],
            }
          : input,
      )
    },
  }),
})
const time = simulatedTime({ wall: START + MINUTE + 10_000 })
const worker = createScheduleCalculationWorker({ maxConcurrent: 1, maxQueued: 4 })
const prediction = createSchedulePredictionService({
  ...localOptions(world).prediction,
  calculator: worker.calculator,
})
const dispatcher = createScheduleDispatcher(
  {
    storage: world.storage,
    scope: world.scope,
    transactionDomain: world.combination.transactionDomain,
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
  },
  prediction,
  {
    owner: context.owner,
    guards: {
      participant: world.guards.participant,
      dispatch: requirement => ({
        participant: world.guards.participant,
        facts: { dispatch: requirement as never },
      }),
    },
    time: time.source,
    standing: async () => ({ kind: 'eligible' }),
    missingCarriers: () => [],
    policy: { intervalMs: MINUTE, gapMs: 5 * MINUTE, roundLimit: 20 },
  },
)
const report = await dispatcher.round()
process.send?.({ kind: 'result', report })
