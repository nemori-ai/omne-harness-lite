# 来历

本成员日历页的版式参考外部项目 `pandazki/super-assistant`，提交 `83c1616f44d000d1f333e929bfd94d31dff847da`（授权依据见 [ui-kit 的来历](../../frontend/ui-kit/UPSTREAM.md)）。没有原样拷贝文件：参考项目的设置页绑它自己的桥、查询与多语言，这里按日历协议的数据重写，只取设置行的手。行、节与页头是共用件的 `SettingRow`、`Section` 与 `PageHeader`（R8 K），本成员只排它们。

| 参考项目的文件（相对 `desktop/src/renderer/src/`） | sha256 | 取了什么 | 落在 |
| --- | --- | --- | --- |
| `routes/settings/connections.tsx` | `3eb161708efef0b1c4c65dd6656ba0c03552e0f5e4d2ce112d39f2fa73b81372` | 一节里一行一个对象：名字与一句说明在左，行尾一个状态词，正常时不写；出了事的说明写在这一行 | `src/view/shipped-calendars.tsx` |
| `routes/settings/pieces.tsx` | `921090e2683169adfc9fea5738997c856ce8366c1bf2326bbd46f683a8310202` | 详情收在一个安静的折叠里，开始时收起 | `src/view/shipped-calendars.tsx`：折叠「来源」 |
| `routes/settings/settings.css` | `290a5c2d733df756b3543f65ee1f03ca7ae73062b67b71176ad4eab29a09435b` | 请求、答复与失败的通知守决定的量度（`.settings-pane-body [data-inline-notice]`） | `src/view/calendar-ui.css` |

## 改了哪几样

- 折叠在这一行里面（`SettingRow` 的 `notice`），不在行的下一条线后面另起：一节里每份日历各有自己的折叠，折叠属于哪一行要看得出来。
- 行尾的词取共用件状态词表的词（失败、待处理、排队中、未确认），不取参考项目的词；状态词的字形由共用件的 `StateWord` 决定，本成员不加。
- 「查一天」不是设置行：是一行表单与它原地到达的事实表，参考项目没有对应的一屏。
- 没有多语言：文案直接写中文。
