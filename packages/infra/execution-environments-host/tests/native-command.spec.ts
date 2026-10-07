// @module-tag slow
// Real systemd scopes, child processes and two independent output pipes.
import { expect, test } from 'vitest'
import { executeHostCommand, prepareHostProcess } from '../dist/native-command.js'
import { createHostProcessCoordinate } from '../dist/native-control.js'
import { defaultHostNativePolicy } from '../dist/native-policy.js'

const request = {
  executable: '/bin/sh',
  args: ['-c', 'printf "$ONLY:$1"; printf err >&2'],
  cwd: '/tmp',
  env: { ONLY: 'explicit' },
}
test(
  'native command is independent of runtime/Storage and separates literal args, env and exit',
  { tags: ['slow'] },
  async () => {
    const value = await executeHostCommand(
      { ...request, args: [...request.args, 'literal', '$HOME'] },
      defaultHostNativePolicy,
    )
    if (value.kind !== 'started') throw new Error(`Native start: ${value.kind}`)
    try {
      const parts: { stream: string; text: string }[] = []
      for await (const part of value.process.output)
        parts.push({ stream: part.stream, text: Buffer.from(part.data).toString() })
      expect(
        parts
          .filter(part => part.stream === 'stdout')
          .map(part => part.text)
          .join(''),
      ).toBe('explicit:$HOME')
      expect(
        parts
          .filter(part => part.stream === 'stderr')
          .map(part => part.text)
          .join(''),
      ).toBe('err')
      expect(await value.process.result).toMatchObject({
        kind: 'completed',
        exit: { code: 0 },
        output: {
          stdout: { observedBytes: 14, discardedBytes: 0 },
          stderr: { observedBytes: 3, discardedBytes: 0 },
        },
      })
    } finally {
      expect(await value.process.stop('forced')).toBe('confirmed')
    }
  },
)
test(
  'ready is not GO, original closed permission cannot be reopened',
  { tags: ['slow'] },
  async () => {
    const value = await prepareHostProcess(
      request,
      defaultHostNativePolicy,
      await createHostProcessCoordinate(),
    )
    if (value.kind !== 'ready') throw new Error(`Native preparation: ${value.kind}`)
    try {
      value.control.closePermission()
      expect(await value.control.go()).toBe('closed')
      expect(await value.control.stop('forced')).toBe('confirmed')
      expect(await value.control.process.result).toHaveProperty('kind', 'failed')
    } finally {
      await value.control.stop('forced')
    }
  },
)
test(
  'unread two-pipe output remains bounded and both exact counts survive completion',
  { tags: ['slow'] },
  async () => {
    const policy = {
      ...defaultHostNativePolicy,
      output: { maxBufferedBytes: 8192, maxChunkBytes: 1024, overflow: 'discard' as const },
    }
    const value = await executeHostCommand(
      {
        ...request,
        args: ['-c', '/usr/bin/head -c 1048576 /dev/zero; /usr/bin/head -c 1048576 /dev/zero >&2'],
      },
      policy,
    )
    if (value.kind !== 'started') throw new Error(`Native start: ${value.kind}`)
    try {
      const outcome = await value.process.result
      expect(outcome.kind).toBe('completed')
      expect(outcome.output.stdout.observedBytes).toBe(1048576)
      expect(outcome.output.stderr.observedBytes).toBe(1048576)
      expect(outcome.output.stdout.discardedBytes + outcome.output.stderr.discardedBytes).toBe(
        2097152 - 8192,
      )
      let retained = 0
      for await (const chunk of value.process.output) {
        expect(chunk.data.length).toBeLessThanOrEqual(1024)
        retained += chunk.data.length
      }
      expect(retained).toBe(8192)
    } finally {
      await value.process.stop('forced')
    }
  },
)
