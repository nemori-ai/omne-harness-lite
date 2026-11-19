import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { accessProtocol } from '@omne-harness/public-contract'
import { createForwarding } from '../forwarding/app.ts'
import { createForwardingRules, httpServer } from '../forwarding/rules.ts'
import { fromElectronPort, servePort, type PortServer } from '../port-fetch/index.ts'
import { domainProtocols } from '../shared/protocols.ts'

// The utility process: the forwarding layer over the port the main process sends. No TCP port.
const serverOrigin = process.env['OMNE_SERVER']
const pageRoot = process.env['OMNE_PAGE_ROOT']
if (serverOrigin === undefined || pageRoot === undefined) {
  process.stderr.write('omne forwarding: OMNE_SERVER and OMNE_PAGE_ROOT are required\n')
  process.exit(2)
}

const forwarding = createForwarding({
  rules: createForwardingRules({
    connect: httpServer(serverOrigin),
    contracts: [accessProtocol, ...domainProtocols],
  }),
  readPageFile: segments =>
    readFile(join(pageRoot, ...segments)).then(
      content => new Uint8Array(content),
      () => undefined,
    ),
  log: line => void process.stderr.write(`${line}\n`),
})

let server: PortServer | undefined

const isMessage = (value: unknown): value is { type: string } =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof (value as { type: unknown }).type === 'string'

process.parentPort.on('message', event => {
  const message: unknown = event.data
  if (!isMessage(message)) return
  if (message.type === 'port') {
    const [port] = event.ports
    if (port === undefined) return
    server?.close()
    server = servePort(fromElectronPort(port), request => forwarding.fetch(request))
    process.parentPort.postMessage({ type: 'ready', uptimeMs: process.uptime() * 1000 })
  } else if (message.type === 'shutdown') {
    server?.close()
    forwarding.close()
    process.exit(0)
  }
})
