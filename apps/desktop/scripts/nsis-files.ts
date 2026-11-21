// The uninstaller's file list: an installation directory can also hold the user's files, so neither
// uninstalling nor upgrading may delete it recursively. Only what was packaged goes, literally.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const nsisFileList = (projectDirectory: string, arch: string): string =>
  join(projectDirectory, 'out', 'nsis', `${arch}.nsh`)

/** Writes `out/nsis/<arch>.nsh`, which nsis/installer.nsh compiles into the uninstaller. */
export function writeNsisFileList(
  appDirectory: string,
  projectDirectory: string,
  arch: string,
): void {
  const checks: string[] = []
  const removals: string[] = []
  const visit = (directory: string, parent: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )
    for (const entry of entries) {
      // A literal dollar is doubled in NSIS strings; Windows names cannot hold quotes.
      const target = `${parent}\\${entry.name.replaceAll('$', () => '$$')}`
      if (entry.isDirectory()) {
        // The user may have put a junction in place of an installed directory.
        checks.push(`!insertmacro CheckDirectory "${target}"`)
        visit(join(directory, entry.name), target)
        removals.push(`RMDir "${target}"`)
      } else removals.push(`!insertmacro RemoveInstalledFile "${target}"`)
    }
  }
  visit(appDirectory, '$INSTDIR')
  const file = nsisFileList(projectDirectory, arch)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, `﻿${[...checks, ...removals].join('\n')}\n`)
}
