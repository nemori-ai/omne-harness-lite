# 模型 runner 接线、十三操作与响应校准组合验收

2026-09-29。主线依据本轮交付与验收委托，结合独立有限审查、HUB实际运行和原验收证据，接受本轮模型纵线的 runner来源交接与P5接线、十三操作最终组合，以及响应校准失效/来源/耐久/输入形态的已采用代表域矩阵。此处记录已发生的技术验收，不增加契约或改变正式采用状态。

采用基线为[D107](../../decisions/model-input-usage-calibration-adoption/decision.md)及[runtime](../../../realization/packages/model/model-request-runtime/README.md)、[runner](../../../realization/packages/agent-loop/loop-extension-runner/README.md)的已采用后继；精确资源、源码Git提交、blob与SHA见[输入索引](inputs.json)。索引截取HUB `bc248298`；后来的型号算法不被本次验收自动覆盖。

## 接受范围与实际证据

| 范围 | 已核行为及明确前提 |
| --- | --- |
| 合法失败来源与释放 | runtime v18/runner v8核同次原Run/调用，真withRun失败才交runner；noRun、错Run和挪用主体拒绝。真实同一JSONL前缀的default/custom/跨call历史逐值认回，scope释放及unknown写入责任不丢失 |
| Cordis/P5组合 | 默认贡献与配置代际、纯replay不重复副作用；真P5产PT0.5S后由测试caller等待550ms再发第二次TLS；实际EIS撤限后拒绝且原retry/log保持，生产共用映射七结果逐值保真 |
| 十三操作最终组合 | 已有逐方法矩阵与真实auth/MF/EIS/SL3链复用；补真SL3 resumable规划拒绝/修正/release，真实custodian密钥轮换后同call第二发授权改变且原binding不变；双语仓外制品门按原限定条件成立 |
| 校准失效与来源 | 首轮、稳定追加、缺usage回用更早合法输入锚、前缀/可见性/压缩结果变化及model/basis/route失效；同一真实日志两份独立合法M/R，物理较新非祖先不能取代实际选入的旧合法源，三种错误候选顺序拒绝 |
| 校准耐久与形态 | 原物理[M,R]事实、关闭重开、unknown不发布、重试/并发隔离与代表域工具/媒体/opaque/cache；新实际withRun三轮首轮full、后两轮marginal，稳定前缀不重复tokenize，actual usage/cost与原log保持 |

归档[原始证据包](five-item-closeout-evidence.tar.gz)包含54份原报告/运行日志及完整性清单：root实际HUB运行、独立仓外消费者执行、独立只读审查、旧U4证据复用分别标注，不能相加为新的测试总数。末尾组合包括A2/A3、七守卫以及同日志因果源顺序；主线已读取实际执行句柄退出码0，原日志无exit字段时不从“没有错误文字”推断通过。包内 `verify.py` 本次主线实际运行通过59文件/54copy完整性核验；它只证明包内完整性，不重新运行或证明业务性质。

## 失败保留与边界

原noRun包装成withRun的错误正向oracle及产品反例保留，不能以旧绿测试证明来源合法；后继v18原Run绑定和真正withRun正反组合才关闭此缺口。首次构建并发缺dist、类型标注、ENOSPC和独立A4夹具失败均在归档，修后日志分别保留。

网络为本机TLS，来源的single-Run/终态选择是明确受控输入；本次不实现或认证完整Run治理、AgentLoop、会话/Inbound、压缩器或所有调度交错。原U4含代表域opaque拒绝，不能因此声称全部模型支持opaque估算。逐厂商full/φ/δ算法、37型号真实OpenRouter认证、缓存TTL全门与费用证据另行验收。没有新增持久计量真值，不回写旧响应，也没有以有限场景声称形式化无条件证明。

归档SHA256：`391a927e3ef593ff399333433643fb9cd5c9c98f3051fd0080d5abeb6602adb8`。旧大制品/数据库仍按输入索引私有保全，不在本包公开密钥、数据库或原始业务配置。后继接口/算法改变须复验受影响义务；本记录不意味着完整纵线或用户最终验收完成。
