// @module-tag slow
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import type { Principal } from '@omne-harness/identity'
import type { SessionPrincipalBindingSource } from '@omne-harness/session-contract'
import {
  SessionWorkPrincipalsService,
  sessionPrincipalBindingsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import * as cordis from '../../../src/cordis.ts'
import { entryObjects as releaseEntryObjects } from '../../../src/entry/index.ts'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import { createSessionWorkPrincipals } from '../../../src/entry/session-work-principals.ts'
import { runServe, type S0Record } from '../../../src/run.ts'
import type { EntryObjectModule } from '../../../src/types.ts'
import { SESSION_PATH } from '../../r9/flow.ts'
import {
  bodyOf,
  freePort,
  newScratch,
  operatorLayer,
  runOmne,
  savedLoginProof,
  savedTenant,
} from '../../r9/support.ts'
import { startModelGateway } from '../../fixtures/model-gateway.ts'
import { connectable, until } from '../server-entry/support.ts'

const CREDENTIAL = 'carol-pw-RUNSTART-7c41'
const INPUT_TEXT = 'run start check MARKER-run-start'

const release: unknown = JSON.parse(
  readFileSync(new URL('../../../config/serve.distribution.json', import.meta.url), 'utf8'),
)

async function post(port: number, body: unknown): Promise<{ status: number; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${SESSION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.text() }
}

const readHistory = (tenant: string, session: string, loginProof: string) => ({
  protocolVersion: 'session-public/1',
  messageId: 'run-start-read-history',
  operation: 'read-history',
  body: { tenant, session, cursor: null, direction: 'forward', pageBytes: '65536' },
  loginProof,
})

type Issued = Readonly<{ actor: string; session: string; outcome: string }>

function withHistoryKinds(layer: unknown): unknown {
  const { ops } = layer as { ops: Readonly<{ kind: string; id: string; config?: object }>[] }
  return {
    ops: ops.map(op =>
      op.id === 'server-entry'
        ? {
            ...op,
            config: {
              ...op.config,
              historyKinds: ['message.user', 'message.assistant', 'run.started'],
            },
          }
        : op,
    ),
  }
}

function observedWorkPrincipals(issued: Issued[]): EntryObjectModule {
  return {
    name: sessionWorkPrincipalsKey,
    implementation: 'contract-double',
    install(scope, env) {
      const work = createSessionWorkPrincipals({
        issue: sessionWorkIssuerOf(env),
        readBindings: (): SessionPrincipalBindingSource | undefined =>
          env.readTrusted(sessionPrincipalBindingsKey).get(sessionPrincipalBindingsKey),
      })
      class Observed extends SessionWorkPrincipalsService<Principal> {
        readonly forSession: SessionWorkPrincipalsService<Principal>['forSession'] =
          async input => {
            const answer = await work.forSession(input)
            issued.push({
              actor: input.actor,
              session: String(input.session),
              outcome: 'ok' in answer ? 'issued' : answer.failure.kind,
            })
            return answer
          }
      }
      new Observed(scope)
    },
  }
}

function kindsOf(body: string): string[] {
  const kinds: string[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) for (const item of value) visit(item)
    else if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>
      if (typeof record['kind'] === 'string' && /^[a-z]+\.[a-z.-]+$/u.test(record['kind']))
        kinds.push(record['kind'])
      for (const item of Object.values(record)) visit(item)
    }
  }
  visit(JSON.parse(body))
  return kinds
}

describe('the release tree with the release session ownership read', () => {
  it(
    'an input sent to a coding session: Session gets its work principals for the session and the Run starts',
    { timeout: 180_000 },
    async () => {
      const dir = newScratch('run-start-')
      const port = await freePort()
      const home = join(dir.base, 'home-carol')
      const controller = new AbortController()
      const records: S0Record[] = []
      const stderr: string[] = []
      const issued: Issued[] = []
      const gateway = await startModelGateway()
      gateway.trustInProcess()
      const finished = runServe({
        distribution: release,
        operator: withHistoryKinds(
          operatorLayer({ storageRoot: dir.storageRoot, port, modelRoute: gateway.url }),
        ),
        plugins: { ...cordis },
        entryObjects: releaseEntryObjects.map(module =>
          module.name === sessionWorkPrincipalsKey ? observedWorkPrincipals(issued) : module,
        ),
        stateRoot: dir.stateRoot,
        stop: controller.signal,
        readinessTimeoutMs: 15_000,
        shutdownDeadlineMs: 5000,
        write: record => records.push(record),
        stderr: line => stderr.push(line),
      })
      let ended = false
      void finished.then(
        () => (ended = true),
        () => (ended = true),
      )
      try {
        await until(
          async () => {
            if (ended)
              throw new Error(`the tree ended before the entry listened: ${stderr.join('\n')}`)
            return connectable('127.0.0.1', port)
          },
          `port ${String(port)} to listen`,
          20_000,
        )
        const cli = (args: readonly string[], credential?: string) =>
          runOmne({
            args: [...args],
            home,
            server: `http://127.0.0.1:${String(port)}`,
            cwd: dir.base,
            ...(credential === undefined ? {} : { credential }),
          })
        const steps = [
          await cli(['register', '--login-identifier', 'carol'], CREDENTIAL),
          await cli(['login', '--login-identifier', 'carol'], CREDENTIAL),
        ]
        const created = await cli(['create-session', '--definition', 'coding'])
        steps.push(created)
        const session = String(bodyOf(created)['session'])
        const atCreate = issued.filter(entry => entry.session === session)
        steps.push(await cli(['send-input', '--session', session, '--text', INPUT_TEXT]))
        for (const step of steps) expect(step.status, step.stderr).toBe(0)

        const request = readHistory(savedTenant(home), session, savedLoginProof(home))
        const mine = () => issued.filter(entry => entry.session === session)
        for (
          const end = Date.now() + 30_000;
          Date.now() < end && !mine().some(entry => entry.actor === 'coordinator');
          await sleep(100)
        );
        let history = await post(port, request)
        for (
          const end = Date.now() + 30_000;
          Date.now() < end && !kindsOf(history.body).includes('run.started');
          await sleep(200)
        )
          history = await post(port, request)
        expect(history.status, history.body).toBe(200)
        expect(kindsOf(history.body)).toContain('message.user')
        expect(kindsOf(history.body)).toContain('run.started')
        expect(history.body).toContain(INPUT_TEXT)
        const answers = mine()
        expect(answers.some(entry => entry.actor === 'maintainer')).toBe(true)
        expect(answers.some(entry => entry.actor === 'coordinator')).toBe(true)
        expect(atCreate.filter(entry => entry.outcome !== 'issued')).toEqual([
          { actor: 'coordinator', session, outcome: 'denied' },
        ])
        expect(answers.slice(atCreate.length).filter(entry => entry.outcome !== 'issued')).toEqual(
          [],
        )
      } finally {
        controller.abort('test: stop')
        await finished.catch(() => undefined)
        await gateway.close()
        dir.remove()
      }
    },
  )
})
