import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
  mkdirSync,
  symlinkSync,
  linkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { observeDelivery } from '../src/delivery/observe.ts'
import {
  bindCapture,
  parseBaseline,
  parseCapture,
  parseConfig,
  workKinds,
} from '../src/delivery/protocol.ts'
import type {
  CapturedIssue,
  Condition,
  DeliveryCapture,
  DeliveryConfig,
} from '../src/delivery/protocol.ts'

const at = '2026-10-10T00:00:00Z'
export function config(): DeliveryConfig {
  return {
    schemaVersion: 1,
    kind: 'github-delivery-config',
    protocolVersion: 1,
    enabled: false,
    repository: 'owner/repo',
    mode: 'manual-single-dispatcher',
    project: {
      owner: 'owner',
      number: 4,
      id: 'project-4',
      url: 'https://github.com/orgs/owner/projects/4',
      fields: { stage: 'stage-field', priority: 'priority-field', iteration: 'iteration-field' },
    },
    creationHandoffIssue: null,
    writers: { stage: null, body: null },
  }
}
export function body(
  number: number,
  kind = 'feature',
  conditions: Condition[] = [],
  level = 'delivery',
): string {
  return [
    '- 交付层级：' + level,
    '- 主工作类型：' + kind,
    '- 交付修订：1',
    '- 创建操作标识：create-' + number,
    '- 卡负责人、主结果接受者及授权依据：负责人及具名授权',
    '- 受影响语义拥有者：无',
    ...(level === 'subtask'
      ? [
          '- 父交付卡：https://github.com/owner/repo/issues/1',
          '- 现行依据或获准问题：成员SPEC abc123',
        ]
      : ['- 责任范围：工具维护，不需要PF', '- 旧卡来源别名：无']),
    ...(level === 'subtask'
      ? [
          '## 交付结果与范围\n可验证结果。',
          '## 持续成果与交接\n工具拥有。',
          '## 当前执行与交接\n未派发。',
          '## 决定\n未决定。',
        ]
      : [
          '## 问题、结果与范围\n修复具体问题。',
          '## 依据与验收\n成员SPEC，abc123，实际方法。',
          '## 工作类型附加内容\n实际基线、范围和相称方法。',
          '## 实施与持续成果交接\n工具拥有，不含PF。',
          '## 决定与剩余责任\n未决定。',
        ]),
    '## 交付条件',
    conditions.length === 0
      ? '无'
      : '| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 |\n| --- | --- | --- | --- | --- | --- |\n' +
        conditions
          .map(
            c =>
              `| ${c.id} | ${c.kind} | ${c.target} | ${c.phase} | ${c.predicate} | ${c.evidence} |`,
          )
          .join('\n'),
  ].join('\n')
}
export function issue(number: number, patch: Partial<CapturedIssue> = {}): CapturedIssue {
  return {
    number,
    url: `https://github.com/owner/repo/issues/${number}`,
    id: `issue-${number}`,
    state: 'open',
    updatedAt: at,
    body: body(number),
    labels: [],
    comments: [],
    commentsComplete: true,
    relationsComplete: true,
    blockedBy: [],
    parentIssue: null,
    stage: null,
    ...patch,
  }
}
export function capture(
  issues: CapturedIssue[] = [],
  patch: Partial<DeliveryCapture> = {},
): DeliveryCapture {
  return {
    schemaVersion: 1,
    kind: 'github-delivery-capture',
    repository: 'owner/repo',
    projectId: 'project-4',
    protocolVersion: 1,
    startedAt: at,
    finishedAt: at,
    collection: { issues: 'complete', project: 'complete', errors: [] },
    issues,
    ...patch,
  }
}
function dependency(id: string, target: number, phase: Condition['phase'] = 'start'): Condition {
  return {
    id,
    kind: 'issue-result',
    target: `https://github.com/owner/repo/issues/${target}`,
    phase,
    predicate: '目标整项结果已被接受',
    evidence: '具名责任，实际决定入口',
  }
}
function codes(issues: CapturedIssue[], patch: Partial<DeliveryCapture> = {}): string[] {
  return observeDelivery(config(), capture(issues, patch)).findings.map(f => f.code)
}

describe('delivery input boundary', () => {
  it('rejects nonexistent calendar dates and invalid times', () => {
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2026-02-31T00:00:00Z', finishedAt: '2026-03-04T00:00:00Z' }),
      ),
    ).toThrow(/calendar/)
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2026-10-10T24:00:00Z', finishedAt: '2026-10-11T00:00:00Z' }),
      ),
    ).toThrow(/calendar/)
    expect(() =>
      parseCapture(
        capture([], { startedAt: '2024-02-29T00:00:00Z', finishedAt: '2024-02-29T00:00:00Z' }),
      ),
    ).not.toThrow()
  })

  it('rejects configured repository traversal before any network read', () => {
    expect(() => parseConfig({ ...config(), repository: '../repo' })).toThrow()
    expect(() => parseConfig({ ...config(), repository: 'owner/..' })).toThrow()
  })

  it('parses explicit config/capture and ignores extra readiness claims', () => {
    const c = parseConfig({ ...config(), ready: true }),
      raw = parseCapture({ ...capture([issue(1)]), allReady: true })
    expect(observeDelivery(c, raw).cards[0]?.dispatchPermission).toBe('not-provided')
  })
  it.each(['repository', 'projectId', 'protocolVersion'])(
    'rejects cross-input %s identities',
    field => {
      const raw = { ...capture(), [field]: field === 'protocolVersion' ? 2 : 'other' }
      if (field === 'protocolVersion') expect(() => parseCapture(raw)).toThrow()
      else expect(() => bindCapture(config(), parseCapture(raw))).toThrow(/match exactly/)
    },
  )
  it('rejects both null/real Project mismatches', () => {
    expect(() => bindCapture(config(), capture([], { projectId: null }))).toThrow()
    const c = config()
    c.project.id = null
    expect(() => bindCapture(c, capture())).toThrow()
    expect(() => bindCapture(c, capture([], { projectId: null }))).not.toThrow()
  })
  it('rejects Issue URL/number/repository disagreement and missing completeness', () => {
    expect(() =>
      parseCapture(capture([issue(1, { url: 'https://github.com/other/repo/issues/1' })])),
    ).toThrow(/match repository/)
    expect(() => parseCapture({ ...capture(), collection: { issues: 'complete' } })).toThrow()
    expect(() => parseCapture(capture([issue(1), issue(1)]))).toThrow(/duplicate/)
  })
  it('rejects malformed and unsupported baseline', () => {
    expect(() => parseBaseline({})).toThrow()
    const report = observeDelivery(config(), capture([issue(1)]))
    expect(() => parseBaseline({ ...report, schemaVersion: 3 })).toThrow()
    expect(() => parseBaseline({ ...report, stock: { ...report.stock, unknown: 100 } })).toThrow(
      /stock/,
    )
    expect(parseBaseline(JSON.parse(JSON.stringify(report))).findings).toEqual(report.findings)
  })
})
describe('delivery observations', () => {
  it.each(workKinds)('supports %s without forcing a PF', kind => {
    const r = observeDelivery(config(), capture([issue(1, { body: body(1, kind) })]))
    expect(r.cards[0]?.workKind).toBe(kind)
    expect(r.findings.filter(f => f.category === 'deviation')).toEqual([])
  })
  it('observes a child relation without creating a hard parent wait', () => {
    const r = observeDelivery(
      config(),
      capture([
        issue(1),
        issue(2, {
          body: body(2, 'refactor', [], 'subtask'),
          parentIssue: 'https://github.com/owner/repo/issues/1',
        }),
      ]),
    )
    expect(r.cards[1]?.level).toBe('subtask')
    expect(r.graph.cycles).toEqual([])
    expect(r.findings.filter(f => f.category === 'deviation')).toEqual([])
  })
  it('detects missing, duplicate fields, placeholders and malformed kinds/revisions', () => {
    const b =
      body(1)
        .replace('- 主工作类型：feature', '- 主工作类型：what')
        .replace('- 交付修订：1', '- 交付修订：0')
        .replace('- 创建操作标识：create-1', '- 创建操作标识：{{创建}}')
        .replace('- 责任范围：工具维护，不需要PF', '') + '\n- 交付层级：delivery'
    expect(codes([issue(1, { body: b })])).toEqual(
      expect.arrayContaining([
        'field-duplicate',
        'field-missing',
        'placeholder',
        'invalid-work-kind',
        'invalid-revision',
      ]),
    )
  })
  it('reports ordinary Issues and the configured bootstrap separately', () => {
    const c = config()
    c.creationHandoffIssue = issue(1).url
    const r = observeDelivery(
      c,
      capture([
        issue(1, { body: 'creation locator only' }),
        issue(2, { body: 'ordinary bug question' }),
      ]),
    )
    expect(r.cards).toEqual([])
    expect(r.findings.map(f => f.code)).toEqual(
      expect.arrayContaining(['creation-handoff-not-work-card', 'unsupported-issue']),
    )
    expect(r.stock.uncovered).toBe(2)
  })
  it('does not equate closed, Accepted, declarations or green CI with effective acceptance', () => {
    const comment = {
      url: issue(1).url + '#issuecomment-1',
      author: 'writer',
      body: '- 决定：accept\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 1\n- 决定者、身份及权限依据：具名人\n- 范围：完整结果\n- 成果与证据：CI green',
      updatedAt: at,
    }
    const r = observeDelivery(
      config(),
      capture([issue(1, { state: 'closed', stage: 'Accepted', comments: [comment] })]),
    )
    expect(r.cards[0]?.declaredDecisions[0]?.revision).toBe(1)
    expect(r.cards[0]?.acceptance).toBe('unknown')
    expect(r.cards[0]?.dispatchPermission).toBe('not-provided')
  })
  it.each(['partial', 'cancel', 'revoke'])('does not use %s as a full result', kind => {
    expect(
      codes([
        issue(1, {
          comments: [
            {
              url: 'https://github.com/owner/repo/issues/1#issuecomment-2',
              author: 'writer',
              body: `- 决定：${kind}\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 2`,
              updatedAt: at,
            },
          ],
        }),
      ]),
    ).toContain('decision-not-full-acceptance')
    expect(
      codes([
        issue(1, {
          comments: [
            {
              url: 'x',
              author: 'writer',
              body: `- 决定：${kind}\n- 对象与交付修订：https://github.com/owner/repo/issues/1 revision 2`,
              updatedAt: at,
            },
          ],
        }),
      ]),
    ).toContain('decision-object-unconfirmed')
  })
  it('keeps absent comments and unknown collection as unknown', () => {
    expect(codes([issue(1, { commentsComplete: false })])).toContain(
      'acceptance-comments-incomplete',
    )
    const r = observeDelivery(
      config(),
      capture([], {
        collection: { issues: 'unknown', project: 'unknown', errors: ['permissions unavailable'] },
      }),
    )
    expect(r.stock.unknown).toBeGreaterThan(0)
    expect(r.cards).toEqual([])
  })
  it('requires explicit no-conditions and detects duplicate IDs and escaped table cells', () => {
    const d = dependency('D-01', 2)
    expect(codes([issue(1, { body: body(1).replace('## 交付条件\n无', '') })])).toContain(
      'conditions-missing',
    )
    expect(codes([issue(1, { body: body(1, 'feature', [d, d]) }), issue(2)])).toContain(
      'condition-duplicate',
    )
    const r = observeDelivery(
      config(),
      capture([
        issue(1, {
          body: body(1, 'feature', [{ ...d, evidence: '负责人\\|实际入口' }]),
          blockedBy: [issue(2).url],
        }),
        issue(2),
      ]),
    )
    expect(r.cards[0]?.conditions[0]?.evidence).toBe('负责人|实际入口')
  })
  it('reports external sources, ambiguity and malformed conditions without guessing satisfaction', () => {
    const external: Condition = {
      id: 'D-01',
      kind: 'adopted-source',
      target: 'SPEC clause',
      phase: 'integration',
      predicate: '具名接受',
      evidence: 'source',
    }
    expect(codes([issue(1, { body: body(1, 'feature', [external]) })])).toContain(
      'condition-target-unconfirmed',
    )
    expect(
      codes([
        issue(1, {
          body: body(1, 'feature', [{ ...dependency('D-01', 2), predicate: '某部分就绪' }]),
        }),
      ]),
    ).toContain('condition-target-unconfirmed')
    expect(
      codes([
        issue(1, { body: body(1, 'feature', [external]).replace('adopted-source', 'arbitrary') }),
      ]),
    ).toContain('condition-invalid')
  })
  it('detects hidden full-phase cycles even when other sources are unknown', () => {
    const a = issue(1, {
      body: body(1, 'feature', [dependency('D-01', 2)]),
      blockedBy: [issue(2).url],
    })
    const b = issue(2, { body: body(2, 'feature', [dependency('D-02', 1, 'integration')]) })
    const r = observeDelivery(
      config(),
      capture([a, b], { collection: { issues: 'partial', project: 'unknown', errors: [] } }),
    )
    expect(r.graph.cycles[0]?.phases.some(p => p.endsWith('@acceptance'))).toBe(true)
    expect(r.graph.cycles[0]?.conditions).toEqual(
      expect.arrayContaining([a.url + '#D-01', b.url + '#D-02']),
    )
    expect(r.findings.some(f => f.code === 'phase-cycle')).toBe(true)
  })
  it('detects hard self-dependency', () => {
    expect(codes([issue(1, { body: body(1, 'feature', [dependency('D-01', 1)]) })])).toContain(
      'condition-self',
    )
  })
})
describe('native dependency projection', () => {
  it('does not treat a negated whole-result phrase as a projectable condition', () => {
    const condition = { ...dependency('D-01', 2), predicate: '不需要整项结果，仅核子结果' }
    const result = codes([issue(1, { body: body(1, 'feature', [condition]) }), issue(2)])
    expect(result).toContain('condition-target-unconfirmed')
    expect(result).not.toContain('native-edge-missing')
  })

  it('reports unexplained observed edges even if other relations are partial', () => {
    expect(
      codes([issue(1, { blockedBy: [issue(2).url], relationsComplete: false }), issue(2)]),
    ).toContain('native-edge-unexplained')
  })
  it('reports definite missing start whole-result edges', () => {
    expect(
      codes([issue(1, { body: body(1, 'feature', [dependency('D-01', 2)]) }), issue(2)]),
    ).toContain('native-edge-missing')
  })
  it('does not project integration or partial-result conditions', () => {
    expect(
      codes([
        issue(1, { body: body(1, 'feature', [dependency('D-01', 2, 'integration')]) }),
        issue(2),
      ]),
    ).not.toContain('native-edge-missing')
  })
  it('reports complete in-scope dangling targets but keeps incomplete/outside unknown', () => {
    expect(codes([issue(1, { blockedBy: [issue(9).url] })])).toContain('native-target-dangling')
    expect(
      codes([issue(1, { blockedBy: [issue(9).url], relationsComplete: false })]),
    ).not.toContain('native-target-dangling')
    expect(codes([issue(1, { blockedBy: ['https://github.com/other/repo/issues/1'] })])).toContain(
      'native-target-uncovered',
    )
  })
  it('does not report missing edges from incomplete relations', () => {
    const result = codes([
      issue(1, { body: body(1, 'feature', [dependency('D-01', 2)]), relationsComplete: false }),
      issue(2),
    ])
    expect(result).not.toContain('native-edge-missing')
    expect(result).toContain('native-relations-incomplete')
  })
})
describe('stock and comparable delta', () => {
  it('keeps identity stable across card revisions and records resolved structural findings', () => {
    const old = observeDelivery(
      config(),
      capture([issue(1, { body: body(1).replace('- 责任范围：工具维护，不需要PF', '') })]),
    )
    const next = observeDelivery(
      config(),
      capture([issue(1, { body: body(1).replace('- 交付修订：1', '- 交付修订：2') })]),
      parseBaseline(old),
    )
    expect(next.delta.remaining.some(id => id.includes('acceptance-requires-review'))).toBe(true)
    expect(next.delta.resolved.some(id => id.includes('field-missing'))).toBe(true)
  })
  it('does not resolve missing old findings from partial capture', () => {
    const old = observeDelivery(config(), capture([issue(1)]))
    const next = observeDelivery(
      config(),
      capture([], { collection: { issues: 'partial', project: 'complete', errors: [] } }),
      old,
    )
    expect(next.delta.resolved).toEqual([])
    expect(next.delta.notComparable.length).toBeGreaterThan(0)
  })
  it('does not count a Project identity change as improvement', () => {
    const old = observeDelivery(config(), capture([issue(1)]))
    const c = config()
    c.project.id = null
    const next = observeDelivery(c, capture([issue(1)], { projectId: null }), old)
    expect(next.delta.resolved).toEqual([])
    expect(next.delta.introduced).toEqual([])
    expect(next.delta.notComparable.length).toBeGreaterThan(0)
  })
})

describe('actual offline CLI', () => {
  it.each(['chain', 'reverse', 'two-chains', 'directory-parent'])(
    'rejects %s dangling output aliases with real target identities',
    mode => {
      const dir = mkdtempSync(join(tmpdir(), 'delivery-chain-'))
      try {
        const cfg = join(dir, 'config.json'),
          missing = join(dir, 'missing.json'),
          first = join(dir, 'first.json'),
          second = join(dir, 'second.json')
        writeFileSync(cfg, JSON.stringify(config()))
        const gh = join(dir, 'gh')
        writeFileSync(gh, '#!/usr/bin/env node\nprocess.stdout.write("[]")\n')
        chmodSync(gh, 0o755)
        let saved = missing,
          reported = first
        if (mode === 'directory-parent') {
          mkdirSync(join(dir, 'physical'))
          mkdirSync(join(dir, 'physical', 'child'))
          symlinkSync('physical/child', join(dir, 'parent-link'))
          saved = join(dir, 'physical', 'missing.json')
          symlinkSync('parent-link/../missing.json', first)
        } else {
          symlinkSync('missing.json', second)
          symlinkSync('second.json', first)
          if (mode === 'reverse') {
            saved = first
            reported = missing
          }
          if (mode === 'two-chains') {
            const third = join(dir, 'third.json')
            symlinkSync('missing.json', third)
            saved = first
            reported = third
          }
        }
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--live',
            '--save-capture',
            saved,
            '--report',
            reported,
          ],
          { encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH } },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('overwrite')
        expect(existsSync(saved)).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
  it.each(['cycle', 'long-chain'])(
    'rejects %s output symlink resolution before any write',
    mode => {
      const dir = mkdtempSync(join(tmpdir(), 'delivery-cycle-'))
      try {
        const cfg = join(dir, 'config.json'),
          cap = join(dir, 'capture.json'),
          output = join(dir, 'link-0')
        writeFileSync(cfg, JSON.stringify(config()))
        writeFileSync(cap, JSON.stringify(capture([issue(1)])))
        const length = mode === 'cycle' ? 2 : 45
        for (let index = 0; index < length; index += 1)
          symlinkSync(
            index + 1 === length
              ? mode === 'cycle'
                ? 'link-0'
                : 'missing.json'
              : `link-${index + 1}`,
            join(dir, `link-${index}`),
          )
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--capture',
            cap,
            '--report',
            output,
          ],
          { encoding: 'utf8' },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('cyclic or too long')
        expect(existsSync(join(dir, 'missing.json'))).toBe(false)
        expect(parseCapture(JSON.parse(readFileSync(cap, 'utf8'))).issues).toHaveLength(1)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
  it('allows distinct dangling output targets without replacing capture data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-distinct-'))
    try {
      const cfg = join(dir, 'config.json'),
        saved = join(dir, 'capture.json'),
        reported = join(dir, 'report.json'),
        alias = join(dir, 'report-link.json')
      writeFileSync(cfg, JSON.stringify(config()))
      symlinkSync('report.json', alias)
      const gh = join(dir, 'gh')
      writeFileSync(gh, '#!/usr/bin/env node\nprocess.stdout.write("[]")\n')
      chmodSync(gh, 0o755)
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          resolve('src/delivery/cli.ts'),
          '--config',
          cfg,
          '--live',
          '--save-capture',
          saved,
          '--report',
          alias,
        ],
        { encoding: 'utf8', env: { ...process.env, PATH: dir + ':' + process.env.PATH } },
      )
      expect(result.status).toBe(0)
      expect(parseCapture(JSON.parse(readFileSync(saved, 'utf8'))).kind).toBe(
        'github-delivery-capture',
      )
      expect(parseBaseline(JSON.parse(readFileSync(reported, 'utf8'))).kind).toBe(
        'github-delivery-report',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects dangling output aliases before live reads or writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-dangling-'))
    try {
      const cfg = join(dir, 'config.json'),
        missing = join(dir, 'missing.json'),
        alias = join(dir, 'alias.json'),
        marker = join(dir, 'gh-called')
      writeFileSync(cfg, JSON.stringify(config()))
      symlinkSync(missing, alias)
      const gh = join(dir, 'gh')
      writeFileSync(
        gh,
        '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.DELIVERY_READ_MARKER, "read\\n"); process.stdout.write("[]")\n',
      )
      chmodSync(gh, 0o755)
      const result = spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          resolve('src/delivery/cli.ts'),
          '--config',
          cfg,
          '--live',
          '--save-capture',
          missing,
          '--report',
          alias,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, PATH: dir + ':' + process.env.PATH, DELIVERY_READ_MARKER: marker },
        },
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('overwrite')
      expect(existsSync(missing)).toBe(false)
      expect(existsSync(marker)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects symlink and hardlink output aliases of input files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-alias-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        alias = join(dir, 'alias.json'),
        hard = join(dir, 'hard.json')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([issue(1)])))
      symlinkSync(cfg, alias)
      linkSync(cap, hard)
      for (const out of [alias, hard]) {
        const result = spawnSync(
          process.execPath,
          [
            '--experimental-strip-types',
            resolve('src/delivery/cli.ts'),
            '--config',
            cfg,
            '--capture',
            cap,
            '--report',
            out,
          ],
          { encoding: 'utf8' },
        )
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('overwrite')
      }
      expect(parseConfig(JSON.parse(readFileSync(cfg, 'utf8')))).toEqual(config())
      expect(parseCapture(JSON.parse(readFileSync(cap, 'utf8'))).issues).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('produces a comparable report and exits zero with unknowns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-cli-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        report = join(dir, 'report.json')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([issue(1)])))
      const cli = resolve('src/delivery/cli.ts')
      execFileSync(process.execPath, [
        '--experimental-strip-types',
        cli,
        '--config',
        cfg,
        '--capture',
        cap,
        '--report',
        report,
      ])
      const first = parseBaseline(JSON.parse(readFileSync(report, 'utf8')))
      expect(first.stock.unknown).toBeGreaterThan(0)
      const next = execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          cli,
          '--config',
          cfg,
          '--capture',
          cap,
          '--baseline',
          report,
        ],
        { encoding: 'utf8' },
      )
      expect(parseBaseline(JSON.parse(next)).delta.remaining.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('rejects invalid/mismatched input without writing an empty report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delivery-cli-'))
    try {
      const cfg = join(dir, 'config.json'),
        cap = join(dir, 'capture.json'),
        out = join(dir, 'must-not-exist.json'),
        cli = resolve('src/delivery/cli.ts')
      writeFileSync(cfg, JSON.stringify(config()))
      writeFileSync(cap, JSON.stringify(capture([], { projectId: null })))
      const child = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--report', out],
        { encoding: 'utf8' },
      )
      expect(child.status).toBe(2)
      expect(child.stdout).toBe('')
      expect(child.stderr).toContain('match exactly')
      expect(existsSync(out)).toBe(false)
      const conflict = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--live'],
        { encoding: 'utf8' },
      )
      expect(conflict.status).toBe(2)
      const overwrite = spawnSync(
        process.execPath,
        ['--experimental-strip-types', cli, '--config', cfg, '--capture', cap, '--report', cfg],
        { encoding: 'utf8' },
      )
      expect(overwrite.status).toBe(2)
      expect(overwrite.stderr).toContain('overwrite')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('delivery product fields and historical reports', () => {
  it('reads schema 1 baseline without inventing new fields and never resolves across schemas', () => {
    const report = observeDelivery(config(), capture([issue(1)]))
    const old = parseBaseline({
      ...report,
      schemaVersion: 1,
      cards: report.cards.map(({ aliases, scenarios, ...card }) => card),
    })
    expect(old.cards[0]?.aliases).toBeUndefined()
    const next = observeDelivery(config(), capture([]), old)
    expect(next.schemaVersion).toBe(2)
    expect(next.delta.resolved).toEqual([])
    expect(next.delta.notComparable.length).toBeGreaterThan(0)
  })
  it('parses product revision aliases independently of delivery revision', () => {
    const i = issue(1)
    i.body =
      i.body.replace('旧卡来源别名：无', '旧卡来源别名：ST-016-01@7') +
      '\n- 产品关联：PF-016 A01, PF-017 B02'
    const result = observeDelivery(config(), capture([i]))
    expect(result.cards[0]?.aliases).toEqual([{ id: 'ST-016-01', productRevision: 7 }])
    expect(result.cards[0]?.scenarios).toEqual([
      { topic: 'PF-016', id: 'A01' },
      { topic: 'PF-017', id: 'B02' },
    ])
    expect(result.cards[0]?.revision).toBe(1)
  })
})
