import { describe, expect, it } from 'vitest'
import { decisionEvidence, type AdmissionCheck } from '@omne-harness/authorization'
import { writeJsonText } from '@omne-harness/json-text'
import { encodeCommandCall } from '@omne-harness/tool-contract/provider'
import { createToolActionResolution } from '../../../src/entry/tool-action-resolution.ts'
import { createActionAdmission } from '../../../src/rows/authorization/action-admission.ts'
import type { ToolPermissionCheck } from '../../../src/rows/authorization/current-tool-permission.ts'
import { objectTree, toolsCall } from '../../entry/tool-call-support.ts'
import { forwardWorld } from '../../entry/tool-forward-support.ts'
import { VERDICT_RELEASE } from '../../support/permission-release.ts'

const evidence = decisionEvidence('gate-agreement', '1', {})
const allowing = { check: async () => ({ kind: 'allowed', evidence }) } as unknown as AdmissionCheck
const rules = {
  revision: 'r1',
  rules: ['Tools', 'Shell', 'Files', 'ToyEcho', 'Ask'].map(tool => ({
    id: tool,
    effect: 'allow',
    tool,
  })),
}

type World = Awaited<ReturnType<typeof forwardWorld>>
type Tool = 'Shell' | 'Files' | 'Tools' | 'ToyEcho' | 'Ask'
type Decision = Awaited<ReturnType<ToolPermissionCheck['check']>>
// What the admission handed the permission check: the gate it judged, and whether as a carrier.
type Seen = readonly (readonly [string, boolean])[]

function call(world: World, tool: Tool, command: string, params: unknown, intent?: string) {
  const definition = world.request(tool).availability.definition
  if (definition.kind !== 'commands') throw new Error(`${tool} is not a command tool`)
  return writeJsonText(
    encodeCommandCall(definition.encoding, {
      command,
      intent: intent ?? null,
      params: objectTree(params),
    }),
  )
}

async function paths(
  world: World,
  decision: Decision = { kind: 'allow', evidence, release: VERDICT_RELEASE },
) {
  const resolution = createToolActionResolution({
    release: () => world.release,
    catalog: () => world.catalog,
    view: () => world.view,
  })
  let seen: [string, boolean][] = []
  const check: ToolPermissionCheck = {
    check: async input => {
      seen.push([input.gate.id, input.carrier === true])
      return decision
    },
  }
  const admission = createActionAdmission({
    actionRules: rules,
    readAdmission: () => allowing,
    readPermission: () => check,
    readResolution: () => resolution,
  })
  const taken = () => {
    const out = seen
    seen = []
    return out
  }
  const admitted = async (tool: Tool, args: string): Promise<Seen> => {
    const answer = await admission.admit({
      principal: world.principal,
      tenant: world.tenant,
      execution: 'e',
      passage: 'p',
      action: 'a',
      advance: {},
      permissions: [],
      decision: null,
      original: { name: tool, arguments: args },
      effectiveArguments: args,
      definition: world.request(tool).availability.definition.adoption,
    } as never)
    expect(answer).toMatchObject({ ok: { kind: 'allow' } })
    return taken()
  }
  return { admitted }
}

describe('admission takes the gate the tool declares for the call', () => {
  it.each([
    ['Shell help', 'Shell', 'help', {}, undefined, [['read', false]]],
    ['Shell execute', 'Shell', 'execute', { script: 'ls' }, 'list files', [['run', false]]],
    ['Files read', 'Files', 'read', { path: 'a.md' }, undefined, [['read', false]]],
    ['Files write', 'Files', 'write', { path: 'a.md', text: 'x' }, undefined, [['write', false]]],
    ['Tools search', 'Tools', 'search', { query: 'echo' }, undefined, [['discover', false]]],
  ] as const)('%s', async (_label, tool, command, params, intent, expected) => {
    const world = await forwardWorld()
    try {
      const { admitted } = await paths(world)
      const args = call(world, tool, command, params, intent)
      expect(await admitted(tool, args)).toEqual(expected)
    } finally {
      await world.close()
    }
  })

  it('a Tools execute call: its own forward gate as the carrier, then the gate of its target', async () => {
    const world = await forwardWorld()
    try {
      const { admitted } = await paths(world)
      const carried = toolsCall(world, { name: 'ToyEcho', command: 'info', arguments: {} })
      expect(await admitted('Tools', carried)).toEqual([
        ['forward', true],
        ['read', false],
      ])
    } finally {
      await world.close()
    }
  })

  it.each([
    ['the session asks a person', { kind: 'ask', evidence }],
    ['the session never asks', { kind: 'deny', evidence, reason: 'inquiry-policy' }],
    ['the session skips asking', { kind: 'allow', evidence, release: VERDICT_RELEASE }],
    ['the permission basis cannot be read', { kind: 'unavailable', evidence }],
  ] as const)(
    'Ask ask has no gate: it is admitted without a permission read when %s',
    async (_label, decision) => {
      const world = await forwardWorld()
      try {
        const { admitted } = await paths(world, decision as Decision)
        const args = call(world, 'Ask', 'ask', {
          questions: [
            {
              title: 'Which port?',
              description: 'Port 8080 is taken.',
              options: [
                { label: '8081', description: 'The next free port.' },
                { label: '3000', description: 'The framework default.' },
              ],
            },
          ],
        })
        expect(await admitted('Ask', args)).toEqual([])
      } finally {
        await world.close()
      }
    },
  )

  it('a call naming no command of its tool: only the first gate, as a carrier', async () => {
    const world = await forwardWorld()
    try {
      const { admitted } = await paths(world)
      const args = '{"command":"nope","params":{}}'
      expect(await admitted('Files', args)).toEqual([['read', true]])
    } finally {
      await world.close()
    }
  })
})
