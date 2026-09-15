# DSH 与 TS/JS Agent Harness 的日志和 trace 证据

核对时间：2026-09-14。本文记录固定源码和发行物观察，支持
[共享诊断施工候选](../proposals/core-capabilities/implementation/observability.md)。
事实、采用建议与尚未验证部分分别陈述；它不自行接受架构或改变 OB/CD/CC v1。
研究先核对项目已有的 DSH，再比较实际 TS/JS harness 与具体库，范围限定于
生产/研发/debug 的关联、秘密裁剪、资源边界和退出，未做性能排行榜。

后续 P1 采用范围归 [D-010](../decisions/D-010-shared-diagnostics.md)，不改写下文
原研究时点的观察。[证据归档](../proposals/core-capabilities/implementation/evidence/observability-design/README.md)
保全作者来源/探针和原失败；HUB 独立重跑仍只证明所列机制的可行性。

## 固定来源

| 对象 | 本次版本与主要官方证据 |
|---|---|
| DeepSeek Harness | `c291e7961a515f6d7af9304e7fd1d257929aef26`；[Cordis logger](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/vendor/cordis/src/logger.ts)、[agent](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent/src/index.ts) |
| DSH Session telemetry | 同一 commit；[子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/session-telemetry.md)、[OTel 实现](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/src/index.ts)、[依赖](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-telemetry-otel/package.json) |
| pi-mono | `71dca871bc80b6bc97be37f0ca3189399d651fff`；[telemetry README](https://github.com/badlogic/pi-mono/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/telemetry/README.md)、[harness context](https://github.com/badlogic/pi-mono/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/context.ts)、[harness telemetry](https://github.com/badlogic/pi-mono/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/src/harness/telemetry.ts)、[实施状态](https://github.com/badlogic/pi-mono/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/agent/docs/telemetry.md) |
| OpenCode | `df23b7f9488a38e6f8064a0739d4f8cde86d7cfb`；[logging](https://github.com/anomalyco/opencode/blob/df23b7f9488a38e6f8064a0739d4f8cde86d7cfb/packages/core/src/observability/logging.ts)、[OTLP](https://github.com/anomalyco/opencode/blob/df23b7f9488a38e6f8064a0739d4f8cde86d7cfb/packages/core/src/observability/otlp.ts)、[LLM](https://github.com/anomalyco/opencode/blob/df23b7f9488a38e6f8064a0739d4f8cde86d7cfb/packages/opencode/src/session/llm.ts)、[Effect/Promise 桥](https://github.com/anomalyco/opencode/blob/df23b7f9488a38e6f8064a0739d4f8cde86d7cfb/packages/opencode/src/effect/bridge.ts)、[debug trace](https://github.com/anomalyco/opencode/blob/df23b7f9488a38e6f8064a0739d4f8cde86d7cfb/packages/opencode/src/cli/cmd/run/trace.ts) |
| Pino | `10.3.1` / `6b344980eae3ebed904fc87caf4bba0ab9dbe946`；[package](https://github.com/pinojs/pino/blob/6b344980eae3ebed904fc87caf4bba0ab9dbe946/package.json)、[redaction](https://github.com/pinojs/pino/blob/6b344980eae3ebed904fc87caf4bba0ab9dbe946/docs/redaction.md)、[异步输出](https://github.com/pinojs/pino/blob/6b344980eae3ebed904fc87caf4bba0ab9dbe946/docs/asynchronous.md) |
| SonicBoom | `4.2.1` / `ada84a68dfccfe9cf1b34f4b3170b6907dd4c468`；[README](https://github.com/pinojs/sonic-boom/blob/ada84a68dfccfe9cf1b34f4b3170b6907dd4c468/README.md)、[实现](https://github.com/pinojs/sonic-boom/blob/ada84a68dfccfe9cf1b34f4b3170b6907dd4c468/index.js)、[发行元数据](https://registry.npmjs.org/sonic-boom/4.2.1) |

OTel 的 [JS 状态页](https://opentelemetry.io/docs/languages/js/) 在本次核对时将
Traces 标为 Stable、Logs 标为 Development。精确研究发行物是
[API 1.9.1](https://registry.npmjs.org/@opentelemetry/api/1.9.1)、
[Trace SDK 2.11.0](https://registry.npmjs.org/@opentelemetry/sdk-trace/2.11.0)、
[ALS 2.11.0](https://registry.npmjs.org/@opentelemetry/context-async-hooks/2.11.0)，
并比较 [trace-base 2.11.0](https://registry.npmjs.org/@opentelemetry/sdk-trace-base/2.11.0)
和 [logs 0.222.0](https://registry.npmjs.org/@opentelemetry/sdk-logs/0.222.0) 的边界。
API 的 registry gitHead 是 `7e74509a4d848e94b2970bb5262dd3e8efeed0a2`；Trace SDK/
ALS/trace-base 的 gitHead 是 `0b72a81636fa476e8f1f1afd2ae0c90a1362194c`。

本次 GitHub 上该 OTel gitHead 的候选源码路径返回 404，因此 API 形状结论依据
**registry 精确 tarball 中的发布 JS/d.ts**，不声称核对到了同 revision GitHub
源码。下载元数据的 dist URL/integrity/shasum、安装锁和实际文件都保留于本次
临时证据；没有用移动分支替代失效的固定链接。Logs 仅核对发行元数据/状态，
未安装、未作其兼容验证。

## DSH：可以借鉴的机制与明确差距

Cordis logger 把来源名、时间、级别、序号、参数和 fiber 交给 exporter，并有
默认 1000 条内存 buffer。fiber 是运行归属，不是本项目 Session/Run/主体身份。
该 revision 的 INFO=1、WARN=2、DEBUG=3；默认门槛 INFO 会过滤 warn/debug。
exporter 调用没有隔离异常；其 disposer 闭包读取服务当前 `_snExporter`，而非
捕获该次注册 ID。下方对官方 `@deepseek-ai/cordis@4.0.2` 的反例再次核实这三项。
这些都是固定版本观察，不将数值习惯或卸载行为推断为所有版本保证。

默认 buffer 先收到 raw args，后续 exporter 的裁剪不能追溯清除；设
`bufferSize=0` 会使用 `slice(-0)` 保留全部内容。内存条数上限本来也不等于
字节上限。项目直接使用官方 Cordis 包的 SYS-KERNEL 边界不授权 fork/patch
此处；候选必须提供真实规避或把对应接入标为受阻，不能默认信任卸载。

DSH agent 用 ALS 传 initiator，适合进程内调用归因；它不是跨队列/进程的
可信身份协议。共享 exporter/timer 若在某 agent 调用链初始化，就需要核对
是否继承了初始化者。项目候选据此要求显式身份和受信 root 初始化；这项政策
是本项目推断，不是上游替我们完成的租户隔离。具体依据是上表 agent 源码。

Session telemetry 文档区分送交后端的 cursor 与可靠交付确认，默认脱敏
waterfall 没有规则。其 OTel 插件实际使用 Logs 的 LoggerProvider、
BatchLogRecordProcessor 与 OTLPLogExporter；默认 FEEDBACK_ONLY，用户反馈会
上传历史前缀，普通 emit 为空实现。它不是本项目所需的通用 span tracer，
反馈上传也不是本地审计耐久协议。shutdown 的 3 秒超时/warn 路径不能承担
OB-03 的剩余记录/cursor 责任；这些差距分别依据 telemetry 文档及插件实现。

适用建议是保留“结构化来源”和“诊断与业务事实分开”的机制，直接注入
P1 诊断面；不要把 DSH 插件原样搬来便宣称完整审计、裁剪、trace 和可靠退出。

## 其它 TS/JS Harness：实际代码与施工边界

pi telemetry 把 context/parent 显式交给 callback，记录方法被动、不抛出，
callback 结算决定 span 生命周期；无全局 exporter/current span。其 README
同时说明内存参考实现无界且没有时间戳。适用经验是显式 parent 和被动诊断边界，
不能照搬参考存储作长期生产保留。

pi 的 agent/harness 代码已把 telemetry 作为运行上下文的一部分；专属设计页
还把多数 runtime spans 和跨进程扩展列在设计/施工范围。它证明一种实际公共
接口选择和部分接入，不能作为全系统 trace 已完备的生产证据。本次候选复用
OTel 的 span 实现，不额外引入 pi schema/runtime 或再建通用 span 树。

OpenCode logging 有等级/输出配置，OTLP 装配按 endpoint 选择 logger/trace SDK，
并为 AI SDK 的 parent 显式注册 ALS。其资源 runID 是进程实例标识，不能拿来
重定义本项目逻辑 Run。Effect/Promise bridge 的代码展示跨调用机制需恢复 span
context；仅仅“采用 OTel”不自动补全这些边界。具体判断分别来自上表 logging、
OTLP、LLM 和 bridge 文件。

OpenCode 的 `run trace` debug 路径含请求/响应全文。可借鉴按阶段定位模型问题，
其内容策略不能直接用于本项目多租户日志。没有证据表明为获得 log/trace 就需
把 Effect 运行框架引入项目。上述观察限定于列出的文件和 commit，不是对两个
harness 全产品的安全或性能评估。

## 库可行性与本地输出边界

发布的 `sdk-trace-base@2.11.0` 主入口为 `index-shim`，其 BasicTracerProvider
继承 `sdk-trace` 的 TracerProvider 并装入环境默认配置；直接 Trace SDK 支持
显式 `spanProcessors` 和 `spanLimits`。ALS manager 的 with 使用自己的
AsyncLocalStorage.run，active 在无上下文时返回 ROOT_CONTEXT；不必为了手工
插桩注册全局 manager。来源是上述精确 tarball 的 build/src 文件及实际探针。

SimpleSpanProcessor 为每次 export 保留 pending Promise；BatchSpanProcessor
则另有队列/批次/timeout。我们已有一条本地日志流，候选用一个同步 SpanProcessor
把结束 span 投影到这条流，避免再加独立 exporter 队列。这里只是适配安全内容和
生命周期，不重写 SDK 的 span 生成、时间或 parent。shutdown 返回/超时仍需与
实际底层资源区分；探针说明外层 timeout 不会取消未完成 processor。

Pino 10.3.1 声明 11 个直接运行依赖，不能把它写成零成本 logger。固定路径
redaction 可移除指定键，但自由文本仍原样输出；同步目标 write 抛错会穿透
logger 调用。异步文档也明示调用与磁盘写入不是一一对应，进程故障可丢最近
缓冲。候选使用内容 allowlist 和被动边界，而非把 Pino 自身当审计系统。

SonicBoom 的 maxLength 以 UTF-8 字节计，溢出同步产生 drop；write 事件给出
实际写入字节，end 排空后关闭，destroy 不排空。它可直接承担本地有界缓冲，
无需另造队列。文件长度、保留策略、已读完整行和业务耐久回执依然是不同责任。
本次只验证容量/实际文件 close 和 open 失败，没验证硬件掉电或生产吞吐。

## 实际探针与复现

本次在隔离目录测量，原输入与输出沿[归档入口](../proposals/core-capabilities/implementation/evidence/observability-design/README.md)恢复。
命令使用 Node `v24.18.0`，
所有文件/模型哨兵是合成数据，没有 .env、密钥、真实模型或外部 exporter。
正式产品源码/根锁文件未改动；安装禁用 scripts。

```bash
npm install --ignore-scripts --no-audit --no-fund --save-exact \
  @opentelemetry/api@1.9.1 @opentelemetry/sdk-trace@2.11.0 \
  @opentelemetry/context-async-hooks@2.11.0 pino@10.3.1 sonic-boom@4.2.1 \
  @deepseek-ai/cordis@4.0.2
node probe.mjs
```

完整 probe.mjs、probe-result.json、package-lock.json、versions.json、固定上游
文件及其来源/哈希已由[38 份原件归档](../proposals/core-capabilities/implementation/evidence/observability-design/README.md)
保留；该入口还区分作者、复核和 HUB 的实际结果。本研究保留 registry 版本、
实际入口及观察局限。以下 Cordis 反例可以独立复制运行：

```js
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
const a = new Context();
a.logger.warn('sentinel');
assert.deepEqual(a.logger.buffer.map(x => x.type), []);
const seen = [];
a.logger.exporter({ levels: { default: 3 }, export: m => seen.push(m.type) });
a.logger.warn('w'); a.logger.debug('d');
assert.deepEqual(seen, ['warn', 'debug']);
const b = new Context(); let A = 0, B = 0;
const removeA = b.logger.exporter({ export() { A++; } });
b.logger.exporter({ export() { B++; } });
removeA(); b.logger.info('x');
assert.deepEqual([A, B], [1, 0]);
const c = new Context(); const marker = new Error('exporter-marker');
c.logger.exporter({ export() { throw marker; } });
assert.throws(() => c.logger.info('x'), error => error === marker);
const z = new Context(); z.logger.bufferSize = 0;
for (let i = 0; i < 3; i++) z.logger.info('x');
assert.equal(z.logger.buffer.length, 3);
```

该探针全内存，不调用不存在的 ctx.dispose。root 可回收性、插件卸载和
敏感参数输入审查没有因这个脚本退出 0 就得到验证。

OTel 入口的最小可复制形式如下；正式产品被动边界/容量治理尚未实现：

```js
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { TracerProvider } from '@opentelemetry/sdk-trace';
const cm = new AsyncLocalStorageContextManager().enable();
const ended = [];
const provider = new TracerProvider({ spanProcessors: [{
  onStart() {}, onEnd(span) { ended.push(span); },
  async forceFlush() {}, async shutdown() {},
}], spanLimits: { attributeCountLimit: 8, attributeValueLengthLimit: 32 } });
const tracer = provider.getTracer('probe', '1');
const parent = tracer.startSpan('parent', {}, ROOT_CONTEXT);
await cm.with(trace.setSpan(ROOT_CONTEXT, parent), async () => {
  await Promise.resolve();
  const child = tracer.startSpan('child', {}, cm.active());
  child.end(); parent.end();
});
await provider.forceFlush(); await provider.shutdown(); cm.disable();
```

正式探针的 12 项结果：

| 项目 | 观察结果与局限 |
|---|---|
| Cordis 默认级别 | 内置 buffer types=[]；显式 exporter 收到 warn/debug |
| Cordis disposer | 删除 A 后一次日志 A=1、B=0，复现错误删除 |
| Cordis exporter 失败 | 捕获到原 marker 对象 |
| Cordis zero buffer | 3 次 info 后仍保留 3 条，不作为禁用办法 |
| 显式 ALS 并发 | 两个根/子 span 各有正确 parent 与 traceId，两个 traceId 不同；结束后 ROOT_CONTEXT |
| 共享任务 ROOT | 在调用者 context 内显式 ROOT 创建 timer，回调无 caller span |
| SDK limits/结束 | 80 字符属性变为 32；forceFlush/shutdown 各到所设 processor 一次 |
| Pino 失败与业务错误 | 原始 logger write 会抛；最小被动 guard 保留业务原异常对象，仅记独立故障计数 |
| Pino redaction | secret/password 哨兵消失，message 中 BODY 哨兵保留，说明需前置 allowlist |
| Sonic 真实有限流 | 2 KiB 缓冲、20 条约 432 字节同步提交：seq 1–4 实写，5–20 drop；close 后 1728 实际字节，接受+丢弃=20 |
| Sonic 打开失败 | 目标为本 tmp 下现有目录，真实 EISDIR，已接管 error，无产品路径写入 |
| SDK 关闭超时 | processor shutdown 永不结算，5 ms 外层等待到期；未声称 provider/资源已释放 |

总脚本 exit 0。这些是**设计可行性/行为反例**，不是产品 TDD 或完整 OB 验收。
Sonic 试验不证明配置换代、磁盘保留、部分写失败、长时间内存稳定；OTel 试验
不证明恢复/网络传播/权限；Cordis 试验不证明受限桥动态释放。正式实现必须
沿候选稿的 O01–O12 使用真实边界逐项 RED/GREEN 和组合测量。

## 推断及待审选择

上述来源支持：显式关联、被动记录 API、成熟 trace primitive、有限输出资源和
缺口状态可以组成 P1 所需的最小设施。它们没有替本项目兑现关键业务审计、
当前身份治理、可靠 outbox、持久 cursor 或完全动态资源责任。

因此候选选择 Pino/Sonic/OTel 的直接组合，P1 不依赖 Cordis 日志桥，P2 对单个
root 注册桥给出限定映射和阻断条件，P3 才完成 engineering 读面。完整选择、
成本和接受问题归候选稿，研究本身不授权新增包、升级根依赖或接受该方案。

## 独立评审后的定点证据

对候选 `1c60feb` 的 O-R1–O-R3 反馈揭示了原设计三个具体缺口。以下修订证据
继续使用前述 Node `v24.18.0`、SonicBoom `4.2.1`、Pino `10.3.1` 和 ALS `2.11.0`，
没有重新选型或扩大产品范围。归档中的脚本为 `review-probe.mjs`，
输出为 `review-probe-result.json`；在恢复目录执行 `node review-probe.mjs`
实际 exit 0。它只测具体机制，未运行尚不存在的产品 consumer。

**O-R1：异步输出不保证门外启动。** 精确 Sonic 源码的 write 在达到 minLength
后同栈调用 `_actualWrite`，继而调用 fs.write。探针仅在自己的独立进程暂时包住
Node fs.write 记录调用时的门标记，真正写入仍交原 fs.write。直接在标记门内
向 `minLength:4096` 流输出超过 4096 字节的日志，实际观察到一次门内 I/O 启动。
这是原“write 只入 buffer”说法的反例，不能以回调异步消除。

修订模型的门内只有最多 16 个固定字段 point 和一个省略计数；退出标记门后
才调用 Pino。分别使用 minLength=4096 与修订后的 0，每轮实际写入 6983 字节、
省略 3 条，门内 fs.write 调用数均为 0。测量使用词法门标记，证明先退出再输出
的组合形状；正式 admission 外层 frame 及 jsonl 写泵还须在产品测试中替换此
标记，尤其不能把内层 submit 返回误当外层 enter 已结束。

**O-R2：单条低流量日志必须主动开始写入。** 候选不再依赖 4 KiB 门槛，固定
minLength=0。真实文件流只收到一条 55 字节 error 日志；没有后续日志和 close，
在 write 事件后 readFile 读回原 code。最终探针该次耗时 0.374 ms，观察期限
1000 ms。它不是 OS/负载无关时限承诺，实际停滞要按 pending age/写入进度报告。
另在 fs.write 的可控故障点回调 EIO，实际 Sonic error 事件令试验健康状态变为
failed、lastErrorCode=EIO。故障是合成 I/O 注入，不声称磁盘发生了真实硬件错误。

这项选择只取消未有性能依据的缓冲门槛；流忙时仍使用 Sonic 的有界缓冲。
没有新增 periodicFlush、轮询、公开 flush API 或第二个输出框架。调用 fs.write、
收到 write 回调和取得 DR 耐久回执依旧是不同结论。

**O-R3：诊断不接管调用者 Promise。** 原 activeScopes/settlement observers
没有独立必需保证且无容量界限，修订模型仅委托真实 ALS.with。10000 次 body
返回同一个永不结算 Promise，逐次保持原对象；该 Promise 的 then getter
计数始终为 0。这里没有“超过 scope 限制后丢弃 body”的机制，因为不再创建
诊断 scope 任务或观察器；活动 span 的独立上限仍保留。原同步 throw 对象及
已由调用者处理的原 rejection 对象也不被替换，新增 unhandledRejection 为 0。
这没有证明调用者自己创建的无限业务任务资源有界，其并发/清理仍归原 owner。

首轮探针还作了过强假设：manager.disable 后，之前已开始 body 的 await 续体
应从底层 manager 看到 ROOT_CONTEXT。真实结果仍看到旧 context，脚本 exit 1；
失败脚本 `review-probe-before-r3.mjs` 和 stderr 保留，没有改写为通过事实。
修订后的测量保持这个观察，以诊断实例的关闭状态封闭公开 current（返回 null）
及晚到输出；within 在关闭状态直接返回 body 的原值。诊断关闭时 caller owner
仍为 running，后来调用者主动解除等待才成为 settled；晚到记录被抑制一次，
没有访问新代或已关闭流。原生上下文引用可能继续随调用者异步资源存在，不可
用 disable 或诊断 closed 假称已取消业务工作。

这七项检查补足了三个反馈的机制输入，尚不证明完整 generation 守卫、真实
资源清理、敏感信息投影或所有消费者已实现。候选修订仍需独立定点复核与整合者
接受；正式 v1、业务审计责任及 P1/P2/P3 的既定分界不变。
