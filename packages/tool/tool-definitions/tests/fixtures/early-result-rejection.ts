import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import type { CommandOutcome, ProcessHandle } from '@omne-harness/execution-environment-contract'
import { createShellAuthor, type ShellAuthorEnvironment } from '@omne-harness/tool-definitions'
import { run, value } from '../run-author.ts'
import { shellFixture } from './shell.ts'

const unhandled: unknown[] = []
const observe = (error: unknown) => unhandled.push(error)
process.on('unhandledRejection', observe)
try {
  for (const route of ['command', 'terminal'] as const) {
    const fixture = shellFixture()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const ending = Promise.withResolvers<CommandOutcome>()
    let drained = false
    let returned = false
    const handle: ProcessHandle = {
      ...fixture.process('', route === 'terminal' ? 'terminal' : 'separate'),
      result: ending.promise,
      output: {
        async *[Symbol.asyncIterator]() {
          entered.resolve()
          await release.promise
          yield {
            stream: route === 'terminal' ? 'terminal' : 'stdout',
            observedOffset: 0,
            data: new TextEncoder().encode('late-tail'),
          }
          drained = true
        },
      },
    }
    const start = async () => ({ kind: 'done', requestId: 'fixture', value: handle }) as const
    const environment: ShellAuthorEnvironment = {
      ...fixture.environment,
      command: { start },
      terminal: { ...fixture.environment.terminal, execute: start },
    }
    const author = value(createShellAuthor(fixture.config))
    if (route === 'terminal') await run(author, 'create_session', {}, environment)
    const call = run(
      author,
      'execute',
      {
        script: 'command',
        ...(route === 'terminal' ? { terminal: { id: 'session', generation: '1' } } : {}),
      },
      environment,
    ).then(text => {
      returned = true
      return text
    })
    await entered.promise
    ending.reject(new Error('lost process result'))
    try {
      await setImmediate()
      await setImmediate()
      assert.equal(returned, false)
    } finally {
      release.resolve()
    }
    const text = await call
    assert.match(text, /^unknown process=/)
    assert.match(text, /outcome=unknown/)
    assert.match(text, /late-tail/)
    assert.equal(drained, true)
  }
  await setImmediate()
  process.stdout.write(JSON.stringify({ routes: 2, unhandledRejections: unhandled.length }))
  assert.equal(unhandled.length, 0)
} finally {
  process.removeListener('unhandledRejection', observe)
}
