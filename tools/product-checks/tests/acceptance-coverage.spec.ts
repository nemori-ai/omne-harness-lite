// 验收覆盖声明的正反夹具：合乎写法的声明通过；缺声明、两行声明、声明不在开头、写法不对、场景不存在、
// 编号重复、文件名的 topic 不在声明里、有验收却没有 acceptance 脚本，各自指名报出。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  inspectCoverage,
  judgeCoverage,
  listAcceptanceFiles,
  memberOfAcceptance,
  type AcceptanceFile,
} from '../src/acceptance/coverage.ts'
import type { AcceptanceLockConfig } from '@omne-harness/repo-toolchain/acceptance/lock'
import { scenarioRows, type ProductTopic } from '@omne-harness/repo-toolchain/product/scenarios'

const config: AcceptanceLockConfig = {
  memberRoots: ['packages', 'apps'],
  directory: 'acceptance',
  ownerRoles: ['main', 'qa'],
}

const topic = (dir: string, acceptance: string): ProductTopic => ({
  dir,
  topic: dir.slice(0, 6),
  scenarios: scenarioRows(acceptance),
})
const TOPICS = [
  topic(
    'PF-016-cli',
    '| # | 场景 |\n|---|---|\n| S5 | 没有屏 |\n| **S6** | 调试 |\n| S7 | x |\n| S7 | 重复 |\n',
  ),
  topic('PF-017-center', '| A01 | 中心没启动 |\n'),
]
const PATH = 'apps/cli/acceptance/PF-016.no-screen.acceptance.ts'
const BODY = "import { it } from 'vitest'\n\nit('x', () => {})\n"

function judge(text: string, path = PATH, hasScript = true) {
  const files: AcceptanceFile[] = [{ path, text }]
  return judgeCoverage({ files, topics: TOPICS, hasScript: () => hasScript, config })
}
const messages = (text: string, path = PATH) =>
  judge(text, path).violations.map(v => `${v.path}:${v.line} ${v.message}`)

describe('覆盖声明：判断', () => {
  it('开头注释块里一行声明、场景都在、文件名的 topic 在声明里：通过，并读出覆盖了哪些场景', () => {
    const judged = judge(
      `// covers: PF-016 S5, PF-016 S6，PF-017 A01\n// 一句说明\n\n// 第二段注释\n${BODY}`,
    )
    expect(judged.violations).toEqual([])
    expect(judged.declarations).toEqual([
      {
        path: PATH,
        covers: [
          { topic: 'PF-016', id: 'S5' },
          { topic: 'PF-016', id: 'S6' },
          { topic: 'PF-017', id: 'A01' },
        ],
      },
    ])
  })

  it('缺声明', () => {
    expect(messages(`// 只有说明\n${BODY}`)).toEqual([
      `${PATH}:1 开头的注释块里缺覆盖声明：恰好一行 \`// covers: PF-<三位> <场景编号>\`，多条用逗号隔开`,
    ])
  })

  it('两行声明', () => {
    expect(messages(`// covers: PF-016 S5\n// covers: PF-016 S6\n${BODY}`)).toEqual([
      `${PATH}:2 开头的注释块里有 2 行覆盖声明（第 1、2 行），只能有一行`,
    ])
  })

  it('声明写在代码之后：不算开头的那一行，两条都报', () => {
    expect(messages(`// 说明\n${BODY}// covers: PF-016 S5\n`)).toEqual([
      `${PATH}:5 覆盖声明要写在文件开头的注释块里`,
      `${PATH}:1 开头的注释块里缺覆盖声明：恰好一行 \`// covers: PF-<三位> <场景编号>\`，多条用逗号隔开`,
    ])
  })

  it('场景不存在：点名这份验收、那一项与该改的文件', () => {
    expect(messages(`// covers: PF-016 S5, PF-016 S9\n${BODY}`)).toEqual([
      `${PATH}:1 PF-016 S9 在 PF-016-cli/acceptance.md 里没有带这个编号的场景行：场景改了含义会换新编号，这份验收要跟着改或删`,
    ])
  })

  it('topic 不存在、编号在 acceptance.md 里重复', () => {
    expect(messages(`// covers: PF-016 S5, PF-099 S1, PF-016 S7\n${BODY}`)).toEqual([
      `${PATH}:1 PF-099 在产品区里没有对应的 topic 目录`,
      `${PATH}:1 PF-016 S7 在 PF-016-cli/acceptance.md 里出现了 2 次（第 5、6 行），指不到唯一的一行`,
    ])
  })

  it('写法不对的项、空项、写了两次的项', () => {
    expect(messages(`// covers: PF-016 S5, PF-16 S6, PF-016 S-1, , PF-016 S5\n${BODY}`)).toEqual([
      `${PATH}:1 覆盖声明的「PF-16 S6」要写成 PF-<三位> <场景编号>（如 PF-016 S5）`,
      `${PATH}:1 覆盖声明的「PF-016 S-1」要写成 PF-<三位> <场景编号>（如 PF-016 S5）`,
      `${PATH}:1 覆盖声明里有一项是空的`,
      `${PATH}:1 覆盖声明里 PF-016 S5 写了两次`,
    ])
  })

  it('文件名的 topic 不在声明里；文件名不以 topic 编号开头', () => {
    expect(messages(`// covers: PF-017 A01\n${BODY}`)).toEqual([
      `${PATH}:1 文件名的 PF-016 不在它声明覆盖的 topic 里（PF-017）`,
    ])
    const unnamed = 'apps/cli/acceptance/ST-016-01.acceptance.ts'
    expect(messages(`// covers: PF-016 S5\n${BODY}`, unnamed)).toEqual([
      `${unnamed}:1 文件名要以它覆盖的 topic 编号开头：<topic 编号>.<一句话>.acceptance.ts`,
    ])
  })

  it('成员有验收却没有 acceptance 脚本', () => {
    const judged = judge(`// covers: PF-016 S5\n${BODY}`, PATH, false)
    expect(judged.violations).toEqual([
      {
        rule: 'acceptance-covers',
        path: 'apps/cli/package.json',
        line: 0,
        message: '成员有可执行验收，却没有 `acceptance` 脚本：这些验收不会被任何入口运行',
      },
    ])
  })

  it('成员目录取 acceptance 那一段之前', () => {
    expect(memberOfAcceptance(PATH, config)).toBe('apps/cli')
    expect(
      memberOfAcceptance('packages/core/x/acceptance/deep/PF-001.a.acceptance.ts', config),
    ).toBe('packages/core/x')
  })
})

describe('覆盖声明：读仓库', () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })
  const write = (root: string, path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }

  it('只收成员根下 acceptance 目录里的 *.acceptance.ts，node_modules 与 dist 不进；场景从产品区读', () => {
    const root = mkdtempSync(join(tmpdir(), 'coverage-'))
    made.push(root)
    write(root, 'product/cli/README.md', '---\nid: PD-cli\nrevision: 1\nstatus: draft\n---\n')
    write(root, 'product/cli/design.md', '# Product')
    write(root, 'product/cli/acceptance.md', '| S5 | 没有屏 |\n')
    write(root, 'apps/cli/package.json', '{"scripts":{"acceptance":"vitest run"}}')
    write(root, PATH, `// covers: PF-016 S5\n${BODY}`)
    write(root, 'apps/cli/acceptance/vitest.config.ts', 'export default {}\n')
    write(root, 'apps/cli/acceptance/node_modules/x/PF-016.a.acceptance.ts', '')
    write(root, 'apps/cli/dist/acceptance/PF-016.a.acceptance.ts', '')
    write(root, 'apps/cli/tests/PF-016.a.acceptance.ts', '')
    write(root, 'tools/x/acceptance/PF-016.a.acceptance.ts', '')
    expect(listAcceptanceFiles(root, config)).toEqual([PATH])
    expect(inspectCoverage(root, 'product', config).violations.map(v => v.message)).toEqual([
      'PF-016 在产品区里没有对应的 topic 目录',
    ])

    write(root, 'product/cli/acceptance.md', '| S5b | 含义变了，换了新编号 |\n')
    expect(inspectCoverage(root, 'product', config).violations.map(v => v.message)).toEqual([
      'PF-016 在产品区里没有对应的 topic 目录',
    ])
  })
})
