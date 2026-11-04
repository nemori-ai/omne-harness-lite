// Usage: node skill-compat.mjs <worktree> <label>=<root> ...
// Loads every Skill package under each root with our implementation (inspect), then requests it
// through SkillAccess (read the body, list, read the first resource). Reports per corpus.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
const [wt, ...pairs] = process.argv.slice(2)
const m = p => import(join(wt, 'packages', p))
const { createDirectorySource } = await m('skills/skill-host-local/dist/index.js')
const { createPackageInspection, createSkillAccess } = await m('skills/skill/dist/index.js')
const T = await m('skills/skill-contract/dist/testing.js')
const { capabilityId } = await m('assets/assets/dist/index.js')
const LI = await m('common/legal-identity/dist/index.js')
const org = LI.organizationCodec.parse('org_0123456789abcdefghjkmnpqrs'), acc = LI.accountCodec.parse('acc_0123456789abcdefghjkmnpqrs')
const who = LI.access('probe', LI.tenant(org.value, acc.value))
const source = createDirectorySource()
const inspection = createPackageInspection(source)
const dirsOf = root => { const out = []; const walk = d => { let es; try { es = readdirSync(d) } catch { return } for (const e of es) { if (e === '.git' || e === 'node_modules') continue; const p = join(d, e); let st; try { st = statSync(p) } catch { continue } if (st.isDirectory()) walk(p); else if (e === 'SKILL.md') out.push(dirname(p)) } }; walk(root); return out }
const bodyOf = text => { const mm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text); return mm ? text.slice(mm[0].length) : text }
for (const pair of pairs) {
  const [label, root] = pair.split('=')
  const dirs = dirsOf(root); let loaded = 0, requested = 0; const issues = []
  for (const d of dirs) {
    const r = await inspection.inspect({ kind: 'directory', root: d })
    if (!('ok' in r)) { issues.push(`${basename(d)}: load ${r.failure.kind}${r.failure.code ? '/' + r.failure.code : ''} — ${r.failure.detail ?? ''}`); continue }
    loaded++
    const def = r.ok, name = def.manifest.name
    const id = capabilityId('skill', name); if (!id.ok) { issues.push(`${basename(d)}: capability id refused for ${name}`); continue }
    const ref = { capability: id.id, layer: 'official', locator: { kind: 'directory', root: d }, digest: def.snapshot.digest }
    const declared = { name, ...(def.manifest.description === undefined ? {} : { description: def.manifest.description }), tools: [], scripts: [], settings: [] }
    const svc = createSkillAccess({ source, readCheck: T.createMemoryReadCheck([{ capability: id.id, visible: () => true }]), resolution: T.createMemoryResolution([{ capability: id.id, visible: () => true, state: { kind: 'adopted', current: { ref, declared } } }]) })
    const page = await svc.read(who, 's', { capability: id.id, part: { kind: 'body' } })
    if (!('ok' in page)) { issues.push(`${basename(d)}: read body ${JSON.stringify(page.failure)}`); continue }
    const want = bodyOf(readFileSync(join(d, 'SKILL.md'), 'utf8'))
    const got = page.ok.content.kind === 'text' ? page.ok.content.text : null
    if (got === null || !want.startsWith(got)) { issues.push(`${basename(d)}: body differs (${page.ok.content.kind})`); continue }
    const listed = await svc.list(who, 's', id.id)
    if (!('ok' in listed)) { issues.push(`${basename(d)}: list ${JSON.stringify(listed.failure)}`); continue }
    const res = (listed.ok.entries ?? listed.ok).find?.(e => e.path !== 'SKILL.md')
    if (res) { const rp = await svc.read(who, 's', { capability: id.id, part: { kind: 'resource', path: res.path } }); if (!('ok' in rp)) { issues.push(`${basename(d)}: read ${res.path} ${JSON.stringify(rp.failure)}`); continue } }
    requested++
  }
  console.log(`## ${label}: ${dirs.length} 包，加载 ${loaded}，请求 ${requested}`)
  for (const i of issues) console.log(`  - ${i.slice(0, 230)}`)
}
