# w2-skill 第 1 轮评审（head 28e50a4ea，基线 b0f2ec7fb）

## 设计与实践（只读子代理）

- **B1 阻断**：映射不止一处——`mapping.ts` 的 `access` 列同时用于 `snapshot` 与 `open`，`pin.ts:30-37` 又做二次映射把 `entry-not-found`/`bytes-mismatch` 改成 `source-unavailable`。处置：列改为 `'inspect' | 'snapshot' | 'open'`，删 `snapshotFailure`。
- **B2 阻断**：`checkpoint` 没覆盖 `gate` 里的两次端口调用（`readCheck.check`、`resolution.resolve`）；已中止的 signal 仍调用端口，到 `pin` 才答 `aborted`；成员 SPEC:65 与代码不符；A7 没断言端口调用次数。处置：`gate` 收可选 `signal`（`describe` 不传），两次端口调用前后各查；加「已中止时 check/resolve 调用 0 次」用例。
- S1 `PinFailure` 含 `DescribeFailure` 不是最窄（`Exclude<PinFailure, GateFailure>`）。S2 `gate`/`pin` 的重载签名编译器不核对，等于类型断言；改为 `pin(ports, gated, moved: F, signal)` 由编译器证明。S3 `export` 每条目 `find` 两次 O(n²)。S4 常量与相等判定重复（`MANIFEST_PATH`、`PAGE_LIMIT`、`ABORTED`、`sameCapability`），契约可导出（W3 prep）。S5 `inspect` 列不用 `basis` 却必须传。S6 `service.ts` 重复 gate→pin 开头与 `basisOf`。S7 范围非法应在操作开头校验。S8 `readManifest` 可直接用 `frontmatterBounds(bytes)`。S9 `AccessFixture.capability.standIn` 无用例；`abortAfterSnapshot().opens` 文档与实现不一致。S10 `toEqual` 应为 `toStrictEqual`（已定事项 9 要求深度相等）；重复用例、死导出、动态 import。S11 成员 SPEC 验证表缺反例列；SPEC:30 自定的次序偏离（无可读包 + 坏路径答 `bad-path`）需组页拥有者确认。
- 无发现：无 as/any/class；`gate` switch 穷尽；`ByteFailure`/`SnapshotFailure` 最窄；`inspection.ts` 符合已定事项 7。

## 交付边界（只读子代理）

- 13 条验收：12 达到、SK2-2 部分；写范围无越界（契约改动都是可加的；形式上契约 SPEC「入口」表改了现有一格而非加行；`public-entry.spec` 一个标题改写）。
- **阻断 B1**：读取次序——第 6 步 `partOf` 在 `pin`（含第 5 步）之前，「没有可读的包 + 坏路径」答 `bad-path` 而非组页规定的 `unsupported`；写者在成员 SPEC 自称偏离。修法小：第 5 步提到第 6 步前；加用例；删偏离句。
- 11 条自定裁定：1（`op` 两列）偏离闭包字面，请追认或改回；2 超出授权（即 B1）；3（快照阶段 `entry-not-found`/`bytes-mismatch` → `source-unavailable`）在授权内，组页映射表需补行；4（无合法定界时整条目当正文）在授权内，组页第 11 步需写明；5（`describe` 带依据时 `material.basis` 取 `SkillRef` 的 digest 而非依据的）与组页「依据所指材料」相抵且与 `read`/`list` 内部不一致，交 reduce；6 `standIn` 无用例；7 测试世界的对应端口替身对 stranger 可见（不满足 PR5），套件只在不合规世界证明过，建议加合规夹具再跑；8–11 可接受。
- 建议：SK2-3 的具名变异编号应是 A2（规格笔误）。

## reduce 裁定

- B1 进第 2 轮：第 5 步提前；用例；删偏离句。
- 裁定 1：不追认两列，改为设计面 B1 的三列 `'inspect' | 'snapshot' | 'open'`。
- 裁定 5：`describe` 带依据且依据合法时，`material.basis` 的 digest 与 assetVersion 取**依据**的（依据所指材料），与 `read`/`list` 一致；已定事项 8 相应修正。
- 裁定 7：加一个对应端口合规的夹具世界（只对 reader 可见）再跑套件，两个世界都要全绿。
- 裁定 3、4：组页「端口」映射表补「快照阶段的 `entry-not-found`/`bytes-mismatch` → `source-unavailable`（来源不得这样答）」、「读取」第 11 步补「没有合法定界的 `SKILL.md`：整个条目是正文」——进 W2 写回清单。
- 契约 SPEC 改格与标题改写：追认。

## L3 逐行（implementation-reviewer，7 个探针实跑）

- **B1 阻断**：`gate` 两侧端口调用无中止检查点（P1：已中止仍调用 `check`、`resolve`；P2：`check` 期间中止答 `not-available-to-you` 而非 `aborted`）；成员 SPEC:65 自述与事实不符。根源是已定事项 3 的 `gate` 签名没有 `signal`。
- N1：读取判定答复不在封闭集合里时放行（P3 `{kind:'denied'}`、P3b `{}` 都交出正文）——L3 热点上的开放式放行。N2 = 设计 B1（P6）。N3 A3 可选，三路径同答可能没被核对。N4 A9 页上限断言在小夹具上空转。N5 A7 抓不到 B1。N6 契约 SPEC:439 与新增条款矛盾。N7 `bodyOffsetOf` 没有契约条款。
- X1 = 交付边界 B1（P4）。X2 = 快照阶段两种答复的契约单列。X3「请求终点」两种读法（P5：`{start:2,length:2}` 在 `61 C3 A9 62 63` 上答 `"bc"`/`{3,2}`）。X4 无合法头部整份交出（P7、P7b）。
- 逐行确认为对：第 1–3 步与无披露同一冻结对象；替换件只用 SafeReason；映射表六行逐行一致；第 5、7、9、10 步；范围六条规则；`frontmatterBounds` 与旧 `frontmatterOf` 等价；`export` 不交部分包。

## reduce 裁定（第 2 轮输入，合三面）

- 三处阻断：读取次序（第 5 步提前）；`gate` 收 `signal` 并在两次端口调用前后 `checkpoint`（已定事项 3 签名修正为 `gate(ports, access, scope, capability, basis?, signal?)`）；映射三列 `'inspect' | 'snapshot' | 'open'`。
- N1：读取判定答复不是 `granted`/`refused`/`unknown` 之一时答 `unknown`（封闭集合在运行期也封闭）；`gatedOf` 的 default 同样收口。
- X3：「请求终点」= 请求起点 + 请求长度（字面）；实际终点前移到不大于它的上一个字符边界；P5 应答 `"b"`/`{3,1}`。SPEC 加一句消歧。
- X4：保持「没有合法定界时整个条目是正文」，写回组页第 11 步。
- 套件：`checkedOnly` 改为必需（A3 必跑）；A9 要求夹具提供 >65536 字节的资源，否则 `NotApplicable`；A7 加「已中止时 check/resolve/snapshot/open 调用 0 次」（夹具加计数钩子）；加对应端口合规的第二个夹具世界。
- 契约 SPEC：允许写者删/改 439 行等三处过时句，并为 `bodyOffsetOf` 补一句条款（扩大写范围）。
- 设计 S1–S3、S5–S11 进第 2 轮；S4（契约导出常量）进 W3 prep。
- `describe` 带依据：`material.basis` 取依据的 digest 与资产版本。
