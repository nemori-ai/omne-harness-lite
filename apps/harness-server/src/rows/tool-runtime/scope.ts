// 发行的并发作用域与固定请求的上下文采用（B 段）。tool-host-local 的授予核验器只认装配给它的一个作用域值，
// 填请求的一方（Tool 请求供给者）交同一个值（`createLocalGrantVerifiers` 的 D1 决定）。所以作用域只在这里定义一次，
// 两边都从这里取。已知限制（tool-host-local 同一条）：M2 一个装配只有一个作用域，全部调用共用一个 FIFO 键前缀。
import type { ResourceScope } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'

const OWNER = '@omne-harness/harness-server'

const grantAdoption = describedAdoption({
  owner: OWNER,
  name: 'release-tool-scope',
  revision: '1',
})

/** 发行唯一的并发作用域：拥有者、键与固定的授予证据。 */
export const RELEASE_TOOL_SCOPE: ResourceScope = Object.freeze({
  owner: OWNER,
  key: 'release-tool-scope',
  grant: Object.freeze({
    owner: OWNER,
    record: 'harness-server#release-tool-scope',
    revision: grantAdoption.revision,
    digest: grantAdoption.digest,
  }),
})

/** 固定请求的 `context` 采用：本发行的 Tool 请求供给者。 */
export const RELEASE_REQUEST_CONTEXT = describedAdoption({
  owner: OWNER,
  name: 'tool-request-source',
  revision: '1',
})
