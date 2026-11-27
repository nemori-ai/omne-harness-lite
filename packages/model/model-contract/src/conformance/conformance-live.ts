import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import type { LiveCommand, LivePhaseRefusal } from '../live-call.ts'
import type { ModelFailure } from '../result.ts'
import type { ModelCallId, ModelOperationId } from '../root.ts'
import {
  accessOf,
  callId,
  expect,
  mutationOf,
  operationId,
  refused,
  refusedAs,
  same,
  show,
  succeeded,
  targetOf,
} from './conformance-kit.ts'
import type { Check, ConformanceLive, Scene } from './conformance-types.ts'

const shown = { toHuman: true, toModel: true } as const
function block(value: unknown): ContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged)
    throw new Error(`a live check block is not a content block: ${judged.rejected}`)
  return judged.ok
}
const words = (text: string) => block({ kind: 'text', id: 'b1', visibility: shown, text })
const picture = block({
  kind: 'image',
  id: 'b2',
  visibility: shown,
  mediaType: 'image/png',
  inline: 'iVBORw0KGgo=',
})
const say = (content: readonly ContentBlock[]): LiveCommand => ({
  type: 'say',
  use: 'context',
  about: null,
  content,
})
const SAY = say([words('the meeting moved to three')])

function liveOf<P>(scene: Scene<P>): ConformanceLive<P> {
  const { live } = scene.subject
  if (live === undefined) throw new Error('a live check ran without the live part of the subject')
  return live
}

async function opened<P>(scene: Scene<P>, label: string) {
  const live = liveOf(scene)
  const call = await live.admit(label)
  await live.upstream({ ...call, step: 'open' })
  return call
}

function command<P>(scene: Scene<P>, call: ModelCallId, id: ModelOperationId, said = SAY) {
  return liveOf(scene).calls.command({ ...mutationOf(scene, call, id), command: said })
}

function refusedInPhase(
  outcome: Outcome<unknown, ModelFailure>,
  phase: LivePhaseRefusal,
  what: string,
) {
  const failure = refusedAs(outcome, 'invalid', what)
  expect(
    failure.field === 'phase' && failure.reason === phase,
    `${what} gives ${show(failure)}, not the refusal of the phase ${phase}`,
  )
}

function commandChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'live-command-before-open-refused',
      requires: ['live'],
      async run(scene) {
        const call = await liveOf(scene).admit('before-open')
        refusedInPhase(
          await command(scene, call.call, operationId('before-open')),
          'not-open',
          'a command before the session opened',
        )
      },
    },
    {
      name: 'live-command-taken-once',
      requires: ['live'],
      async run(scene) {
        const call = await opened(scene, 'taken-once')
        const id = operationId('taken-once')
        const first = succeeded(await command(scene, call.call, id), 'the first command')
        expect(first.state === 'taken', `the first command gives ${show(first)}, not taken`)
        const again = succeeded(
          await command(scene, call.call, id, say([words('said otherwise')])),
          'the command sent again',
        )
        expect(
          again.state === 'seen',
          `the command sent again under its identity gives ${show(again)}, not seen`,
        )
      },
    },
    {
      name: 'live-command-outside-profile-refused',
      requires: ['live'],
      async run(scene) {
        const live = liveOf(scene)
        const call = await live.admit('outside-profile')
        for (const step of ['admitted', 'open'] as const) {
          if (step === 'open') await live.upstream({ ...call, step: 'open' })
          const failure = refusedAs(
            await command(scene, call.call, operationId(`outside-${step}`), say([picture])),
            'invalid',
            `a command with an image the profile does not take, ${step}`,
          )
          expect(
            failure.field === 'content' && failure.reason === 'modality',
            `the image command, ${step}, gives ${show(failure)}, not a refusal of its modality`,
          )
        }
      },
    },
    {
      name: 'live-command-after-settle-refused',
      requires: ['live'],
      async run(scene) {
        const call = await opened(scene, 'after-settle')
        const seen = operationId('after-settle-seen')
        succeeded(await command(scene, call.call, seen), 'the command while open')
        await liveOf(scene).upstream({ ...call, step: 'close' })
        refusedInPhase(
          await command(scene, call.call, seen),
          'settled',
          'a seen command after settle',
        )
        refusedInPhase(
          await command(scene, call.call, operationId('after-settle-new')),
          'settled',
          'a new command after settle',
        )
      },
    },
  ]
}

function endChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'live-end-before-open-refused',
      requires: ['live'],
      async run(scene) {
        const call = await liveOf(scene).admit('end-before-open')
        refusedInPhase(
          await liveOf(scene).calls.end(mutationOf(scene, call.call, operationId('end-early'))),
          'not-open',
          'an end before the session opened',
        )
      },
    },
    {
      name: 'live-end-durable-and-idempotent',
      requires: ['live'],
      async run(scene) {
        const { calls } = liveOf(scene)
        const call = await opened(scene, 'end-twice')
        const before = operationId('end-twice-before')
        succeeded(await command(scene, call.call, before), 'the command before the end')
        const first = operationId('end-twice-first')
        const control = succeeded(await calls.end(mutationOf(scene, call.call, first)), 'the end')
        expect(
          control.kind === 'requested' && control.intent === 'end' && control.operation === first,
          `the end gives ${show(control)}, not the end it asked for`,
        )
        const again = succeeded(
          await calls.end(mutationOf(scene, call.call, operationId('end-twice-second'))),
          'the second end',
        )
        expect(same(again, control), `the second end gives ${show(again)}, not the first`)
        refusedInPhase(
          await command(scene, call.call, operationId('end-twice-new')),
          'closing',
          'a new command while closing',
        )
        const seen = succeeded(
          await command(scene, call.call, before),
          'a seen command while closing',
        )
        expect(seen.state === 'seen', `a seen command while closing gives ${show(seen)}`)
      },
    },
    {
      name: 'live-end-after-settle-idempotent',
      requires: ['live'],
      async run(scene) {
        const { calls } = liveOf(scene)
        const call = await opened(scene, 'end-settled')
        await liveOf(scene).upstream({ ...call, step: 'close' })
        const control = succeeded(
          await calls.end(mutationOf(scene, call.call, operationId('end-settled'))),
          'the end after settle',
        )
        expect(control.kind === 'none', `an end after settle records ${show(control)}`)
      },
    },
  ]
}

function callChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'live-media-by-phase-and-modality',
      requires: ['live'],
      async run(scene) {
        const live = liveOf(scene)
        const call = await live.admit('media')
        const media = succeeded(
          await live.calls.media(accessOf(scene, call.call)),
          'the media of the call',
        )
        try {
          const voice = { modality: 'voice', bytes: new Uint8Array([1, 2]) } as const
          const image = { modality: 'image', bytes: new Uint8Array([3]) } as const
          const early = media.write(voice)
          expect(early === 'dropped', `a voice frame before the session opened was ${show(early)}`)
          const foreign = media.write(image)
          expect(
            same(foreign, { refused: 'modality' }),
            `an image frame the profile does not take was ${show(foreign)}`,
          )
          await live.upstream({ ...call, step: 'open' })
          const sent = media.write(voice)
          expect(sent === 'sent', `a voice frame while open was ${show(sent)}`)
          succeeded(
            await live.calls.end(mutationOf(scene, call.call, operationId('media-end'))),
            'the end of the call',
          )
          const closing = media.write(voice)
          expect(closing === 'dropped', `a voice frame while closing was ${show(closing)}`)
        } finally {
          media.release()
        }
      },
    },
    {
      name: 'live-call-of-another-tenant-unknown',
      requires: ['live'],
      async run(scene) {
        const call = await opened(scene, 'other-tenant')
        const { calls } = liveOf(scene)
        const theirs = refused(
          await calls.command({
            ...mutationOf(scene, call.call, operationId('theirs'), scene.subject.otherTenant),
            command: SAY,
          }),
          'a command on the call through another tenant',
        )
        const none = refused(
          await command(scene, callId('live-none'), operationId('none')),
          'a command on a call that does not exist',
        )
        expect(
          same(theirs, none),
          `another tenant's call answers ${show(theirs)}, a missing call ${show(none)}`,
        )
      },
    },
    {
      name: 'live-lost-body-unavailable',
      requires: ['live'],
      async run(scene) {
        const live = liveOf(scene)
        const call = await opened(scene, 'lost-body')
        await live.loseBody(targetOf(scene, call.call))
        refusedAs(
          await command(scene, call.call, operationId('lost-body')),
          'unavailable',
          'a command once this process lost the live body',
        )
        refusedAs(
          await live.calls.media(accessOf(scene, call.call)),
          'unavailable',
          'the media once this process lost the live body',
        )
      },
    },
  ]
}

export function liveChecks<P>(): readonly Check<P>[] {
  return [...commandChecks<P>(), ...endChecks<P>(), ...callChecks<P>()]
}
