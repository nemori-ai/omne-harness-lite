#!/usr/bin/env node
// 原生依赖准备：`pnpm install --frozen-lockfile --ignore-scripts` 之后运行（根脚本 `pnpm run prepare:native`）。
// 两件事，可重复运行：
//   1. `pnpm -r rebuild node-pty`：只构建 pnpm-workspace.yaml 的 allowBuilds 里放行的这一个原生依赖。
//      macOS 与 Windows 取预编译包，Linux 没有预编译、由 node-gyp 从源码编译。
//   2. macOS 上给 node-pty 预编译包里的 spawn-helper 补执行位（0755）。
//      node-pty 1.1.0 的包里它没有执行位，postinstall 也不补；pnpm 12 应用只改模式的补丁会把它写坏，所以不经补丁。
//      上游 1.2.0 的预发行包已带执行位：1.2.0 正式版发行并升级后删除这一步。
// 凡是重建 node-pty 目录的安装（删掉 node_modules、新工作树、启动段的重装）都会让执行位再次丢失，所以安装后都调用这里。
// 只用 Node 标准库：scripts/check-bootstrap.mjs 在依赖还没装好时也要调用它。
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** node-pty 在 macOS 上带 spawn-helper 的预编译目录。 */
const DARWIN_PREBUILDS = ['darwin-arm64', 'darwin-x64']
/** Mach-O 的四种文件头：32/64 位、两种字节序，以及通用二进制。 */
const MACH_O_MAGICS = new Set([
  'feedface',
  'feedfacf',
  'cefaedfe',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
])

/**
 * 起 PATH 上的 pnpm 的命令：在仓库根运行时它按 packageManager 自己切到钉住的版本，规则同 tools/test-runner 的 `pnpmCommand`。
 * Windows 上只认 PATH 上的 pnpm.exe（docs/development.md 写明的装法），不经 shell 起 pnpm.cmd。
 */
export function pnpmCommand(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return { command: 'pnpm', args: [] }
  const path = env['PATH'] ?? env['Path'] ?? ''
  for (const directory of path.split(delimiter)) {
    if (directory === '') continue
    const exe = join(directory, 'pnpm.exe')
    if (existsSync(exe)) return { command: exe, args: [] }
  }
  throw new Error(
    'PATH 上没有 pnpm.exe：Windows 上按 docs/development.md 装 pnpm 12（独立安装或 mise）',
  )
}

/** 依赖目录里全部 node-pty 包目录（pnpm 的虚拟存储里可能不止一份）。 */
export function nodePtyDirectories(root) {
  const store = join(root, 'node_modules', '.pnpm')
  if (!existsSync(store)) return []
  return readdirSync(store)
    .filter(name => name.startsWith('node-pty@'))
    .map(name => join(store, name, 'node_modules', 'node-pty'))
    .filter(directory => existsSync(directory))
}

function machO(path) {
  const head = readFileSync(path).subarray(0, 4).toString('hex')
  return MACH_O_MAGICS.has(head)
}

/**
 * macOS 上每个 spawn-helper 的状况：路径、是不是 Mach-O、有没有执行位。别的平台返回空表。
 * 找不到 node-pty 也返回空表：有没有装依赖由启动段的依赖核对管。
 */
export function spawnHelpers(root, platform = process.platform) {
  if (platform !== 'darwin') return []
  const helpers = []
  for (const directory of nodePtyDirectories(root))
    for (const prebuild of DARWIN_PREBUILDS) {
      const path = join(directory, 'prebuilds', prebuild, 'spawn-helper')
      if (!existsSync(path)) continue
      helpers.push({
        path,
        machO: machO(path),
        executable: (statSync(path).mode & 0o111) === 0o111,
      })
    }
  return helpers
}

/** 不可用的 spawn-helper，一项一句；空表就是都可用。 */
export function spawnHelperProblems(root, platform = process.platform) {
  return spawnHelpers(root, platform)
    .filter(helper => !helper.machO || !helper.executable)
    .map(helper => `${helper.path}：${helper.machO ? '没有执行位' : '不是 Mach-O 文件'}`)
}

/**
 * 准备原生依赖；返回 `{ status, output }`，status 非 0 即失败，output 是给人读的说明与 pnpm 的输出。
 * 补完执行位后再核一遍：仍不可用（例如文件不是 Mach-O）就算失败，不当成准备好了。
 */
export function prepareNative(root, { env = process.env, platform = process.platform } = {}) {
  let pnpm
  try {
    pnpm = pnpmCommand(env, platform)
  } catch (error) {
    return { status: 1, output: error instanceof Error ? error.message : String(error) }
  }
  const rebuild = spawnSync(pnpm.command, [...pnpm.args, '-r', 'rebuild', 'node-pty'], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const output =
    rebuild.error !== undefined ? rebuild.error.message : `${rebuild.stdout}${rebuild.stderr}`
  if (rebuild.error !== undefined || rebuild.status !== 0)
    return { status: rebuild.status ?? 1, output: `pnpm -r rebuild node-pty 失败：\n${output}` }
  for (const helper of spawnHelpers(root, platform))
    if (helper.machO && !helper.executable) chmodSync(helper.path, 0o755)
  const problems = spawnHelperProblems(root, platform)
  if (problems.length > 0)
    return {
      status: 1,
      output: `${output}spawn-helper 仍不可用：\n${problems.join('\n')}\n删掉 node_modules 后按 docs/development.md「准备可用的检出」重装`,
    }
  return { status: 0, output }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const result = prepareNative(root)
  process.stdout.write(result.output)
  process.exit(result.status)
}
