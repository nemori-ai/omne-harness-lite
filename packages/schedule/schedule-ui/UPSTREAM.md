# 来历

本成员日程页的版式参考外部项目 `pandazki/super-assistant`，提交 `83c1616f44d000d1f333e929bfd94d31dff847da`（授权依据见 [ui-kit 的来历](../../frontend/ui-kit/UPSTREAM.md)）。列表加阅读的骨架由共用件给，本成员只取来源事项页怎样把它填满。没有原样拷贝文件：来源绑它自己的路由、查询与多语言，这里按日程协议的数据重写。

| 来源（相对 `desktop/src/renderer/src/`） | sha256 | 取了什么 | 落在 |
| --- | --- | --- | --- |
| `personal-objects/index.tsx` | `7f0d42128f0c4e01a2932ed3e8ec34838a3c697838754a93bbd0017a422830be` | 目录栏的筛选放在搜索的位置；一行是记号、标题、事实一行与时间；列表空时目录栏不写字，阅读面那一句就是邀请；阅读面是工具条（返回与名字）加文档：大标题、说明行、事实表，下面分节 | `src/view/schedule-page.tsx`、`src/view/schedule-detail.tsx` |
| `personal-objects/objects.css` | `e25c902fb7d735cd78d07306f3f533bd9cad67e25d6c6455c7677ec13e9990cf` | `.objects-agenda` 的外边距（目录栏内边距，下 12）；`.object-reading-body h1` 的阅读字体、标题字号与字重、行高、字距，标题下 8；`.object-facts` 的下内边距 16 | `src/view/schedule-ui.css`：`.schedule-span`、`.schedule-record-title`、`.schedule-record-facts` |
| `components/list-reading.css` | `316cd764360bf82b59e1ddaf96c4efabe5a08f0c6012828388e745177f76912d` | `.list-reading-byline`：界面字号、阅读行高、弱墨，下面隔一个 `space-section` | `src/view/schedule-ui.css`：`.schedule-record-byline` |

## 改了哪几样

- CSS 变量 `--pe-` 换成同名的 `--omne-`；大于 1px 的长度写成 `calc(var(--spacing) * n)`，随字号档变。
- 来源事项页的事实表是它自己的 `.object-facts`（标签一列 96 至 140，标签是说明字）；这里用共用件的 `FactList`，样子归共用件，只取下内边距。
- 来源的状态在阅读面是胶囊，在行里是事实一行的字；这里照做，但行里只在不正常时写词。
- 来源的日期窗口是一个弹出的表单；这里是共用件的分段控件「当前的」「全部，含已结束的」。
- 读到末尾接着读下一页，不放「更多」：做法同会话界面模块的 `read-on-end.tsx`，本成员另有一份。
