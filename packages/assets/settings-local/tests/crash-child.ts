import { openPreparedServiceWorld } from './prepared-service-world.ts'
const [root, scopeRef] = process.argv.slice(2)
if (!root || !scopeRef) throw new Error('Missing database root or scope')
const world = await openPreparedServiceWorld(undefined, { root, scopeRef })
const prepared = await world.service.prepareChange(world.context, world.command)
if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared))
const result = await world.service.commitChange(world.context, {
  requestId: 'commit',
  preparation: prepared.preparation,
})
process.send?.({ result, operation: prepared.preparation.operation })
process.on('message', () => {})
