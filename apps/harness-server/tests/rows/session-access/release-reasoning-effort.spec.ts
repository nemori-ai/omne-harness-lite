// @module-tag slow
import { expect, it } from 'vitest'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import { historyOf, onReleaseTree, pollUntil, sse } from '../../support/release-tree.ts'
import { send, words } from '../media-intake/support.ts'
import { setModelSwitches } from '../../support/model-switches.ts'

it(
  'uses the saved session effort in the next outbound request on the same model',
  {
    tags: ['slow'],
    timeout: 180_000,
  },
  async () => {
    const glm52 = 'z-ai/glm-5.2'
    const glm53 = 'z-ai/glm-5.3'
    const outbound: Array<{ model: string; reasoning?: { effort?: string } }> = []
    const exitCode = await onReleaseTree(
      {
        model: glm52,
        script: request => {
          const body = JSON.parse(request.rawBody)
          outbound.push(body)
          return {
            status: 200,
            contentType: 'text/event-stream',
            body: sse([
              { model: body.model, provider: 'Z.AI', choices: [{ delta: { content: 'done' } }] },
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
            ]),
          }
        },
      },
      async tree => {
        // GLM 5.2 is the one GLM that takes xhigh; the release starts it off, so the tenant turns it on.
        await setModelSwitches(tree, { [glm52]: true })
        const created = await tree.cli(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        const target = { tenant: tenantOf(savedTenant(tree.home)), session: sessionRef(session) }
        const client = tree.clients.session
        const selections = [
          [glm52, 'high'],
          [glm52, 'xhigh'],
          [glm53, 'medium'],
        ] as const
        for (const [index, [model, reasoningEffort]] of selections.entries()) {
          const change = await client['select-model']({
            ...target,
            controlId: `set-${index}`,
            model,
            reasoningEffort,
          })
          expect(change).toMatchObject({ outcome: 'succeeded', body: { model, reasoningEffort } })
          expect(await client['read-model-selection'](target)).toMatchObject({
            outcome: 'succeeded',
            body: { model, reasoningEffort },
          })
          const id = `effort-${index}`
          expect(await send(tree, session, id, [words(`block-${id}`, id)])).toMatchObject({
            outcome: 'succeeded',
          })
          await pollUntil(
            'the response to this input',
            () => historyOf(tree, session),
            entries => entries.filter(entry => entry.kind === 'run.terminal').length > index,
          )
        }
        const refused = await client['select-model']({
          ...target,
          controlId: 'unsupported',
          model: glm53,
          reasoningEffort: 'xhigh',
        })
        expect(refused).toMatchObject({
          outcome: 'invalid',
          body: { detail: 'unsupported-effort' },
        })
        expect(await client['read-model-selection'](target)).toMatchObject({
          outcome: 'succeeded',
          body: { model: glm53, reasoningEffort: 'medium' },
        })
        expect(outbound.map(body => [body.model, body.reasoning?.effort])).toEqual([
          [glm52, 'high'],
          [glm52, 'xhigh'],
          [glm53, 'high'],
        ])
      },
    )
    expect(exitCode).toBe(0)
  },
)
