// The first official Agent of the release: the `coding` entry of the `agent-adoptions` mapping
// (R2-D117, R2-D124, R2-D125). These tests read `config/serve.distribution.json` and judge what a
// consumer of the release observes: the definition and its prompt, the adoption digest computed from
// the definition, the model route, the adoption face, and the system prompt that agent-context
// derives from the definition through the real adoption face. No process is started here; the
// release rows that carry the prompt to a model (`request-context`, `agent-context`, `agent-host`)
// are still stand-ins in this tree, so the composition stops at the assembled system prompt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  INSTRUCTION_LIMITS,
  judgeAgentDefinition,
  type AgentDefinition,
} from '@omne-harness/agent-contract'
import { definitionContributions, definitionSourceOf } from '@omne-harness/agent-context'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'
import { assembleSystemPrompt } from '@omne-harness/request-context-contract'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { contentDigest } from '@omne-harness/server-entry/cordis'
import { agentAdoptionsConfig } from '../../src/rows/agent-adoptions/config.ts'
import { AgentAdoptionsImpl } from '../../src/rows/agent-adoptions/services.ts'
import { buildTable } from '../../src/rows/agent-adoptions/table.ts'
import { TENANT_A } from '../rows/storage/fixtures/tree.ts'

type Distribution = Readonly<{ rows: readonly Readonly<{ id: string; config: unknown }>[] }>

const distribution = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../config/serve.distribution.json'), 'utf8'),
) as Distribution
const row = distribution.rows.find(item => item.id === 'agent-adoptions')
if (row === undefined) throw new Error('the release has no agent-adoptions row')
const config = agentAdoptionsConfig.parse(row.config)
const entry = config.mappings.find(item => item.name === 'coding')
if (entry === undefined) throw new Error('the release has no coding entry')
const configured = entry.definition as AgentDefinition
const instructions = configured.instructions ?? []
const fullText = instructions.map(section => section.text).join('\n')

const access = { principal: 'tester', tenant: TENANT_A }

async function adoptionsFace() {
  const table = await buildTable(config)
  return new AgentAdoptionsImpl(new Context(), table)
}

describe('the coding entry of the release mapping (R2-D124)', () => {
  it('is a legal definition: five release tools resident, the model attribute, ten ordered sections, no extension', async () => {
    const table = await buildTable(config)
    expect(table.mappings.byName('coding')?.candidate).toEqual(entry.candidate)
    const judged = await judgeAgentDefinition(entry.definition)
    expect(judged.kind).toBe('accepted')
    expect(configured.references).toEqual([
      { capability: { category: 'Tool', name: 'Files' }, resident: true },
      { capability: { category: 'Tool', name: 'Shell' }, resident: true },
      { capability: { category: 'Tool', name: 'Tools' }, resident: true },
      { capability: { category: 'Tool', name: 'TodoItems' }, resident: true },
      { capability: { category: 'Tool', name: 'Web' }, resident: true },
    ])
    expect(configured.attributes).toEqual([{ item: 'model' }])
    expect(instructions.map(section => section.id)).toEqual([
      'role',
      'trust',
      'autonomy',
      'method',
      'tools',
      'reporting',
      'safety',
      'git',
      'communication',
      'environment',
    ])
    expect(entry.extensions).toEqual([])
    expect(entry.requiredIdentities).toEqual([])
  })

  it('the adoption digest is the content digest of the definition, prompt included', () => {
    expect(entry.candidate.digest).toBe(contentDigest(entry.definition))
  })

  it('a prompt that differs by one character has another digest, so the adoption would not match', () => {
    const [first, ...rest] = instructions
    if (first === undefined) throw new Error('no sections')
    const changed = {
      ...entry.definition,
      instructions: [{ ...first, text: `${first.text}.` }, ...rest],
    }
    expect(contentDigest(changed)).not.toBe(entry.candidate.digest)
    // The same definition with the same text gives the same digest: the digest is the content.
    expect(contentDigest(JSON.parse(JSON.stringify(entry.definition)))).toBe(entry.candidate.digest)
  })

  it('the initial model route names an official OpenAI profile (R2-D125: openai/gpt-6.1-sol)', () => {
    expect(entry.initialModelSelection?.name).toBe('openai/gpt-6.1-sol')
    const routes = officialOpenAiProfiles({
      retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: '0'.repeat(64) },
      compactionTriggerPercent: '80',
    }).flatMap(definition => definition.suppliers.map(supplier => supplier.model))
    expect(routes).toContain(entry.initialModelSelection?.name)
    expect(entry.initialModelSelection?.basis.digest).toBe(
      contentDigest({ name: entry.initialModelSelection?.name }),
    )
  })

  it('every mapped definition of the release carries an initial model selection (R2-D236)', () => {
    // The server entry refuses a creation without it, so a missing one would make the definition unusable.
    expect(config.mappings.length).toBeGreaterThan(0)
    for (const mapping of config.mappings)
      expect(mapping.initialModelSelection?.name, mapping.name).toBeTruthy()
  })

  it('the prompt names no model vendor, the five resident tools, and carries the guardrails and the state words', () => {
    for (const forbidden of ['Claude', 'Anthropic', 'OpenAI', 'GPT', 'Gemini', 'Codex'])
      expect(fullText, forbidden).not.toContain(forbidden)
    for (const word of ['Verified', 'Partly verified', 'Not verified', 'Failed'])
      expect(fullText).toContain(word)
    for (const word of ['已验证', '部分验证', '未验证', '失败']) expect(fullText).toContain(word)
    expect(fullText).toContain(
      'You have five resident tools: Files, Shell, Tools, TodoItems and Web.',
    )
    // The Web section tells the model what search needs and that web content is data.
    expect(fullText).toContain('## Web')
    expect(fullText).toContain('exa.apiKey')
    expect(fullText).toContain('external data')
    // Four guardrail classes (R2-D124): denied is final; secrets; consent for destructive and
    // visible actions; honest reporting. Six sentences start with the marker.
    expect(fullText.match(/Guardrail:/gu)).toHaveLength(6)
    expect(fullText).not.toContain('{{')
    for (const section of instructions)
      expect(Buffer.byteLength(section.text, 'utf8')).toBeLessThanOrEqual(
        INSTRUCTION_LIMITS.maxSectionBytes,
      )
  })

  it('the adoption face resolves the candidate to the definition with its instructions, and a digest off by one is invalid', async () => {
    const face = await adoptionsFace()
    const resolved = await face.resolve({ ...access, adoption: entry.candidate })
    expect('ok' in resolved && resolved.ok.definition).toEqual(configured)
    const wrong = await face.resolve({
      ...access,
      adoption: { ...entry.candidate, digest: `${entry.candidate.digest.slice(0, -1)}0` },
    })
    expect(wrong).toMatchObject({ failure: { kind: 'invalid', field: 'adoption' } })
  })

  it('agent-context over the real adoption face assembles a system prompt that starts with the first section of v2', async () => {
    const face = await adoptionsFace()
    const read = await definitionSourceOf(face)({ access, definition: entry.candidate })
    if (read.kind !== 'value' || read.value === null)
      throw new Error(`expected sections, got ${JSON.stringify(read)}`)
    const decoded = decodeScopeRef({ ref: 'scope:coding-agent-spec' })
    if (!('ok' in decoded)) throw new Error('fixture scope')
    const scope = decoded.ok
    const set = definitionContributions(entry.candidate, scope, read.value)
    const rendered = assembleSystemPrompt(set, {
      scope,
      definition: JSON.stringify(entry.candidate),
      workspace: null,
      keys: {},
    })
    if (rendered.kind !== 'rendered') throw new Error(rendered.reason)
    const [block] = rendered.blocks
    const text = block?.kind === 'text' ? block.text : ''
    const first = instructions[0]?.text ?? ''
    expect(first.startsWith('# Role and goal\n\nYou are the coding agent of OMNE Harness.')).toBe(
      true,
    )
    expect(text.startsWith(first)).toBe(true)
    expect(text).toBe(fullText)
    expect(rendered.sections.map(section => section.name)).toEqual(
      instructions.map(section => `definition/${section.id}`),
    )
  })

  it('the assistant entry still carries no prompt: the adoption face gives a definition without instructions', async () => {
    const assistant = config.mappings.find(item => item.name === 'assistant')
    if (assistant === undefined) throw new Error('the release has no assistant entry')
    const face = await adoptionsFace()
    const read = await definitionSourceOf(face)({ access, definition: assistant.candidate })
    expect(read).toEqual({ kind: 'value', value: null })
  })
})
