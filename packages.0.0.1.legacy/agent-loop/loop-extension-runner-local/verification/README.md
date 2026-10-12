# 本地 Runner 验证义务

[公共承诺](../../../core/loop-extension-runner/SPEC.md)拥有业务规则，[提供者](../SPEC.md)拥有 SL3 适配与资源边界。[models](models/README.md)的有限性质不替代以下真实组合检查。

| 义务 | 真实场景 |
| --- | --- |
| 稳定锚、提交与回放 | 原 input+耐久 finals 重建 effect/subject；ask 与 final 不双折叠；纯 replay 零 invoke/presence/guard/append，unknown 不伪空 |
| 同 E 的链 | 同 manifest 实例与真实版本正文；E1/E2、given/mint/reuse、完整排列及 held tenant；provider 换代不拼快照、不借注册表私有操作限制 |
| 可用性、策略、guard | 全 policy/fallback 表；presence unavailable 与 absent 分开；command 非阻断例外；select_model/retry 全 guard union、不提前提交 |
| 等待及多 ask | 原 session/tenant/pass/piece/ask/card/batch/answer 全关联、全批 ready；pending 零重复作用；偏离锁存且作者 catch 后也不提交 |
| 提醒与嵌套 | 完整 wrapper、mrr/3 键、精确 JSON；提交前冲突与提交后另一写者 ID race 分开；private system fence、一层嵌套、nested veto 不改 outer effect |
| 模型失败 | 完整同 prefix/call/session/tenant/generation，保重复历史及已生效未发送；首 await 前 execution 同值；同 Run 跨 attempt 允许，noRun/otherRun 拒绝 |
| 取消与迟到 | 信号停新贡献、释放句柄而保真实 Promise；迟到 resolve/reject 由 owner 消费，不回滚 durable prefix，不关闭借用依赖 |
| unknown 恢复 | 原 physical task owner 登记、写可能迟到、合法竞争 winner、真 absent、旧 writer stop/recovered-read/reconcile/drain 正确次序；真实 SL3 close/reopen/fault |
| Cordis 与登记 | 三必需服务实际组合，this.ctx.effect 贡献撤除、同名同步拒绝、旧 disposer 不删新代，closeAdmission 后真实 drain，服务替换不移旧责任 |
| 整批与正式准入 | RA/RAC/TLT/RS 当前原 batch/adoption/grants、未知禁止重入、asked 不交 token、官方末位真实结论及表项；定位值不自行证明授权 |

现有 tests 中 acceptance-public-matrix、correlation、task-owner、run-pass-ask、runner-chain、nested-reminder-fence、implementation-registry、service、action、admission 等承担对应检查。pnpm test／typecheck／build 从包入口执行，输出留 tmp。不得为让检查通过修改原消息、拒绝值、身份、绑定或变成来自当前实现的期望。

完整 Session、真实卡片／模型等待生产者、阈值与模态件身份、模型消息 veto 提醒例外及 inject+rewrite 重组未由本包自动交付。已声明的未闭边界保留，不以模型或示例代授采用。外部效果未知不能当未发生，不新增真实付费调用。
