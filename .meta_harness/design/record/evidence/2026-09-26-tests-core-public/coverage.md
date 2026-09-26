# 五节点本轮公开覆盖

以下均指本 run，外层 `w1.consumer.built-public-packages` 包含 14 个固定子场景；原结果为 [HUB 正常 report](raw/hub/tmp__w1-public-consumers__normal-afySRP__report.json)。输入版本、失败与 scope 见 [README](README.md)。类型组的真实 worker [最终 JSON](raw/worker/tmp__w1-public-consumers__test-results-public-closure.json) 与同字节工具在 HUB [12/12 log](raw/hub/tmp__core-delivery__w1-public-consumers-hub.log) 分开引用。下表不是最终签收矩阵。

| 节点与本地条款 | 真实 test ID | 本轮覆盖与局限 |
|---|---|---|
| kernel：Outcome／插件状态／装卸配对 | `w1.kernel.outcome-public`；`w1.kernel.public-lifecycle`；`w1.kernel.public-assembly-cleanup`；`w1.types.kernel.outcome-public` | 成功／失败互斥，非法配置实际 FAILED 且 apply 0 次，合法 apply 1 次；dispose 后不可用；第三个插件失败以同一错误拒绝，已装两个逆序撤除、提供服务消失。真实 Cordis 4.0.4；不是升级版或所有并发交错保证。类型组核 Config 推导与 Outcome／Ack 分支 |
| identity：S-2／5／7／13 | `w1.identity.public-values`；`w1.types.identity.brands` | 品牌、TenantId 结构相等／规范序列化、同账号不同租户值判定；品牌错配／原字符串与缺分量负例。没有实际准入或隔离 |
| identity：S-10～12／31～33 | `w1.identity.in-band-closed-input`；`w1.types.identity.in-band-results` | 缺失／空白／额外分量／未知 enum 拒绝，表示非法与效力不可用分支区分；不是领域存在性或消费者完整身份字段保证 |
| identity：S-14／15 | `w1.identity.public-parent-snapshot` | 显式快照近到远链、共同上级含自身、不可用／循环失败无短链。没有新 Alloy 运行或全结构等价证明 |
| identity：S-35 模块部分 | `w1.identity.public-warrant` | 公共签发／核实正例、重放、错误用途／账号／密钥、缺失／自制字符串反例。密钥秘密、领域守卫与跨实例规范场景仍归各 owner |
| offer：S-4／14／22 | `w1.offer.public-time-shape`；`w1.types.offer.derived-state-and-clock` | RFC3339 相等、正 ttl、非法 ttl 带内失败、形状与跨字段语义区分；状态／时刻品牌／Clock 形状与 readonly 负例。readonly 不是 runtime 深冻结；未穷尽新 parser／formatter 日历输入 |
| offer：S-8／13／20 | `w1.offer.public-evaluation-order` | 截止时刻相等仍 pending、严格晚才 expired、不可用先于不存在、终结优先、三终态 false。实际 Clock、同源与同提交重求值未覆盖 |
| storage：错误映射／迁移片段／协议与预检形状 | `w1.storage.exception-dependencies`；`w1.storage.public-migrations`；`w1.types.storage.protocol-and-preflight` | 只折 StorageUnavailable，其余三类和调用方值同一实例重抛；命名有序合成保留函数引用、同名失败；只读 Tx 无写锁、失败预检必带 check/detail。没有实际装配迁移／核对执行证明 |
| content：S-12／24，V-6／11 模块部分 | `w1.content.public-lossless-json` | 六数字原文字面往返、解码重复／嵌套重复键中性 failed、opaque 往返、非法 JSON 写入拒绝。每一外部 JSON 跳点另归 owner |
| content：S-12／13／24／26／27 | `w1.content.public-block-judgment`；`w1.types.content.opaque-and-call-forms` | 完整调用大参数往返，自有冻结值、具名拒绝次序、不修复、不完整 rawArguments 保留；opaque 内容成员读取／索引负例、tool call 参数互斥、backgrounded 必有原因。真实 stream 参数唯一解析与外部 opaque 消费者未闭合；三 opaque 品牌互赋负例尚待补 |
| content：S-6／7／20／21 模块部分 | `w1.content.public-metadata-meaning` | 规范媒体类型／无模态、CapabilityId 结构相等、AttachmentRef 存储与键相等、精确非负整数 bytes。未运行附件租户解引用、铸号唯一性或日志不变路径 |

## 公开入口与依赖边界

五 root 实际解析至 built `dist/index.js`；批准 testing／schema 子路径实际取用，未经导出的源码子路径被 Node 拒绝；三 Schema 与冻结规范 hash 同字节。负向 oracle `w1.consumer.detects-wrong-outcome-expectation`：[HUB 仅目标失败](raw/hub/tmp__w1-public-consumers__negative-WagReR__report.json)，固定 IDs、错误名／内容、退出码、无信号／超时分别断言，不能靠缺执行通过。

| 本地义务 | 真实 test ID 与原件 | 本轮 scope |
|---|---|---|
| D-025 kernel 批准例外，D-026 storage 批准例外 | `w1.consumer.adopted-dependency-exceptions`；[实际图 report](raw/hub/tmp__w1-public-consumers__dependencies-BpTmsY__report.json) | source／声明／JS 的相对文件图全部 hash 保存。kernel root 只用 Cordis／Standard Schema 类型，root JS 无外部运行时依赖，testing JS 只 Cordis；storage root 只 Kysely 类型，root JS 无外部运行时依赖，conformance JS 只 Kysely／Vitest。不是整个仓库或任意 resolver 证明 |
| AST 检查器有效性 | `w1.consumer.dependency-parser-detects-forbidden-edges`；[worker 最终 10/10](raw/worker/tmp__w1-public-consumers__test-results-public-closure.json)、[HUB 12/12](raw/hub/tmp__core-delivery__w1-public-consumers-hub.log) | 控制字符串逐项提取 import／export／require／dynamic／type import 的模块引用；忽略注释，拒绝 computed specifier。批准集合由实际图的另一测试断言；不把引用提取自测说成任意禁止边的运行时隔离测试。产品 `./testing` 的独立 no-testing-import 正反自测沿原 foundation run，不伪称这里重跑规则套件 |
| Storage AI R-1～7／OG R-1～6 的套件及代表性错误 | `storage-conformance.selftest.spec.ts` 两项；[正常19/19](raw/hub/tmp__core-verification__enabled-QbVPiM__report.json)、[负向17通过2失败](raw/hub/tmp__core-verification__disabled-kS68SN__report.json) | C-1a/b～C-15 的临时文件 SQLite/WAL 一次运行；外键关闭仅 C-11/C-12 目标断言失败，外层2/2。无 pg、新跨进程持久、断电、实际租户外键或任意错误提供者保证 |

六组严格类型检查是有限公开声明断言；具名公开类型完整名单与三个 opaque 品牌互赋负例尚无此轮实际结果。consumer run 不闭合 identity SC-1 实际准入、SC-2／SC-9 完整消费者字段归属、offer 墙钟与提交路径、content SC-2 stream 准入及各 JSON 传递边界。各 owner 的目录／运行时外部责任仍分别保留。
