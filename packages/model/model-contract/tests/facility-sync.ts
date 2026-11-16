import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

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
