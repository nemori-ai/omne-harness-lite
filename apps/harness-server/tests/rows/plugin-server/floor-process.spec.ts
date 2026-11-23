// @module-tag slow
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedTenant,
  startServer,
  writeOperator,
  type Scratch,
  type ServerHandle,
} from '../../r9/support.ts'
import { uploadPlugin } from '../../support/plugin-packages.ts'
import {
  originOf,
  protocolClients,
  savedCredentials,
  tenantOf,
} from '../../support/protocol-clients.ts'
import { registerAndLogin, type Cli } from '../session-diagnostics/support.ts'

const CREDENTIAL = 'erin-pw-FLOOR-41d9'
const MANIFEST = JSON.stringify({
  schema: 1,
  name: 'tidy',
  summary: 'A protocol of its own.',
  server: {
    members: [{ point: 'access.protocols', key: 'tidy/v1', module: 'protocol.js', export: 'make' }],
  },
})
const WORKS = `export const make = () => ({
  contract: { name: 'tidy', major: 1, operations: { ping: { effect: 'read', limit: 'small', body: { kind: 'object', fields: {} }, result: { kind: 'text' } } } },
  handlers: { ping: async () => ({ outcome: 'succeeded', body: 'pong' }) },
})
`
/** Loading this one takes the whole server down with it. */
const DOWN = `process.exit(7)\n${WORKS}`

let scratch: Scratch | undefined
let server: ServerHandle | undefined

afterEach(async () => {
  await server?.kill()
  scratch?.remove()
  server = undefined
  scratch = undefined
})

describe('the floor of the server, with a process that really goes down', () => {
  it(
    'a plugin that takes the server down while it loads: twice, then the server comes up without it, says so, and still serves; a new version is loaded',
    { tags: ['slow'], timeout: 300_000 },
    async () => {
      scratch = newScratch('plugin-floor-')
      const port = await freePort()
      const operatorPath = join(scratch.base, 'operator.json')
      writeOperator(operatorPath, operatorLayer({ storageRoot: scratch.storageRoot, port }))
      const start = () => startServer({ stateRoot: scratch!.stateRoot, operatorPath, port })
      server = await start()
      const home = join(scratch.base, 'home-erin')
      const cli: Cli = (args, credential) =>
        runOmne({
          args: [...args],
          home,
          server: originOf(port),
          cwd: scratch!.base,
          ...(credential === undefined ? {} : { credential }),
        })
      await registerAndLogin(cli, 'erin', CREDENTIAL)
      const session = await cli(['create-session', '--definition', 'coding'])
      expect(session.status, session.stderr).toBe(0)
      const tenant = tenantOf(savedTenant(home))
      const assets = () => protocolClients(originOf(port), savedCredentials(home)).assets

      const made = await uploadPlugin(assets(), tenant, 'tidy', {
        'plugin.json': MANIFEST,
        'protocol.js': DOWN,
      })
      expect(made.outcome).toBe('succeeded')
      expect(await server.exited).toBe(7)

      server = await start()
      expect(await server.exited).toBe(7)

      server = await start()
      const third = server
      const said = 'the server went down 2 times in a row while loading its plugins'
      const deadline = Date.now() + 30_000
      while (!(third.stdout() + third.stderr()).includes(said) && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 200))
      expect(third.stdout() + third.stderr()).toContain(said)
      const listed = await assets()['list-assets']({
        tenant,
        category: 'plugin',
        after: null,
        limit: 10,
      })
      expect(listed.outcome).toBe('succeeded')

      const fixed = await uploadPlugin(
        assets(),
        tenant,
        'tidy',
        { 'plugin.json': MANIFEST, 'protocol.js': WORKS },
        'up-tidy-2',
      )
      expect(fixed.outcome).toBe('succeeded')
      const ping = async () => {
        const reply = await fetch(`${originOf(port)}/api/tidy/v1/ping`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${savedCredentials(home)().proof}`,
            'omne-acting-tenant': savedTenant(home),
            'omne-message-id': `m-${Math.random()}`,
          },
          body: '{}',
        })
        return [reply.status, await reply.text()] as const
      }
      const loaded = Date.now() + 30_000
      while ((await ping())[0] !== 200 && Date.now() < loaded)
        await new Promise(resolve => setTimeout(resolve, 200))
      expect(await ping()).toEqual([200, expect.stringContaining('pong')])
      const exits = await Promise.race([
        third.exited,
        new Promise(resolve => setTimeout(() => resolve('up'), 2000)),
      ])
      expect(exits).toBe('up')
    },
  )
})
