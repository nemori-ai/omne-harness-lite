import { createAdmissionCoordinator } from '@omne-harness-lite/admission'

const writer = {
  coordinationDomain: 'consumer-domain',
  writerEpoch: '1',
  prepareOperation() {
    return { ok: false, issues: [] }
  },
  prepare() {
    return { ok: false, issues: [] }
  },
  lookupPrepared() {
    return { status: 'not_seen' }
  },
  commit() {
    return { status: 'unavailable', reason: 'not used' }
  },
  quarantine() {},
  async closeWriter() {
    return {
      status: 'closed',
      watermark: { coordinationDomain: 'consumer-domain', seq: '0', commitId: null },
    }
  },
  async readHead() {
    return { status: 'unavailable', reason: 'not used' }
  },
  async readRange() {
    return { status: 'unavailable', reason: 'not used' }
  },
  async lookupOperation() {
    return { status: 'unavailable', reason: 'not used' }
  },
}
let diagnosticSequence = 0
const diagnostics = {
  newId() {
    diagnosticSequence += 1
    return `consumer-diagnostic-${diagnosticSequence}`
  },
  scope() {
    return Object.freeze({})
  },
  current() {
    return null
  },
  log() {},
  startSpan() {
    return { context: Object.freeze({}), end() {} }
  },
  within(_context, body) {
    return body()
  },
}

const host = createAdmissionCoordinator(writer, diagnostics)
if (host.coordinator.enter(() => 'synchronous-value') !== 'synchronous-value') {
  throw new Error('default public entry did not execute a synchronous gate')
}
const use = host.createUseIssuer('consumer-owner').capture(
  { resourceId: 'resource', generation: 'generation', epoch: 'epoch' },
  {
    retainAt: () => undefined,
    release: async () => ({ status: 'released' }),
  },
)
const released = await use.release('not_admitted')
if (released.status !== 'released') throw new Error('ExactUse release guard did not run')
const closed = await host.coordinator.close()
if (closed.status !== 'closed') throw new Error('coordinator did not close')

process.stdout.write('isolated admission consumer PASS\n')
