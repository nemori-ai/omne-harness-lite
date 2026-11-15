import { openWorld, command } from '../world.ts'
const [root, marker, phase] = process.argv.slice(2)
if (root === undefined || marker === undefined) throw new Error('Missing crash arguments')
const world = await openWorld(root, storage => ({
  ...storage,
  commit(input, options) {
    return storage.commit(
      phase === 'in-transaction'
        ? {
            ...input,
            commands: [
              ...input.commands,
              { participant: 'fixture.after-calendar-write', facts: { mode: 'pause', marker } },
            ],
          }
        : input,
      options,
    )
  },
}))
const result = await world.persistence.commitDisposition(command('v2', 1))
process.send?.({ kind: 'result', result })
