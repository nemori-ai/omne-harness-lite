import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PQW_VENDOR = '.meta_harness/agents/vendor/pqw-skills'

export const PQW_FLOAT = '.meta_harness/.vendor-float/pqw-skills'

const PQW_PINNED = '.meta_harness/agents/pqw/contract-version'
const PQW_CONTRACT = 'design/consumer-contract.json'

function versionIn(path: string, parse: (text: string) => unknown): number | undefined {
  if (!existsSync(path)) return undefined
  const value = parse(readFileSync(path, 'utf8'))
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

export function pqwScripts(root: string): string {
  const pinned = versionIn(join(root, PQW_PINNED), text => Number(text.trim()))
  const floated = versionIn(
    join(root, PQW_FLOAT, PQW_CONTRACT),
    text => (JSON.parse(text) as { version?: unknown }).version,
  )
  const source = pinned !== undefined && floated === pinned ? PQW_FLOAT : PQW_VENDOR
  return join(root, source, 'skills/slice-closeout/scripts')
}

export const STRYKER_MODULES = 'tools/pqw-adapter/node_modules'

export const FAST_VITEST_CONFIG = fileURLToPath(
  new URL('../resources/vitest-fast.config.mts', import.meta.url),
)

export const slugOf = (member: string): string => member.replaceAll('/', '__')
