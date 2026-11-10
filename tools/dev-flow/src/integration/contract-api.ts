import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { repositoryEnv } from '@omne-harness/repo-toolchain/core/git-environment'
import { IntegrationError, json, object, string } from './parse.ts'

const TOOLCHAIN_PACKAGE = '@omne-harness/repo-toolchain'
const CONTRACT_API_BIN = 'omne-contract-api'

/** Why the pinned CLI could not run or answer. */
export type Unavailable = { kind: 'unavailable'; reason: string }

/** How to start the CLI: the executable and the arguments before the CLI's own. */
export type ContractApiCommand = { file: string; args: readonly string[] }

/** The manifest of the installed repo-toolchain, or undefined when dev-flow cannot resolve it. */
function toolchainManifest(): string | undefined {
  try {
    return findPackageJSON(TOOLCHAIN_PACKAGE, import.meta.url)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND')
      return undefined
    throw error
  }
}

/** The pinned `omne-contract-api` script, resolved from this member's dependency. */
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

/** The CLI's environment: the configuration and the subject both come from the checkout. */
export function contractApiEnv(root: string): NodeJS.ProcessEnv {
  return { ...repositoryEnv(process.env), OMNE_SUBJECT_ROOT: root, OMNE_RUNNER_ROOT: root }
}

/**
 * Runs `omne-contract-api` with `args` on the checkout `root`. Each failure has its own reason:
 * timeout, process error with its error code, exit code with standard error.
 */
export function runContractApi(
  command: ContractApiCommand,
  args: readonly string[],
  { root, timeoutMs }: { root: string; timeoutMs: number },
): { kind: 'ran'; stdout: string } | Unavailable {
  const result = spawnSync(command.file, [...command.args, ...args, '--root', root], {
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

/**
 * Runs `step`. A known failure (`IntegrationError`, which includes `GitError`) becomes
 * `unavailable` with the reason `describe` gives; any other error propagates.
 */
function unavailableOnKnown<T>(
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
