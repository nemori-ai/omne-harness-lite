export function ioCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}
export function unavailableIo(error: unknown): boolean {
  return [
    'EIO',
    'ENOSPC',
    'EDQUOT',
    'EMFILE',
    'ENFILE',
    'EACCES',
    'EPERM',
    'EROFS',
    'ENOENT',
    'EBUSY',
    'EINTR',
  ].includes(ioCode(error) ?? '')
}
