// 夹具项目上真起 Stryker：真的挂起的 static 变异体复核仍超时，算测出来（#649）。
// 复核的时限另加 mutation.testTimeoutSeconds（60 秒），这一条单独就要八十秒上下，单放一个文件，不拖同文件的别的用例。
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixture, git, mutate } from './fixtures/mutation.ts'

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  // 变异体在模块加载时把步长算成 0，测试里的循环停不下来；循环本身不经过变异体，命中次数超限判不出，只能时限到了。
  it(
    '真的挂起的 static 变异体复核仍超时，算测出来，不判测量无效（#649）',
    { timeout: 300_000 },
    () => {
      const { root, memberDir } = fixture()
      const body = (step: string) =>
        `export const zero = 0\nexport const STEP = ${step}\nexport function count(n: number): number {\n  let c = 0\n  for (let i = 0; i < n; i += STEP) c += 1\n  return c\n}\n`
      writeFileSync(join(memberDir, 'src/sign.ts'), body('1'))
      writeFileSync(
        join(memberDir, 'tests/sign.spec.ts'),
        "import { count } from '../src/sign.ts'\ntest('count', () => { expect(count(3)).toBe(3) })\n",
      )
      git(root, 'add', '.')
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'count')
      writeFileSync(join(memberDir, 'src/sign.ts'), body('Math.max(1, zero)'))
      const ran = mutate(root, join(root, 'out'), '1')
      expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
      expect(ran.summary?.errors).toEqual([])
      const [member] = ran.summary?.members ?? []
      expect(member).toMatchObject({ valid: true, invalid: [] })
      expect(member?.rechecked).toEqual([
        expect.objectContaining({ line: 2, static: true, verdict: 'Timeout' }),
      ])
      expect(member?.counts['Timeout']).toBe(1)
    },
  )
})
