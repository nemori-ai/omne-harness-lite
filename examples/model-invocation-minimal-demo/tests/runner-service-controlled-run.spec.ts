import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAcceptanceApplication, type ControlledRunFixturePort } from '../src/bootstrap.ts'
import { DEMO_DEFAULT_RETRY, DEMO_ROOT, demoPublication } from '../src/deployment.ts'
import { createLocalTls } from './local-tls.ts'
import { callDeployment } from './model-request-support.ts'
import { activateModelFixture, actor } from './support.ts'

describe('trusted controlled Run fixture', () => {
  it('borrows the authenticated session owner, records the original report and fenced attempt, then releases', async () => {
    const base = await callDeployment('runner-service-controlled-run')
    const config = {
      ...base,
      modelRequest: {
        ...base.modelRequest,
        evaluationInputs: {
          ...base.modelRequest.evaluationInputs,
          deployedOfficial: [
            { capability: DEMO_ROOT, meta: false },
            { capability: DEMO_DEFAULT_RETRY, meta: false },
          ],
          async prepare(who: Awaited<ReturnType<typeof actor>>) {
            return {
              publication: demoPublication(who),
              recipe: { rootDefinition: DEMO_ROOT },
            }
          },
        },
      },
    }
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'))
    let port: ControlledRunFixturePort | undefined
    const app = createAcceptanceApplication(config, {
      stage: 'modelRequest',
      developmentTransport: tls.developmentTransport,
      diagnostics: { record() {} },
      controlledRunFixture(value) {
        port = value
      },
    })
    let diagnostic: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    let release: (() => void) | undefined
    try {
      await app.ready
      const who = await actor(app)
      const outsider = await actor(app, 'controlled-run-outsider')
      diagnostic = await activateModelFixture(app, who, config)
      const prepared = await app.prepareSession(who, 'controlled-run-session')
      if (!('session' in prepared)) throw Error('controlled session absent')
      const session = prepared.session
      expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
      if (port === undefined) throw Error('controlled fixture port absent')
      expect(await port.startAttempt(outsider, session, 'controlled-run-1', 1)).toEqual({
        failure: 'identityMismatch',
      })
      const started = await port.startAttempt(who, session, 'controlled-run-1', 1)
      if (!('report' in started))
        throw Error(`controlled start unavailable: ${JSON.stringify(started)}`)
      release = started.release
      expect(started.report.session).toBe(session)
      expect(started.report.runId).toBe('controlled-run-1')
      expect(started.report.attempt).toBe(1)
      const read = await app.readSessionLog(who, session)
      if (!('entries' in read)) throw Error('controlled log unavailable')
      expect(read.entries).toHaveLength(1)
      const entry = read.entries[0]
      expect(entry?.run).toBe('controlled-run-1')
      expect(entry?.attempt).toBe(1)
      expect(entry?.payload).toMatchObject({
        kind: 'fact',
        owner: 'session-runtime',
        version: '1',
        value: { kind: 'attempt_started', run: 'controlled-run-1', attempt: 1, reason: 'first' },
      })
      expect(tls.requests).toHaveLength(0)
    } finally {
      release?.()
      if (diagnostic) {
        const closed = await diagnostic.closeAfterBusiness(() => app.close())
        expect(closed.complete).toBe(true)
      } else expect((await app.close()).complete).toBe(true)
      await tls.close()
    }
  })
})
