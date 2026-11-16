// 检查的启动段 scripts/check-bootstrap.mjs：在夹具仓库里用真实的 Node 起它，PATH 上的 node 与 pnpm 换成替身。
// 守的是五步的顺序与每一格的结论——前一步失败就以 2 停下、不做后面的，输出写明期望、实际与修法；
// 依赖与锁文件本体一致时不动，不一致时带 --ignore-scripts 离线重装并准备原生依赖；macOS 上不可执行的 spawn-helper 被修好。
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, type TestContext } from 'vitest'

/** 替身是 sh 脚本，Windows 上起不了；按平台跳过用运行时的 skip（慢层的 preParse 会丢掉全是静态 skipIf 的文件）。 */
const needs = (context: TestContext, platforms: readonly NodeJS.Platform[]) => {
  if (!platforms.includes(process.platform))
    context.skip(`替身是 sh 脚本，只在 ${platforms.join('、')} 上跑`)
}
const POSIX: readonly NodeJS.Platform[] = ['darwin', 'linux']

const REPOSITORY = new URL('../../../', import.meta.url)
const homes: string[] = []
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

const MAIN = "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n"
const LOCKFILE = `---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    packageManagerDependencies:\n      pnpm:\n        specifier: 12.18.0\n        version: 12.18.0\n\n---\n${MAIN}`

interface Manifest {
  readonly packageManager?: string
  readonly devPnpm?: string
}

function fixture(manifest: Manifest = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'omne-check-bootstrap-')))
  homes.push(home)
  const root = join(home, 'root'),
    bin = join(home, 'bin'),
    trace = join(home, 'trace')
  const put = (path: string, text: string, mode = 0o644) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
    chmodSync(path, mode)
  }
  for (const name of ['check-bootstrap.mjs', 'prepare-native.mjs'])
    put(
      join(root, 'scripts', name),
      readFileSync(new URL(`scripts/${name}`, REPOSITORY), 'utf8'),
      0o755,
    )
  put(
    join(root, 'package.json'),
    `${JSON.stringify({
      packageManager: manifest.packageManager ?? 'pnpm@12.18.0',
      engines: { node: '>=24' },
      devEngines: {
        runtime: { name: 'node', version: '26.13.1', onFail: 'download' },
        packageManager: {
          name: 'pnpm',
          version: manifest.devPnpm ?? '12.18.0',
          onFail: 'download',
        },
      },
    })}\n`,
  )
  put(join(root, 'pnpm-lock.yaml'), LOCKFILE)
  // PATH 上的 node 只被问版本；pnpm 认 -v、exec node -v、离线安装与 rebuild，每次调用记一行。
  put(join(bin, 'node'), '#!/bin/sh\necho "${PATH_NODE:-v24.22.0}"\n', 0o755)
  put(
    join(bin, 'pnpm'),
    `#!/bin/sh
echo "pnpm $*" >> "${trace}"
case "$*" in
  -v) echo "\${PNPM_VERSION:-12.18.0}" ;;
  "--silent exec node -v")
    [ -f node_modules/.pnpm/lock.yaml ] || { echo ERR_PNPM_VERIFY_DEPS_BEFORE_RUN >&2; exit 1; }
    echo "\${RUNTIME:-v26.13.1}" ;;
  install*)
    [ -n "\${INSTALL_FAIL:-}" ] && { echo ERR_PNPM_NO_OFFLINE_TARBALL >&2; exit 1; }
    mkdir -p node_modules/.pnpm && sed '1,/^---$/d' pnpm-lock.yaml > node_modules/.pnpm/lock.yaml ;;
  "-r rebuild node-pty") echo rebuilt ;;
  *) exit 97 ;;
esac
`,
    0o755,
  )
  const installed = () => put(join(root, 'node_modules/.pnpm/lock.yaml'), MAIN)
  const helper = (bytes: Buffer, mode: number) => {
    const path = join(
      root,
      'node_modules/.pnpm/node-pty@1.1.0/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
    )
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
    chmodSync(path, mode)
    return path
  }
  const run = (env: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/check-bootstrap.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, ...env },
    })
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n') : [],
    }
  }
  return { root, run, installed, helper }
}

describe('启动段', () => {
  it('全部一致：退出 0，不重装，标准输出是交给检查器的一行结果', context => {
    needs(context, POSIX)
    const f = fixture()
    f.installed()
    const ran = f.run()
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.calls).toEqual(['pnpm -v', 'pnpm --silent exec node -v'])
    expect(JSON.parse(ran.stdout)).toMatchObject({
      toolchain: { pnpm: '12.18.0', node: 'v24.22.0', runtime: 'v26.13.1' },
      dependencies: { status: 'in-sync' },
    })
    expect(ran.stderr).toContain('启动段：依赖——')
  })

  it('packageManager 与 devEngines.packageManager 不同：第一步失败，不起 pnpm，写明期望、实际与修法', context => {
    needs(context, POSIX)
    const f = fixture({ devPnpm: '12.17.0' })
    f.installed()
    const ran = f.run()
    expect(ran.status).toBe(2)
    expect(ran.stdout).toBe('')
    expect(ran.calls).toEqual([])
    expect(ran.stderr).toContain('启动段：工具链失败')
    expect(ran.stderr).toMatch(/期望：.*实际：12\.18\.0 与 12\.17\.0/u)
    expect(ran.stderr).toContain('修法：')
  })

  it('PATH 上的 Node 是 22：第一步失败，写明 engines 与修法；24 照常', context => {
    needs(context, POSIX)
    const f = fixture()
    f.installed()
    const old = f.run({ PATH_NODE: 'v22.20.0' })
    expect(old.status).toBe(2)
    expect(old.calls).toEqual([])
    expect(old.stderr).toMatch(/期望：>=24；实际：v22\.20\.0/u)
    expect(old.stderr).toContain('修法：装 Node 24 及以上')
    expect(f.run({ PATH_NODE: 'v24.0.0' }).status).toBe(0)
  })

  it('pnpm 实际版本不是声明：第一步失败，不装依赖', context => {
    needs(context, POSIX)
    const f = fixture()
    const ran = f.run({ PNPM_VERSION: '12.14.0' })
    expect(ran.status).toBe(2)
    expect(ran.calls).toEqual(['pnpm -v'])
    expect(ran.stderr).toMatch(/期望：12\.18\.0；实际：12\.14\.0/u)
  })

  it('没有依赖目录：带 --ignore-scripts 离线重装、准备原生依赖，之后才核对经 pnpm 起的 Node', context => {
    needs(context, POSIX)
    const f = fixture()
    const ran = f.run()
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.calls).toEqual([
      'pnpm -v',
      'pnpm install --offline --frozen-lockfile --ignore-scripts',
      'pnpm -r rebuild node-pty',
      'pnpm --silent exec node -v',
    ])
    expect(JSON.parse(ran.stdout)).toMatchObject({ dependencies: { status: 'reinstalled' } })
  })

  it('store 为空、离线安装失败：以 2 停下，给出的联网重装命令与 CONTRIBUTING.md 的准备命令相同', context => {
    needs(context, POSIX)
    const f = fixture()
    const ran = f.run({ INSTALL_FAIL: '1' })
    expect(ran.status).toBe(2)
    expect(ran.stdout).toBe('')
    expect(ran.calls).not.toContain('pnpm --silent exec node -v')
    expect(ran.stderr).toContain('ERR_PNPM_NO_OFFLINE_TARBALL')
    const docs = readFileSync(new URL('CONTRIBUTING.md', REPOSITORY), 'utf8')
    const prepare = /### 准备检出[\s\S]*?```sh\n([\s\S]*?)```/u.exec(docs)?.[1]
    expect(prepare).toBeDefined()
    for (const line of [
      'pnpm install --frozen-lockfile --ignore-scripts',
      'pnpm run prepare:native',
    ]) {
      expect(prepare).toContain(line)
      expect(ran.stderr).toContain(line)
    }
  })

  it('经 pnpm 起的 Node 不是 devEngines.runtime：第三步失败', context => {
    needs(context, POSIX)
    const f = fixture()
    f.installed()
    const ran = f.run({ RUNTIME: 'v24.22.0' })
    expect(ran.status).toBe(2)
    expect(ran.stderr).toContain('启动段：运行时失败')
    expect(ran.stderr).toMatch(/期望：v26\.13\.1；实际：v24\.22\.0/u)
  })

  it('macOS：spawn-helper 没有执行位就修好；不是 Mach-O 就失败并写明重装', context => {
    needs(context, ['darwin'])
    const f = fixture()
    f.installed()
    const machO = Buffer.from('cffaedfe0000', 'hex')
    const path = f.helper(machO, 0o644)
    const repaired = f.run()
    expect(repaired.status, repaired.stderr).toBe(0)
    expect(statSync(path).mode & 0o777).toBe(0o755)
    expect(JSON.parse(repaired.stdout)).toMatchObject({ native: { status: 'repaired' } })
    f.helper(Buffer.from('efbfbdefbfbd', 'hex'), 0o755)
    const broken = f.run()
    expect(broken.status).toBe(2)
    expect(broken.stderr).toContain('不是 Mach-O 文件')
    expect(broken.stderr).toContain('准备检出')
  })
})
