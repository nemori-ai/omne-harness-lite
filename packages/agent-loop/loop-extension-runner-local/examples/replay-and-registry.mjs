import { parseTenantId } from '@omne-harness-lite/identity-values'
import {
  judgeDefinition,
  judgeInput,
  judgePositionedSubject,
} from '@omne-harness-lite/loop-extension'
import { createRunnerImplementationRegistry, readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'

function accepted(value) {
  if (!('ok' in value)) throw new Error('Invalid example input')
  return value.ok
}
const initial = accepted(
  judgePositionedSubject({
    position: 'before_persist_message',
    subject: {
      producer: 'user',
      message: {
        id: 'message',
        type: 'user',
        blocks: [],
        createdAt: '2026-09-29T00:00:00Z',
      },
    },
  }),
)
const definition = accepted(
  judgeDefinition({
    name: 'example-extension',
    position: 'before_persist_message',
    power: 'observe',
    implementation: { kind: 'builtin', builtinName: 'example-extension' },
  }),
)
const result = readPassConclusions({
  initial,
  anchor: 'message',
  chain: [{ definition, power: 'observe' }],
  binding: {
    session: 'example-session',
    tenant: accepted(parseTenantId({ organization: 'example-org', account: 'example-account' })),
    logGeneration: 'example-generation',
  },
  entries: [],
  tail: 0,
})
if (!Array.isArray(result)) throw new Error('History rejected')
console.log('replay:', result.length)
const registry = createRunnerImplementationRegistry()
const dispose = registry.registerBuiltin('example-extension', async () => ({
  kind: 'output',
  value: { kind: 'observed' },
}))
const lease = registry.capture('example-extension')
if ('absent' in lease) throw new Error('Contribution absent')
const input = accepted(
  judgeInput({ ...initial, earlier: [], log: 'example-log', environment: 'example-environment' }),
)
try {
  console.log(
    'invocation:',
    (await lease.invoke(input, new AbortController().signal, { kind: 'fresh' })).kind,
  )
} finally {
  dispose()
  registry.closeAdmission()
  await registry.drain()
}
console.log('withdrawn:', 'absent' in registry.capture('example-extension'))
