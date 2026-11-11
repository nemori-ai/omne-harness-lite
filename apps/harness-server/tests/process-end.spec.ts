// @module-tag slow
// 慢：每个用例起一个 node 子进程。
// The process ends when its command has reported the result (SPEC「进程的结束」): a handle left
// behind does not keep it alive, and the output it wrote reaches the reader whole.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const memberDir = fileURLToPath(new URL('..', import.meta.url))
const built = pathToFileURL(join(memberDir, 'dist', 'process-end.js')).href

/** Runs `script` as an ES module in a child process; resolves with its exit code and output. */
function run(
  script: string,
  timeout = 10_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      ['--input-type=module', '-e', script],
      { timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error !== null && child.exitCode === null) reject(error)
        else resolve({ code: child.exitCode, stdout, stderr })
      },
    )
  })
}

it('ends with the code although a timer and a server are still open, after the output drained', async () => {
  const bytes = 2 * 1024 * 1024
  const result = await run(`
    import { createServer } from 'node:net'
    import { endProcess } from ${JSON.stringify(built)}
    setInterval(() => {}, 1000)
    createServer().listen(0)
    process.stdout.write('x'.repeat(${String(bytes)}))
    process.stderr.write('reported')
    await endProcess(5)
  `)
  expect(result.code).toBe(5)
  expect(result.stdout.length).toBe(bytes)
  expect(result.stderr).toBe('reported')
}, 15_000)

it('the same script without it does not end: the open handles keep the process alive', async () => {
  await expect(
    run(
      `
      setInterval(() => {}, 1000)
      process.exitCode = 5
    `,
      2_000,
    ),
  ).rejects.toMatchObject({ killed: true })
}, 15_000)
