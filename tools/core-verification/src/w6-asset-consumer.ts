import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import {
  attributeDeclarationsOf,
  carrierRecordId,
  capabilityCanonicalString,
  createAssetModelJudge,
  parseWorkspaceManifestText,
  referencesOf,
  type AssetHolding,
  type AttributeAssignment,
  type CapabilityId,
  type WorkspaceCarrierManifest,
} from '@omne-harness-lite/asset-model'
import {
  defaultBodyContracts,
  evaluate,
  evaluationInputFingerprint,
  readWorkspaceCarrier,
  type NonConnectorAssetContent,
  type NonConnectorAssetDefinition,
  type NonConnectorEvaluationInput,
} from '@omne-harness-lite/asset-evaluation'
import {
  judgeContentBlock,
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { loopExtensionBodyContract } from '@omne-harness-lite/loop-extension'
import { mcpBodyContract, judgeMcpValue, actionEntryName } from '@omne-harness-lite/mcp-endpoint'
import { skillBodyContract, readSkillPackage } from '@omne-harness-lite/skill-package'
import {
  slashCommandBodyContract,
  expandSkill,
  parseInvocation,
  recognize,
} from '@omne-harness-lite/slash-command'
import {
  createParameterJudge,
  judgeToolDefinition,
  toolBodyContract,
  toolResultOf,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import { judgeAccountValue } from '@omne-harness-lite/call-accounts'
import { judgeMessage, judgeMessageText, isReadable } from '@omne-harness-lite/messages'

const at = '2026-09-26T09:00:00Z'
const tenant = unwrap(parseTenantId({ organization: 'org_A', account: 'acc_A' }))
const root = { category: 'agent_definition', name: 'assistant' } as const
const tool = { category: 'tool', name: 'shell' } as const
const skill = { category: 'skill', name: 'review' } as const
const loop = { category: 'loop_extension', name: 'guard' } as const
const mcp = { category: 'mcp', name: 'remote' } as const
const slash = { category: 'slash_command', name: 'review' } as const
const workspace = { tenant, directory: '/work/review' }
const negativeControl = process.argv.includes('--negative-control=workspace-permissions')
const packedConsumer = process.argv.includes('--packed-consumer')

function json(value: unknown): JsonValue {
  const parsed = readJsonStrict(writeJsonLossless(value))
  if ('failed' in parsed) throw new Error('invalid test input JSON')
  return parsed.ok
}
function assignment(item: string, value: JsonValue, immutable = false): AttributeAssignment {
  return { item, value, immutable, since: at }
}
function record(
  id: string,
  capability: NonConnectorAssetDefinition['capability'],
  content: NonConnectorAssetContent,
  customized = false,
): NonConnectorAssetDefinition {
  const base = {
    id,
    capability,
    versions: [
      { number: 1, content, publishedAt: at, ...(customized ? { publishedBy: tenant } : {}) },
    ],
  }
  return customized
    ? {
        ...base,
        origin: 'customized',
        owner: { kind: 'tenant', tenant },
        author: tenant,
        byAgent: false,
      }
    : { ...base, origin: 'official' }
}
function holding(
  definition: NonConnectorAssetDefinition,
  layer: 'factory' | 'organization' | 'tenant' = 'factory',
  assignments: readonly AttributeAssignment[] = [],
  immutable = false,
): AssetHolding {
  const holder =
    layer === 'factory'
      ? { layer }
      : layer === 'organization'
        ? { layer, organization: tenant.organization }
        : { layer, tenant }
  return {
    holder,
    capability: definition.capability,
    asset: definition.id,
    basis: { kind: definition.origin === 'official' ? 'official' : 'owned' },
    versionSelection: { kind: 'current' },
    immutable,
    assignments,
    since: at,
  }
}
const toolBody = (timeout = 'PT60S') => ({
  name: 'shell',
  description: 'Execute a bounded command',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: { type: 'object', properties: {} },
  settings: { timeout: { category: 'preference', default: timeout } },
  permissions: { execute: { default: 'ask' } },
})
const skillRead = readSkillPackage(
  [
    {
      kind: 'file',
      path: 'SKILL.md',
      text: '---\nname: review\ndescription: Review a change\n---\nCheck the invariants.',
    },
    {
      kind: 'file',
      path: '.omne/skill.json',
      text: '{"format":1,"tools":[{"category":"tool","name":"shell"}],"settings":[{"item":"tone","kind":"setting","category":"preference","domain":{"kind":"open","schema":{"type":"string"}},"default":"careful"}]}',
    },
    { kind: 'file', path: 'references/checklist.md', text: 'Check failures.' },
  ],
  { capabilityName: 'review' },
)
if (!('ok' in skillRead)) throw new Error('normalized skill fixture rejected')
const skillPackage = skillRead.ok.package
const bodies: readonly NonConnectorAssetContent[] = [
  { category: 'tool', definition: toolBody() },
  { category: 'skill', body: json(skillPackage) },
  {
    category: 'loop_extension',
    extension: {
      name: 'guard',
      position: 'before_action',
      power: 'rewrite',
      implementation: { kind: 'builtin', builtinName: 'guard' },
    },
  },
  {
    category: 'mcp',
    body: {
      transport: { kind: 'streamable_http', url: 'https://mcp.example.invalid' },
      timeouts: { connect: 'PT1S', call: 'PT30S' },
      permissions: { execute: { default: 'ask' } },
    },
  },
  {
    category: 'slash_command',
    body: { description: 'Review the change', binding: { kind: 'skill', skill } },
  },
]
const capabilities = [tool, skill, loop, mcp, slash] as const
const definitions = [
  record('ast_root', root, {
    category: 'agent_definition',
    body: toOpaqueJson({ category: 'connector', opaque: true }),
  }),
  ...capabilities.map((capability, index) => {
    const content = bodies[index]
    if (content === undefined) throw new Error('missing actual body fixture')
    return record('ast_' + capability.category, capability, content)
  }),
]
const input: NonConnectorEvaluationInput = {
  tenant,
  standing: { standing: 'effective', role: 'member' },
  definitions,
  holdings: definitions.map(definition => holding(definition)),
  root: { definition: root, references: capabilities.map(capability => ({ capability })) },
}
const judge = createAssetModelJudge(defaultBodyContracts)
function isManifest(value: unknown): value is WorkspaceCarrierManifest {
  return 'ok' in judge.judgeAssetValue('WorkspaceCarrierManifest', value)
}
function assembled(value: NonConnectorEvaluationInput) {
  const result = evaluate(value)
  assert.ok('ok' in result, writeJsonLossless(result))
  return result.ok
}
function valueOf(result: ReturnType<typeof assembled>, capability: CapabilityId, item: string) {
  return result.values.find(
    value =>
      value.capability.category === capability.category &&
      value.capability.name === capability.name &&
      value.item === item,
  )
}

export const ASSET_CASE_IDS = [
  'w6.asset.five-real-ports',
  'w6.asset.body-rejections',
  'w6.asset.layer-lock-and-setting-discontinuity',
  'w6.asset.workspace-normalized-skill-reading',
  'w6.asset.mcp-schema-execution-boundary',
  'w6.asset.reserved-and-duplicate-real-body',
  'w6.asset.nonconnector-record-domain',
  'w6.asset.scope-identity-and-billing',
  'w6.skill.slash-expansion-to-messages',
  'w6.messages.nested-unique-boundary',
  'w6.messages.nested-readability-and-compaction',
  'w6.tool.result-to-content',
] as const
const cases: readonly { id: (typeof ASSET_CASE_IDS)[number]; run(): void }[] = [
  {
    id: 'w6.asset.five-real-ports',
    run() {
      assert.deepEqual(Object.keys(defaultBodyContracts).sort(), [
        'loop_extension',
        'mcp',
        'skill',
        'slash_command',
        'tool',
      ])
      assert.equal(defaultBodyContracts.tool, toolBodyContract)
      assert.equal(defaultBodyContracts.skill, skillBodyContract)
      assert.equal(defaultBodyContracts.loop_extension, loopExtensionBodyContract)
      assert.equal(defaultBodyContracts.mcp, mcpBodyContract)
      assert.equal(defaultBodyContracts.slash_command, slashCommandBodyContract)
      for (const definition of definitions)
        assert.deepEqual(judge.judgeAssetValue('AssetDefinition', definition), { ok: true })
      const result = assembled(input)
      assert.equal(result.assets.length, 6)
      assert.deepEqual(
        result.composition.map(c => c.category).sort(),
        capabilities.map(c => c.category).sort(),
      )
      assert.deepEqual(result.unresolved, [])
      assert.deepEqual(result.filteredOut, [])
      assert.equal(valueOf(result, skill, 'tone')?.value, 'careful')
      assert.equal(valueOf(result, tool, 'timeout')?.value, 'PT60S')
      assert.deepEqual(valueOf(result, loop, 'power')?.value, { allowed: ['rewrite'] })
      assert.deepEqual(
        referencesOf(bodies[4] ?? { category: 'slash_command', body: null }, defaultBodyContracts),
        { references: [skill] },
      )
      assert.deepEqual(result, assembled(input))
      assert.equal(
        evaluationInputFingerprint(input),
        evaluationInputFingerprint({
          ...input,
          root: { references: input.root.references, definition: input.root.definition },
        }),
      )
    },
  },
  {
    id: 'w6.asset.body-rejections',
    run() {
      for (const [index, capability] of capabilities.entries()) {
        const original = definitions[index + 1]
        assert.ok(original)
        const content: NonConnectorAssetContent =
          capability.category === 'tool'
            ? { category: 'tool', definition: {} }
            : capability.category === 'loop_extension'
              ? { category: 'loop_extension', extension: {} }
              : { category: capability.category, body: {} }
        const invalid = { ...original, versions: [{ number: 1, content, publishedAt: at }] }
        assert.ok('rejected' in judge.judgeAssetValue('AssetDefinition', invalid))
        const result = evaluate({
          ...input,
          definitions: definitions.map(entry => (entry.id === invalid.id ? invalid : entry)),
        })
        assert.deepEqual(Object.keys(result), ['invalidInput'])
      }
      const lexical = {
        ...definitions[1],
        id: 'ast_bad',
        origin: 'official',
        capability: { category: 'tool', name: '' },
        versions: [{ number: 1, content: { category: 'tool', definition: {} }, publishedAt: at }],
      }
      assert.deepEqual(judge.judgeAssetValue('AssetDefinition', lexical), {
        rejected: 'name_invalid',
      })
    },
  },
  {
    id: 'w6.asset.layer-lock-and-setting-discontinuity',
    run() {
      const official = definitions[1]
      assert.ok(official)
      const custom = record(
        'ast_custom',
        tool,
        { category: 'tool', definition: toolBody('PT45S') },
        true,
      )
      const org = holding(official, 'organization', [
        assignment('timeout', 'PT120S', true),
        assignment('execute', { allowed: ['ask'] }, true),
      ])
      const tenantHolding = holding(custom, 'tenant', [
        assignment('execute', { allowed: ['auto'] }),
      ])
      const base = {
        ...input,
        definitions: [...definitions, custom],
        holdings: [...input.holdings, org, tenantHolding],
      }
      const replaced = assembled(base)
      assert.equal(
        replaced.assets.find(asset => asset.capability.category === 'tool')?.asset,
        custom.id,
      )
      assert.equal(valueOf(replaced, tool, 'timeout')?.value, 'PT45S')
      assert.equal(valueOf(replaced, tool, 'timeout')?.lockedAt, undefined)
      assert.deepEqual(valueOf(replaced, tool, 'execute')?.value, { allowed: ['ask'] })
      assert.equal(valueOf(replaced, tool, 'execute')?.tenantAutoWritable, false)
      const locked = assembled({
        ...base,
        holdings: [...input.holdings, { ...org, immutable: true }, tenantHolding],
      })
      assert.equal(
        locked.assets.find(asset => asset.capability.category === 'tool')?.asset,
        official.id,
      )
      assert.equal(valueOf(locked, tool, 'timeout')?.value, 'PT120S')
      assert.equal(valueOf(locked, tool, 'timeout')?.lockedAt, 'organization')
      assert.ok(
        locked.filteredOut.some(
          row =>
            row.capability.category === 'tool' &&
            row.from === 'tenant' &&
            row.reason === 'locked_below',
        ),
      )
      const disabled = assembled({
        ...base,
        holdings: [
          ...input.holdings,
          org,
          { ...tenantHolding, assignments: [assignment('disabled', true)] },
        ],
      })
      assert.equal(
        disabled.assets.find(asset => asset.capability.category === 'tool')?.asset,
        official.id,
      )
      assert.ok(disabled.filteredOut.some(row => row.reason === 'disabled'))
    },
  },
  {
    id: 'w6.asset.workspace-normalized-skill-reading',
    run() {
      const manifest = parseWorkspaceManifestText(
        '{"format":1,"assets":[{"capability":{"category":"skill","name":"review"},"source":"skills/review"}],"assignments":[{"capability":{"category":"skill","name":"review"},"item":"tone","value":"workspace","immutable":true},{"capability":{"category":"skill","name":"review"},"item":"usableBy","value":{"allowed":["member"]}},{"capability":{"category":"tool","name":"shell"},"item":"timeout","value":"PT10S"}],"disabled":[]}',
        defaultBodyContracts,
      )
      assert.ok('ok' in manifest)
      assert.ok(isManifest(manifest.ok))
      const carrier = readWorkspaceCarrier(manifest.ok, workspace)
      assert.ok('ok' in carrier)
      assert.deepEqual(carrier.ok.dropped, [
        { capability: skill, item: 'tone', reason: 'immutable_flag' },
        { capability: tool, item: 'timeout', reason: 'unknown_asset' },
      ])
      const workspaceDefinition = record(
        carrierRecordId(workspace, skill),
        skill,
        { category: 'skill', body: json(skillPackage) },
        true,
      )
      const workspaceHoldings: AssetHolding[] = carrier.ok.holdings.map(entry => ({
        ...entry,
        since: at,
        assignments: entry.assignments.map(value => ({ ...value, since: at })),
      }))
      const result = assembled({
        ...input,
        workspace,
        definitions: [...definitions, workspaceDefinition],
        holdings: [...input.holdings, ...workspaceHoldings],
        session: [{ capability: skill, assignment: assignment('tone', 'session') }],
      })
      assert.equal(valueOf(result, skill, 'tone')?.value, 'session')
      assert.deepEqual(
        valueOf(result, skill, 'usableBy')?.value,
        negativeControl ? { allowed: ['member'] } : { allowed: ['self'] },
      )
      assert.ok(
        result.filteredOut.some(
          row => row.capability.category === 'skill' && row.reason === 'workspace_permission',
        ),
      )
      const broken = parseWorkspaceManifestText(
        '{"format":1,"format":1,"assets":[],"assignments":[],"disabled":[]}',
        defaultBodyContracts,
      )
      assert.deepEqual(broken, { rejected: 'malformed' })
    },
  },
  {
    id: 'w6.asset.mcp-schema-execution-boundary',
    run() {
      const unsupportedInput = {
        type: 'object',
        properties: { value: { type: 'string', description: 'Value', pattern: '(a+)+' } },
      }
      const snapshot = {
        kind: 'fetched',
        fetchedAt: at,
        tools: [{ name: 'send', inputSchema: unsupportedInput }],
      } as const
      assert.deepEqual(judgeMcpValue('ActionSnapshot', snapshot), { ok: true })
      const result = assembled({
        ...input,
        mcpActionSets: [{ endpoint: mcp, scope: 'factory', actions: snapshot }],
      })
      assert.deepEqual(valueOf(result, mcp, 'execute:send')?.value, { allowed: ['ask'] })
      const projected = actionEntryName('remote', 'send')
      assert.deepEqual(projected, { ok: 'remote:send' })
      const definition: ToolDefinition = {
        name: 'remote:send',
        description: 'Remote send',
        paradigm: 'single',
        origin: { kind: 'mcp', endpoint: mcp, remoteName: 'send' },
        input: unsupportedInput,
        permissions: { execute: { default: 'ask' } },
      }
      const admission = judgeToolDefinition(definition)
      assert.ok('rejected' in admission)
      assert.equal(admission.rejected, 'schema_unsupported')
      assert.ok(
        'unsupported' in createParameterJudge().judgeCallArguments(definition, { value: 'x' }),
      )
      assert.deepEqual(snapshot.tools[0].inputSchema, unsupportedInput)
      assert.equal(writeJsonLossless(snapshot), writeJsonLossless(json(snapshot)))
    },
  },
  {
    id: 'w6.asset.reserved-and-duplicate-real-body',
    run() {
      const duplicate = {
        ...skillPackage,
        definition: {
          format: 1,
          settings: [
            {
              item: 'tone',
              kind: 'setting',
              category: 'preference',
              domain: { kind: 'open', schema: { type: 'string' } },
              default: 'a',
            },
            {
              item: 'tone',
              kind: 'setting',
              category: 'preference',
              domain: { kind: 'open', schema: { type: 'string' } },
              default: 'b',
            },
          ],
        },
      }
      assert.ok(
        'rejected' in judge.judgeAssetValue('AssetContent', { category: 'skill', body: duplicate }),
      )
      const reserved = {
        ...skillPackage,
        definition: {
          format: 1,
          settings: [
            {
              item: 'disabled',
              kind: 'setting',
              category: 'preference',
              domain: { kind: 'open', schema: { type: 'boolean' } },
              default: false,
            },
          ],
        },
      }
      assert.ok(
        'rejected' in judge.judgeAssetValue('AssetContent', { category: 'skill', body: reserved }),
      )
      assert.deepEqual(
        judge.judgeAssetValue(
          'AssetDefinition',
          record(
            'ast_slash_bad',
            { category: 'slash_command', name: 'omne-official:danger' },
            bodies[4] ?? { category: 'slash_command', body: null },
            true,
          ),
        ),
        { rejected: 'name_reserved' },
      )
    },
  },
  {
    id: 'w6.asset.nonconnector-record-domain',
    run() {
      const plugin = { category: 'plugin', name: 'bundle' } as const
      const entry = record('ast_bundle', plugin, { category: 'plugin', members: [tool] })
      assert.deepEqual(judge.judgeAssetValue('AssetDefinition', entry), { ok: true })
      assert.deepEqual(
        attributeDeclarationsOf({ category: 'plugin', members: [tool] }, defaultBodyContracts),
        { underivable: 'plugin' },
      )
      const result = evaluate({
        ...input,
        definitions: [...definitions, entry],
        holdings: [...input.holdings, holding(entry)],
        root: { definition: root, references: [{ capability: plugin }] },
      })
      assert.deepEqual(result, { categoryUnsupported: { category: 'plugin' } })
      const helper = { category: 'agent_definition', name: 'helper' } as const
      const helperDefinition = record('ast_helper', helper, {
        category: 'agent_definition',
        body: toOpaqueJson({}),
      })
      assert.deepEqual(
        evaluate({
          ...input,
          definitions: [...definitions, helperDefinition],
          holdings: [...input.holdings, holding(helperDefinition)],
          root: { definition: root, references: [{ capability: helper }] },
        }),
        { categoryUnsupported: { category: 'agent_definition' } },
      )
      const rootRecord = definitions[0]
      assert.ok(rootRecord)
      assert.deepEqual(
        judge.judgeAssetValue('AssetDefinition', {
          ...rootRecord,
          versions: [{ number: 2, content: rootRecord.versions[0]?.content, publishedAt: at }],
        }),
        { rejected: 'version_sequence_broken' },
      )
    },
  },
  {
    id: 'w6.asset.scope-identity-and-billing',
    run() {
      assert.equal(
        tenantIdEquals(tenant, unwrap(parseTenantId({ organization: 'org_A', account: 'acc_B' }))),
        false,
      )
      const amount = readJsonStrict('0.0000000000000000000000000000001')
      assert.ok('ok' in amount)
      assert.deepEqual(
        judgeAccountValue('CostItem', {
          service: capabilityCanonicalString(mcp),
          cost_usd: amount.ok,
          source: 'tool_reported',
        }),
        { ok: true },
      )
      assert.equal(writeJsonLossless(amount.ok), '0.0000000000000000000000000000001')
      assert.equal(capabilityCanonicalString(mcp), 'mcp/remote')
      const definition = record(
        'ast_owned',
        tool,
        { category: 'tool', definition: toolBody() },
        true,
      )
      assert.deepEqual(judge.judgeAssetValue('AssetDefinition', definition), { ok: true })
      assert.deepEqual(
        judge.judgeAssetValue('AssetDefinition', {
          ...definition,
          author: { organization: 'org_A', account: 'acc_B' },
        }),
        { rejected: 'malformed' },
      )
      const invalidTenantHolding = {
        ...holding(definition, 'tenant'),
        holder: {
          layer: 'tenant',
          tenant: unwrap(parseTenantId({ organization: 'org_A', account: 'acc_B' })),
        },
      } as const
      const result = evaluate({
        ...input,
        definitions: [...definitions, definition],
        holdings: [...input.holdings, invalidTenantHolding],
      })
      assert.ok('invalidInput' in result)
      assert.equal(result.invalidInput.diagnostics[0]?.condition, 'C3')
    },
  },
  {
    id: 'w6.skill.slash-expansion-to-messages',
    run() {
      const recognition = recognize('/review careful')
      assert.equal(recognition.kind, 'invocation')
      if (recognition.kind !== 'invocation')
        throw new Error('invocation fixture was not recognized')
      const definition = { description: 'Review', binding: { kind: 'skill', skill } } as const
      assert.deepEqual(parseInvocation(recognition.invocation, { review: definition }), {
        kind: 'skill',
        skill,
      })
      const blocks = expandSkill(recognition.invocation, 'review', skillPackage, [
        {
          id: unwrap(parseOpaqueIdentifier('skill_body', 'BlockId')),
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: unwrap(parseOpaqueIdentifier('skill_args', 'BlockId')),
          visibility: { toHuman: true, toModel: true },
        },
      ])
      assert.deepEqual(
        blocks.map(block => block.text),
        ['Check the invariants.', 'careful'],
      )
      assert.deepEqual(
        blocks.map(block => block.origin),
        [
          { kind: 'skill_body', command: 'review', skill: 'review' },
          { kind: 'slash_command_args', command: 'review' },
        ],
      )
      assert.ok('ok' in judgeMessage({ id: 'msg_review', type: 'user', createdAt: at, blocks }))
    },
  },
  {
    id: 'w6.messages.nested-unique-boundary',
    run() {
      const text = (id: string) => ({
        kind: 'text',
        id,
        text: 'leaf',
        visibility: { toHuman: true, toModel: true },
      })
      const image = (id: string, child: string) => ({
        kind: 'image',
        id,
        visibility: { toHuman: true, toModel: true },
        mediaType: 'image/png',
        data: { inline: 'AQ==' },
        transcript: 'leaf',
        renderings: [{ producedBy: 'system', blocks: [text(child)] }],
      })
      const result = {
        kind: 'tool_result',
        id: 'result',
        visibility: { toHuman: true, toModel: true },
        callId: 'call',
        outcome: 'completed',
        blocks: [image('image1', 'child1'), image('image2', 'child2')],
      }
      assert.ok('ok' in judgeContentBlock(result))
      assert.ok(
        'ok' in
          judgeMessage({
            id: 'msg_nested',
            type: 'tool',
            callId: 'call',
            blocks: [result],
            createdAt: at,
          }),
      )
      for (const blocks of [
        [text('result')],
        [image('image1', 'image1')],
        [image('image1', 'same'), image('image2', 'same')],
        [{ ...result, blocks: [], id: 'result' }],
      ]) {
        const block = { ...result, blocks }
        assert.ok(
          'ok' in judgeContentBlock(block),
          'single block does not own message-wide identity',
        )
        assert.deepEqual(
          judgeMessage({
            id: 'msg_nested',
            type: 'tool',
            callId: 'call',
            blocks: [block],
            createdAt: at,
          }),
          { rejected: 'block_id_duplicate' },
        )
      }
      assert.deepEqual(
        judgeMessageText(
          '{"id":"msg","id":"msg","type":"user","createdAt":"2026-09-26T09:00:00Z","blocks":[]}',
        ),
        { rejected: 'malformed' },
      )
    },
  },
  {
    id: 'w6.messages.nested-readability-and-compaction',
    run() {
      const visible = { toHuman: false, toModel: true }
      const leaf = { kind: 'text', id: 'leaf', visibility: visible, text: 'nested' }
      const media = {
        kind: 'image',
        id: 'media',
        visibility: visible,
        mediaType: 'image/png',
        data: { inline: 'AQ==' },
        transcript: 'nested',
        renderings: [{ producedBy: 'system', blocks: [leaf] }],
      }
      const result = {
        kind: 'tool_result',
        id: 'result',
        visibility: visible,
        callId: 'call',
        outcome: 'completed',
        blocks: [media],
      }
      const message = (block: unknown) => {
        const parsed = judgeMessage({
          id: 'msg_nested',
          type: 'tool',
          callId: 'call',
          createdAt: at,
          blocks: [block],
        })
        assert.ok('ok' in parsed)
        assert.equal(parsed.ok.type, 'tool')
        if (parsed.ok.type !== 'tool') throw new Error('fixture did not produce tool message')
        return parsed.ok
      }
      const ref = {
        messageId: unwrap(parseOpaqueIdentifier('msg_nested', 'MessageId')),
        blockId: unwrap(parseOpaqueIdentifier('leaf', 'BlockId')),
      }
      const original = message(result)
      assert.equal(isReadable(ref, [original]), true)
      for (const block of [
        { ...result, visibility: { toHuman: true, toModel: false } },
        { ...result, blocks: [{ ...media, visibility: { toHuman: true, toModel: false } }] },
        {
          ...result,
          blocks: [
            {
              ...media,
              renderings: [
                {
                  producedBy: 'system',
                  blocks: [{ ...leaf, visibility: { toHuman: true, toModel: false } }],
                },
              ],
            },
          ],
        },
      ])
        assert.equal(isReadable(ref, [message(block)]), false)
      const compact = judgeMessage({
        id: 'compact',
        type: 'compaction',
        createdAt: at,
        blocks: [],
        silenced: [{ messageId: 'msg_nested', blockId: 'result' }],
      })
      assert.ok('ok' in compact)
      assert.ok(compact.ok.type === 'compaction')
      assert.equal(isReadable(ref, [original, compact.ok]), false)
      assert.equal(isReadable(ref, []), false)
      assert.deepEqual(
        message(result),
        original,
        'computations must not mutate original annotations',
      )
    },
  },
  {
    id: 'w6.tool.result-to-content',
    run() {
      const returned = toolResultOf(
        '{"success":true}',
        unwrap(parseOpaqueIdentifier('tool_result', 'BlockId')),
      )
      assert.deepEqual(returned.content, [
        {
          kind: 'text',
          id: 'tool_result',
          visibility: { toHuman: true, toModel: true },
          text: '{"success":true}',
        },
      ])
      assert.ok('ok' in judgeContentBlock(returned.content[0]))
    },
  },
]
const resolution = []
for (const name of [
  'asset-model',
  'asset-evaluation',
  'tool-definition',
  'loop-extension',
  'skill-package',
  'mcp-endpoint',
  'slash-command',
  'content-blocks',
  'messages',
  'call-accounts',
  'identity-values',
]) {
  const url = new URL(import.meta.resolve('@omne-harness-lite/' + name))
  if (packedConsumer) {
    assert.ok(
      fileURLToPath(url).startsWith(dirname(fileURLToPath(import.meta.url)) + '/node_modules/'),
    )
    assert.ok(url.pathname.endsWith('/node_modules/@omne-harness-lite/' + name + '/dist/index.js'))
  } else assert.ok(url.pathname.endsWith('/packages/core/' + name + '/dist/index.js'))
  resolution.push({
    name,
    file: fileURLToPath(url),
    sha256: createHash('sha256')
      .update(await readFile(url))
      .digest('hex'),
  })
}
const results = []
for (const item of cases) {
  try {
    item.run()
    results.push({ id: item.id, status: 'passed' })
  } catch (error) {
    results.push({
      id: item.id,
      status: 'failed',
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
    })
  }
}
process.stdout.write(
  JSON.stringify(
    {
      negativeControl,
      specEpoch: 3,
      packedConsumer,
      nodeVersion: process.version,
      consumerArtifact: {
        file: fileURLToPath(import.meta.url),
        sha256: createHash('sha256')
          .update(await readFile(fileURLToPath(import.meta.url)))
          .digest('hex'),
      },
      resolution,
      cases: results,
    },
    null,
    2,
  ) + '\n',
)
if (results.some(result => result.status === 'failed')) process.exitCode = 1
