/** Accepts one strong notification, forms its unit, reports the unit, then dies without closing anything. */
import type { AcceptCommand } from '@omne-harness/notification'
import { openSqlWorld } from './world.ts'

const [root, commandJson] = process.argv.slice(2)
if (root === undefined || commandJson === undefined) throw new Error('missing crash arguments')
const command = JSON.parse(commandJson) as AcceptCommand
const tenant = command.request.identity.tenant
const world = await openSqlWorld({ root })
const accepted = await world.store.accept(tenant, command)
const formed = await world.store.formStrong(tenant, {
  destination: { recipient: { kind: 'person' }, id: 'default' },
  now: command.now,
  minIntervalMs: 0,
  listLimit: 3,
  disclosure: { kind: 'full' },
  defaults: command.defaults,
})
process.send?.({ accepted, formed }, () => process.kill(process.pid, 'SIGKILL'))
