# revision 6 仓库外公开制品独立验证

**有限场景结果：通过；七类负控均检出预期缺陷。** 主线保留最终接受权。本任务没有修改产品源码、产品测试、锁文件、设计工作区或 r5 证据，没有提交、推送或付费请求。

## 精确输入及执行位置

- HUB：`/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime`，分支 `panqiwei/model-request-runtime`。
- 实际 HEAD：**a6285a7f7a116b49b7436a13ae37aa6267604d40**；采用已集成的源修复 `2fdc4be8`，不使用 spoke 或旧 r5 制品作 r6 结果。
- 接受依据：D-076 的 runtime3/transport 精确 v3 投影；profile3 S-17/S-20/S-21，runtime3 S-53/S-54/S-57/S-58/S-59 及所引用传输义务；call-accounts2 S-6/S-8。脱敏、诊断和撤除责任还消费该精确 provider 投影。异常 finish_reason 的 source=in_band 沿接受设计的终态表。
- Node **24.18.0**、pnpm **10.28.1**；消费者使用 OpenSSL 生成本次 OS 临时 TLS 证书，结束即删除。完整规范、源码、生成 dist、包元数据和双语 README 冻结在 `inputs/`，`inputs.json` 记录 **15 个包、827 个文件**。运行后的 `source-drift.json` 为空。
- 首次外部目录：`/tmp/omne-model-r6-public-7glesulw/package`。
- 从 tar 解包的独立第二目录：`/tmp/omne-model-r6-relocated-o7l7jn7m/package`。
- 验证工具只写本目录和 OS 临时制品；完整实际命令、cwd、退出码、耗时、stdout/stderr 见 `commands.json` 和同名日志。消费者源码的执行前 SHA 在 `location.json`，工具、结果、失败与当前制品 SHA 在 `verification-files.json`。

## 实际矩阵及验收条款对应

| 场景 | 可观察判据与实际结果 | 范围 |
| --- | --- | --- |
| 公开根入口与精确定义 | resolve hook 阻断 Cordis/kernel-basis 后导入成功；37 个唯一、嵌套冻结定义均 impl6/def1，默认 factory 只有两 pilot，其余 35 unavailable | 37 份离线规划，不是完整模型 offer 或生产认证 |
| profile3 S-17/S-20/S-21 | 37 个 all-protected-extra 规划，parameters={}、extra 缺席，公开参数 judge 接受；droppedParameters 使用每个**原始键**，并与消费者的实际 TLS 发送字节相符 | 不复用 r5 错误 prefix oracle；完整参数处置表不在本次范围 |
| direct/Cordis 两种宿主关闭 | maxConnections=1，已持有读流和 callback 后将另一 send 排队；关闭准入后 queued 和旧 lease 新 send 均及时 unavailable，实际 HTTP 请求仍恰 1，原 socket 未被关闭、signal 未取消；服务端继续发 head🌍tail汉字，完整 18 字节和正常 end/stopReason=stop 保留 | 真服务对象、真 Cordis provider/contribution、真 TLS；不是完整 host replacement 或耐久 runtime 服务 |
| 宿主实际排空 | 原读取返回且 response.stopped 完成，实测 socket close；释放 lease 后 callback 未完成仍保留引用/执行，callback 完成后 closed、注册/引用/执行都为零 | 拒绝、取消请求、实际停止及资源终态分别观测 |
| 直接 send/read 诊断隔离 | baseline/throw/reject/pending 四种 sink；直接公开函数及消费同一函数的 invokeModel 都返回相同正文、complete、首个 provider、有效 Usage；诊断中确实经过 send_started/usage_repeated/provider_changed；无 unhandled rejection，实际网络停止 | 显式 NetworkResources 拥有 Agent；顺序请求无需 fixture 补造队列；不以 factory 包装来代证 direct 安全，不宣称借用 sink 有 factory 计数 |
| HTTP/in-band/serving/stopReason 脱敏 | 含引号与反斜杠的 ASCII 哨兵经真实 JSON/TLS；递归扫描返回的失败/serving/headers DTO 与诊断的键、值和所有 ≥8 字符窗口，均无泄漏；普通 HTTP 状态/首部、正文及 exact 数保持 | 合法 stop 的 serving 路径 complete；异常 secret stopReason 路径 failed/source=in_band 并保留已交付正文；原始网络 stream 不作为脱敏 DTO 扫描对象 |
| 非 ASCII 遮罩不重造秘密 | redacted、[redacted]、AA[redacted]ZZ 三类哨兵在带内错误事实中均不能通过替换标记重现 | 有限反例，不声称穷尽每个字符串 |
| 脱敏键冲突 | 两个普通非 ASCII 遮罩键预占、三个不同秘密键，按普通键在前/在后两种顺序；所有成员及普通键值都保留，90071992547409931991 原数逐字不丢 | 真实 in-band 对象，与 HTTP decoded 对象路径共同使用公开函数；不指定所有碰撞最终新键的字面名字 |
| Usage/Cost 来源与精度 | empty/reasoning-only/cost-only/invalid-base/inconsistent-base/known-zero-output/known-zero-cache/large-and-cost 八组；直接 account 事件恰 1 份和 invokeModel 结果都经公开 Usage/Cost judge；全未知为 source=none 且没有 reasoning，合法零为 upstream；精确 cost 与 token 可用性独立 | 精确输入扣除结果 90071992547409931979；精确 cost 0.0000000000000001234567892078345，无实际收费；不是真实供应商计价映射认证 |
| 制品闭合和迁移 | 当前 dist/README 与新 pack 字节相同；offline deploy 后显式供应 Cordis peer **4.0.4**，100 个链接重定位，所有链接留在副本；完整 tar 解至第二个目录后实际重跑 root/consumer/全部矩阵 | 不回退 workspace 文件、不使用旧 r5 包，不对外发布 |

最终两份副本各运行 **23 个新增场景、41 次 TLS 请求**；各自还运行一次保留的公开 invoke/plugin/强制撤除消费者。最终正常 run 共 **84 次本机 TLS、0 次付费请求**。`external-boundaries-results.json` 与 `relocated-boundaries-results.json` 是分别实际执行的结果，不是从一个结果复制宣称两个通过。每份矩阵均无未处理 rejection。

## 实际命令与退出

| 标签 | 命令（完整 cwd 在 commands.json） | exit |
| --- | --- | --- |
| pack | `pnpm pack --out /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/tmp/model-request-runtime/p2-boundaries/external-r6/pi-ai-transport-r6.tgz --json` | **0** |
| deploy | `pnpm --filter @omne-harness-lite/pi-ai-transport deploy --legacy --prod --offline /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/tmp/model-request-runtime/p2-boundaries/external-r6/deployed-r6` | **0** |
| external-root | `node root.mjs` | **0** |
| external-consumer | `node consumer.mjs` | **0** |
| external-boundaries | `node boundaries.mjs` | **0** |
| relocated-root | `node root.mjs` | **0** |
| relocated-consumer | `node consumer.mjs` | **0** |
| relocated-boundaries | `node boundaries.mjs` | **0** |

Prettier 按仓库配置检查本次四个临时消费者文件，退出 **0**。本任务没有重复主线的 262 项包测试、runtime 6 项、build/typecheck/source 规则；这些主线结果不冒充独立制品验证。

## 七类负控

每类都从**本次成功 tar**解包到新的 OS 目录，只改变列出的生成 JS 文件，使用同一 root/boundaries 消费者；原始文件 SHA、变更文件 SHA、cwd、actual exit、诊断和原始 stdout/stderr 分别在 `negative/<name>/`，汇总在 `negative-results.json`。成功制品前后 SHA 相同。

| 恢复的旧缺陷 | 被改文件 | actual exit | 检出的失败 |
| --- | --- | --- | --- |
| 丢项记录错误添加 extra. 前缀 | `dist/plan.js` | **1** | `Expected values to be strictly deep-equal` |
| 宿主关闭后仍保留网络新准入 | `dist/registry.js` | **1** | `queued send rejected before held response ends` |
| 诊断回调未经隔离直接控制业务 | `dist/diagnostics.js` | **1** | `diagnostic fixture throws` |
| 结构化 HTTP 错误未对 decoded 值脱敏 | `dist/http.js` | **1** | `credential leak` |
| ASCII 遮罩重新产生凭据或片段 | `dist/http.js` | **1** | `credential leak` |
| 脱敏键覆盖普通键或其他脱敏键 | `dist/json.js` | **1** | `ordinary-mask` |
| 四项全未知仍声明 upstream 来源 | `dist/accounts.js` | **1** | `unknown_with_source` |

负控的七个 exit=1 是期望的检测结果，不算正常消费者通过。没有用 fixture 补造产品修复，也没有删除断言、改规格或降低指标来取得绿测。

## 所有测量修订及保留范围

首次调度和三次 oracle 错误全部保留，不覆盖失败原始证据：

1. `attempt-1/`：boundaries.mjs 被误当成 consumer.mjs 的额外参数；仅旧式消费者实际执行。该次 generic PASS **不能**支持新增矩阵，后续 driver 加入独立命令与读回 23 场景/41 请求结果的漏执行保护。
2. `attempt-2/`：host oracle 漏写正常上游 stopReason=stop，actual exit=1；补上应保留的普通事实。
3. `attempt-3/`：在 finish_reason 放秘密却期待 complete，actual exit=1；拆成合法 stop/异常 secret stopReason 两条明确路径。
4. `attempt-4/`：异常 finish_reason 期待错误的 protocol 来源，actual exit=1；依据接受设计终态表改为 in_band，仍保持 failed、正文和脱敏断言。
5. `attempt-5/`：行为断言与七类负控均已通过；最终审计收窄报告字段，仅在实际携带错误对象的场景记录普通数字/键碰撞声明，随后重新执行完整正常矩阵及七类负控。没有改变行为断言。

最终清单审计还发现生成器把尚未完成写入的自身 finalize.stdout 纳入哈希；原清单保留为 manifest-before-final-output.json，修正后排除生成器自身 stdout/stderr，实际工具、原始场景日志和制品仍纳入清单。修正不改变行为场景或制品。

这些都是验证调度/fixture/报告修订，**没有发现或修复新的产品源码缺陷**。各 attempt 的源码、工具、输入、正常/失败输出和已产生制品都保留。最终通过的结果只位于本目录根，旧 attempt 不替代最终结果；r5 目录未改字节。

## 当前制品及重跑

- 完整公开制品：`public-artifact-r6.tar.gz`，**SHA-256 9b0c60a7bd9887b57757b64e79d196267047c414517b39d03cf98eeb5ebd74c6**，2106854 bytes。
- 单包：`pi-ai-transport-r6.tgz`，**SHA-256 e23f52d78c403c3033c2f301d727517fb248e9a17507d1491d1a8f42e1828cc0**。
- 正常结果：`results.json`；负控：`negative-results.json`；源码冻结：`inputs.json`；制品闭合：`location.json`。

```sh
mkdir /tmp/omne-r6-rerun
tar -xzf public-artifact-r6.tar.gz -C /tmp/omne-r6-rerun
cd /tmp/omne-r6-rerun/package
node root.mjs
node consumer.mjs
node boundaries.mjs
```

需要 Node 24.18.0、OpenSSL 和 loopback TLS 可用。消费者的 deadline/等待/连接数为显式测试配置，不是产品默认；不会访问 OpenRouter。归档可递归排除各 attempt 的 deployed-r6/packed-r6 重建目录，保留 inputs、脚本、日志、负控和已产生的 tar。

未覆盖：实际 OpenRouter、缓存命中/TTL 到期、37 份完整 offer/config Schema/生产认证、runtime 十三服务操作及持久结算/恢复、整个 T/SC/G 门、完整 provider 热替换。没有运行形式模型，不声称无条件证明或完整纵线交付。
