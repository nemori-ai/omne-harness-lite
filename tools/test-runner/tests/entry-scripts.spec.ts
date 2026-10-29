// 根脚本背后的四个入口脚本（scripts/ 下）：只核它们拥有的部分——参数怎样分派、谁占运行名额、先后与退出码。
// 真正的命令换成记录参数的假程序：node、uv 放在 PATH 前面，运行名额与钉住的 omne-metrics 放在脚本找它们的位置。
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const SCRIPTS = ['metrics.sh', 'slot-unless-plan-only.sh', 'test-tier.sh', 'check-design.sh']

function executable(path: string, text: string): void {
  writeFileSync(path, text)
  chmodSync(path, 0o755)
}

function fixture() {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-entry-scripts-')))
  homes.push(home)
  const root = join(home, 'root'),
    bin = join(home, 'bin'),
    trace = join(home, 'trace')
  for (const dir of [join(root, 'scripts'), join(root, 'node_modules/.bin'), bin])
    mkdirSync(dir, { recursive: true })
  for (const name of SCRIPTS)
    executable(
      join(root, 'scripts', name),
      readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), 'utf8'),
    )
  executable(
    join(root, 'scripts/with-test-slot.sh'),
    '#!/usr/bin/env bash\nprintf "slot|%s\\n" "$*" >> "$TRACE"\nexec "$@"\n',
  )
  // omne-metrics 另记下 --plan 指向的文件在它运行时是否存在。
  executable(
    join(root, 'node_modules/.bin/omne-metrics'),
    `#!/usr/bin/env bash
printf 'omne-metrics|%s\\n' "$*" >> "$TRACE"
while (( $# )); do
  if [[ "$1" == --plan ]]; then [[ -f "$2" ]] && echo "plan-file|present" >> "$TRACE"; fi
  shift
done
`,
  )
  // node 只认测试运行器的 plan：写出 --json 指向的计划文件；FAIL_NODE 给出退出码。
  executable(
    join(bin, 'node'),
    `#!/usr/bin/env bash
printf 'node|%s\\n' "$*" >> "$TRACE"
args=("$@")
for (( i = 0; i < \${#args[@]}; i++ )); do
  if [[ "\${args[i]}" == --json ]]; then echo '{}' > "\${args[i+1]}"; fi
done
exit "\${FAIL_NODE:-0}"
`,
  )
  executable(join(bin, 'uv'), '#!/usr/bin/env bash\nprintf "uv|%s\\n" "$*" >> "$TRACE"\n')
  const run = (script: string, args: string[], env: Record<string, string> = {}) => {
    writeFileSync(trace, '')
    const result = spawnSync('bash', [join(root, 'scripts', script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, TRACE: trace, ...env },
    })
    const lines = readFileSync(trace, 'utf8').split('\n').filter(Boolean)
    return { status: result.status, stderr: result.stderr, lines }
  }
  return { run }
}

describe('metrics.sh', () => {
  it('带 --coverage、没给 --plan：先算计划（--base 交给计划），再占名额以 --plan 交给 omne-metrics', () => {
    const { run } = fixture()
    const ran = run('metrics.sh', ['--base', 'abc', '--coverage', '--out', 'o'])
    expect(ran.status, ran.stderr).toBe(0)
    const [plan, slot, metrics, present] = ran.lines
    expect(plan).toMatch(
      /^node\|.*tools\/test-runner\/src\/testing\/cli\.ts plan --base abc --json \S+\/plan\.json$/u,
    )
    // 名额脚本用 Node 起命令，.bin 里的 shell shim 要显式经 bash。
    expect(slot).toMatch(
      /^slot\|bash node_modules\/\.bin\/omne-metrics --plan \S+\/plan\.json --coverage --out o$/u,
    )
    expect(metrics).not.toContain('--base')
    expect(present).toBe('plan-file|present')
  })

  it('带 --coverage 与 --plan：不另算计划，参数原样交下去并占名额', () => {
    const { run } = fixture()
    const ran = run('metrics.sh', ['--coverage', '--plan', 'p.json'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual([
      'slot|bash node_modules/.bin/omne-metrics --coverage --plan p.json',
      'omne-metrics|--coverage --plan p.json',
    ])
  })

  it('不带 --coverage：不算计划、不占名额，参数原样交下去', () => {
    const { run } = fixture()
    const ran = run('metrics.sh', ['--base', 'abc', '--out', 'o'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toEqual(['omne-metrics|--base abc --out o'])
  })

  it('算计划失败：退出非零，不运行 omne-metrics', () => {
    const { run } = fixture()
    const ran = run('metrics.sh', ['--coverage'], { FAIL_NODE: '3' })
    expect(ran.status).toBe(3)
    expect(ran.lines.some(line => line.startsWith('omne-metrics|'))).toBe(false)
  })
})

describe('slot-unless-plan-only.sh', () => {
  it('实际运行时占名额；带 --plan-only 时不占', () => {
    const { run } = fixture()
    expect(run('slot-unless-plan-only.sh', ['node', 'cli.ts', 'run']).lines).toEqual([
      'slot|node cli.ts run',
      'node|cli.ts run',
    ])
    expect(run('slot-unless-plan-only.sh', ['node', 'cli.ts', 'run', '--plan-only']).lines).toEqual(
      ['node|cli.ts run --plan-only'],
    )
  })
})

describe('test-tier.sh', () => {
  it('缺层或多给参数退出 2；给了层就占名额、先构建、跑全部成员的这一层', () => {
    const { run } = fixture()
    expect(run('test-tier.sh', []).status).toBe(2)
    expect(run('test-tier.sh', ['slow', 'fast']).status).toBe(2)
    const ran = run('test-tier.sh', ['slow'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines[0]).toMatch(/^slot\|node .*testing\/cli\.ts run --all --tier slow --build$/u)
  })
})

describe('check-design.sh', () => {
  it('--stale 只交给第二条；没给值或认不出的参数退出 2', () => {
    const { run } = fixture()
    const ran = run('check-design.sh', ['--stale', 'report'])
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.lines).toHaveLength(2)
    expect(ran.lines[0]).toContain('check_sources.py')
    expect(ran.lines[0]).not.toContain('--stale')
    expect(ran.lines[1]).toMatch(/domain_objects\.py .* --stale report$/u)
    expect(run('check-design.sh', []).lines[1]).not.toContain('--stale')
    expect(run('check-design.sh', ['--stale']).status).toBe(2)
    expect(run('check-design.sh', ['--bogus']).status).toBe(2)
  })
})
