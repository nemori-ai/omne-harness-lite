// 仓库专用的配置只在仓库根的 `repo-toolchain.config.json` 里定一次，按节分给回路、度量与验收锁。
// 文件从运行检查器的仓库读（见 subject.ts）；缺文件、缺节或不是 JSON 对象都报错，不悄悄用默认。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runnerRoot } from './subject.ts'

export const TOOLCHAIN_CONFIG_FILE = 'repo-toolchain.config.json'
export const TOOLCHAIN_CONFIG_SECTIONS = ['loop', 'metrics', 'acceptanceLock'] as const
export type ToolchainConfigSection = (typeof TOOLCHAIN_CONFIG_SECTIONS)[number]

export function toolchainConfigPath(root: string = runnerRoot()): string {
  return join(root, TOOLCHAIN_CONFIG_FILE)
}

/** 读一节原样的 JSON；校验各节内容归各自的读取函数。 */
export function readToolchainSection(
  section: ToolchainConfigSection,
  path: string = toolchainConfigPath(),
): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error(`${path} 须为 JSON 对象`)
  const extra = Object.keys(parsed).filter(
    key => !(TOOLCHAIN_CONFIG_SECTIONS as readonly string[]).includes(key),
  )
  if (extra.length > 0) throw new Error(`${path} 里有认不出的节：${extra.join('、')}`)
  if (!(section in parsed)) throw new Error(`${path} 缺少 ${section} 一节`)
  return (parsed as Record<string, unknown>)[section]
}
