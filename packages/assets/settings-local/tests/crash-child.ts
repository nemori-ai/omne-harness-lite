import { command, context, openWorld } from './world.ts'
const root = process.argv[2]
if (!root) throw new Error('Missing database root')
const world = await openWorld({ root })
const result = await world.backend.commit(context, command())
process.send?.(result)
process.on('message', () => {})
