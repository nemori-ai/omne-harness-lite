// Kernel and wall-clock reads are controlled; receiver state uses real isolated files.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeGithubEvent } from '../src/delivery/events.ts'
import {
  makeChannelConfig,
  readChannelConfig,
  receiverPaths,
  writePrivateJson,
} from '../src/delivery/events-channel-config.ts'
import { checkChannelReceiver } from '../src/delivery/events-receiver-check.ts'
import {
  claimChannelReceiver,
  processIdentity,
  readReceiverHealth,
  readReceiverState,
} from '../src/delivery/events-receiver-state.ts'
import * as receiverState from '../src/delivery/events-receiver-state.ts'

const kernel = vi.hoisted(() => ({
  bootId: '11111111-2222-4333-8444-555555555555',
  startTicks: '14473',
  startedAt: 'Sun Nov  1 00:31:43 2026',
  statOverride: '',
  unreadable: false,
  pid: 0,
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
      if (args[0] === `/proc/${kernel.pid || process.pid}/stat`)
        return (
          kernel.statOverride ||
          `${kernel.pid || process.pid} (receiver (worker) test) S ${Array(18).fill('0').join(' ')} ${kernel.startTicks} 0\n`
        )
      return fs.readFileSync(...args)
    }),
  }
})

const homes: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  kernel.bootId = '11111111-2222-4333-8444-555555555555'
  kernel.startTicks = '14473'
  kernel.startedAt = 'Sun Nov  1 00:31:43 2026'
  kernel.statOverride = ''
  kernel.unreadable = false
  kernel.pid = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
  homes.splice(0).forEach(home => rmSync(home, { recursive: true, force: true }))
})
function testDirectory() {
  const root = resolve('../../tmp/issue-980/revision2/tests')
  mkdirSync(root, { recursive: true })
  const directory = realpathSync(mkdtempSync(join(root, 'identity-')))
  homes.push(directory)
  return directory
}
function connected(directory = testDirectory()) {
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
  beforeEach(() => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })
  })
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
    expect(owner.state.processIdentity).toBe(kernel.startedAt)
    expect(owner.state.processStartedAt).toBe('2026-11-01T00:31:43.000Z')
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

function deliveryCheck(
  receivedAt: string,
  item: Pick<ReturnType<typeof connected>, 'file' | 'config' | 'configPath'> = connected(),
) {
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
  it.each([
    'not-a-date',
    'linux:boot:pid:tick',
    '',
    'Sun Nov  1 00:31:43 2026',
    '2026-11-01T00:31:43',
  ])('refuses invalid stored processStartedAt %j before reconciliation', async startedAt => {
    const item = connected()
    const { file, gh, check } = deliveryCheck('2026-11-01T00:31:44.000Z', item)
    writePrivateJson(receiverPaths(file).state, {
      ...readReceiverState(file),
      processStartedAt: startedAt,
    })
    await expect(check()).rejects.toThrow('invalid-receiver-state')
    expect(gh).not.toHaveBeenCalled()
    expect(() => item.owner.release()).toThrow('invalid-receiver-state')
    expect(existsSync(receiverPaths(file).pid)).toBe(true)
  })
  it.each(['not-a-date', '', '2026-11-01T00:31:42.999Z'])(
    'rejects invalid or pre-start receivedAt %j before reconciliation',
    async receivedAt => {
      const { gh, check } = deliveryCheck(receivedAt)
      await expect(check()).rejects.toThrow('real-event-not-received')
      expect(gh).not.toHaveBeenCalled()
    },
  )
  it('accepts the startup boundary without using the stable identity as a timestamp', async () => {
    const { gh, check, file } = deliveryCheck(kernel.startedAt)
    expect(Number.isFinite(Date.parse(readReceiverState(file).processStartedAt))).toBe(true)
    expect(await check()).toMatchObject({ event: 'verified', wait: 'reconcile' })
    expect(gh).toHaveBeenCalledTimes(1)
  })
  it('does not claim a writer when its process start time is unavailable', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' })
    kernel.startedAt = 'not-a-date'
    expect(() => connected()).toThrow('process-start-time-unavailable')
    expect(homes.every(home => !existsSync(receiverPaths(join(home, 'events.jsonl')).pid))).toBe(
      true,
    )
  })
})

// Separate Vitest processes give each reader a real TZ, including on Windows workers.
const timeWorker = process.env.OMNE_RECEIVER_TIME_WORKER
if (timeWorker === 'producer') {
  it('timezone producer', () => {
    expect(new Date('2026-11-01T00:31:43Z').getTimezoneOffset()).toBe(0)
    vi.stubGlobal('process', { ...process, platform: 'linux' })
    connected(process.env.OMNE_RECEIVER_TIME_DIRECTORY)
  })
} else if (timeWorker === 'consumer') {
  it('timezone consumer', async () => {
    expect(new Date('2026-11-01T00:31:43Z').getTimezoneOffset()).toBe(-480)
    const directory = process.env.OMNE_RECEIVER_TIME_DIRECTORY
    const receivedAt = process.env.OMNE_RECEIVER_EVENT_TIME
    if (directory === undefined || receivedAt === undefined) throw new Error('missing fixture')
    const file = join(directory, 'events.jsonl')
    const configPath = receiverPaths(file).config
    const config = readChannelConfig(configPath)
    kernel.pid = readReceiverState(file).pid
    // Only identity queries use the Linux seam. Config permissions use the actual host.
    const actualHealth = receiverState.readReceiverHealth
    const health = vi.spyOn(receiverState, 'readReceiverHealth').mockImplementation(args => {
      vi.stubGlobal('process', { ...process, platform: 'linux' })
      try {
        return actualHealth(args)
      } finally {
        vi.unstubAllGlobals()
      }
    })
    try {
      const { gh, check } = deliveryCheck(receivedAt, { file, configPath, config })
      if (receivedAt === '2026-11-01T00:31:43.000Z') {
        expect(await check()).toMatchObject({ event: 'verified', wait: 'reconcile' })
        expect(gh).toHaveBeenCalledTimes(1)
      } else {
        await expect(check()).rejects.toThrow('real-event-not-received')
        expect(gh).not.toHaveBeenCalled()
      }
    } finally {
      health.mockRestore()
    }
  })
} else {
  it.each(['2026-10-31T20:31:43.000Z', '2026-11-01T00:31:43.000Z'])(
    'checks event %s across UTC producer and Asia/Shanghai consumer processes',
    receivedAt => {
      const directory = testDirectory()
      const vitest = fileURLToPath(
        new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')),
      )
      for (const [worker, tz] of [
        ['producer', 'UTC'],
        ['consumer', 'Asia/Shanghai'],
      ]) {
        const result = spawnSync(
          process.execPath,
          [
            vitest,
            'run',
            'tests/delivery-events-receiver-identity.spec.ts',
            '--typecheck.enabled=false',
            '-t',
            `^timezone ${worker}$`,
          ],
          {
            encoding: 'utf8',
            timeout: 30_000,
            env: {
              ...process.env,
              TZ: tz,
              NO_COLOR: '1',
              FORCE_COLOR: '0',
              OMNE_RECEIVER_TIME_WORKER: worker,
              OMNE_RECEIVER_TIME_DIRECTORY: directory,
              OMNE_RECEIVER_EVENT_TIME: receivedAt,
            },
          },
        )
        expect(result.error).toBeUndefined()
        expect(result.status, `${worker} TZ=${tz}\n${result.stdout}\n${result.stderr}`).toBe(0)
      }
    },
    60_000,
  )
}
