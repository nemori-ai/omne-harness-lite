# D-089：模型时间关联精确比较的窄投影采用

2026-09-27，主线依用户“Implement the plan”、先有明确spec／realization再实施及主调度／验收职责授权，技术采用[原offer-expiry节点精确比较增补](../../../realization/packages/core/offer-expiry/rfc3339-order-design.md) rev1，SHA256 `249c68ea3239977131cc44be3d75dbd31474e0659355258c2606833eb2bfaab2`。该决定承接[D088](../model-runtime-log-codec-adoption/decision.md)的完整响应时间关联，回应已实际复现的亚毫秒舍入反例；沿既有[模型请求适配topic](../../proposals/model-request-adaptation/README.md)的窄前置，不增加产品目标或通用时间平台。

选择B／R1：在同一core包增加根公开 `compareRfc3339Instants(left: unknown, right: unknown) → Parsed<-1|0|1>`，静态检查表示／日历／偏移，保留任意小数、合法时区等价、UTC年界和合法闰秒的先后。其排序保证以输入确为合法RFC3339时点为前提；`ok`不是外部闰秒事实认证，不能当完整未知数据接收器。当前没有采用公告事实表，不默认所有60合法或非法，不以固定毫秒／纳秒精度降低规范域。

原品牌化毫秒Instant、Clock、公开舍入／书写／失败、存储和OE1／OE2规范资源保持。MR4仍精确消费OE1 S-22，不自动升级无关消费者。新构件不产生Schema、持久身份、服务、plugin、fiber、后台任务或装卸贡献，语言无关契约与中央registry不因本提供者增补升版；节点采用事件在本记录中精确钉定。

runtime完整关联仍有TL-G1：原runtime／回复生产者、宿主及合法历史owner须交具名时间生产链和实际组合证据。Schema通过、Clock接口名、G29-P物理同批或`trusted=true`都不独立证明时间合法。未知历史／未核外部时间不可确认时仍按原RT4 S-70保持unavailable；纯比较成功不得放行非法／不可确认的业务批。若真实路径无法兑现R1前提，回原owner闭合R2的明确事实来源、覆盖、更新和不可决定责任，不能靠局限记录改变保证。

独立architecture-reviewer对精确rev1无本次阻断，认为原时间owner承接已接受顺序性质、无需全局时间表示迁移；明确G29-P不推出时间合法，双入口误用与线性扫描成本须实验，A的隔离半径／C的统一表示／R2的混杂来源优势保留改票条件。独立spec-reviewer未发现表达阻断或非阻断补足项，确认unknown／Parsed静态责任与R1前提、合法leap不滚动、任意小数／UTC年界、原JSON字符串关系及TO-V1～9相互对齐。二者均未运行产品／形式工具、未接受；评审不是算法证明。

主线亲核77输入、候选冻结字节及[107成员归档](../../proposals/model-request-adaptation/reviews/model-runtime-rfc3339-order-2026-09-27.tar.gz)，SHA256 `8329a9c9b79549904c730cfe3df702dade98dff10c4ec8cfad60be950fb53807`；[逐文件索引](../../proposals/model-request-adaptation/reviews/model-runtime-rfc3339-order-2026-09-27.json)全部读回相同。评审文本是主线据两角色实际final消息保存的明确归因摘要，不冒充逐字reviewer原件或人的签收。作者结构检查formal=skip，原毫秒公开反例是旧路径实测，不是新函数测试。

本事件只关闭TL-G2精确技术采用步骤，允许按此投影实施core纯函数；TL-G1、TO-V1～9、实际公开制品／双语README、runtime消费者和旧接口回归尚未完成。新增bindings0／未实现／未验；G28／G29-P/H／G30／G31、五共同结算构件、十三操作与P2～P6保持原owner，官方生产认证0／37。人的总体交付接受未发生。
