import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  cpSync,
} from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const work = resolve(
  process.env.PLATFORM_CONFORMANCE_TEST_TMP ?? 'tmp/line-m2-toolchain/w2/platform',
)
mkdirSync(work, { recursive: true })

function command(file, args, cwd, env = {}) {
  const result = spawnSync(file, args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
  })
  assert.equal(result.error, undefined, result.error?.message)
  return result
}

function fixture(t, scenario = 'pass') {
  const base = mkdtempSync(join(work, 'fixture-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, 'checkout')
  const remote = join(base, 'origin.git')
  mkdirSync(root)
  const git = (...args) => {
    const result = command('git', args, root)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  command('git', ['init', '--bare', remote], base)
  git('init', '-b', 'fixture')
  git('config', 'user.name', 'fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  const member = join(root, 'members', 'new-provider')
  mkdirSync(join(member, 'node_modules/vitest'), { recursive: true })
  mkdirSync(join(root, 'scripts'))
  writeFileSync(
    join(root, 'scripts/with-test-slot.mjs'),
    `import {spawnSync} from 'node:child_process'; const r=spawnSync(process.argv[2],process.argv.slice(3),{stdio:'inherit',env:{...process.env,OMNE_TEST_SLOT_HELD:'fixture'}}); process.exit(r.status??1)`,
  )
  writeFileSync(join(member, 'package.json'), '{}')
  writeFileSync(
    join(member, 'node_modules/vitest/package.json'),
    '{"name":"vitest","version":"fixture"}',
  )
  writeFileSync(
    join(member, 'node_modules/vitest/vitest.mjs'),
    `
import {writeFileSync} from 'node:fs'; import {resolve} from 'node:path';
if (!process.env.OMNE_TEST_SLOT_HELD) process.exit(90);
const args=process.argv.slice(2); const out=args.find(x=>x.startsWith('--outputFile=')).slice(13);
const scenario=${JSON.stringify(scenario)};
if(scenario==='missing') process.exit(0);
const names=args.slice(1,args.indexOf('--reporter=default'));
const files=scenario==='empty'?[]:names.filter((_,i)=>scenario!=='omit'||i===0).map(name=>({name:resolve(name),status:scenario==='fail'?'failed':'passed',assertionResults:[{fullName:'required behavior',status:scenario==='skip'?'pending':scenario==='fail'?'failed':'passed'}]}));
writeFileSync(out,JSON.stringify({testResults:files,success:scenario!=='fail'}));
process.stdout.write('fixture runner output\\n'); process.exit(scenario==='fail'?1:0);
`,
  )
  for (const name of ['one.spec.ts', 'two.spec.ts']) writeFileSync(join(member, name), '')
  writeFileSync(join(root, 'tracked'), 'baseline')
  git('add', 'tracked')
  git('commit', '-m', 'fixture')
  git('remote', 'add', 'origin', remote)
  git('push', 'origin', 'HEAD:refs/heads/fixture')
  const sha = git('rev-parse', 'HEAD')
  return { base, root, sha, git }
}

function run(f, extra = []) {
  const out = join(f.base, 'evidence')
  const result = command(
    process.execPath,
    [
      cli,
      'run',
      '--root',
      f.root,
      '--sha',
      f.sha,
      '--member',
      'members/new-provider',
      '--test',
      'one.spec.ts',
      '--test',
      'two.spec.ts',
      '--out',
      out,
      ...extra,
    ],
    work,
  )
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  return { ...result, report, out }
}

function shortSettleEntry(f) {
  const entry = join(f.base, 'short-settle.mjs')
  writeFileSync(
    entry,
    `import {main} from ${JSON.stringify(new URL('./cli.mjs', import.meta.url).href)}; process.exitCode=await main(process.argv.slice(2),{settleMs:1000});`,
  )
  return entry
}

test('positive control runs arbitrary member and preserves SHA, counts, logs and slot ownership', t => {
  const f = fixture(t)
  const result = run(f)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.report.sha, f.sha)
  assert.equal(result.report.checkout, f.root)
  assert.equal(result.report.members[0].files.length, 2)
  assert.equal(result.report.members[0].files[0].pass, 1)
  assert.match(
    readFileSync(join(result.out, 'member-0.stdout.log'), 'utf8'),
    /fixture runner output/,
  )
  assert.equal(result.report.slotHeld, true)
  assert.equal(f.git('rev-parse', 'HEAD'), f.sha)
})

for (const [scenario, expected] of [
  ['fail', 1],
  ['skip', 3],
  ['empty', 3],
  ['missing', 3],
  ['omit', 3],
]) {
  test(`negative control ${scenario} cannot pass on process success alone`, t => {
    const result = run(fixture(t, scenario))
    assert.equal(result.status, expected, result.stderr)
    assert.notEqual(result.report.conclusion, 'passed')
    if (scenario === 'skip') {
      assert.equal(result.report.members[0].files[0].skip, 1)
      assert.match(result.report.members[0].files[0].skipped[0].reason, /unknown/)
    }
  })
}

test('negative control wrong SHA rejects without changing HEAD', t => {
  const f = fixture(t)
  const requested = f.sha
  writeFileSync(join(f.root, 'tracked'), 'published newer commit')
  f.git('commit', '-am', 'newer commit')
  f.git('push', 'origin', 'HEAD:refs/heads/fixture')
  const actual = f.git('rev-parse', 'HEAD')
  const result = run(f, ['--sha', requested])
  assert.equal(result.status, 1)
  assert.match(JSON.stringify(result.report), /HEAD/)
  assert.equal(f.git('rev-parse', 'HEAD'), actual)
})

test('negative control unpublished commit fails remote reachability', t => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'tracked'), 'unpublished')
  f.git('commit', '-am', 'local only')
  f.sha = f.git('rev-parse', 'HEAD')
  const result = run(f)
  assert.equal(result.status, 1)
  assert.match(JSON.stringify(result.report), /origin/)
})

test('negative control requested file absent is incomplete', t => {
  const f = fixture(t)
  rmSync(join(f.root, 'members/new-provider/two.spec.ts'))
  assert.equal(run(f).status, 3)
})

test('prepare-wsl rejects mounted Windows paths before cloning', () => {
  const result = command(
    process.execPath,
    [
      cli,
      'prepare-wsl',
      '--root',
      '/mnt/d/forbidden',
      '--remote',
      'https://example.invalid/repo.git',
      '--branch',
      'fixture',
      '--sha',
      'a'.repeat(40),
    ],
    work,
  )
  assert.equal(result.status, 2)
  assert.match(result.stderr, /WSL filesystem/)
})

test('real installed Vitest JSON distinguishes a passed test from a skipped test', t => {
  const f = fixture(t)
  const member = join(f.root, 'members/new-provider')
  const vitest = dirname(
    createRequire(
      resolve('packages/execution/execution-environment-host-local/package.json'),
    ).resolve('vitest/package.json'),
  )
  rmSync(join(member, 'node_modules/vitest'), { recursive: true, force: true })
  symlinkSync(vitest, join(member, 'node_modules/vitest'), 'junction')
  writeFileSync(join(member, 'package.json'), '{"type":"module"}')
  writeFileSync(
    join(member, 'one.spec.ts'),
    "import {test,expect} from 'vitest'; test('runs',()=>expect(2+2).toBe(4));",
  )
  writeFileSync(
    join(member, 'two.spec.ts'),
    "import {test} from 'vitest'; test.skip('requires unavailable platform',()=>{});",
  )
  const result = run(f)
  assert.equal(result.status, 3, result.stderr)
  assert.equal(result.report.members[0].files[0].pass, 1)
  assert.equal(result.report.members[0].files[1].skip, 1)
})

test('manifest runs multiple arbitrary members including a path with spaces', t => {
  const f = fixture(t)
  cpSync(join(f.root, 'members/new-provider'), join(f.root, 'members/provider with spaces'), {
    recursive: true,
  })
  const manifest = join(f.base, 'manifest.json')
  writeFileSync(
    manifest,
    JSON.stringify([
      { member: 'members/new-provider', tests: ['one.spec.ts'] },
      { member: 'members/provider with spaces', tests: ['two.spec.ts'] },
    ]),
  )
  const out = join(f.base, 'manifest-evidence')
  const result = command(
    process.execPath,
    [cli, 'run', '--root', f.root, '--sha', f.sha, '--manifest', manifest, '--out', out],
    work,
  )
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  assert.equal(report.members.length, 2)
  assert.equal(report.members[1].files[0].pass, 1)
})

test('slot wrapper success without a report is incomplete with unobserved metadata', t => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'scripts/with-test-slot.mjs'), 'process.exit(0)')
  const out = join(f.base, 'missing-wrapper-report')
  const result = command(
    process.execPath,
    [
      cli,
      'run',
      '--root',
      f.root,
      '--sha',
      f.sha,
      '--member',
      'members/new-provider',
      '--test',
      'one.spec.ts',
      '--out',
      out,
    ],
    work,
  )
  assert.equal(result.status, 3)
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  assert.equal(report.conclusion, 'incomplete')
  assert.equal(report.probes.pnpm.version, null)
  assert.ok(report.probes.pnpm.reason)
  assert.equal(report.probes.status, 'not-run')
  assert.equal(report.slotHeld, null)
  assert.ok(report.slotHeldReason)
})

test('slot wait expiry records that no slot was held and why prerequisites were not probed', t => {
  const f = fixture(t)
  writeFileSync(join(f.root, 'scripts/with-test-slot.mjs'), 'process.exit(75)')
  const out = join(f.base, 'slot-expired-report')
  const result = command(
    process.execPath,
    [
      cli,
      'run',
      '--root',
      f.root,
      '--sha',
      f.sha,
      '--member',
      'members/new-provider',
      '--test',
      'one.spec.ts',
      '--out',
      out,
    ],
    work,
  )
  assert.equal(result.status, 3)
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  assert.equal(report.slotHeld, false)
  assert.equal(report.wrapperProcess.code, 75)
  assert.equal(report.probes.pnpm.version, null)
  assert.ok(report.probes.pnpm.reason)
  assert.equal(report.probes.status, 'not-run')
})

for (const scenario of ['queue', 'members']) {
  test(`stage budgets preserve successful ${scenario} work beyond one child deadline`, t => {
    const f = fixture(t)
    const entry = shortSettleEntry(f)
    if (scenario === 'queue') {
      const slot = join(f.root, 'scripts/with-test-slot.mjs')
      writeFileSync(
        slot,
        `await new Promise(r=>setTimeout(r,4000));\n${readFileSync(slot, 'utf8')}`,
      )
    } else {
      const member = join(f.root, 'members/new-provider')
      const runner = join(member, 'node_modules/vitest/vitest.mjs')
      writeFileSync(
        runner,
        `await new Promise(r=>setTimeout(r,1800));\n${readFileSync(runner, 'utf8')}`,
      )
      cpSync(member, join(f.root, 'members/second-provider'), { recursive: true })
    }
    const out = join(f.base, 'staged-evidence')
    const result = command(
      process.execPath,
      [
        entry,
        'run',
        '--root',
        f.root,
        '--sha',
        f.sha,
        '--out',
        out,
        '--timeout-ms',
        '2500',
        '--member',
        'members/new-provider',
        '--test',
        'one.spec.ts',
        ...(scenario === 'members'
          ? ['--member', 'members/second-provider', '--test', 'two.spec.ts']
          : []),
      ],
      work,
      { OMNE_TEST_SLOT_HELD: '', OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '10' },
    )
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
    assert.equal(result.status, 0, JSON.stringify(report))
    assert.equal(report.conclusion, 'passed')
    assert.equal(report.members.length, scenario === 'members' ? 2 : 1)
    assert.ok(report.members.every(member => member.process.interrupted === null))
  })
}

test('child timeout preserves observed probes and the original child exit result', t => {
  const f = fixture(t)
  const runner = join(f.root, 'members/new-provider/node_modules/vitest/vitest.mjs')
  writeFileSync(runner, 'setInterval(()=>{},1000)')
  const result = run(f, ['--timeout-ms', '2500'])
  assert.equal(result.status, 3)
  assert.equal(result.report.probes.satisfied, true)
  assert.ok(result.report.probes.pnpm.version)
  assert.equal(result.report.slotHeld, true)
  assert.equal(result.report.members[0].process.interrupted, 'timeout')
  assert.ok('code' in result.report.members[0].process)
  assert.notEqual(result.report.members[0].process.code, 0)
  assert.equal(result.report.members[0].process.deadline.phase, 'subprocess')
})

test('stalled runner stage produces an incomplete report with deadline and unknown probe metadata', t => {
  const f = fixture(t)
  writeFileSync(
    join(f.root, 'scripts/with-test-slot.mjs'),
    `import {enterStage} from ${JSON.stringify(new URL('./deadlines.mjs', import.meta.url).href)}; enterStage('runner'); setInterval(()=>{},1000);`,
  )
  const out = join(f.base, 'stalled-evidence')
  const result = command(
    process.execPath,
    [
      shortSettleEntry(f),
      'run',
      '--root',
      f.root,
      '--sha',
      f.sha,
      '--member',
      'members/new-provider',
      '--test',
      'one.spec.ts',
      '--out',
      out,
    ],
    work,
    { OMNE_TEST_SLOT_HELD: '' },
  )
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'))
  assert.equal(result.status, 3)
  assert.equal(report.wrapperProcess.interrupted, 'timeout')
  assert.equal(report.wrapperProcess.deadline.phase, 'runner')
  assert.equal(report.wrapperProcess.deadline.settleMs, 1000)
  assert.ok('code' in report.wrapperProcess)
  assert.equal(report.probes.status, 'not-run')
  assert.equal(report.probes.pnpm.version, null)
  assert.ok(report.probes.pnpm.reason)
  assert.equal(report.slotHeld, null)
  assert.ok(report.slotHeldReason)
})
