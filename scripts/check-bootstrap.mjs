#!/usr/bin/env node
// 检查的启动段：scripts/check.sh 在起检查器（tools/test-runner 的 `check`）之前调用它，普通检查、准入与预检都先过这里。
// 检查器静态导入依赖目录里的包，依赖缺失时进程在加载模块时就退出、到不了任何自愈；所以这里只用 Node 标准库，
// 在检查器之前把工具链与依赖核对好。顺序固定为五步，前一步失败就以 2 退出，不做后面的：
//   1. 工具链：package.json 的 packageManager 与 devEngines.packageManager 相同；PATH 上的 Node 满足 engines.node；
//      在仓库根运行的 pnpm 实际版本等于声明（pnpm 按 packageManager 自己切换版本，切不过去就在这里失败）。
//   2. 依赖：依赖目录与锁文件一致。pnpm 安装成功后把锁文件本体抄在 node_modules/.pnpm/lock.yaml；
//      pnpm 12 的 pnpm-lock.yaml 前面另有一个锁 pnpm 自身的文档，副本里没有，所以只拿本体比。
//      不一致或没有副本时 `pnpm install --offline --frozen-lockfile --ignore-scripts`，再准备原生依赖，再比一次。
//   3. 经 pnpm 起的 Node（`pnpm --silent exec node -v`）等于 devEngines.runtime。排在依赖之后：
//      verifyDepsBeforeRun: error 下依赖过期时 `pnpm exec` 自己就失败。
//   4. 原生依赖：macOS 上 node-pty 的 spawn-helper 是可执行的 Mach-O，不是就调用 prepare-native.mjs 修复。
//   5. 结果写到标准输出（一行 JSON），check.sh 把它放进环境变量 OMNE_CHECK_BOOTSTRAP 交给检查器；
//      检查器没有这份结果时拒绝运行 `check`。给人读的说明都写到标准错误。
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pnpmCommand, prepareNative, spawnHelperProblems } from './prepare-native.mjs'

export const BOOTSTRAP_ENV = 'OMNE_CHECK_BOOTSTRAP'
export const LOCKFILE = 'pnpm-lock.yaml'
export const INSTALLED_LOCKFILE = 'node_modules/.pnpm/lock.yaml'
export const OFFLINE_INSTALL = ['install', '--offline', '--frozen-lockfile', '--ignore-scripts']
/** 联网重装的命令：与 docs/development.md「准备可用的检出」的准备命令相同。 */
export const ONLINE_INSTALL = [
  'pnpm install --frozen-lockfile --ignore-scripts',
  'pnpm run prepare:native',
]

const TAIL_LINES = 8
const tail = text =>
  text
    .trimEnd()
    .split('\n')
    .slice(-TAIL_LINES)
    .map(line => `  ${line.trimEnd()}`)
    .join('\n')

/** `spawnSync` 的结果收成 `{ status, output }`；起不来也算失败，原因进输出。 */
function spawnResult(command, args, options) {
  const run = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })
  if (run.error !== undefined) return { status: -1, output: run.error.message }
  return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` }
}

function pnpmIn(root, args) {
  let pnpm
  try {
    pnpm = pnpmCommand()
  } catch (error) {
    return { status: -1, output: error instanceof Error ? error.message : String(error) }
  }
  return spawnResult(pnpm.command, [...pnpm.args, ...args], { cwd: root })
}

/** 真实的外部动作；测试经子进程替换 PATH 上的 pnpm 与 node。 */
export const defaultIo = {
  pathNodeVersion: root => spawnResult('node', ['-v'], { cwd: root }),
  pnpmVersion: root => pnpmIn(root, ['-v']),
  pnpmNodeVersion: root => pnpmIn(root, ['--silent', 'exec', 'node', '-v']),
  install: root => pnpmIn(root, OFFLINE_INSTALL),
  prepareNative: root => prepareNative(root),
  spawnHelperProblems: root => spawnHelperProblems(root),
}

/** 只认 `>=X`、`>=X.Y`、`>=X.Y.Z`；别的写法返回 undefined，由调用方报「认不出」。 */
export function satisfiesMinimum(version, range) {
  const minimum = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/u.exec(range.trim())
  const actual = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(version.trim())
  if (minimum === null || actual === null) return undefined
  const want = [minimum[1], minimum[2] ?? '0', minimum[3] ?? '0'].map(Number)
  const have = [actual[1], actual[2], actual[3]].map(Number)
  for (let index = 0; index < 3; index += 1)
    if (have[index] !== want[index]) return have[index] > want[index]
  return true
}

/** pnpm-lock.yaml 里与安装副本对应的本体：以 `---` 开头时是第二个文档，否则是整份。 */
export function mainLockfileDocument(text) {
  if (!text.startsWith('---\n')) return text
  const second = text.indexOf('\n---\n', 3)
  return second === -1 ? undefined : text.slice(second + '\n---\n'.length)
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** package.json 里四项声明；形状不对时返回 `{ problem }`。 */
export function readDeclarations(root) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch (error) {
    return {
      problem: `读不了 package.json：${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const packageManager = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(manifest?.packageManager ?? '')?.[1]
  const devPnpm = manifest?.devEngines?.packageManager
  const runtime = manifest?.devEngines?.runtime
  const engines = manifest?.engines?.node
  if (packageManager === undefined)
    return {
      problem: `package.json 的 packageManager 应是 pnpm@<精确版本>，现在是 ${JSON.stringify(manifest?.packageManager)}`,
    }
  if (devPnpm?.name !== 'pnpm' || typeof devPnpm.version !== 'string')
    return {
      problem:
        'package.json 的 devEngines.packageManager 应是 { name: "pnpm", version: <精确版本> }',
    }
  if (runtime?.name !== 'node' || typeof runtime.version !== 'string')
    return {
      problem: 'package.json 的 devEngines.runtime 应是 { name: "node", version: <精确版本> }',
    }
  if (typeof engines !== 'string') return { problem: 'package.json 没有 engines.node' }
  return { packageManager, devPnpm: devPnpm.version, runtime: runtime.version, engines }
}

const firstLine = text => text.trim().split('\n')[0]?.trim() ?? ''

/** 第 1 步：声明、PATH 上的 Node、pnpm 实际版本。返回失败说明（数组）或核对到的版本。 */
function checkToolchain(root, io) {
  const declared = readDeclarations(root)
  if (declared.problem !== undefined) return { problems: [declared.problem] }
  const { packageManager, devPnpm, engines } = declared
  if (packageManager !== devPnpm)
    return {
      problems: [
        `package.json 的 packageManager（pnpm@${packageManager}）与 devEngines.packageManager（${devPnpm}）不同`,
        `  期望：两处是同一个版本；实际：${packageManager} 与 ${devPnpm}`,
        `  修法：改其中一处使两处相同（pnpm 12 实际采用 devEngines 的 ${devPnpm}，全局 pnpm 10 读 packageManager）`,
      ],
    }
  const node = io.pathNodeVersion(root)
  const nodeVersion = firstLine(node.output)
  const nodeOk = node.status === 0 ? satisfiesMinimum(nodeVersion, engines) : false
  if (nodeOk === undefined)
    return {
      problems: [
        `认不出 engines.node 的写法（${engines}）或 node -v 的输出（${nodeVersion}）：只认 >=X.Y.Z`,
      ],
    }
  if (!nodeOk)
    return {
      problems: [
        'PATH 上的 Node 不满足 engines.node',
        `  期望：${engines}；实际：${node.status === 0 ? nodeVersion : `node -v 失败：${firstLine(node.output)}`}`,
        `  修法：装 Node ${engines.replace(/^>=\s*/u, '')} 及以上并放在 PATH 前面`,
      ],
    }
  const pnpm = io.pnpmVersion(root)
  const pnpmVersion = firstLine(pnpm.output)
  if (pnpm.status !== 0 || pnpmVersion !== devPnpm)
    return {
      problems: [
        '在仓库根运行的 pnpm 不是声明的版本',
        `  期望：${devPnpm}；实际：${pnpm.status === 0 ? pnpmVersion : `pnpm -v 退出 ${pnpm.status}`}`,
        ...(pnpm.status === 0 ? [] : [tail(pnpm.output)]),
        `  修法：装任意 12.x 的 pnpm（独立安装或 mise）并放在 PATH 前面，它会按 packageManager 切到 ${devPnpm}`,
      ],
    }
  return { declared, node: nodeVersion }
}

/** 第 2 步：依赖目录与锁文件本体一致，不一致就离线重装并准备原生依赖。 */
function checkDependencies(root, io) {
  const lockfile = readText(join(root, LOCKFILE))
  if (lockfile === undefined)
    return { dependencies: { status: 'no-lockfile', detail: `没有 ${LOCKFILE}，不核对依赖` } }
  const main = mainLockfileDocument(lockfile)
  if (main === undefined)
    return { problems: [`${LOCKFILE} 以 --- 开头却没有第二个文档，认不出本体`] }
  const installed = readText(join(root, INSTALLED_LOCKFILE))
  if (installed === main)
    return {
      dependencies: {
        status: 'in-sync',
        detail: `${INSTALLED_LOCKFILE} 与 ${LOCKFILE} 的本体相同`,
      },
    }
  const why =
    installed === undefined
      ? `没有 ${INSTALLED_LOCKFILE}`
      : `${INSTALLED_LOCKFILE} 与 ${LOCKFILE} 的本体不同`
  const command = `pnpm ${OFFLINE_INSTALL.join(' ')}`
  const online = [
    `  修法：联网后按 docs/development.md「准备可用的检出」重装：`,
    ...ONLINE_INSTALL.map(line => `    ${line}`),
  ]
  const install = io.install(root)
  if (install.status !== 0)
    return {
      problems: [
        `依赖：${why}，${command} 退出 ${install.status}：`,
        tail(install.output),
        ...online,
      ],
    }
  const prepared = io.prepareNative(root)
  if (prepared.status !== 0)
    return {
      problems: [
        `依赖：${why}，已 ${command}，但原生依赖准备失败：`,
        tail(prepared.output),
        ...online,
      ],
    }
  if (readText(join(root, INSTALLED_LOCKFILE)) !== main)
    return {
      problems: [`依赖：${why}，${command} 退出 0 但副本与本体仍不同`, ...online],
    }
  return {
    dependencies: { status: 'reinstalled', detail: `${why}，已 ${command} 并准备原生依赖` },
  }
}

/** 第 3 步：经 pnpm 起的 Node 是 devEngines.runtime。 */
function checkRuntime(root, io, runtime) {
  const run = io.pnpmNodeVersion(root)
  const version = firstLine(run.output)
  if (run.status === 0 && version === `v${runtime}`) return { runtime: version }
  return {
    problems: [
      '经 pnpm 起的 Node 不是 devEngines.runtime',
      `  期望：v${runtime}；实际：${run.status === 0 ? version : `pnpm exec node -v 退出 ${run.status}`}`,
      ...(run.status === 0 ? [] : [tail(run.output)]),
      `  修法：联网后重跑，pnpm 按 devEngines.runtime 下载 Node ${runtime}（onFail: download）`,
    ],
  }
}

/** 第 4 步：spawn-helper 可执行，不可执行就修。 */
function checkNative(root, io) {
  const before = io.spawnHelperProblems(root)
  if (before.length === 0)
    return { native: { status: 'ok', detail: 'node-pty 的 spawn-helper 可用' } }
  const prepared = io.prepareNative(root)
  const after = io.spawnHelperProblems(root)
  if (prepared.status === 0 && after.length === 0)
    return { native: { status: 'repaired', detail: `已修复：${before.join('；')}` } }
  return {
    problems: [
      '原生依赖：node-pty 的 spawn-helper 不可用，修复失败',
      ...(after.length === 0 ? before : after).map(line => `  ${line}`),
      tail(prepared.output),
      '  修法：删掉 node_modules 后按 docs/development.md「准备可用的检出」重装',
    ],
  }
}

/**
 * 跑前四步。成功返回 `{ status: 0, lines, result }`，`result` 是交给检查器的那份结果；
 * 任一步失败返回 `{ status: 2, lines }`，`lines` 写明哪一步、期望、实际与修法。
 */
export function bootstrap(root, io = defaultIo) {
  const lines = []
  const fail = (step, problems) => ({
    status: 2,
    lines: [...lines, `启动段：${step}失败，不起检查器`, ...problems.map(line => `  ${line}`)],
  })
  const toolchain = checkToolchain(root, io)
  if (toolchain.problems !== undefined) return fail('工具链', toolchain.problems)
  lines.push(
    `启动段：工具链——pnpm ${toolchain.declared.devPnpm}，PATH 上的 Node ${toolchain.node}（engines ${toolchain.declared.engines}）`,
  )
  const dependencies = checkDependencies(root, io)
  if (dependencies.problems !== undefined) return fail('依赖', dependencies.problems)
  lines.push(
    `启动段：依赖——${dependencies.dependencies.detail}${dependencies.dependencies.status === 'reinstalled' ? '' : '，不动'}`,
  )
  const runtime = checkRuntime(root, io, toolchain.declared.runtime)
  if (runtime.problems !== undefined) return fail('运行时', runtime.problems)
  lines.push(`启动段：运行时——经 pnpm 起的 Node ${runtime.runtime}`)
  const native = checkNative(root, io)
  if (native.problems !== undefined) return fail('原生依赖', native.problems)
  lines.push(`启动段：原生依赖——${native.native.detail}`)
  return {
    status: 0,
    lines,
    result: {
      toolchain: {
        pnpm: toolchain.declared.devPnpm,
        node: toolchain.node,
        runtime: runtime.runtime,
      },
      dependencies: dependencies.dependencies,
      native: native.native,
    },
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const outcome = bootstrap(root)
  for (const line of outcome.lines) process.stderr.write(`${line}\n`)
  if (outcome.result !== undefined) process.stdout.write(`${JSON.stringify(outcome.result)}\n`)
  process.exit(outcome.status)
}
