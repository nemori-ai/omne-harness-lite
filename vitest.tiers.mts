// 测试分层的唯一定义：慢层标签与它的时限，以及把环境变量 OMNE_TEST_TIER 翻成 vitest 的过滤条件。
// 每个成员的 vitest 配置在 `test` 里先展开 `testTiers()`，成员自己的设置写在它后面。
// 归慢层：整个测试文件在开头的注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
// 并写一句为什么慢（起子进程、真实等待、重 CPU、网络）。怎么划、谁来跑见 docs/verification.md「测试分层」。

/** 运行器用它告诉成员这一轮只跑哪一层；不设或为空串时两层全跑，与分层之前一样。 */
export const TEST_TIER_ENV = 'OMNE_TEST_TIER'
export const TEST_TIERS = ['fast', 'slow'] as const
export type TestTier = (typeof TEST_TIERS)[number]

/**
 * 慢层用例的时限（毫秒）。它盖过成员配置的 `testTimeout`；用例自己写的时限（选项里的 `timeout`
 * 或 `test(名字, 函数, 毫秒)`）又盖过它。快层用 vitest 的默认时限。负责人 2026-10-02 定的初值。
 */
export const SLOW_TEST_TIMEOUT_MS = 120_000

export function testTiers(env: Readonly<Record<string, string | undefined>> = process.env) {
  const tier = env[TEST_TIER_ENV] ?? ''
  if (tier !== '' && !(TEST_TIERS as readonly string[]).includes(tier))
    throw new Error(`${TEST_TIER_ENV} 只能是 ${TEST_TIERS.join('、')} 或不设，现在是 ${tier}`)
  return {
    tags: [
      {
        name: 'slow',
        description: '慢层：起子进程、真实等待、重 CPU 或网络，耗时超出快层预算',
        timeout: SLOW_TEST_TIMEOUT_MS,
      },
    ],
    ...(tier === ''
      ? {}
      : {
          tagsFilter: [tier === 'fast' ? '!slow' : 'slow'],
          // 一层里可能一个测试都不剩（成员没有慢测试，或全是慢测试）：那不是失败。
          passWithNoTests: true,
          // 整个文件都被滤掉时不导入它；要求标签与用例名是字面量，静态看不出的文件照常导入、照常过滤。
          experimental: { preParse: true },
        }),
  }
}
