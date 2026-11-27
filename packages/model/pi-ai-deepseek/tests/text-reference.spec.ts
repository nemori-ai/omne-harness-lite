import { expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { judgeModelRequest, judgeReplayDeclaration } from '@omne-harness/model-contract/provider'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { officialDeepSeekProfiles } from '../src/index.ts'
import { FAMILY } from './support/deepseek.ts'

it('reports unavailable when text is sent from a file reference whose words are absent from the counting projection', async () => {
  const source = { owner: 'test', name: 'test', revision: '1', digest: 'a'.repeat(64) }
  const profile = officialDeepSeekProfiles({
    retryPolicy: source,
    compactionTriggerPercent: '80',
  }).find(p => p.suppliers[0].model === 'deepseek/deepseek-v4-flash')
  if (!profile) throw Error('text route missing')
  const declared = profile.suppliers[0]
  const supplier = {
    provider: declared.provider,
    model: declared.model,
    adoption: declared.adoption,
    credential: { layer: 'official' as const },
  }
  const declaration = judgeReplayDeclaration(declared, 0)
  if ('failure' in declaration) throw Error(JSON.stringify(declaration.failure))
  const bytes = Buffer.from('text from the referenced file')
  const reference = {
    storage: 'test',
    key: 'words',
    mediaType: 'text/plain',
    bytes: String(bytes.length),
    digest: 'words',
  }
  const request = judgeModelRequest('llm', {
    kind: 'llm',
    profile: source,
    retryPolicy: source,
    source,
    suppliers: [supplier],
    fallback: false,
    parameters: [],
    parameterAdoptions: [],
    representation: profile.representation,
    declarations: [declaration.ok],
    system: [],
    tools: [],
    toolChoice: 'auto',
    messages: [
      {
        role: 'user',
        id: 'msg_u100000000000000000000',
        blocks: [
          {
            kind: 'file',
            id: 'words',
            ref: reference,
            transcript: null,
            visibility: { toModel: true, toHuman: true },
          },
        ],
      },
    ],
  })
  if ('failure' in request) throw Error(JSON.stringify(request.failure))
  const acquired = await composeFamilies([FAMILY]).acquire(supplier, new AbortController().signal)
  if ('failure' in acquired) throw Error(JSON.stringify(acquired.failure))
  try {
    const binding = acquired.ok
    const encoded = binding.encode({
      request: request.ok,
      declaration: declaration.ok,
      resent: [],
      media: [
        {
          reference,
          bytes,
          mime: 'text/plain',
          measurement: {
            kind: 'file',
            reference,
            bytes: reference.bytes,
            mediaType: reference.mediaType,
          },
        },
      ],
    })
    if ('failure' in encoded) throw Error(JSON.stringify(encoded.failure))
    expect(writeJsonText(encoded.ok.body)).toContain(bytes.toString())
    expect(
      await binding.meter.measure({
        profile: source,
        supplier: declared,
        context: profile.context,
        limits: profile.limits,
        assembled: request.ok,
        parameters: [],
        representation: encoded.ok.representation,
      }),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'file-text-not-countable' },
    })
  } finally {
    await acquired.ok.release()
  }
})
