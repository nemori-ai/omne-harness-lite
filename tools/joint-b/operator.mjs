import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { serveDistribution, serverMember, SHUTDOWN_DEADLINE_MS } from '../joint-a/support.mjs'

const distDir = join(serverMember, 'dist', 'local')
const { localOperatorLayer } = await import(
  pathToFileURL(join(distDir, 'operator-defaults.js')).href
)
const { captureShellEnvironment, defaultShell } = await import(
  pathToFileURL(join(distDir, 'settings.js')).href
)

export function operatorLayerB(options) {
  const base = dirname(options.storageRoot)
  const workspace = join(base, 'workspace')
  const hostFilesDir = join(base, 'host-files-state')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(hostFilesDir, { recursive: true })
  const layer = localOperatorLayer({
    distribution: JSON.parse(readFileSync(serveDistribution, 'utf8')),
    locations: {
      vaultFile: join(options.storageRoot, 'model-vault.json'),
      storageRoot: options.storageRoot,
      hostFilesDir,
    },
    settings: {
      version: 1,
      port: options.port,
      workspace,
      shell: defaultShell(process.platform, process.env),
      shellEnvironment: captureShellEnvironment(process.platform, process.env),
    },
    shutdownDeadlineMs: options.shutdownDeadlineMs ?? SHUTDOWN_DEADLINE_MS,
    platform: process.platform,
  })
  const ops = layer.ops.map(op => {
    if (op.id === 'model-credential')
      return { ...op, config: { ...op.config, factorySecret: 'joint-b-test-factory-secret' } }
    if (op.id === 'server-entry' && options.historyKinds !== undefined)
      return { ...op, config: { ...op.config, historyKinds: options.historyKinds } }
    return op
  })
  return { ops }
}
