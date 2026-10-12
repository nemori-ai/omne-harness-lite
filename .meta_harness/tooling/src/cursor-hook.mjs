import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

function diagnostic(code, detail) {
  process.stderr.write(`${JSON.stringify({ component: 'omne-cursor-hook', code, detail })}\n`)
  return {}
}

function directory(value) {
  if (typeof value !== 'string' || !isAbsolute(value))
    throw new Error('workspace paths must be absolute')
  const path = realpathSync(value)
  if (!statSync(path).isDirectory()) throw new Error('workspace path must be a directory')
  return path
}

function contains(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function targetWorkspace(payload) {
  const raw = payload.workspace_roots
  if (raw !== undefined && (!Array.isArray(raw) || !raw.length))
    throw new Error('invalid workspace_roots')
  const roots = [...new Set((raw ?? []).map(directory))]
  const cwd = payload.cwd === undefined ? undefined : directory(payload.cwd)
  if (roots.length === 0 && cwd) return cwd
  if (roots.length === 1 && (!cwd || contains(roots[0], cwd))) return roots[0]
  const matching = cwd ? roots.filter(root => contains(root, cwd)) : []
  if (matching.length === 1) return matching[0]
  throw new Error('workspace roots do not identify one target')
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0)
    throw new Error('target is not an accessible Git repository')
  return result.stdout.trim()
}

function compatible(root) {
  try {
    return (
      statSync(resolve(root, 'tools/ts-checks/src/loop/stop-hook.ts')).isFile() &&
      statSync(resolve(root, 'tools/ts-checks/node_modules/typescript/package.json')).isFile()
    )
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function toolingRoot(target) {
  const root = directory(git(target, ['rev-parse', '--show-toplevel']))
  if (compatible(root)) return root
  const common = resolve(root, git(root, ['rev-parse', '--git-common-dir']))
  const fallback = dirname(common)
  if (compatible(fallback)) return fallback
  throw new Error('target and Git common checkout lack compatible loop tooling and dependencies')
}

function output(result) {
  if (result.error || result.status !== 0 || result.signal) {
    return diagnostic(
      'measurement-failed',
      result.error?.message ?? `exit ${result.status}, signal ${result.signal}`,
    )
  }
  if (result.stderr.trim()) return diagnostic('measurement-stderr', result.stderr.trim())
  if (!result.stdout.trim()) return {}
  const data = JSON.parse(result.stdout)
  if (data && typeof data.systemMessage === 'string')
    return diagnostic('measurement-warning', data.systemMessage)
  if (data?.decision === 'block' && typeof data.reason === 'string' && data.reason.trim()) {
    return { followup_message: data.reason }
  }
  return diagnostic(
    'invalid-measurement-output',
    'expected block/reason, systemMessage, or empty output',
  )
}

function run() {
  const [identity, event] = process.argv.slice(2)
  if (!/^[a-zA-Z0-9_-]+$/.test(identity ?? '') || !['stop', 'subagentStop'].includes(event)) {
    throw new Error('invalid hook invocation')
  }
  const resources = dirname(fileURLToPath(import.meta.url))
  const config = JSON.parse(readFileSync(resolve(resources, `${identity}.json`), 'utf8'))
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  if (!payload || Array.isArray(payload) || typeof payload !== 'object')
    throw new Error('invalid event object')
  if (payload.hook_event_name !== undefined && payload.hook_event_name !== event)
    throw new Error('event identity mismatch')
  if (!config.events.includes(event === 'stop' ? 'Stop' : 'SubagentStop'))
    throw new Error('event not declared')
  if (!Number.isInteger(payload.loop_count) || payload.loop_count < 0)
    throw new Error('missing or invalid loop_count')
  if (!['completed', 'error', 'aborted'].includes(payload.status))
    throw new Error('missing or invalid status')
  if (payload.status !== 'completed') return diagnostic('incomplete-event', payload.status)
  if (payload.loop_count > 0 || payload.stop_hook_active === true) return {}
  if (event === 'subagentStop') {
    if (typeof payload.subagent_type !== 'string' || !payload.subagent_type.trim())
      throw new Error('missing subagent_type')
    if (config.subagent_types && !config.subagent_types.includes(payload.subagent_type)) return {}
  }
  const target = directory(git(targetWorkspace(payload), ['rev-parse', '--show-toplevel']))
  toolingRoot(target)
  const normalized = {
    ...payload,
    cwd: target,
    stop_hook_active: false,
    hook_event_name: event === 'stop' ? 'Stop' : 'SubagentStop',
  }
  const result = spawnSync('sh', ['-c', config.command], {
    cwd: target,
    input: JSON.stringify(normalized),
    encoding: 'utf8',
    timeout: config.timeout * 1000,
    killSignal: 'SIGKILL',
  })
  return output(result)
}

try {
  process.stdout.write(`${JSON.stringify(run())}\n`)
} catch (error) {
  process.stdout.write(`${JSON.stringify(diagnostic('adapter-failed', error.message))}\n`)
}
