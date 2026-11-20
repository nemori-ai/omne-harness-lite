#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accessProtocol } from '@omne-harness/public-contract'
import { createForwarding } from '../forwarding/app.ts'
import { createForwardingRules, httpServer } from '../forwarding/rules.ts'
import { domainProtocols } from '../shared/protocols.ts'
import { readConfig } from './config.ts'
import { createStandalone, STANDALONE_WARNING } from './server.ts'

const read = readConfig(process.argv.slice(2), process.env)
if ('usage' in read) {
  process.stdout.write(`${read.usage}\n`)
  process.exit(process.argv.includes('--help') ? 0 : 2)
}
const { config } = read
const log = (line: string): void => void process.stderr.write(`${line}\n`)
const pageRoot = fileURLToPath(new URL('../release/page/', import.meta.url))
const standalone = createStandalone({
  forwarding: createForwarding({
    rules: createForwardingRules({
      connect: httpServer(config.server),
      contracts: [accessProtocol, ...domainProtocols],
    }),
    readPageFile: segments =>
      readFile(join(pageRoot, ...segments)).then(
        content => new Uint8Array(content),
        () => undefined,
      ),
    log,
  }),
  log,
})
process.stdout.write(`${STANDALONE_WARNING}\n`)
const port = await standalone.listen(config.port)
process.stdout.write(`omne desktop: open http://127.0.0.1:${port}/ (server ${config.server})\n`)

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void standalone.close().then(() => process.exit(0))
  })
