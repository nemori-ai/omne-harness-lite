import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { decodeRevision, type ModelProfile } from '@omne-harness/model-contract'
import { judgeFixedModelRequest } from '@omne-harness/model-contract/provider'
import { composeFamilies } from '@omne-harness/pi-ai-transport'
import { fixtureDirectory } from '@omne-harness/pi-ai-transport/testing'
import { GLM_RECORDS, officialGlmProfiles } from '../src/index.ts'
import { FAMILY } from './support/glm.ts'

it.each(GLM_RECORDS)(
  'agrees on explicit tool choice during preparation and sending on $name',
  async record => {
    const path = join(
      fileURLToPath(new URL('./fixtures/records/', import.meta.url)),
      fixtureDirectory(record),
      'request.json',
    )
    const saved = JSON.parse(readFileSync(path, 'utf8')).request
    const definition = officialGlmProfiles({
      retryPolicy: saved.retryPolicy,
      compactionTriggerPercent: '80',
    }).find(p => p.suppliers[0].model === record.name)
    const revision = decodeRevision(record.revision)
    if (!definition || !('ok' in revision)) throw Error('missing current profile')
    const profile: ModelProfile = {
      identity: { scope: { kind: 'factory' }, route: record.name },
      adoption: saved.profile,
      revision: revision.ok,
      updatedAt: '2026-11-23T00:00:00Z',
      availability: 'active',
      definition,
    }
    const bound = await composeFamilies([FAMILY]).acquire(
      saved.suppliers[0],
      new AbortController().signal,
    )
    if ('failure' in bound) throw Error(JSON.stringify(bound.failure))
    try {
      const binding = bound.ok
      for (const config of [
        { tools: saved.tools, toolChoice: 'auto', supported: true },
        { tools: [], toolChoice: 'none', supported: true },
        { tools: saved.tools, toolChoice: 'none', supported: record.name === 'z-ai/glm-5.3-prime' },
        { tools: saved.tools, toolChoice: 'required', supported: false },
        { tools: saved.tools, toolChoice: { name: 'read_ticket' }, supported: false },
      ]) {
        const { supported, ...changes } = config
        const judged = judgeFixedModelRequest({ ...saved, ...changes })
        if ('failure' in judged) throw Error(JSON.stringify(judged.failure))
        const request = judged.ok
        const plan = binding.rules.plan({
          profile,
          supplier: request.suppliers[0],
          assembled: request,
        })
        const sent = binding.encode({
          request,
          declaration: request.declarations[0],
          media: [],
          resent: [],
        })
        if (!supported) {
          for (const result of [plan, sent])
            expect(result).toEqual({
              failure: { kind: 'unsupported', field: 'toolChoice', adapter: binding.adoption },
            })
        } else {
          if ('failure' in sent || 'failure' in plan) throw Error(JSON.stringify({ sent, plan }))
          const wire = JSON.parse(writeJsonText(sent.ok.body))
          expect(wire.tool_choice).toEqual(
            config.tools.length === 0 ? undefined : config.toolChoice,
          )
          expect(plan.ok.representation.tokenInput).toEqual(sent.ok.representation.tokenInput)
        }
      }
    } finally {
      await bound.ok.release()
    }
  },
)
