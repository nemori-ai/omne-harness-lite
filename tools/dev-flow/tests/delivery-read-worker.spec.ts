import { existsSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createReadWorkers, type ReadProbe } from '../src/delivery/collaboration-read-worker.ts'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const close of cleanups.splice(0).reverse()) close()
})
function worker(
  source: string,
  input: unknown = {},
  timeout: number | Readonly<Record<ReadProbe, number>> = 5000,
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'read-worker-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'worker.mjs')
  writeFileSync(file, source)
  const timeouts =
    typeof timeout === 'number' ? { reconcile: timeout, runs: timeout, deadline: timeout } : timeout
  const workers = createReadWorkers(pathToFileURL(file), input, timeouts)
  cleanups.push(workers.stop)
  return workers
}

describe('remote read process isolation', () => {
  it.each([0, -1, Number.NaN, 2_147_483_648])('rejects invalid probe timeout %s', timeout => {
    expect(() => worker('', {}, { reconcile: 5000, runs: timeout, deadline: 5000 })).toThrow(
      'reduce-worker-timeout-invalid',
    )
  })
  it('allows a complete reconciliation while other probe kinds retain shorter bounds', async () => {
    const workers = worker(
      `process.on('message',({kind})=>{
        if (kind === 'reconcile') setTimeout(()=>process.send({kind,ok:true,signals:['queue','release']}),300);
      });`,
      {},
      { reconcile: 2000, runs: 100, deadline: 100 },
    )
    const reconciliation = workers.probe('reconcile')
    await expect(workers.probe('runs')).rejects.toThrow('reduce-worker-probe-timeout')
    await expect(workers.probe('deadline')).rejects.toThrow('reduce-worker-probe-timeout')
    expect(await reconciliation).toEqual(['queue', 'release'])
    await workers.close()
    await expect(workers.probe('reconcile')).rejects.toThrow('reduce-worker-stopped')
  })
  it.skipIf(process.platform === 'win32')(
    'stops an owned blocking reader and its subprocess group',
    async () => {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'worker-descendant-')))
      cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
      const marker = join(dir, 'unwanted-effect')
      const workers = worker(
        `
      import {spawn} from 'node:child_process';
      process.on('message',({kind,input})=>{
        const child=spawn(process.execPath,['-e',
          'process.stdout.write("ready");setTimeout(()=>{require("node:fs").writeFileSync(process.argv[1],"alive")},400)',input.marker],
          {stdio:['ignore','pipe','ignore']});
        child.stdout.once('data',()=>process.send({kind,ok:true,signals:[child.pid]}));
      });`,
        { marker },
      )
      expect(await workers.probe('runs')).toHaveLength(1)
      await workers.close()
      await workers.close()
      await new Promise(resolve => setTimeout(resolve, 650))
      expect(existsSync(marker)).toBe(false)
    },
  )
  it('keeps local timers live during a truly blocking remote worker', async () => {
    const workers = worker(`process.on('message', ({kind}) => {
      if (kind === 'runs') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);
      process.send({kind,ok:true,signals:[kind]});
    })`)
    const remote = workers.probe('runs').catch(error => error.message)
    const local = await new Promise<string>(resolve =>
      setTimeout(() => resolve('local-health'), 50),
    )
    expect(local).toBe('local-health')
    expect(await workers.probe('reconcile')).toEqual(['reconcile'])
    workers.stop()
    expect(await remote).toBe('reduce-worker-stopped')
  })
  it('preserves active-run state in the same worker between probes', async () => {
    const workers = worker(
      `let count=0;process.on('message',({kind})=>process.send({kind,ok:true,signals:[++count]}));`,
    )
    expect(await workers.probe('runs')).toEqual([1])
    expect(await workers.probe('runs')).toEqual([2])
    expect(await workers.probe('deadline')).toEqual([1])
  })
  it('does not silently restart after a remote process exits', async () => {
    const workers = worker(`process.on('message',()=>process.exit(4));`)
    await expect(workers.probe('reconcile')).rejects.toThrow('reduce-worker-exited')
    await expect(workers.probe('reconcile')).rejects.toThrow('reduce-worker-recovery-required')
  })
  it('rejects wrong probe identity and repeated concurrent sends', async () => {
    const workers = worker(
      `process.on('message',()=>process.send({kind:'deadline',ok:true,signals:[]}));`,
    )
    const first = workers.probe('runs')
    await expect(workers.probe('runs')).rejects.toThrow('reduce-worker-probe-overlap')
    await expect(first).rejects.toThrow('reduce-worker-probe-mismatch')
  })
  it('kills an unresponsive worker on bounded timeout', async () => {
    const workers = worker(`process.on('message',()=>{});`, {}, 100)
    await expect(workers.probe('runs')).rejects.toThrow('reduce-worker-probe-timeout')
    await expect(workers.probe('runs')).rejects.toThrow('reduce-worker-recovery-required')
  })
})
