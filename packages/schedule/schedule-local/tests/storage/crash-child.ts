import { openWorld } from './world.ts'
import { createCommand } from './data.ts'
const [root, marker, phase] = process.argv.slice(2)
if (root === undefined || marker === undefined) throw new Error('Missing crash fixture arguments')
const world = await openWorld({
  root,
  configure: false,
  wrap: storage => ({
    ...storage,
    commit(input) {
      return storage.commit(
        phase === 'in-transaction'
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
const result = await world.persistence.commit(createCommand('crash:target'))
process.send?.({ kind: 'result', result })
