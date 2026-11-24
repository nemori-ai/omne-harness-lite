// @module-tag slow
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, onTestFailed } from 'vitest'
import { access, tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import { instanceId } from '@omne-harness/workspace-contract'
import { succeed } from '@omne-harness/operation-result'
import { sessionModelHistoryReadinessKey } from '@omne-harness/session-adapters/cordis'
import { workspaceInstancesKey } from '@omne-harness/workspace-cordis-contract/cordis'
import { historyOf, onReleaseTree, pollUntil, toolCallsByRequest } from '../support/release-tree.ts'
import { command, registered, run, sessionIn } from '../support/workspace-guidance.ts'

function textValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textValues)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(textValues)
  return []
}

it.each([
  'selected',
  'historical',
  'unknown',
  'instance-unavailable',
  'bypassed-history-qualification',
] as const)(
  'C4/C6 workspace guidance qualification %s rechecks visible original sources',
  { tags: ['slow'], timeout: 360_000 },
  async mode => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'guidance-rights-')))
    onTestFinished(() => rmSync(root, { recursive: true, force: true }))
    const body = 'REVOKED_WORKSPACE_CONTENT_195'
    const userReference = 'Continue with current access; my own reference is ' + root
    const oldScope = (request: string) =>
      textValues(JSON.parse(request)).filter(
        text =>
          text.includes('"key":"session.workspace-guidance"') &&
          text.includes('"root":' + JSON.stringify(root)),
      )
    writeFileSync(join(root, 'AGENTS.md'), body)
    const requests: string[] = []
    const script = toolCallsByRequest(request => {
      requests.push(request)
      return []
    })
    await onReleaseTree(
      { script, extraHistoryKinds: ['message.system_reminder', 'session.model-projected'] },
      async tree => {
        let stage = 'first-run'
        const qualificationCalls: unknown[] = []
        onTestFailed(() => {
          process.stderr.write(
            JSON.stringify({
              mode,
              stage,
              requests: requests.length,
              qualificationCalls,
              records: tree.records
                .map(item => (item['fields'] as { text?: string } | undefined)?.text)
                .filter(
                  text => text && /denied|qualification|waits|failure|unavailable/u.test(text),
                )
                .slice(-20),
            }) + '\n',
          )
        })
        const selected = await registered(tree, root)
        const session = await sessionIn(tree, selected)
        await run(tree, session)
        stage = 'first-request-complete'
        expect(requests).toHaveLength(1)
        expect(requests[0]).toContain(body)
        const service = tree.scope.get(workspaceInstancesKey)!
        const verify = service.verify.bind(service)
        const selectedWorkspace = selected[1]
        if (selectedWorkspace === undefined) throw new Error('missing workspace')
        const workspace = workspaceCodec.parse(selectedWorkspace)
        const instance = instanceId(selected[3])
        const foreign = tenantCodec.parse(
          JSON.stringify({
            organization: 'org_1123456789abcdefghjkmnpqrs',
            account: 'acc_0123456789abcdefghjkmnpqrs',
          }),
        )
        if (!workspace.ok || instance === null || !foreign.ok)
          throw new Error('invalid test identity')
        expect(
          await verify(access(tree.registrar().principal, foreign.value), {
            workspace: workspace.value,
            instance,
          }),
        ).toEqual({ kind: 'not-permitted' })
        let ordinal = 1
        if (mode === 'historical' || mode === 'bypassed-history-qualification') {
          const b = join(root, 'B')
          mkdirSync(b)
          writeFileSync(join(b, 'AGENTS.md'), 'LEGAL_WORKSPACE_B_318')
          await command(tree, [
            'select-workspace',
            '--session',
            session,
            ...(await registered(tree, b)),
          ])
          await run(tree, session, 2)
          expect(requests[1]).toContain(body)
          expect(requests[1]).toContain('LEGAL_WORKSPACE_B_318')
          ordinal = 2
        }
        const qualified = tree.scope.get(sessionModelHistoryReadinessKey)!
        const qualify = qualified.qualify
        if (mode === 'bypassed-history-qualification') {
          Reflect.set(qualified, 'qualify', async () => succeed([]))
        } else {
          Reflect.set(qualified, 'qualify', async (...args: Parameters<typeof qualify>) => {
            const result = await qualify(...args)
            qualificationCalls.push({ scopes: args[1], result })
            return result
          })
        }
        stage = 'qualification-change'
        const originalCount = requests.length
        let refused = 0
        Reflect.set(service, 'verify', async (...args: Parameters<typeof verify>) => {
          const result = await verify(...args)
          if (result.kind === 'attachable' && result.directory === root) {
            refused++
            return mode === 'unknown'
              ? { kind: 'unavailable', diagnostic: 'qualification connection lost' }
              : mode === 'instance-unavailable'
                ? { kind: 'instance-unavailable', reason: 'instance missing' }
                : { kind: 'not-permitted' }
          }
          return result
        })
        try {
          const recordStart = tree.records.length
          await command(tree, ['send-input', '--session', session, '--text', userReference])
          await pollUntil(
            'the new qualification reaches a request or an explicit refusal',
            async () => {
              const waiting = tree.records.slice(recordStart).some(item => {
                const text = (item['fields'] as { text?: string } | undefined)?.text ?? ''
                return (
                  text.includes('agent run waits for a dependency') ||
                  text.includes('agent run ended with a failure')
                )
              })
              return (
                (mode === 'bypassed-history-qualification' || refused > 0) &&
                (waiting ||
                  requests.length > originalCount ||
                  (await historyOf(tree, session)).filter(e => e.kind === 'run.terminal').length >
                    ordinal)
              )
            },
            Boolean,
          )
          if (mode === 'instance-unavailable' || mode === 'bypassed-history-qualification') {
            await pollUntil(
              'legal retained history is sent',
              () => requests.length,
              count => count > originalCount,
            )
            expect(requests.at(-1)).toContain(body)
            if (mode === 'bypassed-history-qualification')
              expect(oldScope(requests.at(-1)!).length).toBeGreaterThan(0)
          } else if (mode === 'unknown') {
            expect(requests.slice(originalCount)).toHaveLength(0)
          } else {
            expect(requests.length).toBeGreaterThan(originalCount)
            expect(requests.at(-1)).not.toContain(body)
            expect(oldScope(requests.at(-1)!)).toHaveLength(0)
            expect(requests.at(-1)).toContain(userReference)
            if (mode === 'historical') expect(requests.at(-1)).toContain('LEGAL_WORKSPACE_B_318')
            if (mode === 'selected') expect(requests.at(-1)).toMatch(/unusable/u)
            const entries = await historyOf(tree, session)
            expect(entries.some(entry => entry.kind === 'session.model-projected')).toBe(true)
            if (mode === 'historical') {
              Reflect.set(service, 'verify', verify)
              await pollUntil(
                'the legal B run ends',
                () => historyOf(tree, session),
                entries => entries.filter(entry => entry.kind === 'run.terminal').length > ordinal,
              )
              await command(tree, ['select-workspace', '--session', session, ...selected])
              await run(tree, session, ordinal + 2)
              expect(requests.at(-1)?.split(body).length).toBe(2)
            }
          }
          expect(JSON.stringify(await historyOf(tree, session))).toContain(body)
        } finally {
          Reflect.set(service, 'verify', verify)
          Reflect.set(qualified, 'qualify', qualify)
        }
      },
    )
  },
)
