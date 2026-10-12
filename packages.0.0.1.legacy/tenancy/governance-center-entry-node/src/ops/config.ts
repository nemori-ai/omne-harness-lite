import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { DeploymentKeyLoad, DeploymentParameters } from './health.ts'

export interface GovernanceCenterOpsConfig {
  /** 套接字所在的目录（绝对路径）；只对中心的运行用户可访问。 */
  readonly socketDirectory: string
  readonly deploymentKey: DeploymentKeyLoad
  readonly deploymentParameters: DeploymentParameters
  readonly maintenance: {
    readonly backupDirectory: string
    readonly sourceBuildId: string | null
    readonly migrationNames: readonly string[]
  }
}

const parameter = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const GovernanceCenterOpsConfigSchema: z.ZodType<GovernanceCenterOpsConfig, unknown> = z
  .object({
    socketDirectory: z.string().refine(isAbsolute, 'socketDirectory must be an absolute path'),
    deploymentKey: z.object({ present: z.literal(true), complete: z.literal(true) }).strict(),
    maintenance: z
      .object({
        backupDirectory: z.string().refine(isAbsolute),
        sourceBuildId: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
        migrationNames: z
          .array(z.string().regex(/^[A-Za-z0-9_]{1,128}$/))
          .min(1)
          .max(256)
          .refine(names => new Set(names).size === names.length),
      })
      .strict(),
    deploymentParameters: z
      .object({
        unactivatedRetention: parameter,
        invitationTtlDefault: parameter,
        affiliationRequestTtlDefault: parameter,
        copyNoticeTtlDefault: parameter,
        sharingInvitationTtlDefault: parameter,
      })
      .strict(),
  })
  .strict()

/** 撤除时等在途体检答完的上界：体检里最慢的一项是现探存储（它自己有 2 s 上界）。 */
