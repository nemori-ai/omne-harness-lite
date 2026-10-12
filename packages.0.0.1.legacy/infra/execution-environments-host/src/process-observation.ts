import { readFile } from 'node:fs/promises'

/** A proc read can lose its process after open. This is observation, not stop authority. */
export async function readHostProcessStat(
  pid: number,
  read: (path: string) => Promise<string> = path => readFile(path, 'utf8'),
): Promise<string | undefined> {
  try {
    return await read(`/proc/${pid}/stat`)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ESRCH')
    )
      return undefined
    throw error
  }
}
