// 从实际源码生成 Skill 与 MCP 的实现技术文档。
// 用法（父工作树根）：node tmp/skill-mcp-domain/techdoc/gen.mjs
// 事实只来自 packages/{skills,mcp}/* 的 package.json、src、tests；设计正文不进入事实。
// 手写的健康评述在 techdoc/review/<领域>.html，原样插入。

import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
const require = createRequire(import.meta.url)
const ts = require(path.join(root, 'node_modules/.pnpm/typescript@6.0.3/node_modules/typescript'))
const here = path.join(root, 'tmp/skill-mcp-domain/techdoc')

const probe = process.argv[2] // 可选：探测用的组目录（相对仓库根），只生成 probe.html
const DOMAINS = probe ? [{ id: 'probe', title: '探测', group: probe, label: 'probe' }] : [
  { id: 'skill', title: 'Skill 实现技术文档', group: 'packages/skills', label: 'Skill' },
  { id: 'mcp', title: 'MCP 实现技术文档', group: 'packages/mcp', label: 'MCP' },
]

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const mm = s => String(s).replace(/[<>{}"`]/g, '').replace(/[|]/g, '/')
const nonBlank = text => text.split('\n').filter(l => l.trim() !== '').length
const walkFiles = (dir, keep) => {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkFiles(p, keep))
    else if (keep(p)) out.push(p)
  }
  return out.sort()
}

function unwrap(node) {
  // Readonly<{...}> 与括号只是外壳
  while (node && (ts.isParenthesizedTypeNode(node) || (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Readonly' && node.typeArguments?.length === 1))) {
    node = ts.isParenthesizedTypeNode(node) ? node.type : node.typeArguments[0]
  }
  return node
}

function typeRefs(node, acc = new Set()) {
  if (!node) return acc
  if (ts.isTypeReferenceNode(node)) acc.add(node.typeName.getText().split('.').pop())
  if (ts.isExpressionWithTypeArguments(node)) acc.add(node.expression.getText())
  ts.forEachChild(node, c => { typeRefs(c, acc) })
  return acc
}

function fieldsOf(lit) {
  return lit.members.filter(m => m.name).map(m => {
    const name = m.name.getText()
    const opt = m.questionToken ? '?' : ''
    if (ts.isMethodSignature(m)) return { text: `${name}()`, refs: typeRefs(m) }
    return { text: `${name}${opt}`, refs: typeRefs(m.type) }
  })
}

function describeType(node) {
  const t = unwrap(node)
  if (!t) return { shape: 'type', fields: [], variants: [] }
  if (ts.isUnionTypeNode(t)) {
    const variants = []
    let literal = true
    for (const v of t.types) {
      const u = unwrap(v)
      if (u && ts.isTypeLiteralNode(u)) {
        literal = false
        const kind = u.members.find(m => m.name?.getText() === 'kind' && m.type && ts.isLiteralTypeNode(m.type))
        variants.push(kind ? kind.type.getText().replace(/'/g, '') : '{…}')
      } else if (u && ts.isLiteralTypeNode(u)) variants.push(u.getText().replace(/'/g, ''))
      else { literal = false; variants.push(u ? u.getText().slice(0, 40) : '?') }
    }
    return { shape: literal ? 'enum' : 'union', fields: [], variants, refs: typeRefs(t) }
  }
  if (ts.isTypeLiteralNode(t)) return { shape: 'record', fields: fieldsOf(t), variants: [] }
  if (ts.isIntersectionTypeNode(t) || (ts.isTypeReferenceNode(t) && t.typeName.getText() === 'Brand')) return { shape: 'brand', fields: [], variants: [], refs: typeRefs(t) }
  return { shape: 'alias', fields: [], variants: [], refs: typeRefs(t) }
}

function analyzeFile(file, memberDir) {
  const text = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2024, true)
  const decls = []
  const imports = []
  const reexports = []
  let asCount = 0
  let anyCount = 0
  let longest = { name: '', lines: 0 }
  const isExported = n => n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
  const lineOf = pos => sf.getLineAndCharacterOfPosition(pos).line

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) imports.push(st.moduleSpecifier.text)
    if (ts.isExportDeclaration(st)) {
      const from = st.moduleSpecifier?.text
      if (from) imports.push(from)
      const names = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements.map(e => e.name.text) : '*'
      reexports.push({ from, names })
    }
    if (!isExported(st)) continue
    if (ts.isInterfaceDeclaration(st)) {
      decls.push({ name: st.name.text, kind: 'interface', fields: fieldsOf(st), refs: new Set([...typeRefs(st)]), extends: (st.heritageClauses ?? []).flatMap(h => h.types.map(t => t.expression.getText())) })
    } else if (ts.isTypeAliasDeclaration(st)) {
      const d = describeType(st.type)
      decls.push({ name: st.name.text, kind: d.shape, fields: d.fields, variants: d.variants, refs: d.refs ?? new Set(d.fields.flatMap(f => [...f.refs])) })
    } else if (ts.isClassDeclaration(st) && st.name) {
      const members = st.members.filter(m => m.name && !ts.isPrivateIdentifier(m.name) && !m.modifiers?.some(x => x.kind === ts.SyntaxKind.PrivateKeyword)).map(m => ({ text: ts.isMethodDeclaration(m) || ts.isGetAccessor(m) ? `${m.name.getText()}()` : m.name.getText(), refs: typeRefs(m) }))
      decls.push({ name: st.name.text, kind: 'class', fields: members, refs: typeRefs(st), implements: (st.heritageClauses ?? []).filter(h => h.token === ts.SyntaxKind.ImplementsKeyword).flatMap(h => h.types.map(t => t.expression.getText())) })
    } else if (ts.isFunctionDeclaration(st) && st.name) {
      decls.push({ name: st.name.text, kind: 'function', fields: [], refs: typeRefs(st) })
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) decls.push({ name: d.name.getText(), kind: 'const', fields: [], refs: new Set() })
    }
  }
  const visit = n => {
    if (ts.isAsExpression(n) && n.type.getText() !== 'const') asCount += 1
    if (n.kind === ts.SyntaxKind.AnyKeyword) anyCount += 1
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.body) {
      const lines = lineOf(n.body.end) - lineOf(n.body.pos) + 1
      if (lines > longest.lines) longest = { name: n.name?.getText() ?? '(匿名)', lines }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return { file: path.relative(memberDir, file), text, decls, imports, reexports, asCount, anyCount, longest, lines: nonBlank(text) }
}

function resolveRel(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  for (const c of [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, path.join(base, 'index.ts')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  return undefined
}

function exportedNames(entryAbs, files, seen = new Set()) {
  if (!entryAbs || seen.has(entryAbs)) return []
  seen.add(entryAbs)
  const f = files.get(entryAbs)
  if (!f) return []
  const names = f.decls.map(d => ({ name: d.name, kind: d.kind }))
  for (const r of f.reexports) {
    if (!r.from || !r.from.startsWith('.')) continue
    const target = resolveRel(entryAbs, r.from)
    const inner = exportedNames(target, files, seen)
    if (r.names === '*') names.push(...inner)
    else for (const n of r.names) names.push(inner.find(x => x.name === n) ?? { name: n, kind: '?' })
  }
  return names
}

function analyzeMember(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  const srcFiles = walkFiles(path.join(dir, 'src'), p => p.endsWith('.ts'))
  const files = new Map(srcFiles.map(f => [f, analyzeFile(f, dir)]))
  const testFiles = walkFiles(path.join(dir, 'tests'), p => /\.(ts|mts)$/.test(p))
  const testCases = testFiles.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/\b(?:it|test)(?:\.each\([^)]*\))?\s*\(/g) ?? []).length, 0)
  const draft = walkFiles(dir, p => !p.includes('node_modules') && !p.includes('/dist/') && /\.(ts|md)$/.test(p)).filter(p => fs.readFileSync(p, 'utf8').includes('PACKAGE_TEMPLATE_DRAFT')).map(p => path.relative(dir, p))
  const entries = Object.entries(pkg.exports ?? {}).map(([sub, v]) => {
    const src = typeof v === 'object' ? v.source : undefined
    const abs = src ? path.join(dir, src) : undefined
    return { sub, names: exportedNames(abs, files) }
  })
  const modEdges = []
  const pkgEdges = new Set()
  for (const f of files.values()) for (const spec of f.imports) {
    if (spec.startsWith('.')) { const t = resolveRel(path.join(dir, f.file), spec); if (t) modEdges.push([f.file, path.relative(dir, t)]) }
    else pkgEdges.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
  }
  return { dir: path.relative(root, dir), name: pkg.name, description: pkg.description ?? '', deps: Object.keys(pkg.dependencies ?? {}), files: [...files.values()], testFiles: testFiles.length, testCases, draft, entries, modEdges, pkgEdges: [...pkgEdges] }
}

const DIAGRAM_KINDS = new Set(['interface', 'class', 'record', 'union'])

// 每个源文件一张类图：本文件的接口、类、记录、判别联合是完整节点；引用到的其他文件里的类型只画空节点。
function classDiagrams(member) {
  const all = member.files.flatMap(f => f.decls.map(d => ({ ...d, file: f.file })))
  const byName = new Map(all.map(d => [d.name, d]))
  const out = []
  for (const f of member.files) {
    const decls = f.decls.filter(d => DIAGRAM_KINDS.has(d.kind))
    if (decls.length === 0) continue
    const lines = ['classDiagram', '  direction TB']
    const stubs = new Set()
    const edges = new Set()
    for (const d of decls) {
      const stereo = { interface: 'interface', class: '', record: 'value', union: 'union' }[d.kind]
      const body = d.kind === 'union' ? (d.variants ?? []).slice(0, 8).map(v => `    ${mm(v)}`) : d.fields.slice(0, 8).map(fl => `    +${mm(fl.text)}`)
      if (d.fields.length > 8 || (d.variants ?? []).length > 8) body.push('    …')
      lines.push(`  class ${d.name} {`, ...(stereo ? [`    <<${stereo}>>`] : []), ...body, '  }')
      const link = (target, arrow) => {
        const t = byName.get(target)
        if (!t || target === d.name || !DIAGRAM_KINDS.has(t.kind)) return
        if (t.file !== f.file) stubs.add(target)
        edges.add(`  ${arrow(target)}`)
      }
      for (const i of d.implements ?? []) link(i, t => `${t} <|.. ${d.name}`)
      for (const e of d.extends ?? []) link(e, t => `${t} <|-- ${d.name}`)
      for (const r of d.refs ?? []) link(r, t => `${d.name} --> ${t}`)
    }
    for (const s of stubs) lines.push(`  class ${s}`)
    out.push({ file: f.file, code: [...lines, ...edges].join('\n') })
  }
  return out
}

function valueTable(member) {
  const rows = member.files.flatMap(f => f.decls.filter(d => ['brand', 'enum', 'alias'].includes(d.kind)).map(d => ({ ...d, file: f.file })))
  if (rows.length === 0) return ''
  const kindName = { brand: '品牌', enum: '字面量集合', alias: '别名' }
  return `<h4>品牌、字面量集合与别名</h4><div class="tbl"><table><thead><tr><th>名字</th><th>种类</th><th>取值</th><th>文件</th></tr></thead><tbody>${rows.map(d => `<tr><td><code>${esc(d.name)}</code></td><td>${kindName[d.kind]}</td><td>${d.kind === 'enum' ? (d.variants ?? []).map(v => `<code>${esc(v)}</code>`).join(' ') : ''}</td><td><code>${esc(d.file)}</code></td></tr>`).join('')}</tbody></table></div>`
}

function moduleGraph(member) {
  if (member.files.length < 2) return ''
  const id = f => f.replace(/[^A-Za-z0-9]/g, '_')
  const lines = ['flowchart LR']
  for (const f of member.files) lines.push(`  ${id(f.file)}["${mm(f.file)}"]`)
  for (const [a, b] of member.modEdges) lines.push(`  ${id(a)} --> ${id(b)}`)
  return lines.join('\n')
}

function memberGraph(members) {
  const id = n => n.replace(/[^A-Za-z0-9]/g, '_')
  const own = new Set(members.map(m => m.name))
  const lines = ['flowchart TD']
  for (const m of members) lines.push(`  ${id(m.name)}["${mm(m.name)}"]:::own`)
  const ext = new Set()
  for (const m of members) for (const d of new Set([...m.deps, ...m.pkgEdges])) {
    if (d.startsWith('node:')) continue
    if (!own.has(d)) ext.add(d)
    lines.push(`  ${id(m.name)} --> ${id(d)}`)
  }
  for (const e of ext) lines.push(`  ${id(e)}["${mm(e)}"]:::ext`)
  lines.push('  classDef own stroke-width:2px', '  classDef ext stroke-dasharray: 4 3')
  return lines.join('\n')
}

const readFragment = (dir, id, fallback) => {
  const p = path.join(here, dir, `${id}.html`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : fallback
}
const diagram = code => `<div class="diagram"><pre class="mmd">\n${esc(code)}\n</pre></div>`

function renderDomain(domain, members) {
  const tot = members.reduce((a, m) => ({ files: a.files + m.files.length, lines: a.lines + m.files.reduce((n, f) => n + f.lines, 0), exports: a.exports + m.entries.reduce((n, e) => n + e.names.length, 0), cases: a.cases + m.testCases, as: a.as + m.files.reduce((n, f) => n + f.asCount, 0), any: a.any + m.files.reduce((n, f) => n + f.anyCount, 0), drafts: a.drafts + (m.draft.length > 0 ? 1 : 0) }), { files: 0, lines: 0, exports: 0, cases: 0, as: 0, any: 0, drafts: 0 })
  const tile = (label, value, note = '') => `<div class="tile"><span class="v">${value}</span><span class="l">${label}</span>${note ? `<span class="n">${note}</span>` : ''}</div>`
  const memberSections = members.map(m => {
    const exportsTable = m.entries.map(e => `<tr><td><code>${esc(e.sub)}</code></td><td>${e.names.length === 0 ? '<span class="muted">无导出</span>' : e.names.map(n => `<code title="${esc(n.kind)}">${esc(n.name)}</code>`).join(' ')}</td></tr>`).join('')
    const fileRows = m.files.map(f => `<tr><td><code>${esc(f.file)}</code></td><td class="num">${f.lines}</td><td class="num">${f.decls.length}</td><td class="num">${f.longest.lines}${f.longest.lines ? ` <span class="muted">${esc(f.longest.name)}</span>` : ''}</td><td class="num ${f.asCount ? 'warn' : ''}">${f.asCount}</td><td class="num ${f.anyCount ? 'bad' : ''}">${f.anyCount}</td></tr>`).join('')
    const cds = classDiagrams(m)
    const mg = moduleGraph(m)
    const fns = m.files.flatMap(f => f.decls.filter(d => d.kind === 'function' || d.kind === 'const').map(d => ({ ...d, file: f.file })))
    return `<details class="member" open><summary><h3><code>${esc(m.name)}</code> ${m.draft.length ? '<span class="pill draft">模板草稿</span>' : '<span class="pill real">有实现</span>'}</h3></summary>
  <p class="muted">${esc(m.description)} · <code>${esc(m.dir)}</code> · 源文件 ${m.files.length} · 测试文件 ${m.testFiles} · 用例 ${m.testCases}</p>
  <h4>入口与导出</h4><div class="tbl"><table><thead><tr><th>入口</th><th>导出（悬停看种类）</th></tr></thead><tbody>${exportsTable || '<tr><td colspan="2">无 exports</td></tr>'}</tbody></table></div>
  ${cds.length ? `<h4>类型与类（UML 类图，每个源文件一张）</h4>${cds.map(c => `<details open><summary><code>${esc(c.file)}</code></summary>${diagram(c.code)}</details>`).join('')}` : '<p class="muted">没有导出的接口、类、记录或判别联合。</p>'}
  ${valueTable(m)}
  ${fns.length ? `<h4>导出的函数与常量</h4><p>${fns.map(d => `<code title="${esc(d.file)}">${esc(d.name)}</code>`).join(' ')}</p>` : ''}
  ${mg ? `<h4>模块依赖</h4>${diagram(mg)}` : ''}
  <h4>健康读数</h4><div class="tbl"><table><thead><tr><th>文件</th><th>非空行</th><th>导出声明</th><th>最长函数（行）</th><th><code>as</code></th><th><code>any</code></th></tr></thead><tbody>${fileRows}</tbody></table></div>
  ${m.draft.length ? `<p class="muted">草稿标记：${m.draft.map(d => `<code>${esc(d)}</code>`).join(' ')}</p>` : ''}
</details>`
  }).join('\n')
  return `<div class="panel" id="panel-${domain.id}" data-panel="${domain.id}" hidden>
<section><h2>技术讲解</h2><div class="prose">${readFragment('narrative', domain.id, '<p>尚无讲解。</p>')}</div></section>
<section><h2>读数</h2><div class="tiles">
${tile('成员', members.length, `草稿 ${tot.drafts}`)}${tile('源文件', tot.files)}${tile('非空源码行', tot.lines)}${tile('入口导出', tot.exports)}${tile('测试用例', tot.cases)}${tile('as 断言', tot.as, '不含 as const')}${tile('any', tot.any)}
</div></section>
<section><h2>成员依赖</h2><p class="muted">粗框是本组成员，虚线框是组外依赖（来自 package.json 与 import）。</p>${diagram(memberGraph(members))}</section>
<section><h2>各成员：入口、UML、模块与健康读数</h2>${memberSections}</section>
<section><h2>健康评述</h2><div class="prose">${readFragment('review', domain.id, '<p>尚无评述。</p>')}</div></section>
</div>`
}

function renderPage(domains, head, at) {
  return `<title>Skill 与 MCP 实现架构</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@700&family=JetBrains+Mono:wght@400;500&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js"></script>
<style>
/* 布局：粘顶的标签栏切换两个领域；每个领域依次是讲解、读数、成员依赖、各成员详情、健康评述 */
:root{--bg:#f6f7f9;--card:#fff;--ink:#1b2330;--muted:#5d6878;--line:#d9dee6;--skill:#2f6f5e;--mcp:#7a4a8c;--warn:#9a6b00;--bad:#b23a2e;--good:#2f7a3d;--accent:var(--skill);
--display:"Noto Serif SC",serif;--body:"Noto Sans SC",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#13171d;--card:#1b2129;--ink:#e2e7ee;--muted:#9aa5b4;--line:#2d3540;--skill:#7cc4ad;--mcp:#c79ad8;--warn:#e0b44c;--bad:#ef8a7e;--good:#7fcf8c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#13171d;--card:#1b2129;--ink:#e2e7ee;--muted:#9aa5b4;--line:#2d3540;--skill:#7cc4ad;--mcp:#c79ad8;--warn:#e0b44c;--bad:#ef8a7e;--good:#7fcf8c;color-scheme:dark}
body[data-tab="mcp"]{--accent:var(--mcp)}
*{box-sizing:border-box}body{background:var(--bg);color:var(--ink);font:15px/1.7 var(--body);margin:0}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
.wrap{max-width:1120px;margin:0 auto;padding-block:24px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:20px}
h1,h2{font-family:var(--display);margin:0;text-wrap:balance}h1{font-size:1.8rem}h2{font-size:1.3rem;border-bottom:2px solid var(--accent);padding-bottom:4px;margin-bottom:10px}
h3{margin:0;font-size:1.02rem;display:inline}h4{margin:14px 0 6px;font-size:.9rem;color:var(--muted);letter-spacing:.04em}
code{font-family:var(--mono);font-size:.82em;overflow-wrap:anywhere}.muted{color:var(--muted)}
nav.tabs{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);display:flex;gap:8px;padding-block:8px;border-bottom:1px solid var(--line)}
nav.tabs a{text-decoration:none;color:var(--muted);border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 16px;font-weight:500}
nav.tabs a[aria-current="true"]{color:#fff;background:var(--accent);border-color:var(--accent)}
nav.tabs a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.panel{display:flex;flex-direction:column;gap:26px}.panel[hidden]{display:none}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column}
.tile .v{font:600 1.45rem var(--mono);font-variant-numeric:tabular-nums}.tile .l{font-size:.8rem;color:var(--muted)}.tile .n{font-size:.75rem;color:var(--muted)}
.member{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:8px;padding:12px 16px;margin-bottom:12px;min-width:0}
.member>summary{cursor:pointer;list-style-position:outside}
.pill{font:500 .72rem var(--body);padding:1px 8px;border-radius:999px;vertical-align:middle;margin-left:6px}.pill.draft{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}.pill.real{background:color-mix(in srgb,var(--good) 18%,transparent);color:var(--good)}
.tbl,.diagram{overflow-x:auto}.diagram{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;margin:4px 0}
pre.mmd{margin:0;font-family:var(--mono);font-size:.75rem;color:var(--muted);white-space:pre}
table{border-collapse:collapse;width:100%;font-size:.85rem;background:var(--card)}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:color-mix(in srgb,var(--line) 40%,transparent)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.warn{color:var(--warn);font-weight:600}td.bad{color:var(--bad);font-weight:600}
details details{margin:6px 0}details details>summary{cursor:pointer;color:var(--muted);font-size:.85rem}
.prose{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 18px 14px}.prose p,.prose li{max-width:74ch}.prose h3{display:block;margin-top:14px}
</style>
<div class="wrap">
<header><span class="muted">由 <code>techdoc/gen.mjs</code> 从实际源码生成 · 父分支 <code>PanQiWei/skill-mcp</code> @ <code>${esc(head)}</code> · ${esc(at)}</span>
<h1>Skill 与 MCP 实现架构</h1>
<p class="muted">图与读数只取自 <code>packages/skills/*</code> 与 <code>packages/mcp/*</code> 的 package.json、src、tests。设计正文不是本页的事实来源；讲解与评述由 reduce 读源码后手写，每个闭包合入后更新。</p></header>
<nav class="tabs" aria-label="领域">${domains.map(d => `<a href="#${d.id}" data-tab="${d.id}">${esc(d.label)}</a>`).join('')}</nav>
${domains.map(d => d.html).join('\n')}
</div>
<script>
(function () {
  var dark = function () { var t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches }
  if (window.mermaid) mermaid.initialize({ startOnLoad: false, theme: dark() ? 'dark' : 'default', securityLevel: 'strict' })
  function show() {
    var id = (location.hash || '').slice(1)
    if (!document.getElementById('panel-' + id)) id = '${domains[0].id}'
    document.body.dataset.tab = id
    document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.dataset.panel !== id })
    document.querySelectorAll('nav.tabs a').forEach(function (a) { a.setAttribute('aria-current', String(a.dataset.tab === id)) })
    if (!window.mermaid) return
    var nodes = Array.prototype.slice.call(document.querySelectorAll('#panel-' + id + ' pre.mmd:not([data-done])'))
    nodes.forEach(function (n) { n.setAttribute('data-done', '1') })
    if (nodes.length) mermaid.run({ nodes: nodes }).catch(function () {})
  }
  window.addEventListener('hashchange', show)
  show()
})()
</script>`
}

const head = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const rendered = []
for (const d of DOMAINS) {
  const groupDir = path.join(root, d.group)
  const members = fs.readdirSync(groupDir, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(groupDir, e.name, 'package.json'))).map(e => analyzeMember(path.join(groupDir, e.name)))
  fs.writeFileSync(path.join(here, `${d.id}.facts.json`), JSON.stringify(members, (k, v) => (v instanceof Set ? [...v] : k === 'text' ? undefined : v), 2))
  rendered.push({ ...d, html: renderDomain(d, members) })
  console.log(`${d.id}: ${members.length} 个成员`)
}
const out = probe ? 'probe.html' : 'index.html'
fs.writeFileSync(path.join(here, out), renderPage(rendered, head, at))
console.log(`→ techdoc/${out}`)
