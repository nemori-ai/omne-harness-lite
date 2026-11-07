// Tool 运行时组的配置（B 段）：bundle 只建一次，建时就要全部数值，所以整组的配置只放在 `tool-records` 行上
// （一个插件体、一个记录仓、一个启动协调器）。字段的含义归 `@omne-harness/tool` 的 `ToolConfiguration` 与
// tool-host-local 的 `LocalToolRuntimeInput`；`maxCommandBytes`、`maxChunkBytes` 归 tool-storage-sql 的输出保管。
// 发行层不写数值（R2-D6 同一口径）：全部由运维者层给，缺任何一项本行装载时失败，不取成员初值冒充部署值。
import { isAbsolute } from 'node:path'
import type { ToolConfiguration } from '@omne-harness/tool'
import { z } from 'zod'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
/** 计时器能保持的最长延迟（`driverRetryDelayMs` 的上界，见 ToolConfiguration）。 */
const timerMs = z.number().int().min(1).max(2_147_483_647)

export const toolConfigurationSchema = z.strictObject({
  authorBufferBytes: positive,
  authorBufferItems: positive,
  authorWaitHistoryBytes: positive,
  authorWaitHistoryItems: positive,
  processBatchBytes: positive,
  processBatchDelayMs: nonNegative,
  observerBufferBytes: positive,
  resultPageBytes: positive,
  offloading: z.strictObject({
    maxInlineUtf8Bytes: positive,
    maxRetentionMs: positive,
    maxBodyBytes: positive,
    previewUtf8Bytes: positive,
    maxPageBytes: positive,
    maxPageLeaseMs: positive,
  }),
  reconciliationDelayMs: nonNegative,
  ledgerCommitAttempts: positive,
  queueCapacity: positive,
  driverStepsPerRun: positive,
  driverRetryDelayMs: timerMs,
}) satisfies z.ZodType<ToolConfiguration>

/** 与 `execution-host` 行的绝对路径同一规则。 */
const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))

export const toolRuntimeConfigSchema = z.strictObject({
  /**
   * 宿主文件根：与 `execution-host` 行的 `filesRoot` 必须相同。Files 的路径按它解析成宿主对象（命名）并核界；
   * 两行不同时命名与提供者打开的对象对不上，调用答冲突或不可用。装载时不核两行相等（具名限制）。
   */
  filesRoot: absolutePath,
  /** 与 `session-storage` 行相等：Tool 参加者在会话存储组合里，同一事务域、同一登记。 */
  combinationVersion: z.string().min(1).max(1024),
  /** 交给 `storage` 行的同一个值（装配页 `tool-records` 行）。 */
  maxCommandBytes: positive,
  /** 输出保管一块原字节的上限；编码后加信封必须放进一条命令。 */
  maxChunkBytes: positive,
  configuration: toolConfigurationSchema,
  capacity: positive,
  observersPerCall: positive,
  observerQueueFrames: positive,
  observerResidenceMs: positive,
})

export type ToolRuntimeConfig = z.infer<typeof toolRuntimeConfigSchema>
