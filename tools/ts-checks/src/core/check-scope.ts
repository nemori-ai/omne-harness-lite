import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export function isLegacyDirectory(path: string): boolean {
  return path
    .replaceAll('\\', '/')
    .split('/')
    .some(segment => segment.endsWith('.legacy'))
}

export function isLegacyFile(path: string): boolean {
  const segments = path.replaceAll('\\', '/').split('/')
  return isLegacyDirectory(segments.slice(0, -1).join('/'))
}

/** Whether any directory under `root`, outside node_modules and .git, is an archived `.legacy` one. */
export function hasArchivedDirectories(root: string): boolean {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || ['node_modules', '.git'].includes(entry.name)) continue
    if (entry.name.endsWith('.legacy') || hasArchivedDirectories(join(root, entry.name)))
      return true
  }
  return false
}
