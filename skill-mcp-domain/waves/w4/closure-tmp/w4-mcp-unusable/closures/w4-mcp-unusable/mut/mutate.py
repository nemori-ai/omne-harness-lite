import subprocess, sys, json, hashlib, os, re
ROOT = sys.argv[1]
OUT = os.path.join(ROOT, 'tmp/closures/w4-mcp-unusable/mut/logs')
P = 'packages/mcp/'
M = [
 ('U1', P+'mcp/src/internal/lost.ts',
  "  return unusable === undefined ? undefined : { reason: unusable, mark: 'connection-unavailable' }",
  "  return undefined", [], [('mcp', ['tests/lost.spec.ts','tests/invoke.spec.ts','tests/refresh.spec.ts','tests/tasks.spec.ts','tests/cancel.spec.ts'])]),
 ('U2', P+'mcp/src/internal/lost.ts',
  "      return unusableOf(answer.unusable)\n    case 'no-answer':\n      return unusableOf(answer.unusable)",
  "      return { reason: 'stream-broken', mark: 'connection-unavailable' }\n    case 'no-answer':\n      return answer.cause === 'abandoned' ? undefined : { reason: answer.cause, mark: 'connection-unavailable' }",
  [], [('mcp', ['tests/lost.spec.ts','tests/invoke.spec.ts','tests/refresh.spec.ts','tests/tasks.spec.ts'])]),
 ('U3', P+'mcp/src/internal/lost.ts',
  "if (answer.cause === 'authorization-required') return AUTHORIZATION_REQUIRED",
  "if (answer.cause === 'authorization-required') return undefined",
  [], [('mcp', ['tests/lost.spec.ts','tests/invoke.spec.ts','tests/refresh.spec.ts','tests/tasks.spec.ts'])]),
 ('U4', P+'mcp/src/discovery.ts',
  "  const lost = lostOf(failure)",
  "  const lost = failure.kind === 'not-sent' ? ({ reason: 'stream-broken', mark: 'connection-unavailable' } as const) : undefined",
  [], [('mcp', ['tests/refresh.spec.ts'])]),
 ('U5', P+'mcp/src/internal/build.ts',
  "    if ('failure' in discovered.value) return fail(failedOf(discovered.value.failure))",
  "    if ('failure' in discovered.value && 'unusable' in discovered.value.failure) return fail(failedOf(discovered.value.failure))",
  [], [('mcp', ['tests/refresh.spec.ts'])]),
 ('U6', P+'mcp-host-local/src/session.ts',
  "    return notSentFailureOf(this.closed ? undefined : this.dead)",
  "    return notSentFailureOf(undefined)",
  ['mcp-host-local'], [('mcp-host-local', ['tests/stdio.spec.ts','tests/session.spec.ts'])]),
 ('U7', P+'mcp-host-local/src/session.ts',
  "    return notSentFailureOf(this.closed ? undefined : this.dead)",
  "    return notSentFailureOf(this.dead)",
  ['mcp-host-local'], [('mcp-host-local', ['tests/session.spec.ts'])]),
 ('U8', P+'mcp-host-local/src/session.ts',
  "    return { ...answered, wire: unusableAnswerOf(answered.wire, this.dead) }",
  "    return answered",
  ['mcp-host-local'], [('mcp-host-local', ['tests/session.spec.ts'])]),
 ('U9', P+'mcp-contract/src/decisions.ts',
  "    : { kind: 'settle', wire: unusableAnswerOf(wire, unusable), unusable }",
  "    : { kind: 'settle', wire, unusable }",
  ['mcp-contract'], [('mcp-contract', ['tests/decisions.spec.ts']), ('mcp-host-local', ['tests/stdio.spec.ts','tests/http.spec.ts'])]),
 ('U10', P+'mcp-contract/src/decisions.ts',
  "  if (status === '5xx' && (probe || body === 'plain')) return brokenStream(false)",
  "  if (status === '5xx' && (probe || body === 'plain')) return { kind: 'no-answer', cause: 'stream-broken', resend: false, unusable: 'stream-broken' }",
  ['mcp-contract'], [('mcp-contract', ['tests/decisions.spec.ts']), ('mcp-host-local', ['tests/http.spec.ts']), ('mcp', ['tests/invoke.spec.ts'])]),
 ('U11', P+'mcp-contract/src/decisions.ts',
  "      return wire.unusable === undefined ? { ...wire, unusable: cause } : wire",
  "      return { ...wire, unusable: cause }",
  ['mcp-contract'], [('mcp-contract', ['tests/decisions.spec.ts'])]),
 ('U12', P+'mcp/src/internal/build.ts',
  "    if ('failure' in discovered.value) return fail(failedOf(discovered.value.failure))",
  "    if ('failure' in discovered.value && !('unusable' in discovered.value.failure)) return fail(failedOf(discovered.value.failure))",
  [], [('mcp', ['tests/refresh.spec.ts'])]),
 ('U13', P+'mcp-contract/src/answer-readings.ts',
  "      return { failure: noAnswerFailureOf(wire) }",
  "      return { failure: { kind: 'no-answer', cause: wire.cause } }",
  ['mcp-contract'], [('mcp-contract', ['tests/decisions.spec.ts'])]),
 ('U14', P+'mcp-contract/src/answer-readings.ts',
  "      return noAnswerFailureOf(wire)",
  "      return { kind: 'no-answer', cause: wire.cause }",
  ['mcp-contract'], [('mcp-contract', ['tests/decisions.spec.ts'])]),
]
only = sys.argv[2:] 
def run(cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
def build(pkgs):
    for p in pkgs:
        r = run('pnpm run build', os.path.join(ROOT, P+p))
        if r.returncode: raise SystemExit(f'build {p} failed: {r.stdout[-2000:]}{r.stderr[-2000:]}')
table=[]
for mid, f, find, repl, pkgs, runs in M:
    if only and mid not in only: continue
    path=os.path.join(ROOT,f); orig=open(path,'rb').read(); text=orig.decode()
    assert text.count(find)==1, (mid, text.count(find))
    open(path,'w').write(text.replace(find,repl))
    try:
        build(pkgs)
        log=[]; codes=[]
        for pkg, files in runs:
            r = run('NO_COLOR=1 VITEST_MAX_WORKERS=4 pnpm exec vitest run --typecheck.enabled=false ' + ' '.join(files), os.path.join(ROOT,P+pkg))
            codes.append(r.returncode); log.append(f'## {pkg}\n'+r.stdout+r.stderr)
        body='\n'.join(log)
        lp=os.path.join(OUT, mid+'.log'); open(lp,'w').write(body)
        fails=sorted(set(re.findall(r'FAIL  (tests/\S+ > .*)', body)))
        table.append({'id':mid,'codes':codes,'fails':fails,'log':hashlib.sha256(body.encode()).hexdigest()[:16]})
        print(mid, codes, len(fails), flush=True)
    finally:
        open(path,'wb').write(orig)
        build(pkgs)
        assert open(path,'rb').read()==orig
        assert run('git diff --quiet -- '+f, ROOT).returncode==0, mid+' not restored'
json.dump(table, open(os.path.join(OUT,'table.json'+('.'+'-'.join(only) if only else '')),'w'), indent=1, ensure_ascii=False)
