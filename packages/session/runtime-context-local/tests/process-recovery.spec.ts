// @module-tag slow
// Real child processes receive SIGKILL inside two persistence boundaries.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations, narrow } from '@omne-harness-lite/storage'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { createRuntimeContext, runtimeContextMigrations } from '../src/index.ts'
import type { ProjectionTables } from '../src/projection-codec.ts'
import { authority, scope as baseScope, at } from './fixture.ts'

for (const cut of ['after-log', 'inside-sql'] as const)
  test(
    `SIGKILL ${cut}: cold recovery adopts the committed log without duplicating a context fact`,
    { tags: ['slow'] },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'omne-context-crash-'))
      await mkdir(join(dir, 'logs'))
      const scope = {
        ...baseScope,
        session: unwrap(parseOpaqueIdentifier('crash-session', 'SessionRef')),
      }
      const auth = authority(),
        token = auth.bind('coordinator', ['public'], scope)
      const openSql = () =>
        openStorage({
          dialect: 'sqlite',
          file: join(dir, 'context.sqlite'),
          migrations: composeMigrations(runtimeContextMigrations),
          upgrade: false,
        })
      const firstSql = await openSql()
      const firstLog = await openJsonlSessionLog({
        dir: join(dir, 'logs'),
        processOwnership: { current: 'initial-parent', observeExit: async () => 'unknown' },
      })
      const first = createRuntimeContext({
        storage: firstSql,
        log: firstLog,
        access: auth.operations,
        now: () => at,
      })
      expect(
        await first.initializer.initializeContextSession(scope, {
          required: [],
          initial: [],
          fixed: [],
        }),
      ).toHaveProperty('kind', 'applied')
      first.closeAdmission()
      await first.drain()
      await firstLog.close()
      await firstSql.close()
      const child = fork(
        fileURLToPath(new URL('./fixtures/crash-owner.ts', import.meta.url)),
        [dir, cut],
        { execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      )
      let errors = ''
      child.stderr?.on('data', data => {
        errors += String(data)
      })
      const exit = once(child, 'exit')
      try {
        const reached = await Promise.race([
          once(child, 'message'),
          exit.then(result => {
            throw new Error(`child exited before cutpoint ${String(result)}: ${errors}`)
          }),
        ])
        expect(reached[0]).toEqual({ kind: 'cut', pid: child.pid })
        expect(child.kill('SIGKILL')).toBe(true)
        expect(await exit).toEqual([null, 'SIGKILL'])
        const sql = await openSql()
        const log = await openJsonlSessionLog({
          dir: join(dir, 'logs'),
          processOwnership: {
            current: 'recovery-parent',
            observeExit: async identity =>
              identity === `crash:${child.pid}` && child.signalCode === 'SIGKILL'
                ? 'exited'
                : 'unknown',
          },
        })
        const owner = createRuntimeContext({
          storage: sql,
          log,
          access: auth.operations,
          now: () => at,
        })
        try {
          const prefix = await log.readSince(scope.session, 0)
          expect(prefix).toHaveProperty('tail', 2)
          // The killed transaction did not advance SQL even though the log fact is durable.
          expect(
            await sql.read(tx =>
              narrow<ProjectionTables>(tx)
                .selectFrom('rc_projection_meta')
                .select('applied_tail')
                .executeTakeFirstOrThrow(),
            ),
          ).toHaveProperty('applied_tail', '1')
          expect(await owner.operations.registrations(token, scope)).toMatchObject({
            kind: 'registrations',
            entries: [{ key: 'public' }],
          })
          expect(
            await sql.read(tx =>
              narrow<ProjectionTables>(tx)
                .selectFrom('rc_projection_meta')
                .select('applied_tail')
                .executeTakeFirstOrThrow(),
            ),
          ).toHaveProperty('applied_tail', '2')
          expect(await log.readSince(scope.session, 0)).toEqual(prefix)
        } finally {
          owner.closeAdmission()
          await owner.drain()
          await log.close()
          await sql.close()
        }
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
          await exit
        }
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
