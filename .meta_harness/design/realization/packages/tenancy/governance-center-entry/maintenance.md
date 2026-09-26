# 中心维护的文件表示与运维组合 · 候选 R1

消费 EC3 S-55～S-59 与 HT3 S-19～S-33，均候选。具体文件格式归本节点，SQL层只消费受限数据流和只读owner检查。保持现有两个插件；维护控制器是ops fiber内的拥有资源组件，无独立服务键或第九个fiber。它的生死与ops相同，离线工具通过公开工厂创建同一文件算法，使用storage-sql给出的SnapshotInspection。

## 装配边界

`GovernanceCenterOpsConfig.maintenance` 是固定 `{backupDirectory, sourceBuildId, migrationNames, snapshotChecks}`；最后一项是AI/OG/clock/entry及跨owner外键的静态只读结构/底线检查函数清单，由host静态传入，不从环境/网络解析回调。`storage`消费core/storage扩展facet；缺席使整个ops装载失败，不半开。controller只调用facet、clock.now()和自身center-id owner核对，无账号/组织/邀请服务，不调用认人或touch活动。

原serving/stopped通知只控制准入；maintenance等serving取得centerId。ops的一个socket effect disposer按序：关新请求/维护准入并请求取消；至多3秒网络排空并断连接；等待controller真实任务结束和全部暂存收场；最后移除socket。不能把“连接没了”当工作已结束。source.run包含完整发布回调，源close也独立守住同一任务。startup注册effect失败自行按同序收场，正常通知不会抛错。

SC-2的新边界允许ops仅引用maintenance、严格JSON/parser、events和health/socket模块；maintenance可引用core/storage协议、offer-expiry时间、identity-values值和entry center-id公开内部owner函数，不得引用治理提供者或私有SQL。检验静态import、inject、event白名单；真实反例监测维护前后安全事实与登录时间未变。

## 固定文件表示与校验

封装恰为UTF8 ASCII魔数 `OMNE-CENTER-BACKUP/1\n`、4字节无符号大端头长度、UTF8紧凑JSON元信息、byteLength个原SQLite字节，无尾随数据、无压缩/加密。头1～16384字节，EC3 Metadata字段按format/centerId/sourceBuildId/migrationNames/startedAt/finishedAt/byteLength/sha256顺序输出；严格JSON拒绝重复/额外键、BOM、非法UTF8。输入接受合法字段排列，不依赖输入按输出规范序；摘要只校验数据库段，不认证元信息或来源。

操作先O_NOFOLLOW打开普通文件、验证权限当前uid且group/other无权限，固定同一句柄读头与内容；stat尺寸受头和1GiB上界，精确长度、全量SHA256、fstat前后dev/ino/size/mtime/ctime核对。数据从此句柄按64KiB流入inspect，SHA与结构/owner检查作用于同一复制出来的字节；源发生观测变动则unavailable。源恶意在观测间修改且恢复不在宿主防篡改承诺内，不假借只读打开宣称文件不可变。普通读取IO失败unavailable；明确坏格式/摘要/owner检查invalid-backup；超过界限capacity。

`governanceCenterSnapshotCheck(view)`由本包center-id owner实现：表结构按本版迁移精确核对，恰一行slot=center，非空合法centerId；不读或铸。另由同owner的`readSnapshotCenterId(view)`从同一副本只读取得Metadata所用标识，前者与后者共享同一判据。装配的owner检查先核全部已知结构（详见各节点维护检查），clock函数检查原底线，不以当前wall重写它。迁移名必须等于host提供的完整有序清单，允许的旧版本前缀由后续明确发布的兼容矩阵扩充，本版只支持本制品当前格式；metadata列表必须与副本实际登记相同。只有本版结构能验证的数据才verified，不自动升级。startedAt/finishedAt从clock.now()取，副本固定在区间内；后一次早于前一次或不可读失败。

备份最终名为随机128位小写hex+`.omne-backup`，冲突target-exists不自动换名重试。暂存封装在已持久标记的根内，由文件控制器生成；为不泄露路径，路径只来自固定配置与随机任务。按同文件系统hard-link独占发布，EXDEV失败unavailable，发布前完整fsync，发布后同步父目录；link成功后确认失败unknown保留文件。最终文件0600，目录0700。生产数据库打开封装自然失败，根内明文另有guard。

status/onlyIfDue按EC3候选定义扫描；匹配名非普通文件/软链invalid不跟随，先256上界，再逐个完整检查、过滤其他中心、核时间，选最大startedAt同刻文件名ASCII最小。每个本中心合格候选重新fsync固定文件句柄与父目录，失败unknown不给较旧fallback；只读verify不做该重确认。status发现候选容量超限则capacity，不把它计坏件后报missing。扫描目录保持打开描述符并核真实父目录未变；宿主恶意并发修改目录在前提之外，普通文件消失/I/O错误unavailable。

## 离线verify/restore

公开控制器函数消费静态inspection、snapshotChecks、migrationNames，不加载根Context或业务插件；输入输出严格EC3。全操作通过inspection.run，取消请求与真实结束分开。临时封装路径由entry控制器自己拥有、在相同永久保护根下；core view不泄漏SQLite路径。

restore在源验证后以mkdir(mode0700)独占请求目标，既有空目录也拒绝。目标内固定 `data.omne-backup` 是原始封装的相同字节，来自本次固定输入句柄；复制过程中再核哈希/前后stat；不把临时SQLite当输出。发布点是目标内文件独占link完成；成功须文件、目标目录、目标已存在父目录全fsync。发布后任何确认失败unknown，targetLocation取请求原串。目录已创建而文件尚未发布失败可保留空/不完整目标并诊断unavailable；不得返回target-exists误称本次没建目录。发布后的输出绝不删除；无extract/serve/reset/清保护命令。

输出confirmed但临时清理失败unavailable，并留已发布输出/残余位置的无秘密诊断；unknown优先。文件内容或凭据从不写日志。checksum成功不把unknown改completed；下一次显式status重新确认不算重放旧发布。

## 验证义务

EC3/HT3 exact shapes和字节例；全部正常/失败分支；坏名/跨中心未来时间/容量/缺失与due；损坏长度/头/摘要/迁移/身份/clock；固定句柄源变动；link冲突/fsync未知/cleanup失败；target已有/符号链接/源目标重叠；ops断连后完成且close继续等待；安全事实/活动时间不变。与存储实际组合，不能仅mock。当前无实现证据。

R2结构保证：不能将SQLite物理完整/FK无反例或登记了完整迁移名当作业务结构完整。snapshotChecks消费同一view.inspection与structure；全部owner要求及装配外键都通过才verified。缺login_state但仍留迁移登记且重新计算正确摘要是必须拒绝的反例；缺列/唯一索引/FK及额外触发器同理。不承诺对人为重写全部业务事实的认证，也不因结构通过允许业务开放。

## R3候选：封装文件句柄托管

input/output/目录FileHandle由entry在open成功后立刻交同一次session.ownResource(close,isClosed)，isClosed观察FileHandle.fd<0；未成功的open没有资源。异步open都被fn或其子回调await，不逃逸；取消也登记刚取得句柄。entry显式关闭，原run负责最终兜底与未closed保锁；收尾回调只close原句柄，不读取服务、不等run、不发布/删成功输出。entry继续拥有元信息、摘要、临时路径清理、独占发布、unknown优先级和无秘密残余诊断；SQL无法选择这些政策。在线/离线均沿core maintenance R3，无host补救分支。
