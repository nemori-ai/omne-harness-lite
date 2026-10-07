// @module-tag slow
// Real systemd scopes, child processes and a real merged PTY.
import { expect, test } from 'vitest'
import { executeHostCommand, prepareHostProcess } from '../dist/native-command.js'
import { createHostProcessCoordinate } from '../dist/native-control.js'
import { defaultHostNativePolicy } from '../dist/native-policy.js'
import { hostResourceDirectory } from '../dist/resource-directory.js'
import { mkdtemp, symlink, writeFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const request = {
  executable: '/bin/sh',
  args: ['-c', 'printf "$ONLY:$1"; printf err >&2'],
  cwd: '/tmp',
  env: { ONLY: 'explicit' },
}
test(
  'native command is independent of runtime/Storage and preserves literal args, env and target exit',
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
      expect(value.process.outputMode).toBe('terminal')
      expect(parts.every(part => part.stream === 'terminal')).toBe(true)
      expect(parts.map(part => part.text).join('')).toBe('explicit:$HOMEerr')
      expect(await value.process.result).toMatchObject({
        kind: 'completed',
        exit: { code: 0 },
        output: {
          mode: 'terminal',
          terminal: { observedBytes: 17, discardedBytes: 0 },
        },
      })
    } finally {
      expect(await value.process.stop('forced')).toBe('confirmed')
    }
  },
)

test(
  'PTY mode provides real TTYs, explicit geometry, merged output and the target signal',
  { tags: ['slow'] },
  async () => {
    const value = await executeHostCommand(
      {
        executable: '/bin/bash',
        args: [
          '--noprofile',
          '--norc',
          '-c',
          'test -t 0 && test -t 1 && test -t 2 || exit 8; /usr/bin/stty size; printf out; printf err >&2; kill -TERM $$',
        ],
        cwd: '/tmp',
        env: {},
      },
      { ...defaultHostNativePolicy, terminalColumns: 100, terminalRows: 30 },
    )
    if (value.kind !== 'started') throw new Error(value.kind)
    try {
      const chunks: Buffer[] = []
      for await (const part of value.process.output) {
        expect(part.stream).toBe('terminal')
        chunks.push(Buffer.from(part.data))
      }
      expect(Buffer.concat(chunks).toString()).toBe('30 100\r\nouterr')
      expect(await value.process.result).toMatchObject({
        kind: 'completed',
        exit: { signal: 'SIGTERM' },
      })
    } finally {
      expect(await value.process.stop('forced')).toBe('confirmed')
    }
  },
)

test.each(['absolute-equals', 'relative-equals', 'bare'] as const)(
  'literal executable %s receives exact binary stdin and EOF without intermediary env hooks',
  { tags: ['slow'] },
  async mode => {
    const directory = await mkdtemp(join(tmpdir(), 'omne-pty-input-'))
    try {
      await symlink('/usr/bin/python3', join(directory, 'tool=name'))
      const marker = join(directory, 'must-not-exist'),
        hook = join(directory, 'bash-env')
      await writeFile(hook, `printf unexpected > '${marker}'`)
      const executable =
        mode === 'bare'
          ? 'python3'
          : mode === 'relative-equals'
            ? './tool=name'
            : join(directory, 'tool=name')
      const value = await executeHostCommand(
        {
          executable,
          cwd: directory,
          env: { PATH: '/usr/bin:/bin', BASH_ENV: hook },
          args: [
            '-c',
            'import sys; print(sys.stdin.buffer.read().hex()); print(sys.argv[1])',
            '$HOME',
          ],
          stdin: new Uint8Array([0, 10, 255, 13, 4]),
        },
        defaultHostNativePolicy,
      )
      if (value.kind !== 'started') throw new Error(value.kind)
      try {
        const chunks: Buffer[] = []
        for await (const part of value.process.output) chunks.push(Buffer.from(part.data))
        expect(Buffer.concat(chunks).toString()).toBe('000aff0d04\r\n$HOME\r\n')
        expect(await value.process.result).toMatchObject({ kind: 'completed', exit: { code: 0 } })
        await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' })
      } finally {
        expect(await value.process.stop('forced')).toBe('confirmed')
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test(
  'target spawn failure remains unknown and original one-off artifacts are disposed by stop',
  { tags: ['slow'] },
  async () => {
    const coordinate = await createHostProcessCoordinate()
    const prepared = await prepareHostProcess(
      { ...request, executable: '/missing/omne-command' },
      defaultHostNativePolicy,
      coordinate,
    )
    if (prepared.kind !== 'ready') throw new Error(prepared.kind)
    try {
      expect(await prepared.control.go()).toBe('started')
      expect(await prepared.control.process.result).toMatchObject({
        kind: 'failed',
        reason: 'effectUnknown',
      })
      expect(await prepared.control.stop('forced')).toBe('confirmed')
      await expect(access(hostResourceDirectory(coordinate))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await prepared.control.stop('forced')
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
  'unread merged PTY output remains bounded with exact observed and discarded counts',
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
      expect(outcome.output.mode).toBe('terminal')
      if (outcome.output.mode !== 'terminal') throw new Error('wrong output mode')
      expect(outcome.output.terminal.observedBytes).toBe(2097152)
      expect(outcome.output.terminal.discardedBytes).toBe(2097152 - 8192)
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
