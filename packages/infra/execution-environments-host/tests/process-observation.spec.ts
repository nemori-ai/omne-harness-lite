import { expect, test } from 'vitest'
import { readHostProcessStat } from '../src/process-observation.ts'

test.each(['ENOENT', 'ESRCH'])(
  'a process lost during proc read reports absence for %s',
  async code => {
    let path: string | undefined
    expect(
      await readHostProcessStat(123, async value => {
        path = value
        throw Object.assign(new Error('Original process disappeared'), { code })
      }),
    ).toBeUndefined()
    expect(path).toBe('/proc/123/stat')
  },
)

test.each(['EACCES', 'EIO'])(
  'an unreadable proc observation remains an error for %s',
  async code => {
    const error = Object.assign(new Error('Observation unavailable'), { code })
    await expect(
      readHostProcessStat(123, async () => {
        throw error
      }),
    ).rejects.toBe(error)
  },
)
