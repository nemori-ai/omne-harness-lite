// @module-tag slow — every case starts the SDK's 2026-07-28 server on a local port.
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { declaresSkills, judgeSkills } from '@omne-harness/mcp-contract'
import type { McpTransport } from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import { skillsServer, type SkillsServer } from './fixtures/sdk/skills-http.ts'

const SKILL_MD =
  '---\nname: style\ndescription: House style for notes.\n---\n# Style\nShort sentences.\n'
const TONE = 'Be plain. 平实。\n'

const peers: SkillsServer[] = []
const transports: McpTransport[] = []
afterEach(async () => {
  await Promise.all(transports.splice(0).map(transport => transport.close()))
  await Promise.all(peers.splice(0).map(peer => peer.close()))
})

async function opened() {
  const peer = await skillsServer({ 'style/SKILL.md': SKILL_MD, 'style/references/tone.md': TONE })
  peers.push(peer)
  const factory = createLocalTransportFactory({
    clientInfo: { name: 'skills', version: '0' },
    maxLongRequests: 2,
  })
  const made = await factory.open(
    {
      kind: 'streamable-http',
      target: peer.target,
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    },
    new AbortController().signal,
  )
  if (!('ok' in made)) throw new Error(JSON.stringify(made))
  transports.push(made.ok)
  const discovered = await made.ok.discover()
  if (!('ok' in discovered)) throw new Error(JSON.stringify(discovered))
  return { transport: made.ok, peer: discovered.ok }
}

describe('the skills of an SDK peer (C401, C402)', () => {
  it('declares them, lists them in the shape the host takes, and serves each listed file whose bytes match the listing', async () => {
    const { transport, peer } = await opened()
    expect(declaresSkills(peer)).toBe(true)
    const listed = await transport.listSkills?.()
    if (listed === undefined || !('ok' in listed)) throw new Error(JSON.stringify(listed))
    const { skills, refused } = judgeSkills(listed.ok.skills)
    expect(refused).toEqual([])
    const [style] = skills
    expect(style?.name).toBe('style')
    expect(style?.files.map(file => file.path).toSorted()).toEqual([
      'SKILL.md',
      'references/tone.md',
    ])
    for (const [file, text] of [
      [style?.files.find(one => one.path === 'SKILL.md'), SKILL_MD],
      [style?.files.find(one => one.path === 'references/tone.md'), TONE],
    ] as const) {
      if (file === undefined) throw new Error('not listed')
      const read = await transport.readResource?.(file.uri)
      if (read === undefined || !('ok' in read) || !('text' in read.ok))
        throw new Error(JSON.stringify(read))
      expect(read.ok.text).toBe(text)
      expect(file.size).toBe(Buffer.byteLength(text))
      expect(file.digest).toBe(`sha256:${createHash('sha256').update(text).digest('hex')}`)
    }
    const got = await transport.getSkill?.(style?.uri ?? '')
    expect(got).toHaveProperty('ok')
  })

  it('answers an address it does not serve as an error, not as content', async () => {
    const { transport } = await opened()
    const read = await transport.readResource?.('skill://nowhere/SKILL.md')
    expect(read).toMatchObject({ failure: { kind: 'error-answer' } })
  })
})
