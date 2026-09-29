# v21 请求图片准备的 runtime 接入（候选）

2026-09-29 revision 1，candidate。已接受语义仍RT10/MR9/MS6/CA2，未接受T29后继不作为本页前置；与v20 registry/ref并行组合。可实施未批准，新增bindings 0，实际验证未执行。无新Session/Run实现、业务操作、持久消息或注册表。

依据[提案](../../../../record/proposals/model-request-image-preparation/README.md)及[transport v15](../pi-ai-transport/v15-image-preparation-design.md)。本页拥有通用runtime公开类型接缝；图片policy/结果账本唯一在transport v15，不重复定义。

## 公共接口和消费点

`TransportAdapter.plan`破坏性改为：

```ts
interface PlanExecutionContext {
  readonly signal: AbortSignal
  readonly reuseScope?: object
}
// plan(input: PlanInput, execution: PlanExecutionContext): Promise<PlanResult<P>>
```

context是进程内执行资源参数，不是PlanInput/ModelSnapshot/ModelResponse持久字段，不能串行化后作为恢复身份或授权。scope不承诺图片能力，也不能使普通transport必须提供图片缓存；它只允许已配置的准备构件作本地复用。signal与scope由owner给，不是新业务输入。计划原input equality保持，无兼容同步分支/类型断言。

全部实际调用点必须迁移并验收：`invoke.ts`真实run规划和缺cap preflight；`anchored-invocation.ts` preflight/固定plan及转invoke时的已固定plan闭包；`service-calls.ts` openCall发前检查；所有公开planRequest、factory/registry/plugin及双语README示例。缺cap preflight先做结构/模态检查并返回缺项，不能先付昂贵decode代价。固定plan闭包仅返回已经签发原plan，不重复图片处理。所有测试替身改async精确类型，不保留宽泛Promise|value过渡。

## 任务归属与取消

公开invoke：既有真实invocation owner在首次异步plan之前登记任务，合并原caller signal/host signal；await plan实际完成后才决定取消或失败。prepare不早返意味着plan终结才可释放其decode资源；取消终局依RT10 S54已先成立规则，不把因signal使plan unavailable改报上游故障。没有发送就没有响应/费用。

service：取得固定transport lease后，`lease.track(planPromise)`覆盖全部准备及固定规划；登记在原runtime正在进行的工作集合，lease释放在finally且只在实际任务完成后。openCall尚无耐久call也必须由runtime owner持有，不能以call不存在为由遗弃。关闭先关准入、取消真正owner任务，等待准备与后续网络全部实际停止后释放。T29消费者释放仅停止该消费者等待，不能透传为此处owner signal；registry读取/消费结果不拥有图像工作。

不允许timeout Promise.race后在finally提前release。首版没有native提前返回路径；未能实际停住保持owner责任及close未完成，诊断挂起但不伪停止。若后继要有早返，必须明确独立completion/drain协议再修改设计。

## 受信scope与有限缓存寿命

service每次通过`RuntimeSessionAccess.bind`完成身份核实后，依据核过的tenant、session、log generation取进程内scope；不接受外部caller's scope注入服务面。ModelCallHost可以跨session，不以host对象当tenant scope。scope表由现有runtime实例持有，配置有有限maxScopes，LRU仅淘汰无在途引用的项；满且全部在途时新请求可使用无复用scope继续在普通准备资源限制下运行，不能跨租户借表。idle被淘汰cache可清理，不影响原图或计量依据；runtime关闭等待在途任务后清表。

transport只看到opaque scope，不查询Session日志、tenant注册或环境。单scope下bytes/entry上限与所有scope总bytes/entry上限均由transport准备provider兑现；scope身份不赋权，输入原bytes仍须明确提供和校验。跨tenant相同图片不会命中同表，诊断不返回内容hash。

独立公开invoke没有Session/tenant前置：caller可显式在自有factory/host作用域内复用opaque scope，缺席时不跨请求保存图片结果。公开preparer自身也可独立使用；其factory close等待自身全部实际任务，不能依赖runtime服务存在才可释放。

## 原来源、校准及持久事实

保留原PlanInput/持久消息、原outputHistory真实输出块与inputCalibration，不为准备构造假的原回复或改摘要。runtime已有受信来源核验和transport纯来源核验均不降级。之后独立的request-local mapping只影响实际body；合法转换使原O口径不适用可full，原来源矛盾仍invalidInput，不可判仍unavailable。

MR9已有transformRevision用于共享basis合成；本页不新增字段/新真值。响应记录的是此次实际表示的前缀证据；下一轮相同实际图与同算法可复用，模型、prefix实质内容或计量/处理依据变化回full。后继Session/Run消费者无须自己重编码/累积图片表示，仍只消费runtime结果。

持久写对象新增0，跨owner同一提交新增0。图片准备不会改原model_call_dispatched/响应批的原子性，不能把缓存插入当作新的耐久完成点。零HTTP负控允许既有前置读取，但不能产生新的发出锚点或响应。

## 必须完成的工程验证

1. 提案IP-V1～10在公开invoke与真实Cordis service分别覆盖；async迁移后原13操作、取消/卸载/固定lease、原planned.input equality保持。
2. 同一shared host两个tenant同图，缓存不交叉；同一session三轮稳定历史只首次编码；scope淘汰后重算同byte，不扩大权限或降低来源核验。
3. cancellation在openCall准备、dispatch准备、native处理中、计划发布前四位置；无HTTP且真实任务排空后才lease.release。消费者取消不停止T29真实owner。
4. 统一basis合成对OpenAI等现有原transform严格比较consumer迁移，有原O适用、原O不适用full、坏原摘要仍拒三种区分，不能每模型补异常分支。
5. changed packages两份README同步说明async调用、显式policy/scope和close；真实打包独立consumer包含codec依赖、调用后无native任务遗留。

本页只有候选接口和验证义务，没有新增实际bindings；codec/preset离线实证、节点独立架构评审、公共类型表达审查和主线采用是实施前剩余门。无需等待完整Session/Run或未来完整上下文组装契约。
