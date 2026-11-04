// 联调 B 的运维者层。
//
// 数值不在这里写：发行树上各行的运维者数值归 harness-server 的「本机单用户」档
// （`apps/harness-server/src/local/operator-defaults.ts`，SPEC「本机单用户档」）。这里经构建产物
// `dist/local/` 取那份默认值，只改联调自己的三件事：路径落在本次的临时目录下，保管库由插件用一个
// 测试工厂秘密新建（联调不跑 `setup`，也不读真实供应商凭据），`historyKinds` 可由调用方替换。
// 本目录不是 pnpm 工作区成员，所以按相对路径导入构建产物，与 `startServer` 起 `dist/bin.js` 一样要先构建。
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

/**
 * 联调 B 用的运维者层：本机单用户档的默认值，路径落在 `storageRoot` 旁边。工作区与宿主状态目录建在
 * 存储根的父目录下。`historyKinds` 给了就替换 `server-entry` 的默认列表。
 */
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
    // 联调不读真实供应商凭据：这个值只用来让插件新建保管库文件。
    if (op.id === 'model-credential')
      return { ...op, config: { ...op.config, factorySecret: 'joint-b-test-factory-secret' } }
    if (op.id === 'server-entry' && options.historyKinds !== undefined)
      return { ...op, config: { ...op.config, historyKinds: options.historyKinds } }
    return op
  })
  return { ops }
}
