import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { IntegrationError, json, object, string } from './parse.ts'

const TOOLCHAIN_PACKAGE = '@omne-harness/repo-toolchain'
const CONTRACT_API_BIN = 'omne-contract-api'

export type Unavailable = { kind: 'unavailable'; reason: string }

export type ContractApiCommand = { file: string; args: readonly string[] }

export type ProcessResult = {
  error?: Error | undefined
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string | null
}

export type ProcessRunner = (
  file: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => ProcessResult

export type ManifestFinder = (specifier: string, base: string) => string | undefined

export function toolchainManifest(find: ManifestFinder = findPackageJSON): string | undefined {
  try {
    return find(TOOLCHAIN_PACKAGE, import.meta.url)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND')
      return undefined
    throw error
  }
}

export function contractApiCommand(): ContractApiCommand | Unavailable {
  const manifest = toolchainManifest()
  if (manifest === undefined)
    return {
      kind: 'unavailable',
      reason: `找不到 ${CONTRACT_API_BIN}：dev-flow 解析不到 ${TOOLCHAIN_PACKAGE}。`,
    }
  const bin = unavailableOnKnown(
    () =>
      string(
        object(object(json(readFileSync(manifest, 'utf8'), manifest), manifest).bin, 'bin')[
          CONTRACT_API_BIN
        ],
        `bin.${CONTRACT_API_BIN}`,
      ),
    error => `找不到 ${CONTRACT_API_BIN}：${error.message}`,
  )
  if (typeof bin !== 'string') return bin
  return { file: process.execPath, args: [join(dirname(manifest), bin)] }
}

export function contractApiEnv(root: string): NodeJS.ProcessEnv {
  return { ...repositoryEnv(process.env), OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: root }
}

export function runContractApi(
  command: ContractApiCommand,
  args: readonly string[],
  { root, timeoutMs }: { root: string; timeoutMs: number },
  run: ProcessRunner = spawnSync,
): { kind: 'ran'; stdout: string } | Unavailable {
  const result = run(command.file, [...command.args, ...args, '--root', root], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: contractApiEnv(root),
  })
  if (result.error !== undefined) {
    const code = 'code' in result.error ? result.error.code : undefined
    return code === 'ETIMEDOUT'
      ? {
          kind: 'unavailable',
          reason: `${CONTRACT_API_BIN} 在 ${timeoutMs} 毫秒内没有结束，已终止。`,
        }
      : {
          kind: 'unavailable',
          reason: `${CONTRACT_API_BIN} 进程出错（${typeof code === 'string' ? code : '无错误码'}）：${result.error.message}`,
        }
  }
  const stderr = (result.stderr ?? '').trim()
  if (result.status !== 0)
    return {
      kind: 'unavailable',
      reason: `${CONTRACT_API_BIN} 退出码 ${result.status ?? `null（信号 ${result.signal ?? '未知'}）`}${stderr === '' ? '' : `：${stderr}`}`,
    }
  return { kind: 'ran', stdout: result.stdout }
}

export function unavailableOnKnown<T>(
  step: () => T,
  describe: (error: IntegrationError) => string,
): T | Unavailable {
  try {
    return step()
  } catch (error) {
    if (!(error instanceof IntegrationError)) throw error
    return { kind: 'unavailable', reason: describe(error) }
  }
}
