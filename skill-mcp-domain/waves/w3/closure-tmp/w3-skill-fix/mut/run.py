# Manual mutations: apply one, rebuild the members whose dist the tests import, run the named
# tests, record the exit code and the red cases, restore the bytes, rebuild.
import subprocess, sys, json, pathlib
W = pathlib.Path('/data/qiwei/repos/omne-harness-lite/.worktrees/w3-skill-fix')
SK = W/'packages/skills/skill'; SC = W/'packages/skills/skill-contract'
HL = W/'packages/skills/skill-host-local'
M = [
 ('N2a', SC/'src/parse/shape.ts', "export const DESCRIPTION_LIMIT = 16384", "export const DESCRIPTION_LIMIT = 1024", [SC, SK], [(SC, ['tests/values.spec.ts', 'tests/contract-extension.spec.ts', 'tests/parse-compat.spec.ts']), (SK, ['tests/compat.spec.ts'])]),
 ('N2b', SC/'src/parse/manifest.ts', "  if (!isSkillDescription(description))\n    return fail('description is not text", "  if (typeof description !== 'string' || description === '')\n    return fail('description is not text", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('N1a', SC/'src/parse/package.ts', "const renamed = manifest.manifest.name !== snapshot.rootName", "const renamed = false", [SC, SK, HL], [(SC, ['tests/parse-compat.spec.ts']), (HL, ['tests/examples.spec.ts'])]),
 ('N1b', SC/'src/parse/package.ts', "if (name !== undefined && expectedName !== undefined && name !== expectedName)", "if (name !== undefined && (name !== snapshot.rootName || (expectedName !== undefined && name !== expectedName)))", [SC, SK, HL], [(SC, ['tests/parse-compat.spec.ts', 'tests/parse-manifest.spec.ts']), (HL, ['tests/examples.spec.ts'])]),
 ('F1a', SK/'src/port-answer.ts', "  if (!sameCapability(ref.capability, request.capability)) return false\n", "", [SK], [(SK, ['tests/ref-identity.spec.ts', 'tests/answer-parse.spec.ts'])]),
 ('F1b', SK/'src/port-answer.ts', "    ref.layer === basis.layer &&", "    true &&", [SK], [(SK, ['tests/ref-identity.spec.ts', 'tests/answer-parse.spec.ts'])]),
 ('F1c', SK/'src/port-answer.ts', "    (basis.assetVersion === undefined || ref.assetVersion === basis.assetVersion) &&", "    true &&", [SK], [(SK, ['tests/ref-identity.spec.ts', 'tests/answer-parse.spec.ts'])]),
 ('F1d', SK/'src/port-answer.ts', "    (ref.digest === undefined || ref.digest === basis.digest)", "    true", [SK], [(SK, ['tests/ref-identity.spec.ts', 'tests/answer-parse.spec.ts'])]),
 ('F1e', SK/'src/port-answer.ts', "standIn !== undefined && sameCapability(standIn.capability, request.capability)", "standIn !== undefined", [SK], [(SK, ['tests/ref-identity.spec.ts', 'tests/answer-parse.spec.ts'])]),
 ('F2', SC/'src/testing-resolution.ts', "ref: ref.digest === undefined ? ref : { ...ref, digest: basis.digest },", "ref,", [SC, SK], [(SC, ['tests/conformance.spec.ts']), (SK, ['tests/describe.spec.ts', 'tests/conformance.spec.ts'])]),
 ('F3', SK/'src/mapping.ts', "inspect: { snapshot: SOURCE_UNAVAILABLE, open: VERSION_CHANGED },", "inspect: both(VERSION_CHANGED),", [SK], [(SK, ['tests/mapping.spec.ts', 'tests/inspection.spec.ts'])]),
 ('F4', SK/'src/access/service.ts', "      if (bodyOffset === undefined) return fail(SOURCE_UNAVAILABLE)\n", "", [SK], [(SK, ['tests/read.spec.ts'])]),
 ('C1', SC/'src/parse/manifest.ts', "  return isBoundedText(value, Number.POSITIVE_INFINITY)", "  return isBoundedText(value, DESCRIPTION_MAX)", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('C2', SC/'src/parse/manifest.ts', "  return isBoundedText(description, DESCRIPTION_MAX) ? [] : ['description-over-limit']", "  return []", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('C3', SC/'src/parse/manifest.ts', "typeof item === 'string' ? [[key, item] as const] : []", "[]", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('C4', SC/'src/parse/manifest.ts', "hints.push('metadata-not-text-map')", "void hints", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('C5', SC/'src/parse/manifest.ts', "return lineRead(yaml)", "return malformed('the frontmatter is not valid YAML')", [SC], [(SC, ['tests/parse-compat.spec.ts'])]),
 ('C6', SC/'src/parse/by-line.ts', "values?.length === 1 ? values[0] : undefined", "values?.[0]", [SC], [(SC, ['tests/parse-manifest.spec.ts', 'tests/parse-package.spec.ts'])]),
 ('C7', SC/'src/parse/by-line.ts', "  if (text.startsWith('|') || text.startsWith('>')) return undefined\n", "", [SC], [(SC, ['tests/parse-manifest.spec.ts'])]),
 ('C8', SC/'src/parse/by-line.ts', "  if (rest.trim() !== '' && !/^[ \\t]+#/.test(rest)) return undefined\n", "", [SC], [(SC, ['tests/parse-manifest.spec.ts'])]),
]
only = sys.argv[1:]
def build(pkgs):
    for p in pkgs:
        subprocess.run(['pnpm', 'run', 'build'], cwd=p, capture_output=True, check=True)
for name, path, old, new, builds, tests in M:
    if only and name not in only: continue
    orig = path.read_bytes()
    text = orig.decode()
    if text.count(old) != 1: print(name, 'PATTERN', text.count(old)); continue
    path.write_text(text.replace(old, new))
    try:
        build(builds)
        for cwd, files in tests:
            r = subprocess.run(['pnpm', 'exec', 'vitest', 'run', '--mode', 'fast', *files], cwd=cwd, capture_output=True, text=True, env={**__import__('os').environ, 'NO_COLOR': '1'})
            red = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith('×')]
            print(f"{name} | {path.relative_to(W)} | {cwd.name}: {' '.join(files)} | exit {r.returncode} | red {len(red)}: {red[:3]}")
    finally:
        path.write_bytes(orig)
build(sorted({b for m in M for b in m[4]}, key=lambda p: {SC: 0, SK: 1}.get(p, 2)))
print('restored')
