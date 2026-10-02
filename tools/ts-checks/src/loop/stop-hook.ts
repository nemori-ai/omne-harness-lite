// 收工钩子的入口：宿主（Claude Code、Codex）在 Stop 与 SubagentStop 上调它，标准输入是一个 JSON 对象。
// 要反馈时向标准输出写恰好一个 {"decision":"block","reason":…}；量读数时自己出错写恰好一个 {"systemMessage":…}
//（宿主显示给用户，不拦）；其余情形一个字节都不写。所有路径都退出 0。
// 宿主把退出码 2 一律当拦截，所以这里不经 make、不透传任何子进程的退出码。判断在 hook.ts。
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { git } from '../metrics/git.ts'
import { readIfFile } from './catalogue.ts'
import { readLoopConfig } from './config.ts'
import { stopHook, type HookDeps } from './hook.ts'
import { measureInWorker } from './hook-thread.ts'
import { loopHome } from './home.ts'

function repository(cwd: string): ReturnType<HookDeps['repository']> {
  let root: string
  try {
    root = git(cwd, ['rev-parse', '--show-toplevel'])
  } catch {
    return undefined
  }
  const common = resolve(root, git(root, ['rev-parse', '--git-common-dir']))
  return {
    root,
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    home: loopHome(dirname(common), process.env),
  }
}

function writeState(home: string, text: string): void {
  mkdirSync(home, { recursive: true })
  const path = join(home, 'hook-state.json')
  // 先写临时文件再改名：几棵工作树同时收工时，读到的总是完整的一份。
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, path)
}

function log(home: string, line: string): void {
  mkdirSync(home, { recursive: true })
  appendFileSync(join(home, 'hook.log'), `${line}\n`)
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks).toString('utf8')
}

try {
  const output = await stopHook(await readStdin(), {
    env: process.env,
    cwd: process.cwd(),
    now: () => new Date(),
    config: () => {
      const config = readLoopConfig()
      return { ...config.hook, primaryBranch: config.primaryBranch }
    },
    repository,
    measure: measureInWorker,
    readState: home => readIfFile(join(home, 'hook-state.json')),
    writeState,
    log,
  })
  if (output !== undefined) process.stdout.write(output)
} catch {
  // 读不了标准输入之类：不反馈。钩子自己出错从不拦人。
}
process.exitCode = 0
