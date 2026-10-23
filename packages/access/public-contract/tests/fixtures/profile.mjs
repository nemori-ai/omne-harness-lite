import { cpus, platform, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { readGovernanceRequest } from '@omne-harness/public-contract'

const encoder = new TextEncoder()
const limits = {
  maxBytes: 262144,
  maxDepth: 30000,
  maxItems: 100000,
  maxMembers: 64,
  maxStringLength: 262144,
  maxNumberLength: 128,
}
const tenant = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const base = {
  protocolVersion: 'governance-public/1',
  messageId: 'profile',
  operation: 'judge-admission',
  loginProof: 'synthetic-proof',
  actingTenant: tenant,
  body: { resource: 'synthetic', action: 'read', scopeId: 'synthetic', parameters: { blob: '' } },
}
const overhead = encoder.encode(JSON.stringify(base)).length
base.body.parameters.blob = 'x'.repeat(limits.maxBytes - overhead)
const maximum = encoder.encode(JSON.stringify(base))
const duplicate = '{"messageId":"profile","x":0,"x":1}'
const bounded = '{"messageId":"m","x":0,"x":[123]}'
const exact = {
  maxBytes: encoder.encode(bounded).length,
  maxDepth: 2,
  maxItems: 5,
  maxMembers: 3,
  maxStringLength: 9,
  maxNumberLength: 3,
}
const cases = [
  { name: 'maximum-document-bytes', bytes: maximum, limits, expected: 'request' },
  {
    name: 'duplicate-root-key',
    bytes: encoder.encode(duplicate),
    limits,
    expected: 'protocol-rejected',
    id: 'profile',
  },
  {
    name: 'deep-duplicate',
    bytes: encoder.encode(
      '{"messageId":"profile","x":0,"x":' + '['.repeat(20000) + '0' + ']'.repeat(20000) + '}',
    ),
    limits,
    expected: 'protocol-rejected',
    id: 'profile',
  },
  ...Object.keys(exact).map(key => ({
    name: `over-${key}`,
    bytes: encoder.encode(bounded),
    limits: { ...exact, [key]: exact[key] - 1 },
    expected: 'protocol-rejected',
  })),
]
const results = []
for (let round = 0; round < 5; round++) {
  for (const input of cases) {
    const before = process.memoryUsage()
    const cpu = process.cpuUsage()
    const start = performance.now()
    let observed = 0
    for (let iteration = 0; iteration < 20; iteration++) {
      const result = readGovernanceRequest({ bytes: input.bytes, limits: input.limits })
      if (result.kind !== input.expected) throw new Error(`Unexpected result for ${input.name}`)
      if (result.kind === 'protocol-rejected' && result.response.messageId !== input.id)
        throw new Error(`Unexpected correlation for ${input.name}`)
      observed++
    }
    results.push({
      name: input.name,
      round,
      inputBytes: input.bytes.length,
      iterations: observed,
      expected: input.expected,
      wallMs: performance.now() - start,
      cpuMicroseconds: process.cpuUsage(cpu),
      memoryBefore: before,
      memoryAfter: process.memoryUsage(),
    })
  }
}
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        cores: cpus().length,
      },
      claim:
        'Current bounded synchronous codec workload only. No baseline speedup, transport latency, or process-memory guarantee.',
      limits,
      results,
    },
    null,
    2,
  ),
)
