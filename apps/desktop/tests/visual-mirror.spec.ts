import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createVisualRecordKernel,
  VISUAL_DEFAULTS,
  visualRecordKernel,
  type VisualPreferences,
} from '../src/shared/visual-record.ts'
import { afterEach, expect, it, vi } from 'vitest'

import { nodeFs } from '../src/main/atomic-file.ts'
import { createVisualMirror } from '../src/main/visual-mirror.ts'

const directories: string[] = []
function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'visual-mirror-')))
  directories.push(dir)
  const log = { warn: vi.fn<() => void>() }
  const fs = {
    ...nodeFs,
    readFileSync: vi.fn<(path: string) => string>(path => readFileSync(path, 'utf8')),
    renameSync: vi.fn<typeof nodeFs.renameSync>((from, to) => nodeFs.renameSync(from, to)),
    sleep: vi.fn<(ms: number) => void>(),
  }
  return {
    file: join(dir, 'visual.json'),
    fs,
    log,
    start: () => createVisualMirror(dir, { log, fs }),
  }
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})
const raw = (t: number, preferences: Partial<VisualPreferences>) =>
  visualRecordKernel.encode({ version: 1, stamp: { t, id: 'a' }, preferences })
const older = raw(1, { size: 'large' })
const newer = raw(2, { theme: 'dark', size: 'small' })
it('starts without writing and replaces a corrupt mirror with a complete canonical record', () => {
  const { file, log, start } = fixture()
  expect(start().read()).toEqual({ record: null, pending: false })
  expect(existsSync(file)).toBe(false)
  writeFileSync(file, 'invalid')
  const mirror = start()
  expect(log.warn).not.toHaveBeenCalled()
  expect(mirror.theme()).toBe(VISUAL_DEFAULTS.theme)
  expect(mirror.push(older)).toBe('ok')
  expect(mirror.push(JSON.stringify(JSON.parse(newer), null, 2))).toBe('ok')
  expect(mirror.push('invalid')).toBe('failed')
  expect(mirror.push(older)).toBe('ok')
  expect(readFileSync(file, 'utf8')).toBe(newer)
  expect(start().read()).toEqual({ record: newer, pending: false })
})
it('recovers a busy mirror at startup and preserves the newer file on an older push', () => {
  const { file, fs, start } = fixture()
  writeFileSync(file, newer)
  fs.readFileSync.mockImplementationOnce(() => {
    throw Object.assign(new Error('file busy'), { code: 'EBUSY' })
  })
  const mirror = start()
  expect(fs.sleep).toHaveBeenCalledOnce()
  expect(mirror.read()).toEqual({ record: newer, pending: false })
  expect(mirror.push(older)).toBe('ok')
  expect(readFileSync(file, 'utf8')).toBe(newer)
})
it('warns when the mirror cannot be read at startup', () => {
  const { fs, log, start } = fixture()
  fs.readFileSync.mockImplementationOnce(() => {
    throw Object.assign(new Error('read error'), { code: 'EIO' })
  })
  expect(start().read()).toEqual({ record: null, pending: false })
  expect(log.warn).toHaveBeenCalledOnce()
})
it('G10 derives missing choices from product defaults on construction and reset', () => {
  const kernel = createVisualRecordKernel({ ...VISUAL_DEFAULTS, theme: 'light' })
  const effective = vi.spyOn(visualRecordKernel, 'effective').mockImplementation(kernel.effective)
  try {
    const { start } = fixture()
    const mirror = start()
    expect(mirror.theme()).toBe('light')
    mirror.push(newer)
    mirror.push(raw(3, {}))
    expect(mirror.theme()).toBe('light')
    expect(start().theme()).toBe('light')
  } finally {
    effective.mockRestore()
  }
})
it.each(['equal', 'older', 'invalid', 'window or quit'] as const)(
  'retries pending data on %s without changing its stamp',
  trigger => {
    const { fs, start } = fixture()
    const mirror = start()
    const notify = vi.fn<typeof mirror.theme>(() => mirror.theme())
    mirror.onThemeChange(notify)
    mirror.push(older)
    fs.renameSync.mockImplementation(() => {
      throw new Error('disk unavailable')
    })
    try {
      expect(mirror.push(newer)).toBe('failed')
      expect(mirror.push(older)).toBe('ok')
      expect(mirror.push(newer)).toBe('failed')
      expect(mirror.read()).toEqual({ record: newer, pending: true })
      expect(notify).toHaveLastReturnedWith('dark')
      expect(start().read()).toEqual({ record: older, pending: false })
    } finally {
      fs.renameSync.mockImplementation((from, to) => nodeFs.renameSync(from, to))
    }
    const result =
      trigger === 'window or quit'
        ? mirror.retryPending()
        : mirror.push(trigger === 'equal' ? newer : trigger === 'older' ? older : '{}')
    const expected = { equal: 'ok', older: 'ok', invalid: 'failed', 'window or quit': undefined }
    expect(result).toBe(expected[trigger])
    expect(mirror.read()).toEqual({ record: newer, pending: false })
    expect(start().read()).toEqual(mirror.read())
    const writes = fs.renameSync.mock.calls.length
    mirror.push(newer)
    mirror.retryPending()
    expect(fs.renameSync).toHaveBeenCalledTimes(writes)
    expect(notify).toHaveBeenCalledOnce()
  },
)

it('supersedes a pending write with the new maximum and reports durability independently of native drawing', () => {
  const { fs, start } = fixture()
  const mirror = start()
  const latest = raw(3, { theme: 'light' })
  mirror.onThemeChange(() => {
    throw new Error('appearance unavailable')
  })
  const applied = vi.fn<() => string>(() => mirror.theme())
  mirror.onThemeChange(applied)
  fs.renameSync.mockImplementationOnce(() => {
    throw new Error('disk unavailable')
  })
  expect(mirror.push(newer)).toBe('failed')
  expect(applied).toHaveLastReturnedWith('dark')
  expect(mirror.push(latest)).toBe('ok')
  expect(applied).toHaveLastReturnedWith('light')
  expect(mirror.read()).toEqual({ record: latest, pending: false })
  expect(start().read()).toEqual(mirror.read())
})
