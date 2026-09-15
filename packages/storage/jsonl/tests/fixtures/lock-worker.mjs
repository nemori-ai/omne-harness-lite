import { createJsonlProvider } from '../../dist/index.js'

const directory = process.argv[2]
const context = Object.freeze({})
let crashBeforeReceipt = false
const diagnostics = {
  newId: () => 'worker-diagnostic',
  scope: () => context,
  current: () => null,
  log: (_context, point) => {
    if (crashBeforeReceipt && point.code === 'commit_durable') process.kill(process.pid, 'SIGKILL')
  },
  startSpan: () => ({ context, end: () => undefined }),
  within: (_context, body) => body(),
}
const provider = createJsonlProvider(
  {
    coordinationDomain: 'domain-1',
    directory,
    bindings: [{ namespace: 'core', owners: ['session'], allowSystemScope: false }],
    limits: {
      maxBytes: 16_384,
      maxDepth: 32,
      maxNodes: 1_024,
      maxLineBytes: 32_768,
      maxPayloadBytes: 16_384,
      maxPendingCommits: 8,
      maxPendingBytes: 128_000,
    },
  },
  diagnostics,
)
const acquired = await provider.acquireWriter()
if (acquired.status !== 'acquired') {
  process.send?.({ status: acquired.status })
  process.exitCode = 2
} else {
  process.send?.({ status: 'acquired', epoch: acquired.writer.writerEpoch })
  process.on('message', async message => {
    if (message === 'close') {
      const result = await acquired.writer.closeWriter()
      process.send?.({ status: result.status })
      process.exit(result.status === 'closed' ? 0 : 3)
    }
    if (message === 'commit-crash') {
      const operation = {
        namespace: 'core',
        principalId: '{"kind":"user","user":{"userId":"user-1"}}',
        operationId: 'crash-before-receipt',
      }
      const preparedOperation = acquired.writer.prepareOperation(operation, {
        format: 'core-operation/1',
        operationKind: 'session.edit',
        tenantId: 'tenant-1',
        principal: { kind: 'user', user: { userId: 'user-1' } },
        target: { sessionId: 'session-1' },
        arguments: { value: 'durable' },
        preconditions: {},
        causality: {},
      })
      if (!preparedOperation.ok) process.exit(4)
      const prepared = acquired.writer.prepare({
        operation: preparedOperation.value,
        appends: [
          {
            stream: {
              namespace: 'core',
              owner: 'session',
              scope: { kind: 'tenant', tenantId: 'tenant-1' },
              streamId: 'session-1',
            },
            expectedRevision: '0',
            records: [{ kind: 'session.changed', version: '1', data: { value: 'durable' } }],
          },
        ],
        result: { value: 'durable' },
        requiredUses: [],
      })
      if (!prepared.ok) process.exit(5)
      crashBeforeReceipt = true
      const submission = acquired.writer.commit(prepared.value)
      process.send?.({ status: submission.status })
      if (submission.status !== 'pending_durability') process.exit(6)
      await submission.completion
      process.exit(7)
    }
  })
}
