import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { evaluatePermission } from '../dist/index.js'
import { evaluation, source } from '../tests/fixtures.ts'

function material(basis) {
  if (!basis.valid) return null
  const input = evaluation()
  const definition = input.declaration.definition
  definition.values = definition.values.map(value => ({ ...value, permitsOperation: true }))
  definition.defaultRule.pick = basis.picks[0]
  definition.comparison =
    basis.distances === null || basis.strictOrder === null
      ? null
      : { strictOrder: basis.strictOrder, distances: basis.distances }
  for (const [index, layer] of ['organization', 'tenant', 'session'].entries()) {
    input.sources[layer] =
      basis.picks[index + 1] === null
        ? { kind: 'absent', revision: '1' }
        : source(basis.picks[index + 1])
  }
  const constraint = input.constraints[0]
  const bounds = [basis.external]
  input.constraints = bounds.map((bound, index) =>
    bound === null
      ? { id: `bound-${index}`, kind: 'unavailable', sourceRef: `bound-${index}` }
      : { ...constraint, id: `bound-${index}`, effect: { kind: 'bound', allowedSet: bound } },
  )
  for (const [index, bound] of basis.locks.entries()) {
    if (bound === null) {
      input.constraints.push({
        id: `lock-${index}`,
        kind: 'unavailable',
        sourceRef: `lock-${index}`,
      })
    } else if (index === 0) {
      definition.defaultRule.allowedSet = bound
    } else {
      const layer = ['organization', 'tenant', 'session'][index - 1]
      if (!layer) throw new Error('Oracle exceeds four assignment layers')
      input.sources[layer] = source(basis.picks[index], bound)
    }
  }
  for (const [index, prohibited] of basis.prohibitions.entries()) {
    if (prohibited)
      input.constraints.push({
        ...constraint,
        id: `prohibition-${index}`,
        effect: { kind: 'prohibition' },
      })
  }
  input.requiredConstraintIds = [
    ...input.constraints.map(entry => entry.id),
    ...basis.missing.map(name => `missing-${name}`),
  ]
  return input
}
function observation(result) {
  switch (result.kind) {
    case 'effective':
      return [result.kind, result.value, [...result.allowedSet].sort()]
    case 'denied':
      return [result.kind, result.reason]
    case 'unavailable':
      return [
        result.kind,
        result.missingBasis.includes('comparison') ? 'comparison' : 'required-source',
      ]
    case 'invalid-input':
      return [result.kind]
    default:
      throw new Error(`Unexpected result ${JSON.stringify(result)}`)
  }
}
const child = spawn(
  process.env['PYTHON'] ?? 'python3.12',
  [fileURLToPath(new URL('./oracle-cases.py', import.meta.url)), ...process.argv.slice(2)],
  { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } },
)
const completion = new Promise((resolve, reject) => {
  child.on('error', reject)
  child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`oracle exited ${code}`))))
})
const counts = {}
const started = performance.now()
for await (const line of createInterface({ input: child.stdout })) {
  const [partition, basis, expected] = JSON.parse(line)
  const actual = observation(evaluatePermission(material(basis)))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    child.kill()
    throw new Error(JSON.stringify({ partition, basis, expected, actual }))
  }
  counts[partition] = (counts[partition] ?? 0) + 1
}
await completion
const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
if (total !== (process.argv.includes('--witnesses') ? 11 : 425985))
  throw new Error(`Incomplete oracle stream: ${total}`)
console.log(
  JSON.stringify({
    kind: 'passed',
    cases: total,
    partitions: counts,
    milliseconds: Math.round(performance.now() - started),
  }),
)
