import type { Policy } from '../integration/policy.ts'
import type { TaskBinding } from './binding.ts'
import { bodyFields, bodySections } from './body.ts'
import {
  findLine,
  INTEGRATION_LINE,
  isOpenScope,
  scopeOwners,
  targetTrack,
  under,
  type DeliveryLines,
} from './lines.ts'
import type { CapturedIssue } from './protocol.ts'
import { readWorkKind, type WorkKind } from './work-kind.ts'

/** Card attribute values adopted in docs/engineering/delivery.md「卡属性与合法组合」. */
export const natures = ['design', 'contract', 'impl', 'integration', 'baseline'] as const
export const contractChanges = ['none', 'additive', 'breaking'] as const
export type Nature = (typeof natures)[number]
export type ContractChange = (typeof contractChanges)[number]

/** The body field name of each card attribute in「身份与责任」. */
export const ATTRIBUTE_FIELDS = {
  line: '交付线',
  nature: '性质',
  contractChange: '契约变更',
} as const
export type AttributeName = keyof typeof ATTRIBUTE_FIELDS
export const attributeNames = [
  'line',
  'nature',
  'contractChange',
] as const satisfies readonly AttributeName[]
/**
 * The card attributes as written, before judgement. Each body field keeps every value found in
 * 「身份与责任」, so a missing or repeated field stays visible. `milestone` is the Issue milestone
 * title, null without one, and undefined when the capture did not read it.
 */
export type CardAttributes = {
  issue: string
  workKind: WorkKind | undefined
  fields: Record<AttributeName, string[]>
  milestone: string | null | undefined
  labels: string[]
  /** The trimmed text of「交付条件」, or undefined without that section. */
  conditions: string | undefined
}
export function readCardAttributes(
  body: string,
  issue: Pick<CapturedIssue, 'url' | 'labels' | 'milestone'>,
): CardAttributes {
  const sections = bodySections(body),
    identity = bodyFields((sections.get('身份与责任') ?? []).join('\n')),
    conditions = sections.get('交付条件')
  const values = (name: AttributeName) => identity.get(ATTRIBUTE_FIELDS[name]) ?? []
  return {
    issue: issue.url,
    workKind: readWorkKind(body),
    fields: {
      line: values('line'),
      nature: values('nature'),
      contractChange: values('contractChange'),
    },
    milestone: issue.milestone,
    labels: [...issue.labels],
    conditions: conditions === undefined ? undefined : conditions.join('\n').trim(),
  }
}

export const attributeCodes = [
  'attribute-missing',
  'attribute-invalid',
  'attribute-binding-drift',
  'nature-route-mismatch',
  'scope-outside-line',
  'scope-integration-path',
  'condition-cross-line',
  'label-drift',
  'binding-v1',
] as const
export type AttributeCode = (typeof attributeCodes)[number]
/** One report-only finding about a card's attributes. `clause` names the field or entry. */
export type AttributeFinding = { code: AttributeCode; clause: string; message: string }
/** A condition of the card whose target is an Issue, with that card's attributes when read. */
export type ConditionCard = { condition: string; target: string; card: CardAttributes | undefined }
export type AttributeInput = {
  binding: TaskBinding | undefined
  card: CardAttributes
  conditionCards: readonly ConditionCard[]
  lines: DeliveryLines
  registry: Pick<Policy, 'tracks'>
}
/** Attributes that passed judgement; each is absent when the body value is missing or invalid. */
export type Attributes = { line?: string; nature?: Nature; contractChange?: ContractChange }

/** The label families projected from the attributes, by attribute. */
export const LABEL_PREFIXES = {
  line: 'line:',
  nature: 'nature:',
  contractChange: 'contract:',
} as const satisfies Record<AttributeName, string>
/** The label a valid attribute value projects to; contract change `none` projects to no label. */
export function projectedLabels(name: AttributeName, value: string): string[] {
  return name === 'contractChange' && value === 'none' ? [] : [`${LABEL_PREFIXES[name]}${value}`]
}

function lineValues(lines: DeliveryLines): string[] {
  return [INTEGRATION_LINE, ...lines.lines.map(line => line.id)]
}
function allowedValues(name: AttributeName, lines: DeliveryLines): readonly string[] {
  return name === 'line' ? lineValues(lines) : name === 'nature' ? natures : contractChanges
}
/** Judges the body values: one value from the allowed set, or one finding that explains why not. */
export function judgeAttributes(
  card: CardAttributes,
  lines: DeliveryLines,
): { attributes: Attributes; findings: AttributeFinding[] } {
  const attributes: Attributes = {},
    findings: AttributeFinding[] = [],
    accepted = new Map<AttributeName, string>()
  for (const name of attributeNames) {
    const field = ATTRIBUTE_FIELDS[name],
      values = card.fields[name],
      allowed = allowedValues(name, lines),
      value = values[0]
    if (value === undefined || /\{\{|documentation:placeholder/.test(value) || value === '')
      findings.push({
        code: 'attribute-missing',
        clause: field,
        message: `「身份与责任」缺少${field}，或仍是占位。`,
      })
    else if (values.length > 1)
      findings.push({
        code: 'attribute-invalid',
        clause: field,
        message: `${field}出现 ${values.length} 次，须有且只有一项。`,
      })
    else if (!allowed.includes(value))
      findings.push({
        code: 'attribute-invalid',
        clause: field,
        message: `${field} ${value} 不在 ${allowed.join('、')} 中。`,
      })
    else accepted.set(name, value)
  }
  const line = accepted.get('line'),
    nature = natures.find(item => item === accepted.get('nature')),
    contractChange = contractChanges.find(item => item === accepted.get('contractChange'))
  if (line !== undefined) attributes.line = line
  if (nature !== undefined) attributes.nature = nature
  if (contractChange !== undefined) attributes.contractChange = contractChange
  return { attributes, findings }
}

const ALLOWED_CHANGES: Record<Nature, readonly ContractChange[]> = {
  design: ['none'],
  contract: ['none', 'additive'],
  impl: ['none', 'additive'],
  integration: contractChanges,
  baseline: ['none'],
}
function combinationFindings({ line, nature, contractChange }: Attributes): AttributeFinding[] {
  const findings: AttributeFinding[] = []
  if (line !== undefined && nature !== undefined) {
    const integration = line === INTEGRATION_LINE
    if ((nature === 'integration' || nature === 'baseline') && !integration)
      findings.push({
        code: 'attribute-invalid',
        clause: '合法组合:交付线',
        message: `性质 ${nature} 的卡交付线须为 integration，实为 ${line}。`,
      })
    if ((nature === 'contract' || nature === 'impl') && integration)
      findings.push({
        code: 'attribute-invalid',
        clause: '合法组合:交付线',
        message: `性质 ${nature} 的卡须属于一条线，交付线不能为 integration。`,
      })
  }
  if (
    nature !== undefined &&
    contractChange !== undefined &&
    !ALLOWED_CHANGES[nature].includes(contractChange)
  )
    findings.push({
      code: 'attribute-invalid',
      clause: '合法组合:契约变更',
      message: `性质 ${nature} 的契约变更只能取 ${ALLOWED_CHANGES[nature].join('、')}，实为 ${contractChange}。`,
    })
  return findings
}

function bindingFindings(
  binding: TaskBinding,
  card: CardAttributes,
  body: Attributes,
  lines: DeliveryLines,
): AttributeFinding[] {
  if (binding.schemaVersion === 1)
    return [
      {
        code: 'binding-v1',
        clause: 'binding',
        message:
          'binding 为版本 1，不含属性。taskBase 中的 dev-flow 能读版本 2 时，新 attempt 用版本 2。',
      },
    ]
  const findings: AttributeFinding[] = []
  if (!lineValues(lines).includes(binding.line))
    findings.push({
      code: 'attribute-invalid',
      clause: 'binding.line',
      message: `binding 的交付线 ${binding.line} 不在线归属表中，也不是 integration。`,
    })
  for (const name of attributeNames) {
    const written = body[name]
    if (written !== undefined && written !== binding[name])
      findings.push({
        code: 'attribute-binding-drift',
        clause: `binding.${name}`,
        message: `binding 的${ATTRIBUTE_FIELDS[name]}为 ${binding[name]}，正文为 ${written}。`,
      })
  }
  if (card.milestone !== undefined && card.milestone !== binding.milestone)
    findings.push({
      code: 'attribute-binding-drift',
      clause: 'binding.milestone',
      message: `binding 记录派发时的里程碑 ${binding.milestone ?? '无'}，Issue 现为 ${card.milestone ?? '无'}。`,
    })
  return findings
}

/** Write scope entries that count for ownership: task tmp is ignored by Git, shared is open. */
function ownedScope(binding: TaskBinding, lines: DeliveryLines): string[] {
  return binding.writeScope.filter(path => !isOpenScope(lines, path))
}
function routeFindings(
  binding: TaskBinding,
  { line, nature }: Attributes,
  lines: DeliveryLines,
  registry: Pick<Policy, 'tracks'>,
): AttributeFinding[] {
  if (line === undefined || nature === undefined) return []
  const findings: AttributeFinding[] = [],
    integration = line === INTEGRATION_LINE || nature === 'integration' || nature === 'baseline',
    expected = integration ? lines.integration.track : targetTrack(lines, line)
  if (!registry.tracks.some(track => track.id === expected))
    findings.push({
      code: 'nature-route-mismatch',
      clause: 'route.track',
      message: `本卡的目标轨道 ${expected} 未在 registry 登记。`,
    })
  else if (binding.route.track !== expected)
    findings.push({
      code: 'nature-route-mismatch',
      clause: 'route.track',
      message: `交付线 ${line}、性质 ${nature} 的卡应进入轨道 ${expected}，route 为 ${binding.route.track}。`,
    })
  if (line !== INTEGRATION_LINE) return findings
  const touched = [
    ...new Set(ownedScope(binding, lines).flatMap(path => [...scopeOwners(lines, path)])),
  ].filter(owner => owner !== INTEGRATION_LINE)
  const route = binding.route
  if (touched.length === 0) {
    if (route.kind !== 'track')
      findings.push({
        code: 'nature-route-mismatch',
        clause: 'route.kind',
        message: `只写联调轨道路径的卡 route 用 track，实为 ${route.kind}。`,
      })
    return findings
  }
  if (route.kind !== 'cross-track') {
    findings.push({
      code: 'nature-route-mismatch',
      clause: 'route.kind',
      message: `写入线 ${touched.join('、')} 路径的 integration 卡 route 用 cross-track，实为 ${route.kind}。`,
    })
    return findings
  }
  const missing = [
    ...new Set(
      touched
        .map(id => findLine(lines, id)?.owner)
        .filter((owner): owner is string => owner !== undefined && !route.owners.includes(owner)),
    ),
  ]
  if (missing.length > 0)
    findings.push({
      code: 'nature-route-mismatch',
      clause: 'route.owners',
      message: `route.owners 缺少受影响线的 owner ${missing.join('、')}。`,
    })
  return findings
}
function scopeFindings(
  binding: TaskBinding,
  { line, nature }: Attributes,
  lines: DeliveryLines,
): AttributeFinding[] {
  if (line === undefined || nature === undefined || nature === 'integration') return []
  const findings: AttributeFinding[] = []
  for (const path of ownedScope(binding, lines)) {
    if (nature === 'baseline') {
      findings.push({
        code: 'scope-outside-line',
        clause: path,
        message: `baseline 卡不写仓库，写范围含 ${path}。`,
      })
      continue
    }
    if (line === INTEGRATION_LINE) continue
    const owners = scopeOwners(lines, path),
      others = [...owners].filter(owner => owner !== line && owner !== INTEGRATION_LINE)
    if (others.length > 0)
      findings.push({
        code: 'scope-outside-line',
        clause: path,
        message: `写范围 ${path} 属于线 ${others.join('、')}，不在本线 ${line} 内。`,
      })
    else if (
      nature === 'contract' &&
      !(findLine(lines, line)?.contracts ?? []).some(contract => under(path, contract))
    )
      findings.push({
        code: 'scope-outside-line',
        clause: path,
        message: `contract 卡只写本线的契约成员，写范围 ${path} 不在其中。`,
      })
    if (owners.has(INTEGRATION_LINE))
      findings.push({
        code: 'scope-integration-path',
        clause: path,
        message: `写范围 ${path} 含联调轨道拥有的路径，线内的卡不能写。`,
      })
  }
  return findings
}
function conditionFindings(
  card: CardAttributes,
  conditionCards: readonly ConditionCard[],
  { line, nature }: Attributes,
  lines: DeliveryLines,
): AttributeFinding[] {
  if (nature === 'baseline')
    return card.conditions === '无'
      ? []
      : [
          {
            code: 'condition-cross-line',
            clause: '交付条件',
            message: 'baseline 卡没有交付条件，「交付条件」须为「无」。',
          },
        ]
  if (line === undefined || nature === undefined) return []
  if (line === INTEGRATION_LINE) return []
  return conditionCards.flatMap(({ condition, target, card }) => {
    const other = card === undefined ? undefined : judgeAttributes(card, lines).attributes.line
    return other === undefined || other === line || other === INTEGRATION_LINE
      ? []
      : [
          {
            code: 'condition-cross-line' as const,
            clause: condition,
            message: `线 ${line} 的卡引用线 ${other} 的卡 ${target}。依赖其他线的契约时写 capability 条件。`,
          },
        ]
  })
}
function labelFindings(card: CardAttributes, body: Attributes): AttributeFinding[] {
  return attributeNames.flatMap(name => {
    const value = body[name]
    if (value === undefined) return []
    const prefix = LABEL_PREFIXES[name],
      actual = card.labels.filter(label => label.startsWith(prefix)).sort(),
      expected = projectedLabels(name, value)
    return actual.join('\n') === expected.join('\n')
      ? []
      : [
          {
            code: 'label-drift' as const,
            clause: prefix,
            message: `${prefix} 标签应为 ${expected.join('、') || '无'}，实为 ${actual.join('、') || '无'}。`,
          },
        ]
  })
}

/**
 * Report-only findings about a card's attributes against docs/engineering/delivery.md
 * 「卡属性与合法组合」. The body is the attribute source. A binding adds route, scope and drift
 * checks. Callers report the findings and never refuse on them.
 */
export function attributeFindings(input: AttributeInput): AttributeFinding[] {
  const { binding, card, conditionCards, lines, registry } = input
  const judged = judgeAttributes(card, lines),
    body = judged.attributes
  const findings = [...judged.findings, ...combinationFindings(body)]
  if (card.milestone === null)
    findings.push({
      code: 'attribute-missing',
      clause: 'milestone',
      message: 'Issue 没有 milestone。调度者在 Issue 上设置卡所属的里程碑。',
    })
  if (binding !== undefined)
    findings.push(
      ...bindingFindings(binding, card, body, lines),
      ...routeFindings(binding, body, lines, registry),
      ...scopeFindings(binding, body, lines),
    )
  findings.push(
    ...conditionFindings(card, conditionCards, body, lines),
    ...labelFindings(card, body),
  )
  return findings
}
