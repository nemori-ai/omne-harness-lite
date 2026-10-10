import {
  bindCapture,
  conditionKinds,
  phases,
  workKinds,
  parseAliases,
  parseAssociations,
  InputError,
} from './protocol.ts'
import type {
  CardObservation,
  Condition,
  DeliveryCapture,
  DeliveryConfig,
  DeliveryReport,
  Finding,
} from './protocol.ts'

function fields(body: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s*-\s+([^：:]+)[：:]\s*(.*?)\s*$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined)
      result.set(match[1], [...(result.get(match[1]) ?? []), match[2]])
  }
  return result
}
function section(body: string, name: string): string | undefined {
  const lines = body.split(/\r?\n/),
    index = lines.findIndex(line => line.trim() === `## ${name}`)
  if (index < 0) return undefined
  const tail = lines.slice(index + 1),
    end = tail.findIndex(line => /^##\s/.test(line))
  return tail
    .slice(0, end < 0 ? tail.length : end)
    .join('\n')
    .trim()
}
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(cell => cell.trim().replace(/\\\|/g, '|'))
}
function revisionOf(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}
function unresolved(value: string): boolean {
  return /\{\{|documentation:placeholder/.test(value) || value.trim() === ''
}
function wholeResult(condition: Condition): boolean {
  return (
    !/不|非|无需|仅|部分|候选/.test(condition.predicate) &&
    /整项结果|整卡结果|完整交付结果|整项完成|全范围结果/.test(condition.predicate)
  )
}
function issueUrl(target: string): string | null {
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/.test(target)
    ? target
    : null
}
type Edge = { from: string; to: string; condition: string }
function cyclesOf(edges: Edge[]): DeliveryReport['graph']['cycles'] {
  const outgoing = new Map<string, Edge[]>()
  for (const edge of edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  const done = new Set<string>(),
    active: string[] = [],
    path: Edge[] = [],
    cycles: DeliveryReport['graph']['cycles'] = []
  function visit(node: string): void {
    if (done.has(node)) return
    active.push(node)
    for (const edge of outgoing.get(node) ?? []) {
      const index = active.indexOf(edge.to)
      if (index >= 0)
        cycles.push({
          phases: [...active.slice(index), edge.to],
          conditions: [...path.slice(index).map(e => e.condition), edge.condition].filter(
            id => id !== 'phase-order',
          ),
        })
      else {
        path.push(edge)
        visit(edge.to)
        path.pop()
      }
    }
    active.pop()
    done.add(node)
  }
  for (const node of outgoing.keys()) visit(node)
  return cycles
}
export function observeDelivery(
  config: DeliveryConfig,
  capture: DeliveryCapture,
  baseline?: DeliveryReport,
): DeliveryReport {
  bindCapture(config, capture)
  const findings = new Map<string, Finding>(),
    cards: CardObservation[] = [],
    edges: Edge[] = []
  function add(
    category: Finding['category'],
    code: string,
    object: string,
    clause: string,
    message: string,
    revision: number | null = null,
    source = object,
  ): void {
    const id = JSON.stringify([category, code, object, clause])
    findings.set(id, { id, category, code, object, clause, revision, source, message })
  }
  const issues = new Map(capture.issues.map(issue => [issue.url, issue]))
  if (!config.enabled)
    add(
      'unknown',
      'protocol-disabled',
      config.repository,
      'activation',
      '日常流程未启用。此报告不授予派发许可。',
    )
  for (const [name, status] of Object.entries(capture.collection))
    if ((name === 'issues' || name === 'project') && status !== 'complete')
      add(
        'unknown',
        'collection-incomplete',
        config.repository,
        name,
        `${name}读取为${String(status)}，空集合不证明不存在。`,
      )
  capture.collection.errors.forEach((error, index) =>
    add('unknown', 'collection-error', config.repository, `error-${index}`, error),
  )
  for (const issue of capture.issues) {
    if (issue.url === config.creationHandoffIssue) {
      add(
        'uncovered',
        'creation-handoff-not-work-card',
        issue.url,
        'handoff',
        '此Issue是配置指定的创建交接入口，不是业务交付卡。',
      )
      continue
    }
    const f = fields(issue.body),
      levelValue = f.get('交付层级')?.[0],
      revision = revisionOf(f.get('交付修订')?.[0])
    if (!isDeliveryCardBody(issue.body)) {
      add('uncovered', 'unsupported-issue', issue.url, 'protocol', '普通Issue不属于交付模板协议。')
      continue
    }
    const level = levelValue === 'delivery' || levelValue === 'subtask' ? levelValue : null
    const workKind = workKinds.find(kind => kind === f.get('主工作类型')?.[0]) ?? null
    const required = [
      '交付层级',
      '主工作类型',
      '交付修订',
      '创建操作标识',
      '卡负责人、主结果接受者及授权依据',
      '受影响语义拥有者',
      ...(level === 'subtask' ? ['父交付卡', '现行依据或获准问题'] : ['责任范围', '旧卡来源别名']),
    ]
    for (const name of required) {
      const values = f.get(name) ?? []
      if (values.length !== 1)
        add(
          'deviation',
          values.length === 0 ? 'field-missing' : 'field-duplicate',
          issue.url,
          name,
          `${name}必须有且只有一项。`,
          revision,
        )
      else if (unresolved(values[0] ?? ''))
        add('deviation', 'placeholder', issue.url, name, `${name}仍有占位或空值。`, revision)
    }
    if (level === null)
      add(
        'deviation',
        'invalid-level',
        issue.url,
        '交付层级',
        '交付层级须为delivery或subtask。',
        revision,
      )
    if (workKind === null)
      add(
        'deviation',
        'invalid-work-kind',
        issue.url,
        '主工作类型',
        '主工作类型不在六类采用范围内。',
        revision,
      )
    if (revision === null)
      add('deviation', 'invalid-revision', issue.url, '交付修订', '交付修订须为正整数。')
    if (unresolved(issue.body))
      add('deviation', 'placeholder', issue.url, 'body', '正文仍包含模板占位。', revision)
    const requiredSections =
      level === 'subtask'
        ? ['交付结果与范围', '持续成果与交接', '当前执行与交接', '决定']
        : [
            '问题、结果与范围',
            '依据与验收',
            '工作类型附加内容',
            '实施与持续成果交接',
            '决定与剩余责任',
          ]
    for (const name of requiredSections)
      if (section(issue.body, name) === undefined || section(issue.body, name) === '')
        add('deviation', 'section-missing', issue.url, name, `缺少非空${name}章节。`, revision)
    const parent = f.get('父交付卡')?.[0]
    if (level === 'subtask') {
      if (parent === undefined || issueUrl(parent) === null)
        add(
          'deviation',
          'parent-reference-invalid',
          issue.url,
          '父交付卡',
          '子任务必须引用真实父IssueURL。',
          revision,
        )
      else if (parent === issue.url)
        add(
          'deviation',
          'parent-self',
          issue.url,
          '父交付卡',
          '子任务不能成为自己的父卡。',
          revision,
        )
      else if (!issue.relationsComplete)
        add(
          'unknown',
          'parent-unverified',
          issue.url,
          '父交付卡',
          '平台父关系读取不全，无法对账。',
          revision,
        )
      else if (issue.parentIssue !== parent)
        add(
          'deviation',
          'parent-projection-conflict',
          issue.url,
          '父交付卡',
          '正文父卡与平台父关系不一致。',
          revision,
        )
    }
    const conditions: Condition[] = [],
      rawConditions = section(issue.body, '交付条件')
    if (rawConditions === undefined || rawConditions === '')
      add(
        'deviation',
        'conditions-missing',
        issue.url,
        '交付条件',
        '无条件须显式写无，缺章节不能视为无条件。',
        revision,
      )
    else if (rawConditions !== '无') {
      const rows = rawConditions
        .split(/\r?\n/)
        .filter(line => line.trim().startsWith('|'))
        .map(cells)
      const header = ['条件ID', '类型', '目标', '阶段', '所需结果与判据', '确认责任及证据入口']
      if (
        JSON.stringify(rows[0]) !== JSON.stringify(header) ||
        !rows[1]?.every(cell => /^:?-{3,}:?$/.test(cell))
      )
        add(
          'deviation',
          'conditions-table-invalid',
          issue.url,
          '交付条件',
          '交付条件须采用六列有限表头。',
          revision,
        )
      if (rows.length < 3)
        add(
          'deviation',
          'conditions-empty',
          issue.url,
          '交付条件',
          '表格没有条件行，无条件须写无。',
          revision,
        )
      const seen = new Set<string>()
      for (const [index, row] of (JSON.stringify(rows[0]) === JSON.stringify(header) &&
      rows[1]?.every(cell => /^:?-{3,}:?$/.test(cell))
        ? rows.slice(2)
        : []
      ).entries()) {
        const [id, kindValue, target, phaseValue, predicate, evidence] = row
        const kind = conditionKinds.find(kind => kind === kindValue),
          phase = phases.find(phase => phase === phaseValue)
        if (
          row.length !== 6 ||
          id === undefined ||
          !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(id) ||
          kind === undefined ||
          phase === undefined ||
          target === undefined ||
          predicate === undefined ||
          evidence === undefined ||
          row.some(unresolved)
        ) {
          add(
            'deviation',
            'condition-invalid',
            issue.url,
            id || `row-${index + 1}`,
            '条件行有缺项、占位或不支持的有限值。',
            revision,
          )
          continue
        }
        if (seen.has(id)) {
          add('deviation', 'condition-duplicate', issue.url, id, '条件ID重复。', revision)
          continue
        }
        seen.add(id)
        conditions.push({ id, kind, target, phase, predicate, evidence })
      }
      add(
        'unknown',
        'conditions-semantic-review',
        issue.url,
        '交付条件',
        '自然语言判据、确认权限和证据仍需具名责任核对。',
        revision,
      )
    }
    const declaredDecisions: CardObservation['declaredDecisions'] = []
    for (const comment of issue.comments) {
      const d = fields(comment.body),
        kind = d.get('决定')?.[0]
      if (kind === undefined) continue
      const object = d.get('对象与交付修订')?.[0] ?? '',
        match = /(?:revision\s*[:=]?\s*|修订\s*[:：]?\s*|\brev\s*)([1-9]\d*)/.exec(object)
      const decisionRevision = revisionOf(match?.[1]),
        decider = d.get('决定者、身份及权限依据')?.[0] ?? '',
        scope = d.get('范围')?.[0] ?? ''
      declaredDecisions.push({
        kind,
        revision: decisionRevision,
        source: comment.url,
        decider,
        scope,
      })
      if (!['accept', 'cancel', 'revoke', 'partial'].includes(kind))
        add(
          'deviation',
          'decision-kind-invalid',
          issue.url,
          comment.url,
          '决定种类不在采用范围内。',
          revision,
          comment.url,
        )
      if (decisionRevision !== revision || !object.includes(issue.url))
        add(
          'unknown',
          'decision-object-unconfirmed',
          issue.url,
          comment.url,
          '决定对象或修订与当前卡不能确认匹配。',
          revision,
          comment.url,
        )
      if (kind !== 'accept')
        add(
          'unknown',
          'decision-not-full-acceptance',
          issue.url,
          comment.url,
          '取消、撤销和部分认可不满足整项结果。',
          revision,
          comment.url,
        )
    }
    add(
      'unknown',
      issue.commentsComplete ? 'acceptance-requires-review' : 'acceptance-comments-incomplete',
      issue.url,
      'acceptance',
      '有效接受的权限、完整范围和撤销链不能由关闭、阶段或模板机械证明。',
      revision,
    )
    const product = observeProductFields(issue.body)
    for (const message of product.errors)
      add('deviation', 'product-field', issue.url, 'product', message, revision)
    cards.push({
      aliases: product.aliases,
      scenarios: product.scenarios,
      issue: issue.url,
      number: issue.number,
      revision,
      level,
      workKind,
      state: issue.state,
      stage: issue.stage,
      conditions,
      declaredDecisions,
      acceptance: 'unknown',
      dispatchPermission: 'not-provided',
      coverage: 'declared-requires-review',
      execution: 'requires-review',
    })
    edges.push(
      { from: `${issue.url}@integration`, to: `${issue.url}@start`, condition: 'phase-order' },
      { from: `${issue.url}@acceptance`, to: `${issue.url}@integration`, condition: 'phase-order' },
    )
  }
  const creations = new Map<string, string[]>()
  for (const card of cards) {
    const issue = issues.get(card.issue)
    if (issue === undefined) continue
    const creation = fields(issue.body).get('创建操作标识')?.[0]
    if (creation !== undefined && !unresolved(creation))
      creations.set(creation, [...(creations.get(creation) ?? []), card.issue])
    const projected = new Map<string, Condition[]>()
    for (const condition of card.conditions) {
      const target = issueUrl(condition.target)
      if (target === card.issue)
        add(
          'deviation',
          'condition-self',
          card.issue,
          condition.id,
          '硬条件不能自指。',
          card.revision,
        )
      if (condition.kind !== 'issue-result' || target === null || !wholeResult(condition)) {
        add(
          'unknown',
          'condition-target-unconfirmed',
          card.issue,
          condition.id,
          '外部前置或目标范围不能由已读数据确认。',
          card.revision,
        )
        continue
      }
      if (condition.phase === 'start')
        projected.set(target, [...(projected.get(target) ?? []), condition])
      if (cards.some(candidate => candidate.issue === target))
        edges.push({
          from: `${card.issue}@${condition.phase}`,
          to: `${target}@acceptance`,
          condition: `${card.issue}#${condition.id}`,
        })
      else
        add(
          'unknown',
          'condition-target-uncovered',
          card.issue,
          condition.id,
          '目标卡未进入已支持观察范围，等待链未覆盖。',
          card.revision,
        )
    }
    if (!issue.relationsComplete)
      add(
        'unknown',
        'native-relations-incomplete',
        card.issue,
        'blockedBy',
        '原生关系读取不全，不能确认投影漏边或悬空。',
        card.revision,
      )
    for (const target of issue.blockedBy) {
      if (!projected.has(target))
        add(
          'deviation',
          'native-edge-unexplained',
          card.issue,
          target,
          '原生blockedBy没有明确整项结果的start条件解释。',
          card.revision,
        )
      if (!issues.has(target)) {
        const sameRepo = target.startsWith(`https://github.com/${config.repository}/issues/`)
        add(
          sameRepo && capture.collection.issues === 'complete' && issue.relationsComplete
            ? 'deviation'
            : 'unknown',
          sameRepo && capture.collection.issues === 'complete' && issue.relationsComplete
            ? 'native-target-dangling'
            : 'native-target-uncovered',
          card.issue,
          target,
          '原生依赖目标未在读取范围内。',
          card.revision,
        )
      }
    }
    for (const [target, conditions] of projected) {
      if (!issues.has(target)) {
        add(
          target.startsWith(`https://github.com/${config.repository}/issues/`) &&
            capture.collection.issues === 'complete' &&
            issue.relationsComplete
            ? 'deviation'
            : 'unknown',
          capture.collection.issues === 'complete' &&
            issue.relationsComplete &&
            target.startsWith(`https://github.com/${config.repository}/issues/`)
            ? 'condition-target-dangling'
            : 'projection-target-uncovered',
          card.issue,
          target,
          '可投影条件目标不在已读范围内。',
          card.revision,
        )
      } else if (issue.relationsComplete && !issue.blockedBy.includes(target))
        for (const condition of conditions)
          add(
            'deviation',
            'native-edge-missing',
            card.issue,
            condition.id,
            '明确整项结果的start条件缺少原生blockedBy投影。',
            card.revision,
          )
    }
  }
  for (const [creation, urls] of creations)
    if (urls.length > 1)
      for (const url of urls)
        add(
          'deviation',
          'creation-id-duplicate',
          url,
          '创建操作标识',
          `创建操作标识重复使用于${urls.join(', ')}。`,
          cards.find(c => c.issue === url)?.revision ?? null,
        )
  const cycles = cyclesOf(edges)
  for (const cycle of cycles)
    add(
      'deviation',
      'phase-cycle',
      config.repository,
      [...cycle.conditions].sort().join('|'),
      `已知子图有循环等待${cycle.phases.join(' -> ')}。`,
    )
  const result = [...findings.values()].sort((a, b) => a.id.localeCompare(b.id))
  const currentIds = new Set(result.map(f => f.id)),
    oldIds = new Set(baseline?.findings.map(f => f.id) ?? [])
  const comparable =
    baseline !== undefined &&
    baseline.repository === config.repository &&
    baseline.projectId === config.project.id &&
    baseline.protocolVersion === config.protocolVersion &&
    baseline.scope === 'all-repository-issues' &&
    baseline.schemaVersion === 2
  const missingOld = [...oldIds].filter(id => !currentIds.has(id))
  const complete =
    capture.collection.errors.length === 0 &&
    capture.collection.issues === 'complete' &&
    capture.collection.project === 'complete' &&
    capture.issues.every(i => i.commentsComplete && i.relationsComplete)
  return {
    schemaVersion: 2,
    kind: 'github-delivery-report',
    protocolVersion: 1,
    repository: config.repository,
    projectId: config.project.id,
    enabled: config.enabled,
    startedAt: capture.startedAt,
    finishedAt: capture.finishedAt,
    scope: 'all-repository-issues',
    completeness: capture.collection,
    cards,
    findings: result,
    graph: { completeness: 'known-subgraph-only', cycles },
    stock: {
      deviation: result.filter(f => f.category === 'deviation').length,
      unknown: result.filter(f => f.category === 'unknown').length,
      uncovered: result.filter(f => f.category === 'uncovered').length,
    },
    delta: {
      introduced:
        baseline === undefined || comparable ? [...currentIds].filter(id => !oldIds.has(id)) : [],
      remaining: comparable ? [...currentIds].filter(id => oldIds.has(id)) : [],
      resolved: comparable && complete ? missingOld : [],
      notComparable:
        baseline === undefined
          ? []
          : comparable && complete
            ? []
            : [...new Set([...(!comparable ? [...currentIds] : []), ...missingOld])],
    },
  }
}

export function observeProductFields(body: string): {
  aliases: import('./protocol.ts').LegacyAlias[]
  scenarios: import('./protocol.ts').ProductAssociation[]
  title: string
  revision: number | null
  errors: string[]
} {
  const f = fields(body),
    errors: string[] = []
  function values(name: string): string[] {
    const rows = f.get(name) ?? []
    if (rows.length > 1) errors.push(`${name}重复`)
    const row = rows[0]
    return row === undefined || row === '无' ? [] : row.split(/[,，]/).map(v => v.trim())
  }
  let aliases: import('./protocol.ts').LegacyAlias[] = [],
    scenarios: import('./protocol.ts').ProductAssociation[] = []
  try {
    aliases = parseAliases(
      values('旧卡来源别名').map(value => {
        const m = /^(ST-\d{3}-\d{2})@([1-9]\d*)$/.exec(value)
        if (m === null) throw new InputError('旧卡来源别名须为 ST-NNN-NN@原产品修订')
        return { id: m[1], productRevision: Number(m[2]) }
      }),
    )
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  try {
    scenarios = parseAssociations(
      values('产品关联').map(value => {
        const m = /^(PF-\d{3})\s+([A-Z]{1,3}\d{1,3}[a-z]?)$/.exec(value)
        if (m === null) throw new InputError('产品关联须为 PF-NNN 场景号')
        return { topic: m[1], id: m[2] }
      }),
    )
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  return {
    aliases,
    scenarios,
    title:
      f.get('标题')?.[0] ??
      body
        .split('\n')
        .find(line => /^# /.test(line))
        ?.slice(2) ??
      '',
    revision: revisionOf(f.get('交付修订')?.[0]),
    errors,
  }
}

export function isDeliveryCardBody(body: string): boolean {
  return fields(body).has('交付层级') || body.includes('交付修订')
}
