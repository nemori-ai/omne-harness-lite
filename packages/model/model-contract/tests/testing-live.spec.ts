import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import type { LiveCommand } from '@omne-harness/model-contract'
import {
  createLiveDouble,
  createScriptedConformanceSubject,
  type ScriptedPrincipal,
} from '@omne-harness/model-contract/testing'
import { describe, expect, it } from 'vitest'
import { callId, operationId } from '../src/conformance/conformance-kit.ts'

const shown = { toHuman: true, toModel: true } as const
function block(value: unknown): ContentBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new Error(`not a content block: ${judged.rejected}`)
  return judged.ok
}
const words = block({ kind: 'text', id: 'b1', visibility: shown, text: 'hello' })
const thought = block({ kind: 'thinking', id: 'b2', visibility: shown, text: 'so' })
const picture = block({
  kind: 'image',
  id: 'b3',
  visibility: shown,
  mediaType: 'image/png',
  inline: 'iVBORw0KGgo=',
})
const document = block({
  kind: 'file',
  id: 'b4',
  visibility: shown,
  storage: 's',
  key: 'k',
  mediaType: 'file/raw',
})
const spoken = block({
  kind: 'voice',
  id: 'b5',
  visibility: shown,
  mediaType: 'audio/wav',
  inline: 'UklGRg==',
})
const say = (...content: ContentBlock[]): LiveCommand => ({
  type: 'say',
  use: 'context',
  about: null,
  content,
})

const NOT_FOUND = { failure: { kind: 'invalid', field: 'call', reason: 'not-found' } }
const MODALITY = { failure: { kind: 'invalid', field: 'content', reason: 'modality' } }
const ELSEWHERE = {
  failure: { kind: 'unavailable', dependency: 'live-call', diagnostic: 'not-in-this-process' },
}

function world() {
  const { principal, tenant } = createScriptedConformanceSubject()
  const live = createLiveDouble<ScriptedPrincipal>({ tenant })
  const access = { principal, tenant }
  return {
    live,
    tenant,
    open: async (label: string) => {
      const call = await live.admit(label)
      await live.upstream({ ...call, step: 'open' })
      return call.call
    },
    command: (call: ReturnType<typeof callId>, id: string, command = say(words)) =>
      live.calls.command({ ...access, call, operation: operationId(id), command }),
    end: (call: ReturnType<typeof callId>, id: string) =>
      live.calls.end({ ...access, call, operation: operationId(id) }),
    media: (call: ReturnType<typeof callId>) => live.calls.media({ ...access, call }),
  }
}

describe('the controlled live double', () => {
  it('takes thinking as text, and refuses a file or a command with any block outside its modalities', async () => {
    const w = world()
    const call = await w.open('modalities')
    expect(await w.command(call, 'thought', say(thought))).toEqual({ ok: { state: 'taken' } })
    expect(await w.command(call, 'file', say(document))).toEqual(MODALITY)
    expect(await w.command(call, 'mixed', say(words, picture))).toEqual(MODALITY)
  })

  it('takes the modalities it is given: voice by default, images when told so', async () => {
    const w = world()
    const call = await w.open('voice')
    expect(await w.command(call, 'spoken', say(spoken))).toEqual({ ok: { state: 'taken' } })
    const { principal, tenant } = createScriptedConformanceSubject()
    const seeing = createLiveDouble<ScriptedPrincipal>({ tenant, input: ['text', 'image'] })
    const target = await seeing.admit('image')
    await seeing.upstream({ ...target, step: 'open' })
    const command = (id: string, said: LiveCommand) =>
      seeing.calls.command({ principal, ...target, operation: operationId(id), command: said })
    expect(await command('picture', say(picture))).toEqual({ ok: { state: 'taken' } })
    expect(await command('spoken', say(spoken))).toEqual(MODALITY)
  })

  it('answers a seen command with its outcome so far', async () => {
    const w = world()
    const call = await w.open('seen')
    await w.command(call, 'once')
    expect(await w.command(call, 'once')).toEqual({ ok: { state: 'seen', outcome: 'pending' } })
  })

  it('records an end as a durable intent to close normally', async () => {
    const w = world()
    const call = await w.open('end')
    expect(await w.end(call, 'end')).toEqual({
      ok: {
        kind: 'requested',
        intent: 'end',
        operation: operationId('end'),
        propagation: 'pending',
        upstream: 'unknown',
      },
    })
  })

  it('answers each entry for a call it does not hold as not found', async () => {
    const w = world()
    const none = callId('nowhere')
    expect(await w.command(none, 'c')).toEqual(NOT_FOUND)
    expect(await w.end(none, 'e')).toEqual(NOT_FOUND)
    expect(await w.media(none)).toEqual(NOT_FOUND)
  })

  it('answers the command and the media of a call whose live body is elsewhere as unavailable', async () => {
    const w = world()
    const call = await w.open('elsewhere')
    const media = await w.media(call)
    if (!('ok' in media)) throw new Error('media while open')
    await w.live.loseBody({ tenant: w.tenant, call })
    expect(await w.command(call, 'late')).toEqual(ELSEWHERE)
    expect(await w.media(call)).toEqual(ELSEWHERE)
    expect(media.ok.write({ modality: 'voice', bytes: new Uint8Array([1]) })).toBe('dropped')
  })

  it('answers a closing call whose live body is elsewhere as unavailable too', async () => {
    const w = world()
    const call = await w.open('closing-elsewhere')
    await w.end(call, 'end')
    await w.live.loseBody({ tenant: w.tenant, call })
    expect(await w.command(call, 'late')).toEqual(ELSEWHERE)
    expect(await w.media(call)).toEqual(ELSEWHERE)
  })

  it('keeps a settled call settled when the upstream says open again', async () => {
    const w = world()
    const call = await w.live.admit('settled')
    await w.live.upstream({ ...call, step: 'open' })
    await w.live.upstream({ ...call, step: 'close' })
    await w.live.upstream({ ...call, step: 'open' })
    expect(await w.command(call.call, 'after')).toEqual({
      failure: { kind: 'invalid', field: 'phase', reason: 'settled' },
    })
  })

  it('refuses to drive the upstream of a call it does not hold', async () => {
    const w = world()
    const target = { tenant: w.tenant, call: callId('unknown') }
    await expect(w.live.upstream({ ...target, step: 'open' })).rejects.toThrow('no live call')
    await expect(w.live.loseBody(target)).rejects.toThrow('no live call')
  })
})
