import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git } from '../core/git.ts'
import { readIfFile } from './catalogue.ts'
import { readLoopConfig } from './config.ts'
import { STATE_FILE, stopHook, type HookDeps } from './hook.ts'
import { measureInChild } from './hook-process.ts'
import { loopHome } from './home.ts'
import { toolRoot } from './tool-root.ts'

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

function installed(): boolean {
  try {
    createRequire(import.meta.url).resolve('@typescript/typescript6')
    return true
  } catch {
    return false
  }
}

function writeState(home: string, text: string): void {
  mkdirSync(home, { recursive: true })
  const path = join(home, STATE_FILE)
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
    measure: measureInChild,
    readState: home => readIfFile(join(home, STATE_FILE)),
    writeState,
    log,
    toolRoot: () => toolRoot(process.env, dirname(fileURLToPath(import.meta.url))),
    installed,
  })
  if (output !== undefined) process.stdout.write(output)
} catch {}
process.exitCode = 0
