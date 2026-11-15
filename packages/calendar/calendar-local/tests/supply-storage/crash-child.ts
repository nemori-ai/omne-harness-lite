import { instantSchema } from '@omne-harness/calendar-contract'
import { openWorld, run, scope, instant } from './world.ts'
const [root, marker, phase, action] = process.argv.slice(2)
if (root === undefined || marker === undefined || phase === undefined || action === undefined)
  throw new Error('Missing crash fixture arguments')
const world = await openWorld(root, s => ({
  ...s,
  commit: input =>
    s.commit(
      phase === 'in-transaction'
        ? {
            ...input,
            commands: [
              ...input.commands,
              { participant: 'fixture.after-supply', facts: { mode: 'pause', marker } },
            ],
          }
        : input,
    ),
}))
const result =
  action === 'run'
    ? await world.journal.prepareRun(run())
    : await world.journal.recordProbe({
        systemScopeRef: scope,
        calendarId: run().command.address.calendarId,
        operationKey: 'crash-probe',
        fingerprint: 'a'.repeat(64),
        policyVersion: 'fixture-policy',
        observation: {
          sourceId: 'fixture-source',
          observedAt: instant,
          kind: 'failed',
          marker: null,
          authorityCoverageEnd: null,
          reason: null,
        },
        nextDue: instantSchema.parse('2026-01-03T00:00:00.000Z'),
      })
process.send?.({ result })
