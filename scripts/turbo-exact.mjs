#!/usr/bin/env node
// 经缓存跑 turbo，并让缓存命中的任务的输出目录只留 turbo 为它记下的文件：
//   node scripts/turbo-exact.mjs run build [turbo 的其余参数]
// 缓存命中时 turbo 把产物还原到已有目录之上，成员自己的 `rm -rf dist` 不执行，旧布局留下的文件
// 一直留在输出目录里。把输出目录当集合读的消费者（发行清单、打包）就看到清单之外的产物（#1373）。
// 没命中的任务跑的是成员自己的构建脚本，输出目录归它清，这里不碰。只用 Node 标准库。
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIRECTORY_GLOB = /^([^*?[\]{}!]+)\/\*\*$/u

/** 一个任务声明的输出目录（相对成员目录）。只认「目录/**」：别的写法判不了哪些文件多余。 */
export function outputDirectories(task) {
  if ((task.excludedOutputs ?? []).length > 0)
    throw new Error(`${task.taskId} 声明了排除的输出，turbo-exact 判不了哪些文件多余`)
  return (task.outputs ?? []).map(glob => {
    const found = DIRECTORY_GLOB.exec(glob)
    if (found === null)
      throw new Error(`${task.taskId} 的输出 ${glob} 不是「目录/**」的写法，turbo-exact 判不了`)
    return found[1]
  })
}

function filesUnder(root, relative) {
  const out = []
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = `${relative}/${entry.name}`
    if (entry.isDirectory()) out.push(...filesUnder(root, path))
    else out.push(path)
  }
  return out
}

/**
 * 运行摘要里缓存命中的任务，输出目录中不在它产物清单里的文件（仓库相对路径，正斜杠）。
 * 产物清单里没有某个输出目录的任何文件、目录里却有文件时不删，抛错：那不是「多了几个旧文件」。
 */
export function staleOutputs(summary, root = ROOT) {
  const stale = []
  for (const task of summary.tasks ?? []) {
    if (task.cache?.status !== 'HIT') continue
    const kept = new Set((task.expandedOutputs ?? []).map(path => path.replaceAll('\\', '/')))
    const member = task.directory.replaceAll('\\', '/')
    for (const directory of outputDirectories(task)) {
      const relative = `${member}/${directory}`
      if (!existsSync(join(root, relative))) continue
      const present = filesUnder(root, relative)
      const extra = present.filter(path => !kept.has(path))
      if (extra.length === present.length && present.length > 0)
        throw new Error(
          `${task.taskId} 命中了缓存，但产物清单里没有 ${relative} 下的任何文件：不清空它`,
        )
      stale.push(...extra)
    }
  }
  return stale
}

function removeEmptyDirectories(root, relative) {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true }))
    if (entry.isDirectory()) removeEmptyDirectories(root, `${relative}/${entry.name}`)
  if (readdirSync(join(root, relative)).length === 0) rmdirSync(join(root, relative))
}

/** 删掉多余的文件与因此变空的目录，返回删掉的文件。 */
export function pruneOutputs(summary, root = ROOT) {
  const stale = staleOutputs(summary, root)
  for (const path of stale) rmSync(join(root, path))
  const touched = new Set(stale.map(path => path.slice(0, path.lastIndexOf('/'))))
  for (const directory of touched)
    if (existsSync(join(root, directory))) removeEmptyDirectories(root, directory)
  return stale
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu')

/** turbo 在输出里报出的运行摘要路径；没报就是 null。 */
export function summaryPath(output) {
  const found = /Summary:\s+(\S.*\.json)/u.exec(output.replace(ANSI, ''))
  return found === null ? null : found[1]
}

function runTurbo(args) {
  return new Promise((done, failed) => {
    const child = spawn('turbo', [...args, '--summarize'], {
      cwd: ROOT,
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', TURBO_NO_UPDATE_NOTIFIER: '1' },
      shell: process.platform === 'win32',
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
      process.stdout.write(chunk)
    })
    child.stderr.on('data', chunk => {
      output += String(chunk)
      process.stderr.write(chunk)
    })
    child.on('error', failed)
    child.on('close', code => done({ code: code ?? 1, output }))
  })
}

async function main(args) {
  if (args[0] !== 'run' || args.length < 2) {
    process.stderr.write('用法：node scripts/turbo-exact.mjs run <任务> [turbo 的其余参数]\n')
    return 2
  }
  const ran = await runTurbo(args)
  const path = summaryPath(ran.output)
  if (path === null) {
    if (ran.code !== 0) return ran.code
    process.stderr.write('turbo-exact：turbo 没有报出运行摘要，无法核对输出目录\n')
    return 2
  }
  const stale = pruneOutputs(JSON.parse(readFileSync(path, 'utf8')))
  rmSync(path)
  if (stale.length > 0)
    process.stderr.write(
      `turbo-exact：删掉 ${String(stale.length)} 个缓存产物清单之外的旧文件：\n${stale.map(item => `  ${item}`).join('\n')}\n`,
    )
  return ran.code
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`turbo-exact：${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
