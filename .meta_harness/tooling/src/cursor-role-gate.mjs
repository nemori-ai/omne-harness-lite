import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const resources = dirname(fileURLToPath(import.meta.url))
const gate = JSON.parse(readFileSync(resolve(resources, 'role-gate.json'), 'utf8'))
const packageRoot = dirname(resources)

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function decide(payload) {
  const type = payload && !Array.isArray(payload) ? payload.subagent_type : undefined
  if (typeof type !== 'string' || !gate.managed.includes(type))
    return { permission: 'allow' }
  const expected = gate.summaries[type]
  if (typeof expected !== 'string') {
    return {
      permission: 'deny',
      user_message: `cursor qualification: ${type} has no qualified agent file`,
    }
  }
  const file = resolve(packageRoot, 'agents', `${type}.md`)
  let actual = ''
  try {
    actual = digest(file)
  } catch {
    actual = ''
  }
  if (actual !== expected) {
    return {
      permission: 'deny',
      user_message: `cursor qualification: ${type} agent file summary does not match`,
    }
  }
  return { permission: 'allow' }
}

try {
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  process.stdout.write(`${JSON.stringify(decide(payload))}\n`)
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    permission: 'deny',
    user_message: `cursor qualification: ${error.message}`,
  })}\n`)
}
