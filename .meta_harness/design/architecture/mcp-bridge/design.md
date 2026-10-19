# MCP桥：当前设计与未实现边界

产品规则归[产品入口](../../product.0.0.1.legacy/PF-006-tools-and-skills/README.md)；本页只维护尚无真实提供者的已采用技术行为及未决，不授予实现或验证状态。公开数据沿实际定义拥有者，不建空包。新增产品政策仍由产品负责人决定。

桥不做准入。holding 来自真实求值，invoke 由已经过 tool admission 的调用方执行；身份、凭据、scope/provenance 不能从进程环境补。形状先 invalidInput；其他闭合失败是现行采用集合，**现行采用未给所有并发失败的统一首拒绝全序，不补一个**。纯投影内部有明确名字/schema 首拒绝。

| 操作 | 资格/首拒绝与闭合失败 | 提交、幂等、外部效果 |
| --- | --- | --- |
| refreshActions  | holding 为求值事实；invalidInput,endpointUnreachable,credentialUnavailable,oauthRequired,protocolError{raw},dependencyUnavailable,bridgeWithdrawn | 先连接/stdio进程/分页列举，不回滚；全部页成功、项合法、remoteName唯一才条件写 snapshot。fetchedAt = 发第一页之前同一 clock 的开始时刻，较晚开始胜，较早或相等不覆盖；每次真列举不去重，connectTimeout/maxListPages界限 |
| projectActions  | 无授权；仅 invalidInput；动作先判 name，再 tool-definition公开校验的具名形状规则，再实现编译上限，再 execution方式 | 纯计算无效果，同输入同实现上限逐字相同；not_fetched 返回空 entries/excluded 且标未知；副本不回写。不能把无形状当 fetched空清单 |
| availability  | 同 refresh；invalidInput,dependencyUnavailable,bridgeWithdrawn；确定连不通/凭据/OAuth/协议因素在 availability 结果说明，不能抄 refresh 失败集合 | 可能连接，connectTimeout有界，不写 snapshot；现有健康连接不用再握手；每次按此刻答 |
| invoke  | caller已放行；holding/action属于本 attempt钉住清单，不用其他 Session新 snapshot核；invalidInput,endpointUnreachable,credentialUnavailable,oauthRequired,actionUnknown,protocolError{raw},callTimedOut,dependencyUnavailable,bridgeWithdrawn | 无自身提交；每失败 requestSent事实；连接写请求不可逆，断线/超时/中断/崩溃/换桥不重发、不去重；新调用是新外部效果；tool runtime拥有执行/收场 |
| beginOAuth  | 仅凭据设置入口到达，非agent/tool/Run；shape先invalidInput，再非HTTP或非tenant格oauthNotApplicable；endpointUnreachable,protocolError{raw},dependencyUnavailable,bridgeWithdrawn | 取metadata之后，新 pending与该 holding旧 pending撤销一次提交；不幂等，新绑定号使旧回答oauthDenied；不判最终配值资格 |
| completeOAuth  | 仅同入口；pending/state对应、未过TTL；invalidInput,oauthDenied,endpointUnreachable,protocolError{raw},dependencyUnavailable,bridgeWithdrawn | 授权码交换不可逆不重放；凭据custodian先pending收存，再binding granted+ref，granted前不能交凭据，失败清扫。外部同成同败，不改配值；同绑定二次oauthDenied |

refresh 四个确定类失败附现存 snapshot（包括 not_fetched），invalidInput/dependencyUnavailable/bridgeWithdrawn 不附副本；读取不到副本不能伪 not_fetched。snapshot按(tenant,endpoint,scope)耐久隔离、随holding失去可读资格；连接仅桥所有、不跨租户、不上签名，换桥不接旧连接。

projectActions 行为必须保持：remote条目名 endpoint.name+":"+remote.name、不改remote名；无description补固定“对端未提供说明”；schema每个位置仅补缺description、剥schema/title关键字、恰type:object补properties空三项，normalized显式标；不展开ref、不改required/type/additionalProperties。无参数形状不是缺schema；参数未知键沿当前 tool-definition 默认读法判。排除 name_unformable{rejection} 或 input_rejected{rejection}（name先），合法但schema_unsupported仅stand-in，不排除；required task方式只stand-in，同犯优先schema_unsupported。任务识别未核须原样记限制。投影single、不含help/needs/settings/allowBackground/composes，输入文本、结果模态任意、禁止后台；超时仍endpoint setting，不造每条目设置。excluded可观察，是否通知agent未定。

结果与持续义务：

- content按序映射合法 text/image/audio/资源链接/内嵌资源；链接 name和URI各行、文本资源 URI首行；非图音二进制无存储时**明确没带回**URI/mediaType/bytecount，坏项说明类型/原因，不修媒体类型、不整份丢。仅structuredContent且content空补JSON text；不产offload/attachments。双方可见标注，保留图片/音频。
- 普通invoke失败是工具 implementation_error、无异常原因码；isError保留内容并failed；bridgeWithdrawn→failed/abnormal_interruption；运行时中断→interrupted。执行中连不通不是unavailable；本期无no_answer/backgrounded。当前 tool-execution-runtime终局/记录端口拥有落盘、恢复和终态竞态；旧桥回执不能代签运行时事实。
- OAuth pendingTTL为严格 now>since+TTL，等号不expired；同holding至多一pending，revoked终态。引用不呈现/日志、不凭reference授可取权；workspace target不能取tenant credential（provenance核），缺凭据不能匿名回退；组织格不存CredentialRef。取得引用须有资格者通过AG配值才生效；未配过保留期丢弃；改值/清值/移除使旧binding revoked，在途不因普通撤权自动取消，新调用拒。
- 续期不改ref/配值/since、不扰人是产品义务；**当前custodian尚未采用续期写回，规范续期场景受阻**，不能迁成已有机制。临时不可达与明确授权拒绝不能合并；后者revoked，前者可重试；到期无写回只能重新取，不能当永久失效。
- tools/list_changed只可观察并合并，不改已钉attempt、不立刻刷新；progress经发帧；logs遮秘密；elicitation/sampling/roots不声明、来了不代答。清理先拒新/关transport→停stdio全后代（grace后强制）→有界排空stderr，活着也持续排空；物理停止必须确认，不能凭close完成宣称无后代。
- bridge替换先结每个invoke bridgeWithdrawn再收连接，其余未提交操作也bridgeWithdrawn；不迁、不重发。ordinary credential change等inflight完成，endpoint断开已发请求endpointUnreachable。重启不重发；snapshot/binding/凭据耐久；旧孤儿进程不复用，须明确回收 owner。

仍未闭：SDK精确pin/任务可识别/鉴权provider、自定义transport探针；static secret出示名/按holding取用和续期写回（旧限定本期不收）；非图音二进制存储；elicitation等待态；首次not_fetched时空展示是否产品可接受；excluded是否告诉agent；具名部署参数；多机器OAuth单一holding值导致仅一机器可用的产品代价。PF020原位workspace发现更新了旧候选落点，不能把旧桥workspace默认禁用写面标已存在。

验证义务与规范输入见[verification](verification/README.md)。尚未闭合的公共语义阻止相应提供者实施，不以迁移目录关闭业务缺口。

新 Tool 已实现[正文端口](../../../../packages/tool/tool-contract/SPEC.md#正文端口)，负责正文来源、名字匹配及 Skill 引用。它尚未提供 MCP 动作名、参数 Schema、编译上限和 execution 方式的完整校验协议。原桥设计要求先名字、再 Schema 形状、后编译上限、最后 execution 方式；这一顺序保留为待承接约束，不能由新正文端口推定已经实现。MCP 与 Tool 技术拥有者须共同明确公开校验、具名拒绝和顺序，纳入[MCP 公开形状缺口](../../../../packages/mcp/docs/architecture.md#完整行为候选的正式承接缺口)后再放行相应桥接实现。
