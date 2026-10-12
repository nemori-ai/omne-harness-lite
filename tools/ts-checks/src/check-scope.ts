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
