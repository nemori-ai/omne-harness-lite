# Asset model 行为承诺

公开类型、必要校验及 Schema 拥有形状。本页接续默认 AM3 与精确 retained2 的类型外行为；旧 workspace carrier 表示不自动升级为新版双来源发现或跨租户共享。正文端口由调用者显式注入，本包无存储、权限、发布或流转操作。

## 身份、记录与发布

能力身份只按 category＋name 相等，不裁剪、归一或折叠大小写。规范串仅用于只能放字符串的位置，不替代对象交换表示；记录号不能来自运行时身份，消费者不解析它推来源。空白词法沿 identity-values。

origin、capability、author、byAgent 产生后不变。customized 必有 owner 与 author；official 两者必须缺席，不是 null，不补平台租户。official 来源由真正官方登记写面决定，不据形状允许自报。organization O 的 author.organization 必为 O；tenant owner 的 author 恰为该租户，违例 malformed。owner 只可由租户不可逆提升到同一组织，作者不变，写方核历史与当前权限；纯值合法不证明转移合法。

普通发布从1连续追加，每版完整且不可改，草稿不是发布版。carrier 始终第1版但内容随读入变动，不能按记录号＋版本缓存，按准确内容指纹判同一内容。

## 正文与唯一声明

正文名字只是能力身份镜像，与记录能力名不同即拒绝。agent_definition 不解析 opaque 正文，不推出名字或声明；plugin 成员引用能力，不能嵌 plugin 或 agent_definition，空成员合法。plugin／opaque 的 underivable 不是空声明。

声明是确定的正文函数，MCP 另显式收动作快照。body 不能产保留项、重复项或不合法治理声明；这类端口违约抛提供者／配置错误，不折为领域拒绝。完整结果为 body 声明加固定 disabled、usableBy；disabled 为 governance 布尔 setting，default=false；usableBy 为 permission，域恰 [superAdministrator,member,self]，default=self。official 持有不配 disabled，official 使用不受 usableBy 管；disabled 配值 immutable 恒 false。工作区禁用只影响目录自带资产，其实际效果归求值者；无自然默认的落点／治理项保缺席，权限 default 不等于允许集合。

MCP 未提供、not_fetched、fetched 空、fetched 非空是不同知识。所有声明始终保固定项和自有 actionSnapshotKind；未提供时该值是 undefined，不能 JSON 化或条件展开丢 marker。AM 核输入与返回 marker 相等，其他类别不得冒带该项。

接受六实际端口或明确的非 Connector 五端口；缺键或类别错抛配置错误。缺 Connector 提供者时真实 Schema 闭包仍完整，只有实际访问对应契约正文位置才抛 BodyProviderUnavailableError，不用 stub、malformed 或空声明遮盖。

## 持有、配值与来路

持有键为 holder＋capability，引用记录须实现同能力；pinned 必须存在，shared／carrier 只能 current；current 无发布版不得回退草稿。配值属于持有，移除持有连带消失，禁用保留；配值不独立携租户。写时须合当时声明，since 是当前值写下的时刻；只加锁／解锁而值未变则 since 不变，解锁不回溯。声明移除后的旧配值保留，读方不能清理修补。

official 记录与 official 来路双向对应；owned 必须与本格 owner 相同；tenant 格 organization 可来自本组织 owned，或外层同 capability、同 asset 的持有；workspace 格 organization 必在本租户／本组织格有同 capability、同 asset 外层持有，不单靠组织 owned；carrier 只属于提供它的工作区：owner={kind:tenant,tenant:WorkspaceKey.tenant}，author=WorkspaceKey.tenant，origin=customized、byAgent=false，publishedBy 为该租户、publishedAt 为本次读入时刻，记录号由 (WorkspaceKey,capability) 确定；读入方直接产生，不经过创作／发布。外层仍存在但分享已失效时，依赖它的 organization 持有不可用，不等于外层撤除。shared 的当前有效性由流转及求值者核。依赖外层持有的 organization 来路随外层撤除失效，不能改称 owned。拿到 Ref 不授资格或跨租户访问。

血缘号不能反解源组织／记录，目标读面不提供映射。血缘存在性出生时确定，原记录不增删；首次血缘固定。sourceVersion 指源版，imports 首次1、重复加1，importedBy 属目标组织且租户所有时就是该租户；一血缘至多挂一份现存记录。重复复制仅更新 sourceVersion、importedBy、importedAt、imports，和新目标版本同提交，不继承另一复制的血缘。CredentialRef 只在原持有有效，本体和引用不呈现，续期不改配值；组织格不配 MCP 凭据，也不能配 Connector 鉴权绑定；后者只能在租户格配。真实授权、同提交、续期与保密由存储／治理／流转拥有者兑现。

## 工作区与接纳

manifest 未知格式最高优先级，缺列表不补空；重复 JSON 键拒绝。source 只作字面 confinement，链接是否逃逸由真实读方核，文件缺席不等于空清单。目录身份不从绝对物理路径推业务归属。

非法工作区配值可以仍具合法形状：清单读入丢 immutable／无来源项并留 DropReason；求值第四步丢权限、落点身份和非 disabled 治理配值并留 FilterReason，每种只丢一次，不把这两步混成修补准入。

表示拒绝顺序为 manifest_format_unsupported → category_unknown → origin_unknown → owner_kind_unknown → name_invalid → plugin_member_is_plugin → version_sequence_broken → assignment_item_duplicate → manifest_source_escapes → malformed。正文、被引用的配值域、记录名字连同相应正文上下文都沿各契约原首拒绝；非 malformed 原名进入 name_invalid 与 plugin_member_is_plugin 之间，同名沿 AM 等级；多个正文按草稿、版本数组、成员数组取首个非 malformed。非法表示不等于资格否定，不偷偷修改输入。

## 验证与采用边界

`createAssetModelJudge` 默认不保留作者域的编译结果。调用者显式设置 `reuseDomainValidators: true` 时，成功编译的域按完整无损 Schema 表示保存在该 judge 内，固定资源使用构造时快照。不同 Schema 各用独立编译器，相同 `$id` 不合并身份。缓存只复用校验器，每次仍校验当前 default；无 default 时只做元校验。释放 judge 后，其编译状态不再由本包持有，不设模块级作者缓存。

固定 Schema 图在构建生成，首次实际消费加载；缺资源、定义、生成物或 helper 原抛，不回退、不伪业务拒绝。动态作者 Schema 的编译对象归调用者。规范输入、闭包缺资源负控、首拒绝与正文端口责任由 tests 验证；发布顺序、owner 历史、权限、血缘同提交和凭据泄漏还须真实消费方验证。

plugin 完整内容／声明、AM3 agent_definition 集成端口、Connector install／usableBy 对应、项域变化后旧配值求值及版本撤下仍待各真正拥有者限定；新版独立 agent-definition 不自动改 AM3 opaque 规则。

factory 持有的 immutable 当且仅当部署清单标明 meta，非 meta 恒 false。这项当前采用覆盖 retained Schema 中“出厂格不加锁”的旧说明；真实部署／持有写方核 meta，而非从形状或能力名推。

## 跨边界消费责任

跨节点沿持有键串行化或条件提交唯一持有，版本追加、owner 提升及首次／重复复制也在原相应身份下串行化或条件提交，不能用先查后写放大窗口。CredentialRef 不是 bearer，解引用每次按原持有及当前权限重判。WorkspaceKey 目前没有宿主分量，多宿主命名／同一目录身份的协议仍待真正拥有者限定，不以共享内存或绝对路径证明。同一数据每个接收边界重验形状及对应上下文。
