#!/usr/bin/env node
// `node apps/desktop/dist/web-host/bin.js [--server <origin>] [--port <port>]`: starts the web host
// on 127.0.0.1 and serves the built page from `dist/page`.
import { fileURLToPath } from 'node:url'
import { identityProtocol } from '@omne-harness/identity-protocol'
import { accessProtocol } from '@omne-harness/public-contract'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { httpServer, memoryCredentialStore, openLoginSession } from '../main-core/index.ts'
import { readConfig } from './config.ts'
import { createWebHost } from './server.ts'

const read = readConfig(process.argv.slice(2), process.env)
if ('usage' in read) {
  process.stdout.write(`${read.usage}\n`)
  process.exit(process.argv.includes('--help') ? 0 : 2)
}
const { config } = read
const session = await openLoginSession({
  connect: httpServer(config.server),
  store: memoryCredentialStore(),
  contracts: [accessProtocol, identityProtocol, sessionProtocol],
})
const host = createWebHost({
  session,
  pageRoot: fileURLToPath(new URL('../page/', import.meta.url)),
  log: line => process.stderr.write(`${line}\n`),
})
const port = await host.listen(config.port)
process.stdout.write(`omne desktop: open http://127.0.0.1:${port}/ (server ${config.server})\n`)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void host.close().then(() => process.exit(0))
  })
