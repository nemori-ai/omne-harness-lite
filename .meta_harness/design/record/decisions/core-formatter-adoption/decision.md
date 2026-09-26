# D-046：采用 unix-format 与 xml-format 的窄技术映射

- 当前状态：技术映射已接受（2026-09-26）；实现及用户总体交付接受未发生。
- 来源：[研究](../../../../research/minimal-runtime-formatters/research.md)及其固定观察。
- 需求依据：用户本会话明确“unix-format 和 xml-mformat这两个是我们明确要的…另外timeout和brand你自己看情况”；实际来源名xml-format。用户先前明确“除了最后总体交付验收要人，其他的可以自行验收（让一个主调度规划者来验收）”。
- 接受主体：主调度在上述明确委托内接受技术实现映射；不是代签人类总体门。
- 精确修订：[scope.json](scope.json)的八份候选SHA；随后README只补接受事实与本决定引用。

## 选择与范围

| 项目 | 处置 | 范围与依据 |
|---|---|---|
| unix-format/xml-format | 接受技术映射 | user选定util路径，固定d79484d9来源；UF-1～6、XF-1～7公开渲染/类型，零运行依赖，无独立领域契约 |
| XML两项迁入调整 | 接受 | 普通路径拒绝非法XML1.0Char和重复生成属性，不覆盖trusted toXml合法片段前提；保留来源差异，不声称全输入等价 |
| timeout | 暂不迁入 | 纯core当前没有计时器需求；取消通知不是静止，未来真实运行时需要时重新判断 |
| brand | 暂不迁入 | 已有identity-values品牌单一来源，外来brand互不兼容且只是断言，无新增需求 |

## 理由与保留前提

独立architecture-reviewer核对八文件无阻断：技术渲染没有领域事实、Cordis服务或隐式持久责任，空bindings不冒充契约，码点宽度/尽力maxWidth与trusted主动钩子责任已明。评审未执行实现或原Python。双盲未达成如实保留。

验收落实既有要求：XML合法补充平面U+1FFFE接受；声明/manual/list Map键字符串化重名拒绝；同error实例原抛；unix宽前列、emoji、负start、小宽度行为。终端显示列一致、不可信主动对象仍保证完整XML、业务固定字节协议若成为需求，需重审相应映射，不能扩大本次接受。

## 取代与影响

不取代领域契约、旧决定或其冻结资源。用户明确新增util位置构成本阶段仅core边界的两叶例外，realization布局增加技术utils；不把util当新领域名。implementation计划/matrix记录U1，源码仅两util叶，根lock由root；其余core依赖不自动修改。

节点[unix-format](../../../realization/packages/util/unix-format/README.md)与[xml-format](../../../realization/packages/util/xml-format/README.md)据此开包；实际证据须另登记，最后用户总体门仍待。
