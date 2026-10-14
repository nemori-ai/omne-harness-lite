# 共同纯表示能力组

本组是条件性工程位置，依据为[目标包组织](../../docs/package-organization.md#目标目录)。下面三份成员已经在 workspace 里。`json-text` 已导出读取函数。`utc-instant` 已导出时间点、SI 时长和 `compareInstants`。`legal-identity` 的行为仍由 #243 交付。

## 责任与范围

至少两个具名消费者需要同一纯表示，且原语义拥有者确认含义一致时，才提出成员。本组不接管相邻领域的业务规则或事实权威。

公共 JSON 文本读取的签名和失败归[架构页](../../docs/architecture/cross-cutting-concepts.md#json-text-reader)。本组不另写该契约。

## 成员与依赖

依赖方向见[包边界与公开入口](../../docs/package-organization.md#包边界与公开入口)。下表的三个目录现在是 workspace 成员。`json-text` 的读取函数已经实现，负责人尚未接受。`utc-instant` 的公开行为已经实现，过期对外结果的接受见 [#244](https://github.com/nemori-ai/omne-harness-lite/issues/244#issuecomment-6171766684)。`legal-identity` 的行为仍由 #243 交付。

| 目标成员 | 状态 | 拥有的纯值 | 具名消费者 |
| --- | --- | --- | --- |
| `json-text` | 读取函数已实现，尚未接受。叶子名在本分支确定为 `json-text`。#242 当时没有裁定名字，并禁止从旧目录猜测 | 严格 JSON 文本读取 | 后续的配置读取、协议解码与持久记录读取。当前没有生产消费者 |
| `legal-identity` | workspace 草稿。行为归 #243 | 合法身份文本、相等、租户组合 | `packages/identity/identity` 与 `packages/session/session` |
| `utc-instant` | 公开行为已实现。过期对外结果已由 PanQiWei 于 2026-10-14 接受，见 [#244](https://github.com/nemori-ai/omne-harness-lite/issues/244#issuecomment-6171766684)。整卡尚未接受 | 时间点、SI 时长、唯一比较 | `packages/identity/identity` 与 `packages/tool/tool` |

采用记录是 [Issue 221 技术设计采用](https://github.com/nemori-ai/omne-harness-lite/issues/221#issuecomment-6161958178)。

合法身份是带家族名的记录。账号、组织和登录状态的正文是家族前缀加 26 位 Crockford 字符。错前缀不能解析成另一家族。单独的 `a` 不合法。租户由已解析的组织与账号组成。`tenant()` 是进程内唯一组合函数。本组不铸造新的账号正文。解析成功不是对象存在、成员有效或授权允许。

时间点是 UTC 日历字段加精确小数。比较函数只有 `compareInstants`。它不调用 `Date` 或 `Number`。时长只表示 SI 秒。`P1D` 不是时长。计划时间是民用日期、时刻和时区，不是时间点。业务期限带规则名。到期判断留在业务拥有者。序号不是时间。观察时间不可用时，调用方不把序号改成上一个加一。

墙钟、单调钟和业务时钟是三个读取端口。本组不提供 `Date.now` 默认实现。租约宽度读单调钟。

手写的 `name` 与 `text` 对象在类型上仍可能通过。实现必须把解析函数收成唯一铸造路径。比较规则已经采用。秒数 60 按民用日期早于次日零点。

闰秒表的发布者是 IERS 地球定向中心。PanQiWei 于 2026-10-14 认可沿用它的 Bulletin C，不由本仓库自选日期。纳入范围是 1972 年 6 月 30 日起每一次已经发生的正闰秒，以及 Bulletin C 已经宣布、当前 `leap-seconds.list` 尚未失效的下一次。1972 年 1 月 1 日的起始偏差不是一次 `23:59:60`。负闰秒至今没有发生。IERS 若宣布负闰秒，同一份表纳入它。软件读取 IERS 发布的 `leap-seconds.list`，或 IANA 时区库从该文件转发的副本。表有失效日。过期后不得把旧表当成仍然完整。

## 旧类型与迁移责任

下表对照 `71876225cf9300f0381f09e496b27d4007fb71ea` 上的旧公开类型。旧类型名不构成兼容要求。本卡不删除 legacy 包，也不修改这些消费者的源码。

| 旧公开类型或用法 | 新拥有者 | 消费者迁移责任 |
| --- | --- | --- |
| `AccountId`、`OrganizationId`、`LoginStateId` 共用一个不透明字符串解析 | `legal-identity` | 调用方按家族解析。错前缀得到 `family` |
| `LoginIdentifier` | 不进入 `IDENTITY_SPECS` | 它仍是账号属性，不是身份类型名 |
| 由两个裸字符串组成的 `TenantId` | `legal-identity` 的文本解析与 `tenant()` | `governance-client-operations-local` 的缓存不再收下解析器会拒绝的字符串 |
| 没有相等函数的 `ScopeLayerIdentity` | `legal-identity` | 调用方使用相等函数。重新解析得到新对象 |
| 同一种 `HandoffWarrant` 既解析又签发 | `packages/identity/identity` | 核对凭证不代替授权 |
| 三套 RFC 3339 比较，以及经 `Date` 与 `Number` 的时间点 | `utc-instant` 的 `compareInstants` | `session-runtime`、`call-accounts`、`runtime-context` 去掉各自的本地比较 |
| 用 `Number` 解析的工具时长 | `utc-instant` | `session-runtime-local` 不再对秒字段调用 `Number` |
| 共享的 `deriveState` | 业务拥有者 | 到期判断不放进本组 |
| 用 `filledAt` 充当递增序号 | 序号拥有者 | `asset-registry-local` 不再在钟停住时保存 `previous + 1` |
| 租约读取 `Date.now` | 单调钟端口 | `clock-lease` 不把 `Date.now` 当作默认当前时间 |
| `IDENTITY_TYPE_NAMES` | `legal-identity` 的唯一名单 | `tools/ts-checks` 的 `identity-shapes` 导入这份名单。它删除字面量 `AccountId`。#219 不另写一份拼写 |

## 反例

下表是已采用契约的结果。2026-10-14 的本地探针 `tmp/issue-221-identity-time/probe.mjs` 输出 `probe ok`。该探针不在 Git 中。本表是可核对的结果。

| 输入 | 结果 |
| --- | --- |
| 账号前缀的正文按组织解析 | `family` |
| `a` 按账号解析 | 不成功 |
| 同一账号文本解析两次 | 两个对象。相等函数为真 |
| 小数秒 `0.5005` 与 `0.500` | `0.5005` 更晚 |
| 小数 `0004` 与 `00049` | 不相等 |
| `Math.round(Number('0.5005') * 1000)` | 旧路径得到 `500`。新比较不使用这条路径 |
| `2016-12-31T23:59:60Z` 与次日零点 | 闰秒更早。比较不调用 `Date` |
| `PT1.0000000000000001S` | 保留 16 位小数 |
| `P1D` | `calendar-unit` |
| 租户文本多一个 `role` | 不成功 |
| 序号的下一个，观察时间不可用 | 接受这个序号 |
| 序号不前进，只提供一个时间点 | `stale-sequence` |

## 时钟失败

单调钟不可用时，调用方返回不可用。它不接着读业务时钟。单调读数低于已记录的下界时，结果是 `rollback`。经过的时长大于租约宽度时，结果是 `stopped`。业务时钟不可用时，调用方返回不可用。墙钟跳动不结束租约。观察时间不可用时，序号不改成上一个加一。

进程内的下界是本进程单调钟的高水位。上一进程的单调读数不能和这一进程比较。租约拥有者不得把旧的纳秒值装回下界。

跨进程恢复的持久记录是开租约时的业务时钟瞬间和宽度。记录者是租约拥有者。纯值包和调用方都不临时编一个下界。启动时租约拥有者先读业务时钟。业务时钟不可用时，租约保持不可用，不改用墙钟。业务时钟早于开租约瞬间时，结果是 `rollback`，不继续旧租约。业务时钟晚于开租约瞬间加宽度时，结果是 `stopped`。业务时钟仍在这个窗口内时，用本进程当前单调读数作为新下界。剩余宽度是原宽度减去已经过去的业务时长，不是新的满额宽度。墙钟不是这次恢复的参数。

## 关键协作

原语义拥有者解释定义。消费者通过公开入口引用。共同定义不反向依赖领域状态或提供者。文本读取不导入 Cordis。字段 codec 留在形状拥有者。

#220 接收 `{ parse, encode }` 这一对函数。它不导入解析实现文件。#219 只导入 `IDENTITY_TYPE_NAMES`。它不保留第二份身份拼写。精确失败行为见上面的反例与时钟失败。

## 组合验证

核对消费者对同一表示的解释、序列化边界与依赖闭包。目前没有本组可执行验证资源或通过证据。实际成员成立后，成员与消费者共同说明前提、故障场景与未覆盖范围。

## 维护

组技术拥有者与原语义或事实拥有者共同判断新增成员，文档维护者同步导航、登记及链接。长期个人负责人尚未具名。建包前核对[成员文档规范](../../docs/member-documentation.md)和[开发指南](../../docs/development.md#创建和整改产品包)；条件未满足时在原拥有者处维护局部机制。
