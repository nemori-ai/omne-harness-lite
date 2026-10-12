# 模型档案目录公共行为

本包公开类型/校验表达形状，本页拥有目录所有提供者共用的行为。实际存储、初始化与撤除责任归[本地提供者](../../model/model-profile-directory-local/SPEC.md)。类型齐全或本次归位不表示所有业务与跨进程路径已实现。

### D1 身份、授权、缺失

行身份是范围与路由名，origin/范围/路由名不变，撤回不删除。组织写仅本组织有效超管；租户写仅有效本人，其他组织/租户先 `notAuthorized`，不查询成员资格。有效性每道写准入现读；不可读 `unavailable`，不能折成无权。授权读取与目录写不在同提交，已接受的判定后撤权窗口保留。输入/身份/问法无默认，表示先校验。对外八失败值闭合：invalidInput/notAuthorized/routeNameTaken/officialProfileReadOnly/manifestNotNewer/profileNotFound/credentialUnavailable/unavailable。必要事实不可读立即 unavailable，不猜前项通过去返回后项。

目录持久事实包括档案、配置修订判重、租户绑定、最高序号及原处置。替换/撤除不删除；原单操作单提交不引入跨提交活状态迁交。通知不担任正确性。

### D2 两个读面与胜出规则

`scopeChain` 输入只收 TenantId，内部派生本人租户→该组织→factory 三格，不收 caller 自排链，不含本人别处的个人组织。readProfile 按精确 ref：输入→读边界→必要读取→存在性；已撤回也返回完整行，不回落同名。official 各链可读，custom 必须是链上的组织/本人租户。

listProfiles 读同一一致快照的三格全部行，含已撤回/被覆盖项；任一格不可读整体 unavailable，不交部分。它不是合法/可发送集合。winner 先滤撤回与路由允许，再取 tenant>organization>factory；模态/凭据不滤 winner。当前 A 是同次列表的全部路由名，不引入新收窄政策；相同 `(T,r)` 不足以缓存未来带 A 的求值。全撤回、链无任何行、合法 winner 分开；同一路由名r的C是链上全部同名行，C1是其中在册行，C2再按允许集合A过滤。展示落点依次取winner、无winner时C1中最具体行、C1也空时C中最具体行；C为空则无落点，不自造行。当前A来自同次全部名字，故范围不允许的分支不出现；展示落点不授发送资格。

### D3 自建登记、更新、撤回、恢复

| 操作 | 表示之后的判定与提交 | 重复与并发 |
|---|---|---|
| registerProfile | custom 内容→当前授权→必要存储/配置修订判重→同格名字；判重事实+完整listed行同提交。名字包括撤回行，不看别格。出口 invalidInput→notAuthorized→unavailable→配置冲突invalidInput/malformed→routeNameTaken。 | 同身份同完整建档内容且listed认回原行；撤回行或异内容是routeNameTaken，不能重建清历史。 |
| updateProfile | 输入patch/ref→officialProfileReadOnly→授权→读取/不存在→应用patch后的完整文档校验→配置修订冲突；整行+历史同提交。不能改身份/registration/updatedAt，不能局部拼必填对象。 | 内容不变零写；并发在同一行提交边界读改写，后提交者作用在实际前值。已撤回仍可改，不自动恢复。 |
| withdrawProfile/relistProfile | 输入→officialProfileReadOnly→授权→必要读取→profileNotFound；同一行只改registration，updatedAt不动。 | 已在目标状态零写；恢复不撞名、不新行；按提交序竞争。只有listed→withdrawn提交后通知一次，恢复不通知。 |

这些出口的必要读取不可得为 unavailable，不读取无权者的名字、历史或完整旧值。表示校验与有状态配置冲突是两个位置，不能合成纯校验。

### D4 官方清单

loadManifest 是受信发布装配动作，不是普通租户服务写面；形状（official、正精确序号、路由无重复、完整内容）先拒。读取必要清单状态，先判序号重放/拒绝，再对可采用的新序号校验配置修订。低序号、同序号异完整内容是 manifestNotNewer；同序号同内容认回耐久保存的**原处置**，不能从当前行重算unchanged。新清单所有官方行/配置事实/最高序号/逐项处置同提交，确定拒绝/确认回滚不留下部分行、历史或序号；实际已整体提交但回执未知时可能全部生效，重启按耐久原处置认回，不由unavailable推零写。不读改custom行。

处置闭合 added/updated/unchanged/withdrawn/relisted：新增listed；消失listed改withdrawn；消失且已withdrawn不报处置；重现原行relisted；整份内容采用，六项时标之外的绑定变更仍可updated但时标不动。仅本次listed→withdrawn发提交后通知。

### D5 凭据绑定与两问法

bind/unbind 是本人租户当前资格，组织超管不能改成员那一把。表示→授权→必要读写，不解引用证明凭据可用。一个租户一引用；同引用重绑零写且boundAt不动，异引用轮换；unbind幂等删除绑定，不负责本体销毁；并发后提交者生效。

当前公共入口以 `credentialPresent` 与 `CredentialLookup.value`。租户绑定存在则任何origin均取该租户；无绑定且official才可能factory；custom不取factory、组织不提供凭据。两个问法都不能在租户绑定事实不可读时fallback。credentialPresent只读绑定槽位，不解引用、不访问保管方；有绑定时本体已清除仍可present:true，无可用租户/官方factory槽位时present:false，绑定读取不可用为unavailable；只返回存在/来源/boundAt，不返回ref或本体。value无可用槽位、绑定本体不存在或引用错时为credentialUnavailable，不fallback；保管方不可用为unavailable。present:true不证明稍后value可取；value只给模型实际发送消费者，每次现取，无缓存到下一次。

### D6 配置修订、完整输入与六项时标

目录不查注册表，不证明精确版本可取或模型可发送。完整 adaptation 的ID对齐沿 model-profile 拥有者校验；配置修订历史键为**同一档案身份+revision**，该修订曾成功采用的JSON值永久唯一。不同档案同字符串可不同值；撤回/恢复/重启保留历史。三条内容写路径与历史同提交，确定拒绝/确认回滚不留孤立历史；提交未知沿清单/写入的原认回责任，不从失回执推历史缺席。结构合法未注册绑定可保存。

inputs/upstream facts/caps 整项替换且合法，unknown是明确值，缺必填不是unknown/unbounded；同值相等按公开值语义，含精确数值/对象顺序等，不用浮点或字符串顺序代替。新档案updatedAt、新绑/换绑boundAt及六项变化后的updatedAt均取该次真实提交时刻，不由caller给值或任取单调旧时刻。六项inputModalities/outputModalities/maxInputTokens/maxOutputTokens/inputConstraints/upstreamInputLimits任一语义值变才更新既有档案时间，时间不得早于旧值、同精度可相等；相同内容认回/重绑仍不动时间。仅绑定/参数/供应商/回退/registration变不更新时间。完整读只见某次提交整行；不能交合法完整当前值的不兼容行整次unavailable，不补、不回写、不造兼容读取或自动升级操作。原调用快照不按当前目录回填。

### D7 发布链、通知与未闭

注册确切版本、目录采用、停止旧准入是各owner分别确认，非跨owner原子；目录成功不认证registry可用，过早停旧版本时开调用明确不可用，不回写最新、不称档案不存在。官方发布不自动改custom行。停止前检查旧引用的责任归受信发布者，检查与停止竞争由版本取得点收口。

profile.withdrawn 是提交后通知，不携凭据/适配配置，不担任授权，必发但非必达，不等待/读取listener返回；listener返回的未决Promise不使目录等待，也不成为控制结果。不因监听者异常撤销提交；丢通知不补正确性，现读保护。中心↔据点线上鉴别/秘密供给/新鲜度与按目标范围过滤通知、发布序号单一来源与发布者鉴别、存量完整上游事实来源仍明确未闭，不将本机成功写成跨进程采用。目录/tenancy都无形式模型，不为迁移新建模型。


验证义务归[verification](verification/README.md)。
