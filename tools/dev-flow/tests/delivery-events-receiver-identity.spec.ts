// Kernel and wall-clock reads are controlled; receiver state uses real isolated files.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeGithubEvent } from '../src/delivery/events.ts'
import {
  makeChannelConfig,
  receiverPaths,
  writePrivateJson,
} from '../src/delivery/events-channel-config.ts'
import { checkChannelReceiver } from '../src/delivery/events-receiver-check.ts'
import {
  claimChannelReceiver,
  processIdentity,
  readReceiverHealth,
} from '../src/delivery/events-receiver-state.ts'

const kernel = vi.hoisted(() => ({
  bootId: '11111111-2222-4333-8444-555555555555',
  startTicks: '14473',
  startedAt: 'Sun Nov  1 00:31:43 2026',
  statOverride: '',
  unreadable: false,
}))
vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(() => kernel.startedAt),
}))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    readFileSync: vi.fn((...args: Parameters<typeof fs.readFileSync>) => {
      if (args[0] === '/proc/sys/kernel/random/boot_id') {
        if (kernel.unreadable) throw new Error('proc unavailable')
        return `${kernel.bootId}\n`
      }
      if (args[0] === `/proc/${process.pid}/stat`)
        return (
          kernel.statOverride ||
          `${process.pid} (receiver (worker) test) S ${Array(18).fill('0').join(' ')} ${kernel.startTicks} 0\n`
        )
      return fs.readFileSync(...args)
    }),
  }
})

const homes: string[] = []
beforeEach(() => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  vi.clearAllMocks()
  kernel.bootId = '11111111-2222-4333-8444-555555555555'
  kernel.startTicks = '14473'
  kernel.startedAt = 'Sun Nov  1 00:31:43 2026'
  kernel.statOverride = ''
  kernel.unreadable = false
})
afterEach(() => {
  vi.unstubAllGlobals()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function connected() {
  const root = resolve('../../tmp/issue-980/tests')
  mkdirSync(root, { recursive: true })
  const directory = realpathSync(mkdtempSync(join(root, 'identity-')))
  homes.push(directory)
  const file = join(directory, 'events.jsonl')
  const config = makeChannelConfig({
    repository: 'owner/repo',
    file,
    channel: 'https://smee.io/identity-fixture',
    hookId: 42,
  })
  const configPath = receiverPaths(file).config
  writePrivateJson(configPath, config)
  const owner = claimChannelReceiver(config)
  owner.state.state = 'connected'
  owner.state.reasonCode = 'connected'
  writePrivateJson(receiverPaths(file).state, owner.state)
  return { file, owner, config, configPath }
}

describe('receiver identity across Linux clock correction', () => {
  it.each(['health', 'release'])(
    'preserves %s when ps lstart changes for the same process',
    action => {
      const { file, owner } = connected()
      kernel.startedAt = 'Sun Nov  1 00:31:42 2026'
      if (action === 'health') {
        expect(readReceiverHealth({ file, repository: 'owner/repo' })).toMatchObject({
          healthy: true,
          processAlive: true,
          reasonCode: 'connected',
        })
      } else {
        expect(() => owner.release()).not.toThrow()
        expect(existsSync(receiverPaths(file).pid)).toBe(false)
      }
    },
  )
  it.each([
    { bootId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    { startTicks: '14474' },
    { unreadable: true },
  ])('refuses a changed or unavailable kernel identity: %j', change => {
    const { file, owner } = connected()
    Object.assign(kernel, change)
    expect(readReceiverHealth({ file, repository: 'owner/repo' })).toMatchObject({
      healthy: false,
      processAlive: false,
      reasonCode: 'receiver-process-dead',
    })
    expect(() => owner.release()).toThrow('receiver-process-identity-changed')
    expect(existsSync(receiverPaths(file).pid)).toBe(true)
  })
  it.each([
    { bootId: '' },
    { bootId: 'not-a-boot-id' },
    { startTicks: '-1' },
    { startTicks: '1.5' },
    { startTicks: 'NaN' },
    { statOverride: 'truncated' },
    { statOverride: `99999999 (other) S ${Array(18).fill('0').join(' ')} 14473 0` },
    { unreadable: true },
  ])('does not create a fallback identity from malformed or unreadable proc data: %j', change => {
    Object.assign(kernel, change)
    expect(processIdentity(process.pid)).toBeNull()
    expect(() => connected()).toThrow('process-identity-unavailable')
    expect(homes.every(home => !existsSync(receiverPaths(join(home, 'events.jsonl')).pid))).toBe(
      true,
    )
  })
  it.each([
    { processIdentity: 'another-process' },
    { pid: 99999999 },
    { instanceId: 'other' },
    { host: 'other-host' },
    { repository: 'other/repo' },
    { eventFile: '/other/file' },
    { mode: 'legacy' },
    { managed: true },
    { hookId: 43 },
    { processStartedAt: '2026-10-31T00:00:00.000Z' },
  ])('retains the pid when persisted ownership changes: %j', change => {
    const { file, owner } = connected()
    writePrivateJson(receiverPaths(file).state, { ...owner.state, ...change })
    expect(() => owner.release()).toThrow('receiver-owner-changed')
    expect(existsSync(receiverPaths(file).pid)).toBe(true)
  })
  it('refuses health and release for old records and keeps a live writer excluded', () => {
    const { file, owner, config } = connected()
    writePrivateJson(receiverPaths(file).state, {
      ...owner.state,
      schemaVersion: 1,
      processIdentity: undefined,
    })
    expect(() => readReceiverHealth({ file, repository: 'owner/repo' })).toThrow(
      'invalid-receiver-state',
    )
    expect(() => owner.release()).toThrow('invalid-receiver-state')
    expect(() => claimChannelReceiver(config)).toThrow('receiver-already-running')
    expect(existsSync(receiverPaths(file).pid)).toBe(true)
  })
  it.each(['win32', 'darwin'])('keeps the existing start-time identity on %s', platform => {
    vi.stubGlobal('process', { ...process, platform })
    kernel.startedAt = '2026-11-01T00:31:43.0000000Z'
    const { file, owner } = connected()
    expect(processIdentity(process.pid)).toBe(kernel.startedAt)
    expect(execFileSync).toHaveBeenCalledWith(
      platform === 'win32' ? 'powershell.exe' : 'ps',
      expect.any(Array),
      expect.objectContaining({ timeout: platform === 'win32' ? 10000 : 2000, shell: false }),
    )
    expect(readReceiverHealth({ file, repository: 'owner/repo' }).healthy).toBe(true)
    owner.release()
    expect(existsSync(receiverPaths(file).pid)).toBe(false)
  })
})

function deliveryCheck(receivedAt: string) {
  const item = connected()
  const hookEvidence = join(item.configPath, '..', 'hook-evidence.json')
  const record = normalizeGithubEvent(
    { 'x-github-event': 'issues', 'x-github-delivery': 'checked' },
    { action: 'closed', issue: { number: 7, state: 'closed' } },
    receivedAt,
  )
  writeFileSync(
    item.file,
    `${JSON.stringify({
      ...record,
      receiver: {
        instanceId: item.config.instanceId,
        repository: item.config.repository,
        mode: 'channel',
        requiresReconcile: true,
      },
    })}\n`,
  )
  writePrivateJson(hookEvidence, {
    repository: item.config.repository,
    hook: {
      id: 42,
      name: 'web',
      active: true,
      events: item.config.events,
      config: { url: item.config.webhookUrl, content_type: 'json' },
    },
    delivery: { guid: 'checked', event: 'issues', status_code: 200, delivered_at: receivedAt },
  })
  const gh = vi.fn(() => JSON.stringify({ state: 'CLOSED' }))
  return {
    ...item,
    gh,
    check: () =>
      checkChannelReceiver({
        configPath: item.configPath,
        file: item.file,
        repository: item.config.repository,
        delivery: 'checked',
        issue: 7,
        hookEvidence,
        gh,
      }),
  }
}

describe('receiver delivery time validation', () => {
  beforeEach(() => {
    kernel.startedAt = '2026-11-01T00:31:43.000Z'
  })
  it.each(['not-a-date', 'linux:boot:pid:tick', ''])(
    'refuses invalid stored processStartedAt %j before reconciliation',
    async startedAt => {
      const { file, owner, gh, check } = deliveryCheck('2026-11-01T00:31:44.000Z')
      writePrivateJson(receiverPaths(file).state, { ...owner.state, processStartedAt: startedAt })
      await expect(check()).rejects.toThrow('invalid-receiver-state')
      expect(gh).not.toHaveBeenCalled()
    },
  )
  it.each(['not-a-date', '', '2026-11-01T00:31:42.999Z'])(
    'rejects invalid or pre-start receivedAt %j before reconciliation',
    async receivedAt => {
      const { gh, check } = deliveryCheck(receivedAt)
      await expect(check()).rejects.toThrow('real-event-not-received')
      expect(gh).not.toHaveBeenCalled()
    },
  )
  it('accepts the startup boundary without using the stable identity as a timestamp', async () => {
    const { gh, check, owner } = deliveryCheck(kernel.startedAt)
    expect(Number.isFinite(Date.parse(owner.state.processStartedAt))).toBe(true)
    expect(await check()).toMatchObject({ event: 'verified', wait: 'reconcile' })
    expect(gh).toHaveBeenCalledTimes(1)
  })
  it('does not claim a writer when its process start time is unavailable', () => {
    kernel.startedAt = 'not-a-date'
    expect(() => connected()).toThrow('process-start-time-unavailable')
    expect(homes.every(home => !existsSync(receiverPaths(join(home, 'events.jsonl')).pid))).toBe(
      true,
    )
  })
})
