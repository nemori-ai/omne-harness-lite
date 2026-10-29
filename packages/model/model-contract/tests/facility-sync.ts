// The install-closure facility is kept by each contract member (the two copies are not one
// package), so the copies must stay the same. This compares the files of two members byte for byte.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

/**
 * The files of a member that make up the facility, relative to the member, in order. The relative
 * paths always use `/`, so the list and its order are the same on every platform.
 */
export function facilityFiles(member: string): string[] {
  const found: string[] = []
  const visit = (relative: string): void => {
    for (const entry of readdirSync(join(member, relative), { withFileTypes: true })) {
      const path = posix.join(relative, entry.name)
      if (entry.isDirectory()) visit(path)
      else found.push(path)
    }
  }
  if (existsSync(join(member, 'tests/install'))) visit('tests/install')
  if (
    statSync(join(member, 'tests/fixture-runner.ts'), { throwIfNoEntry: false })?.isFile() === true
  )
    found.push('tests/fixture-runner.ts')
  return found.sort()
}

/** What differs between the facility files of two members; empty when they are the same. */
export function facilityDifferences(left: string, right: string): string[] {
  const own = facilityFiles(left)
  const other = facilityFiles(right)
  return [
    ...own.filter(file => !other.includes(file)).map(file => `only in ${left}: ${file}`),
    ...other.filter(file => !own.includes(file)).map(file => `only in ${right}: ${file}`),
    ...own
      .filter(file => other.includes(file))
      .filter(file => !readFileSync(join(left, file)).equals(readFileSync(join(right, file))))
      .map(file => `differs: ${file}`),
  ]
}
