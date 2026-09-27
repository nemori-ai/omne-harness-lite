# 规范场景（输入/结果外形另见examples.json）

| 稳定场景名 | 触发与必须观察的结果 |
|---|---|
| center.no-secret-before-match | health返回与绑定不同的centerId，login/invoke目标零调用，原记录不变；只报告中心不匹配 |
| input.capture-before-await | 发起后调用者修改payload/端点对象，线上仍是初始快照；非法输入不发目标请求 |
| login.remote-local-separate | AI15成功、CLS拒绝或unconfirmed，公开只保留句柄与两阶段结果，不声称远端没创建，不输出Bearer |
| login.new-use-required | TUI已有选中L1时不能把login L2接入原use；明确结束后新open才捕获L2 |
| logout.late-old-reference | L1退出网络等待中另进程选L2；目标仍为L1句柄；返回成功后CAS冲突，不清L2 |
| credential.unknown | AI50可能已发出但回执丢失，unknown、当前use停新准入、原本地记录保留；没有自动重试或自动旧密码登录 |
| credential.success | AI50成功后原引用CAS清理、所有旧登录有效性归中心；本机需要重新登录，不缓存任何凭据 |
| use.external-change | 新动作开始读取CLS发现中心材料或登录不同，reenter-required；原在途动作仍归原identity，不重新ctx.get新引用 |
| identity.prepare | 本地账号未知，OG36成功补足；同一动作目标执行与最终一次CAS使用原快照；OG36失败不发目标动作 |
| expected.preserve | 用户以旧expectedTenant发起，组合不以后台现读值替换；EC2拒绝原样保留，不自动重发 |
| cache.all-read-surfaces | 13读面逐一覆盖：真实成功保存；prefer-copy精确匹配时零目标网络；refresh明确联网；缓存缺席不可假空 |
| cache.isolation | 同route但中心/账号/tenant语境/载荷不同不得复用，arrays顺序有意义；另一账号缓存不能进入显示 |
| cache.not-authorization | 缓存effective只显示旧时点；写/切换仍进EC2现读；网络不可用不能用缓存改成可执行 |
| cache.denial-not-fallback | 登录拒绝、权限拒绝、中心/信任/版本不符不回退历史成功；普通业务拒绝不变成登录拒绝 |
| cache.known-role-loss | 别处把本人降为member，refresh OG26得到新判定；即使观察时刻无法表示、缓存不能保存，旧超管副本包括OG59(true)不可继续prefer-copy；清理CAS失败也一样 |
| cache.known-membership-loss | 本人退出成功或EC2补授权notAuthorized（本人OG26不会线上成功返回ineffective）；按资格依赖收拢同组织副本，保留无关读组；不替人切回个人组织 |
| cache.structure-change | OG32/33成功后OG22 parent及OG34传递关系旧副本不可再适用 |
| cache.reacquire | 已因资格观察失效的查询，后来该use明确fresh读取成功并CAS installed，可将这份具体新副本恢复适用；fresh成功但保存失败时旧盘条目仍不可适用；不能靠别进程旧缓存时间解除失效 |
| local.unknown-visible | unknown后一次read看见原storeId+operationId，报告当前可见但原耐久仍unconfirmed |
| local.unknown-other | unknown后read见后来的记录/原版本/初始空/不同storeId/再次不可用，各分支不追认原写未发生，不重交、不补偿 |
| lifecycle.network-not-done | 网络未收场就close，停止新准入但不释放CLS；运输结束之后的CAS/查证同样等完 |
| lifecycle.no-login-on-exit | 关闭TUI只关闭本次使用和运输资源，不额外撤销选中登录，不让窗口关闭改变中心事实 |
| output.secret-filter | 原AI15成功答复、原CLS读取、含凭据输入或带原错误文本均不能成为PublicExchange/Output；机器与人读消费同一安全投影 |
| output.exit-state | 远端成功、本地unknown → 5；读历史副本 → 0且source=copy；未知写 → 3；确认拒绝 → 4；缺陷 → 70 |
| inbox.entry-refresh | 应用进入治理界面明确refresh待办，失败可显示适用副本，不用永久prefer-copy替代发现新待办 |

- recovery.defect-preserves-unknown：CAS已unconfirmed，唯一查证读取抛缺陷，原local.status不变、recovery=unknown、defect.stage=recovery，退出70；不以defect覆盖已知终结。
- registration.interrupted-is-unknown：保留AR8 interrupted原名，remote.status=unknown，退出3，不暗示未提交。
