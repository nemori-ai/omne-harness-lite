// @module-tag slow
import { expect, it } from 'vitest'
import { bodyOf, savedTenant } from '../../r9/support.ts'
import { sessionRef, tenantOf } from '../../support/protocol-clients.ts'
import {
  historyOf,
  onReleaseTree,
  pollUntil,
  sse,
  storedModelRequests,
} from '../../support/release-tree.ts'
import { send, words } from '../media-intake/support.ts'
import { setModelEfforts, setModelSwitches } from '../../support/model-switches.ts'

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

it(
  'a session that chose no effort takes the tenant default for the model, for the next request only (C7, I-8)',
  { tags: ['slow'], timeout: 240_000 },
  async () => {
    const glm53 = 'z-ai/glm-5.3'
    const outbound: Array<{ model: string; reasoning?: { effort?: string } }> = []
    // The request head lives with its call: it is read while the gateway holds the call open.
    let storageRoot: string | undefined
    const recorded: unknown[] = []
    const exitCode = await onReleaseTree(
      {
        model: glm53,
        script: request => {
          const body = JSON.parse(request.rawBody)
          outbound.push(body)
          for (const head of storageRoot === undefined ? [] : storedModelRequests(storageRoot))
            recorded.push(
              (head['parameters'] as { kind: string }[]).find(
                parameter => parameter.kind === 'reasoning-effort',
              ),
            )
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
        storageRoot = tree.storageRoot
        const created = await tree.cli(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)
        const session = String(bodyOf(created)['session'])
        const target = { tenant: tenantOf(savedTenant(tree.home)), session: sessionRef(session) }
        const ask = async (index: number) => {
          const id = `default-${index}`
          expect(await send(tree, session, id, [words(`block-${id}`, id)])).toMatchObject({
            outcome: 'succeeded',
          })
          await pollUntil(
            'the response to this input',
            () => historyOf(tree, session),
            entries => entries.filter(entry => entry.kind === 'run.terminal').length > index,
          )
        }
        await setModelEfforts(tree, { [glm53]: 'high' })
        await ask(0)
        await setModelEfforts(tree, { [glm53]: 'low' })
        await ask(1)
        const chosen = await tree.clients.session['select-model']({
          ...target,
          controlId: 'chosen',
          model: glm53,
          reasoningEffort: 'medium',
        })
        expect(chosen).toMatchObject({ outcome: 'succeeded' })
        await ask(2)
        // GLM 5.3 takes the unified low, medium and high as low, high and max on the wire.
        expect(outbound.map(body => [body.model, body.reasoning?.effort])).toEqual([
          [glm53, 'max'],
          [glm53, 'low'],
          [glm53, 'high'],
        ])
        expect(recorded).toEqual([
          { kind: 'reasoning-effort', value: 'high', scale: 'unified', basis: 'preference' },
          { kind: 'reasoning-effort', value: 'low', scale: 'unified', basis: 'preference' },
          { kind: 'reasoning-effort', value: 'medium', scale: 'unified' },
        ])
      },
    )
    expect(exitCode).toBe(0)
  },
)
