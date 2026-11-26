import { parseArgs } from 'node:util'
import { isAbsolute } from 'node:path'
import { standingOfVersion } from '@omne-harness/assembly'
import { installVersion, readVersions, switchVersion } from './install-root.ts'
import { UsageError } from './serve-command.ts'

export const VERSIONS_USAGE =
  'usage: versions install --install-root <abs dir> --from <abs dir> [--label <name>]\n       versions switch --install-root <abs dir> <version>\n       versions show --install-root <abs dir>'

const absolute = (flag: string, value: string | undefined): string => {
  if (value === undefined || !isAbsolute(value))
    throw new UsageError(`--${flag} must be an absolute path`)
  return value
}

/** Exit 0: done, or it was so already. 3: refused, with the reason. 2: usage, or the install root cannot be read. */
export function versionsCommand(
  argv: readonly string[],
  out: (line: string) => void,
  err: (line: string) => void,
): number {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      'install-root': { type: 'string' },
      from: { type: 'string' },
      label: { type: 'string' },
    },
  })
  const [op, version] = positionals
  const root = absolute('install-root', values['install-root'])
  const answer = (record: Record<string, unknown>, refused: boolean): number => {
    out(JSON.stringify(record))
    return refused ? 3 : 0
  }
  try {
    if (op === 'install' && positionals.length === 1) {
      const installed = installVersion(root, absolute('from', values.from), values.label)
      return answer({ kind: 'version-installed', ...installed }, installed.outcome === 'in-use')
    }
    if (op === 'switch' && positionals.length === 2 && version !== undefined) {
      const switched = switchVersion(root, version)
      return answer(
        { kind: 'version-switched', version, ...switched },
        switched.outcome === 'not-complete',
      )
    }
    if (op === 'show' && positionals.length === 1) {
      const versions = readVersions(root)
      const standings = Object.keys(versions.installed)
        .sort()
        .map(each => ({ version: each, standing: standingOfVersion(versions, each) }))
      return answer({ kind: 'versions', pointer: versions.pointer, versions: standings }, false)
    }
  } catch (error) {
    if (error instanceof UsageError) throw error
    err(`versions: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
  throw new UsageError('expected install, switch <version> or show')
}
