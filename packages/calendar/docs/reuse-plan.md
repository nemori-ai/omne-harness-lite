# 日历实现的复用与自有责任

本页是 Calendar 的实施选型与派发约束。范围是本组五个成员及其文档、配置和测试。源码盘点基线为 `f6dcb59fa4e2530faf071906f37ae1917e9e5130`，社区来源复核于 2026-11-03。已有实现表示源码入口存在，不表示本次重新运行了其验收。候选库的版本元数据已经核对，尚未在本组安装或验证。

## 社区实现与标准库

| 功能 | 复用选择与状态 | 本域落点 | 采用前必须验证 |
| --- | --- | --- | --- |
| ISO 日期、时区与 DST 物化 | `@js-temporal/polyfill@0.5.1`，ISC；[项目技术基础](../../../docs/architecture/technical-foundations.md)已采用 | `calendar` 中的日期运算，local 记录运行环境 | 目标 Node24、ICU/tzdb；gap/fold、半小时转换、跳日；本组业务语义仍需验收 |
| CSV 语法 | `csv-parse@7.0.3`，MIT；首选候选 | `calendar-local` 日本供应适配 | 引号、换行、列形状、大小预算、重复日期、截断；不手写 CSV parser |
| CP932 文本解码 | 先用目标 Node24 full-ICU 的 `TextDecoder`；`iconv-lite@0.7.3`，MIT，仅作必要备选 | `calendar-local` 日本供应适配 | 扩展字符、非法字节与替换字符策略。编码名相近不等于语义相同 |
| ICS 语法 | `ical.js@2.2.1`，MPL-2.0；首选候选 | `calendar-local` OPM 对照来源 | 折行、DATE、TZID、重复记录和范围预算；按实际分发核对 LICENSE，不直接修改库源码 |
| HTTP 下载与取消等待 | Node `fetch`、`AbortSignal` | `calendar-local` 来源适配 | 超时、大小、重定向政策、304/429/503、缓存验证器、取消后保管责任 |
| 有限下载重试 | `p-retry@9.0.0`，MIT，候选；只在需要异步退避时引入 | `calendar-local` GET/HEAD 适配 | 总预算、次数、AbortSignal、Retry-After；不得套用于结果未知的发布命令 |
| 摘要与随机身份 | Node `crypto` | 本域摘要和操作身份适配 | 固定 UTF-8 字节、协议标签和原操作身份；规范化方法见[日程复用规划](../../schedule/docs/reuse-plan.md#规范化与公共值) |

社区包承担通用算法或格式，不决定产品政策。Temporal 的对象不能直接成为 wire DTO，日期与 instant 的公开表示沿本域契约。不能因 cron-parser 的间接依赖而把 Luxon 再引为第二套业务时间语义。

直接来源：[Temporal 官方](https://github.com/js-temporal/temporal-polyfill)、[csv-parse 文档](https://csv.js.org/parse/)、[ical.js 文档](https://kewisch.github.io/ical.js/api/)、[ical.js LICENSE](https://github.com/kewisch/ical.js/blob/main/LICENSE)、[p-retry 官方](https://github.com/sindresorhus/p-retry)、[Node24 编码文档](https://github.com/nodejs/node/blob/v24.x/doc/api/util.md)。具体版本沿 npm 发布元数据及采用时的锁文件，不以官网 main 的行为替代固定版本验证。

## 系统公共能力

| 公共拥有者与状态 | 本域怎样消费 | 不得自行补造的能力 |
| --- | --- | --- |
| [legal-identity](../../common/legal-identity/README.md)，已有实现 | 使用既有身份与 codec，wire 发送编码文本，接收方重新 parse | 第二套 Account/Tenant 身份；身份合法性不能替代授权 |
| [utc-instant](../../common/utc-instant/README.md)，已有实现 | 复用 Instant/Duration 及 encode/parse；明确与毫秒 wire 和 Temporal 的转换 | 直接 JSON.stringify opaque 值；用 SI Duration 代替月/年日期算术 |
| [json-text](../../common/json-text/README.md) 与 [schema-provider](../../schema/schema-provider/SPEC.md)，已有实现 | 有界 JSON 读取、数字投影、结构校验、编译缓存；本域拥有 schema 身份与业务验证 | 新 JSON parser、JSON Schema 引擎或平行校验缓存。SchemaRef 的 load 函数留在本地 |
| [operation-result](../../common/operation-result/SPEC.md)，已有实现 | 复用 Outcome/Ack；本域明确 pending/unknown 等业务观察 | 把 unknown 压成成功或普通拒绝 |
| [exchange-refs](../../common/exchange-refs/SPEC.md)，纯类型 | 消费采用与证据引用，向原拥有者核验 | 用一个引用对象冒充持久保管或授权服务 |
| [sql-contract](../../storage/sql-contract/SPEC.md)，契约与辅助已存在 | `calendar-local` 编写本域表、迁移、参加者和查询；只使用公开入口 | 自建数据库、事务引擎、通用锁或第二套存储服务 |
| [sqlite-provider](../../storage/sqlite-provider/SPEC.md)，已有提供者及具名限制 | 由应用装配选择，local 依赖 sql-contract，不依赖该具体包 | 扩大 L-1 的授权保证或 L-4 的跨进程写者排除保证 |
| [kernel-basis](../../assembly/kernel-basis/README.md) 与 Cordis | 绑定使用公开辅助及唯一 Service 定义 | 第二套 DI 容器、插件注册表或有序清理框架 |
| [settings](../../assets/settings/README.md)、[notification](../../notification/notification/README.md)，空导出草稿 | 本域定义所需消费投影，交接有效环境和维护通知要求 | 在 Calendar 写用户设置、通知渠道或替代服务 |
| [time](../../time/README.md)，无具名成员 | 本域工厂接受窄 Clock 依赖，local 用原生时钟和受管等待 | 为借用专属 Clock 导入 Session/Agent/Tool runtime，或越界创建公共 time 包 |

其他领域 README 与公开源码状态冲突时，引用实际入口并提出交接，不在本次范围内顺手修订外域文件。已有 SQL 只保护自己的事务域，Calendar 与 Schedule 的部署边界沿[安装和部署约定](../../../docs/package-organization.md#日历与日程的安装和部署边界)。

## 必须由本域实现

这些内容是产品含义，不能由通用库默认行为决定：

- 日历身份、不可变版本、覆盖、provenance、current 指针与发布代际。
- 三历的来源优先级、更新窗口、健康阈值、withheld 和发行闸。US 日期算术复用 Temporal，联邦范围、observed 与行政例外保留已确认规则。
- 工作日分类、补班、版本选择、查询预算及明确缺覆盖错误。
- 本域持久映射、发布操作去重、原操作查询、恢复和待交接责任。

不建设世界节假日引擎。`date-holidays` 不能取代已确认的 CN/JP/US 来源和数据使用条件。Python 源系统作为固定对照材料，不作为 Node 生产运行时依赖。

## calendar-tools 提供什么

本包提供 Agent 工具贡献插件，不是日历服务、调度器或 API 服务器。目标为一个 `calendar` 工具，以判别联合选择 `list/get/effective/resolve`。工作日判断、计数、移动通过 resolve 的明确查询分支映射，不另复制计算逻辑。完整动作语义归[公开设计](../calendar/docs/public-api-design.md#cordis-与独立工具)。

工具适配器拥有参数与结果投影、可信上下文获取和贡献生命周期；通过 `calendar-cordis-contract` 的服务键 inject，不导入 calendar 或 calendar-local。模型不能填写租户、作者、权限凭据或回调。日历供应、发布、种子导入和发行管理属于系统管理入口，不默认暴露给普通 Agent。

工具定义、调用账本、执行授权和结果保管复用 Tool 的公开协议。工具作者包不实现 Tool runtime。目标动作尚未成为导出或注册，本包当前仍为空入口。

## 实施顺序与停止条件

1. 在 Calendar 纵切开始时完成日期和格式库的小范围兼容探针；固定实际包字节、LICENSE、Node/ICU/tzdb，并保存可复跑输入。
2. 用固定供应样本验证真值来源、坏字节、截断与覆盖。通过后只在实际消费者 manifest 声明依赖，catalog 与锁文件同步。
3. 接入已有存储和校验能力，再实现本域发布与查询。公共服务响应保留可序列化协议，内部工厂和参加者对象不外泄。
4. 外域缺少有效环境、权限围栏或通知承诺时，登记具体需求与验收反例，停止依赖该能力的路径，继续独立部分。本会话不进入外域补实现。

社区库不符合已接受产品语义时，先调整薄适配或更换候选；只有固定反例证明现成方案不能履约，才评估最小自有算法。不能以删掉合法输入或放宽验收换取采用。
