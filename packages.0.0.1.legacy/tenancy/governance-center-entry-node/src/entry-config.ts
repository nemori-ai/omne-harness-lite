import { z } from 'zod'

/** 入口层加载时等待中心时钟超界；装配按类型归类，不依赖说明文字。 */
export class GovernanceCenterClockTimeoutError extends Error {
  override readonly name = 'GovernanceCenterClockTimeoutError'

  constructor() {
    super('governance-center-entry: the center clock could not be read within clockReadyTimeoutMs')
  }
}

export interface GovernanceCenterEntryConfig {
  /** 监听地址与端口（部署配置；端口 0 由系统分配，只给测试用）。 */
  readonly listen: { readonly host: string; readonly port: number }
  /** TLS 证书链与私钥（PEM，部署配置输入，不是部署密钥）。 */
  readonly tls: { readonly certificateChainPem: string; readonly privateKeyPem: string }
  /** 中心所装版本的标识（公开体检里的 `version`）。 */
  readonly version: string
  /** 停机排空上界（毫秒）。 */
  readonly drainTimeoutMs: number
  /** 启动时与开门那一刻等钟可读的上界（毫秒）；须严格大于时钟的租约宽度（装配核）。 */
  readonly clockReadyTimeoutMs: number
}

const positiveMs = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const GovernanceCenterEntryConfigSchema: z.ZodType<GovernanceCenterEntryConfig, unknown> = z
  .object({
    listen: z
      .object({ host: z.string().min(1), port: z.number().int().min(0).max(65535) })
      .strict(),
    tls: z
      .object({ certificateChainPem: z.string().min(1), privateKeyPem: z.string().min(1) })
      .strict(),
    version: z.string().min(1),
    drainTimeoutMs: positiveMs,
    clockReadyTimeoutMs: positiveMs,
  })
  .strict()
