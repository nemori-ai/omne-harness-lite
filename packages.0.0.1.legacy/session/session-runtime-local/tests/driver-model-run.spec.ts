import { describe, expect, it, vi } from 'vitest'
import type {
  SettlementOwner,
  SettlementRegistration,
} from '@omne-harness-lite/model-request-runtime'
import { createDriverReads } from '../src/driver-model-run.ts'

describe('driver actual read registration pairing', () => {
  function fixture() {
    const stopped = Promise.withResolvers<void>()
    const release = vi.fn()
    const stop = vi.fn()
    const registration: SettlementRegistration = {
      start(_kind, operation) {
        return {
          completion: Promise.resolve().then(() => operation(new AbortController().signal)),
          stopped: stopped.promise,
          requestStop: stop,
        }
      },
      release,
    }
    const owner: SettlementOwner = {
      name: 'controlled-read-owner',
      admission: () => 'open',
      opened: () => ({ confirmed: true }),
      unresolvedWrites: () => [],
      acquire: vi.fn(() => ({ registration })),
    }
    return {
      stopped,
      release,
      stop,
      registration,
      owner,
      reads: createDriverReads({ owner, concurrent: 1 }),
    }
  }
  it('does not promote a completed read or return its owner slot before actual stopped', async () => {
    const f = fixture()
    const operation = vi.fn(async () => 'original full prefix')
    const task = f.reads.registration.start('read', operation)
    const completed = vi.fn()
    void task.completion.then(completed)
    await new Promise(resolve => setImmediate(resolve))
    expect(operation).toHaveBeenCalledOnce()
    expect(completed).not.toHaveBeenCalled()
    expect(f.release).not.toHaveBeenCalled()
    f.stopped.resolve()
    expect(await task.completion).toBe('original full prefix')
    await task.stopped
    expect(f.release).toHaveBeenCalledOnce()
    await f.reads.close()
    expect(f.release).toHaveBeenCalledOnce()
  })
  it('retains a failed stopped proof and reports it without returning the original registration', async () => {
    const f = fixture()
    const defect = new Error('actual read stop not proved')
    const task = f.reads.registration.start('read', async () => 'completion is insufficient')
    const rejected = expect(task.completion).rejects.toBe(defect)
    f.stopped.reject(defect)
    await rejected
    expect(f.release).not.toHaveBeenCalled()
    await expect(f.reads.close()).rejects.toMatchObject({ errors: [defect] })
    expect(f.stop).toHaveBeenCalledOnce()
    expect(f.release).not.toHaveBeenCalled()
  })
  it('retries the same failed original return and never allocates a replacement registration', async () => {
    const f = fixture()
    const defect = new Error('actual original return failed')
    f.release.mockImplementationOnce(() => {
      throw defect
    })
    const task = f.reads.registration.start('read', async () => 'prefix')
    const rejected = expect(task.completion).rejects.toBe(defect)
    f.stopped.resolve()
    await rejected
    await f.reads.close()
    expect(f.release).toHaveBeenCalledTimes(2)
    expect(f.owner.acquire).toHaveBeenCalledOnce()
    expect(() => f.reads.registration.start('read', async () => 'late')).toThrow(
      'open driver read required',
    )
  })
  it('keeps a defective starter registration when no actual task stop proof escaped', async () => {
    const f = fixture()
    const defect = new Error('starter invoked work then failed')
    vi.mocked(f.owner.acquire).mockReturnValue({
      registration: {
        ...f.registration,
        start() {
          throw defect
        },
      },
    })
    expect(() => f.reads.registration.start('read', async () => 'not a stop proof')).toThrow(defect)
    await expect(f.reads.close()).rejects.toMatchObject({ errors: [defect] })
    expect(f.release).not.toHaveBeenCalled()
  })
})
