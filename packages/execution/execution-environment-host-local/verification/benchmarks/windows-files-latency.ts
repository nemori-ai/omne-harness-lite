/**
 * Latency of single Windows file operations through `createWindowsFiles`: `stat`, `read` (4 KiB),
 * `list` (100 entries) and `write` (4 KiB replacement). The first request of the process, which
 * loads or compiles and starts the files helper, is reported on its own: it is the `hostObjectToken`
 * of the first named object, since the helper reads object tokens on Windows. Then every operation
 * warms up and runs `--iterations` times (200 by default) in sequence, and the script prints the
 * p50, p95, min and max in milliseconds.
 *
 * Run on Windows from the package directory, after the workspace dependencies are built:
 *
 *   node verification/benchmarks/windows-files-latency.ts [--iterations 200] [--warmup 20]
 *
 * Results are single-run measurements; keep raw output in the task's tmp, not here.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  originRef,
  type FacilityResult,
  type FileRequest,
} from '@omne-harness/execution-environment-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { hostObjectToken } from '../../src/host-files.ts'
import { hostFilesLimits } from '../../src/host-file-tree.ts'
import { createWindowsFiles } from '../../src/windows-files/facility.ts'

const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '200' },
    warmup: { type: 'string', default: '20' },
  },
})
const iterations = Number(values.iterations)
const warmup = Number(values.warmup)
if (process.platform !== 'win32') throw new Error('this benchmark measures the Windows backend')

const tenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!tenant.ok) throw new Error('tenant')

const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-files-latency-')))
try {
  const kib4 = Buffer.alloc(4096, 'a')
  const readPath = join(root, 'read.bin')
  const writePath = join(root, 'write.bin')
  const listPath = join(root, 'list')
  await writeFile(readPath, kib4)
  await writeFile(writePath, kib4)
  await mkdir(listPath)
  for (let index = 0; index < 100; index++)
    await writeFile(join(listPath, `entry-${String(index).padStart(3, '0')}.txt`), 'x')

  let generation = 0
  const files = createWindowsFiles({
    root,
    limits: hostFilesLimits(),
    issue: object => ({ object, generation: String(++generation) }),
  })
  const request = async (path: string, named = path): Promise<FileRequest<unknown>> => ({
    requestId: 'latency',
    access: { principal: 'benchmark', tenant: tenant.value },
    origin: originRef('benchmark'),
    binding: { kind: 'host_machine' },
    path,
    named: await hostObjectToken(named),
  })
  const expectDone = <T>(result: FacilityResult<T>): T => {
    if (result.kind !== 'done') throw new Error(`operation failed: ${JSON.stringify(result)}`)
    return result.value
  }

  const coldStart = process.hrtime.bigint()
  const statRequest = await request(readPath)
  const coldMs = Number(process.hrtime.bigint() - coldStart) / 1e6
  const listRequest = await request(listPath)
  let writeNamed = (await request(writePath)).named
  expectDone(await files.stat(statRequest))

  const operations: Readonly<Record<string, () => Promise<void>>> = {
    stat: async () => void expectDone(await files.stat(statRequest)),
    read: async () => {
      const read = expectDone(await files.read(statRequest))
      if (read.bytes.length !== 4096) throw new Error('read size')
    },
    list: async () => {
      const listed = expectDone(await files.list(listRequest))
      if (listed.entries.length !== 100) throw new Error('list size')
    },
    write: async () => {
      const written = expectDone(
        await files.write({
          ...statRequest,
          path: writePath,
          named: writeNamed,
          bytes: kib4,
          mode: 'replace',
        }),
      )
      writeNamed = written.object
    },
  }

  const percentile = (sorted: readonly number[], p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN
  const format = (value: number) => value.toFixed(2).padStart(8)

  console.log(
    `node ${process.version}, Windows ${release()}, ${cpus()[0]?.model ?? 'cpu'} x${cpus().length}`,
  )
  console.log(`iterations ${iterations}, warmup ${warmup}, sequential, one request in flight`)
  console.log(`first request (object token, helper start included): ${coldMs.toFixed(2)} ms`)
  console.log('operation      p50      p95      min      max  (ms)')
  for (const [name, run] of Object.entries(operations)) {
    for (let index = 0; index < warmup; index++) await run()
    const samples: number[] = []
    for (let index = 0; index < iterations; index++) {
      const started = process.hrtime.bigint()
      await run()
      samples.push(Number(process.hrtime.bigint() - started) / 1e6)
    }
    samples.sort((left, right) => left - right)
    console.log(
      `${name.padEnd(9)}${format(percentile(samples, 50))} ${format(percentile(samples, 95))} ${format(samples[0] ?? Number.NaN)} ${format(samples.at(-1) ?? Number.NaN)}`,
    )
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
