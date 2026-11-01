// `session-storage` 行的配置（装配页 `session-storage` 行配置栏的本波子集）：组合版本、登记表文件位置与推导规则的名字。
// 只含数据（IC-16）。规则本身在 `directory.ts`；这里只命名它，发行层写出采用的规则。
import { isAbsolute } from 'node:path'
import { z } from 'zod'

/** 事务域推导规则：`tenant/<organization>/<account>`，用 legal-identity 的公开 codec，可逆。 */
export const DOMAIN_RULE = 'organization-account/1'

export const sessionStorageRowConfigSchema = z.strictObject({
  /** 组合登记的版本（sql-contract §6.1 登记键的一项）。参加者变化时换一个版本。 */
  combinationVersion: z.string().min(1).max(1024),
  /** 登记表文件的绝对路径，放在存储根目录下。 */
  directoryFile: z.string().refine(isAbsolute, 'directoryFile must be an absolute path'),
  domainRule: z.literal(DOMAIN_RULE),
})

export type SessionStorageRowConfig = z.infer<typeof sessionStorageRowConfigSchema>
