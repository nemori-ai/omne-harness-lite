# Robert C. Martin「整洁之道」体系：正式出版物与作者自营渠道取证笔记

- 取证日期：2026-09-30
- 本路来源域：出版社页面（InformIT / Pearson / O'Reilly 目录与样章）、书的目录（TOC）与出版社托管样章 PDF、blog.cleancoder.com、cleancoder.com、github.com/unclebob（含 Martin 本人为作者/合作者的 GitHub 文档）。X/Twitter、播客、第三方评论不在本路范围内；少量第三方搜索结果只作「搜索摘要」标注，不当事实用。
- 标注约定：
  - 【一手原文】= 本路实际抓取到页面/PDF/仓库文件并逐字读到的内容。
  - 【搜索摘要】= 仅在搜索引擎结果摘要里看到，未抓到原页面。
  - 【出版社文案】= InformIT/Pearson 的产品描述（营销文字，非作者正文）。
  - 【作者自述】= Martin 本人署名的正文（书内正文、博客、仓库提交/文档）。
  - 【TOC/索引推断】= 只从目录或书后索引的条目与页码推断「讲了什么主题」，未读到正文，不代表具体论点。
- 可访问性：O'Reilly 页面（https://www.oreilly.com/library/view/clean-code-a/9780135398586/ 、Clean Architecture 对应页）与 Pearson eLibrary（https://elibrary.pearson.de/book/99.150005/9780135398548）对本环境返回 HTTP 403，未能读取。

---

## 0. 来源清单（编号供正文引用）

出版社 / 样章（【一手原文】除特别注明）

- S01 InformIT，Clean Code 2e 纸书页（ISBN 9780135398579）：https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780135398579
- S02 InformIT，Clean Code 2e 电子书页（ISBN 9780135398517）：https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780135398517
- S03 Pearson.com，Clean Code 2e 产品页：https://www.pearson.com/en-us/subject-catalog/p/clean-code-a-handbook-of-agile-software-craftsmanship-2nd-edition/P200000013239/9780135398548
- S04 InformIT 托管 Clean Code 2e 样章 PDF（前言、导言、目录、第 3 章、索引）：https://www.informit.com/content/images/9780135398579/samplepages/9780135398579_Sample.pdf
- S05 InformIT 在线样章 "First Principles"（Clean Code 2e 第 3 章，站内日期 Feb 24, 2026）：https://www.informit.com/articles/article.aspx?p=3222335
- S06 InformIT，Clean Code 1e（ISBN 9780132350884）：https://www.informit.com/store/clean-code-a-handbook-of-agile-software-craftsmanship-9780132350884
- S07 InformIT 托管 Clean Code 1e 样章 PDF（目录、第 1 章、索引）：https://www.informit.com/content/images/9780132350884/samplepages/9780132350884.pdf
- S08 InformIT，The Clean Coder（ISBN 9780137081073）：https://www.informit.com/store/clean-coder-a-code-of-conduct-for-professional-programmers-9780137081073
- S09 InformIT 托管 The Clean Coder 样章 PDF（前言、第 4 章 Coding）：https://www.informit.com/content/images/9780137081073/samplepages/0137081073.pdf
- S10 InformIT，Clean Architecture（ISBN 9780134494166）：https://www.informit.com/store/clean-architecture-a-craftsmans-guide-to-software-structure-9780134494166
- S11 InformIT 在线样章 "The Clean Architecture Dependency Rule"（Clean Architecture 第 22 章，站内日期 Nov 18, 2017）：https://www.informit.com/articles/article.aspx?p=2832399
- S12 InformIT，Clean Agile（ISBN 9780135781869）：https://www.informit.com/store/clean-agile-back-to-basics-9780135781869
- S13 InformIT 托管 Clean Agile 样章 PDF（前言、完整目录、第 2 章、索引）：https://www.informit.com/content/images/9780135781869/samplepages/9780135781869_Sample.pdf
- S14 InformIT，Clean Craftsmanship 纸书（ISBN 9780136915713）：https://www.informit.com/store/clean-craftsmanship-disciplines-standards-and-ethics-9780136915713
- S15 InformIT，Clean Craftsmanship 电子书（ISBN 9780136915645）：https://www.informit.com/store/clean-craftsmanship-disciplines-standards-and-ethics-9780136915645
- S16 InformIT 托管 Clean Craftsmanship 样章 PDF（前言、第 1 章）：https://www.informit.com/content/images/9780136915713/samplepages/9780136915713_Sample.pdf
- S17 InformIT 在线样章 "A Brief History of Craftsmanship in Programming"（站内日期 Feb 22, 2022）：https://www.informit.com/articles/article.aspx?p=3129448
- S18 InformIT，Functional Design 纸书（ISBN 9780138176396）：https://www.informit.com/store/functional-design-principles-patterns-and-practices-9780138176396
- S19 InformIT，Functional Design 电子书（ISBN 9780138176464）：https://www.informit.com/store/functional-design-principles-patterns-and-practices-9780138176464
- S20 InformIT，We, Programmers 纸书（ISBN 9780135344262）：https://www.informit.com/store/we-programmers-a-chronicle-of-coders-from-ada-to-ai-9780135344262
- S21 InformIT，We, Programmers 电子书（ISBN 9780135344200）：https://www.informit.com/store/we-programmers-a-chronicle-of-coders-from-ada-to-ai-9780135344200
- S22 InformIT 托管 We, Programmers 样章 PDF（序、前言、目录、第 6 章、索引）：https://www.informit.com/content/images/9780135344262/samplepages/9780135344262_Sample.pdf
- S23 InformIT，Robert C. Martin Series 列表：https://www.informit.com/imprint/series_detail.aspx?ser=348084
- S24 InformIT 在线样章 "Agile: The Reasons for Agile"（Clean Agile 第 2 章，站内日期 Oct 29, 2019）：https://www.informit.com/articles/article.aspx?p=2990402

作者自营渠道

- S30 blog.cleancoder.com 首页（全部博文索引，最新一篇 2023-01-19）：https://blog.cleancoder.com/
- S31 blog.cleancoder.com Atom feed（`<updated>2023-01-19T20:57:45+00:00</updated>`）：https://blog.cleancoder.com/atom.xml
- S32 cleancoder.com 首页（2026-09-30 抓取；含 "Morning Bathrobe Rants" 列表）：https://cleancoder.com/
- S33 github.com/unclebob 仓库列表（经 GitHub API `users/unclebob/repos`，99 个仓库）：https://github.com/unclebob?tab=repositories
- 博客单篇编号（URL 前缀 https://blog.cleancoder.com/uncle-bob/ ，完整路径见 §9 表格）：S40 2012-08-13 The Clean Architecture；S44 2016-05-01 Type Wars；S46 2016-06-10 Mutation Testing；S47 2017-02-23 Necessary Comments；S50 2014-03-28 The True Corruption of Agile；S51 2014-05-08 The Single Responsibility Principle；S52 2014-09-19 Microservices and Jars；S53 2014-10-01 Clean Micro-service Architecture；S55 2015-05-28 The First Micro-service Architecture；S56 2017-01-11 The Dark Path；S57 2017-03-03 TDD Harms Architecture；S58 2017-01-13 Types and Tests；S60 2015-11-18 The Programmer's Oath；S61 2015-11-27 Prelude to a Profession；S62 2016-01-04 A Little Architecture；S63 2017-07-24 Drive me to Toronto, Hal.；S64 2017-07-28 The Brain Problem；S65 2018-03-29 We Programmers；S66 2018-05-02 Craftsman, Craftswoman, Craftsperson；S67 2018-04-02 In The Large；S68 2018-04-13 FP vs. OO；S69 2018-08-28 The Tragedy of Craftsmanship.；S70 2018-08-13 Too Clean?；S74 2021-01-17 Pairing Guidelines；S75 2019-06-16 Classes vs. Data Structures；S76 2020-10-18 Solid Relevance；S79 2021-06-25 On Types；S80 2021-06-29 More On Types；S81 2021-10-28 Functional Duplications；S84 2023-01-18 Functional Classes；S85 2023-01-19 Functional Classes in Clojure。其余博文与 GitHub 仓库在各节就地给出 URL。

Martin 为合作作者的 GitHub 文档

- S86 "A Philosophy of Software Design vs Clean Code"（Ousterhout 与 Martin 2024-09～2025-02 对话记录，仓库在 Ousterhout 名下）：https://github.com/johnousterhout/aposd-vs-clean-code
- S87 Martin 与 Casey Muratori 的问答文档（Martin fork 的副本，2023-03～04）：https://github.com/unclebob/cmuratori-discussion/blob/main/cleancodeqa.md

搜索摘要（第三方，仅作线索）

- S120 维基百科 SRP 条目（给出 Clean Architecture 的 "actor" 表述与页码）：https://en.wikipedia.org/wiki/Single-responsibility_principle
- S121 bugzmanov 的第二版书评（提到 Postscript 页码与 FromRoman 示例）：https://bugzmanov.github.io/cleancode-critique/clean_code_second_edition_review.html
- S122 MIT Press Bookstore 条目（搜索摘要中给出 September 30, 2025）：https://mitpressbookstore.mit.edu/book/9780135398579

---

## 1. 版本总表

| 书 | 版次 | ISBN（出处） | 出版日期（各来源原样） | 版权年 | 页数 | 来源 |
|---|---|---|---|---|---|---|
| Clean Code: A Handbook of Agile Software Craftsmanship | 1st | 978-0-13-235088-4 / 0-13-235088-2 | InformIT: "Published Aug 1, 2008" | InformIT 页标 "Copyright 2009" | 464 | S06【一手原文】 |
| Clean Code …, 2nd Edition | 2nd | 纸书 978-0-13-539857-9 / 0-13-539857-6（S01、S04 版权页）；InformIT 电子书 978-0-13-539851-7（S02）；Pearson VitalSource eTextbook 9780135398548（S03）；O'Reilly 版本号 9780135398586（S06 URL，403 未读） | InformIT 纸书页："Published Oct 8, 2025"（S01）；InformIT 电子书页："Published Sep 30, 2025"（S02）；Pearson.com："Published by Addison-Wesley Professional (30 September 2025) © 2026"（S03） | 版权页："Copyright © 2026 Pearson Education, Inc."；LCCN 2025941348（S04） | 672（S01、S02） | S01–S04【一手原文】 |
| The Clean Coder: A Code of Conduct for Professional Programmers | 1st | 978-0-13-708107-3 | "Published May 13, 2011" | 2011 | 256 | S08【一手原文】 |
| Clean Architecture: A Craftsman's Guide to Software Structure and Design | 1st | 978-0-13-449416-6 | "Published Sep 10, 2017" | 页标 "Copyright 2018" | 432 | S10【一手原文】 |
| Clean Agile: Back to Basics | 1st | 978-0-13-578186-9 | "Published Oct 17, 2019" | 页标 "Copyright 2020" | 240 | S12【一手原文】 |
| Clean Craftsmanship: Disciplines, Standards, and Ethics | 1st | 纸书 978-0-13-691571-3；电子书 978-0-13-691564-5 | 纸书 "Published Nov 4, 2021"（S14）；电子书 "Published Sep 16, 2021"（S15） | 2022 | 416 | S14、S15【一手原文】 |
| Functional Design: Principles, Patterns, and Practices | 1st | 纸书 978-0-13-817639-6；电子书 9780138176464 | 纸书 "Published Sep 11, 2023"（S18）；电子书 "Published Sep 20, 2023"（S19） | 页标 "Copyright 2024" | 384 | S18、S19【一手原文】 |
| We, Programmers: A Chronicle of Coders from Ada to AI | 1st | 纸书 978-0-13-534426-2；电子书 978-0-13-534420-0 | 纸书 "Published Nov 20, 2024"（S20）；电子书 "Published Dec 5, 2024"（S21） | 2025 | 480 | S20、S21【一手原文】 |

补充观察：
- InformIT 系列页与 cleancoder.com 首页书架均列出上述书；cleancoder.com 书架把 Clean Code 2nd ed. 与 1st ed. 同时列出（S32，【一手原文】）。
- Clean Code 2e 样章里的 "Robert C. Martin Series" 广告页排版文件时间戳为 "8/14/25"（S04 第 2 页，【一手原文】），仅说明排版时间，不是出版日期。

---

## 2. Clean Code：第一版（2008）与第二版（2025）

### 2.1 第二版的结构（完整 TOC，S01【一手原文】；页码为书内页码）

前置：Foreword xix（Micah Daniel Martin 撰）／Introduction xxv／Introduction (from Long Ago) xxix（"This is the Introduction to the first edition and has been edited and abridged."，S04）／About the Author xxxi。

- Chapter 1: Clean Code（There Will Be Code, Bad Code, The Art of Clean Code, Putting All This Together, We Read More Than We Write, The Boy Scout Rule）
- Part I: Code
  - Ch2 Clean That Code!（The Cleaning Process; Conclusion; **Postscript: Future Bob Playing with Grok3 37**; Postscript Conclusion 40）
  - Ch3 First Principles（Everything Small, Well Named, Organized, and Ordered; A More Significant Example; A Final Thought）
  - Ch4 Meaningful Names；Ch5 Comments（Compensating for Failure; Good Comments; Bad Comments）；Ch6 Formatting（含 Team Rules; Uncle Bob's Formatting Rules）
  - Ch7 Clean Functions（Small!; The Stepdown Rule; Switch Statements; Clean Functions: A Deeper Look）
  - Ch8 Function Heuristics（Function Arguments; Command Query Separation; Prefer Exceptions to Returning Error Codes; DRY; Side Effects; Structured Programming; **This Is Too Much to Constantly Keep in Mind**）
  - Ch9 The Clean Method；Ch10 One Thing（Extract Method Refactoring; **What Are Large Functions Anyway?**）；Ch11 Be Polite（The Newspaper Metaphor; The Stepdown Rule: Once Again; The Abstraction Roller Coaster; **This Is How We Write, but Not How We Want to Read**）
  - Ch12 Objects and Data Structures（… The OO/Procedural Trade-off; **But What About Performance?**）；Ch13 Clean Classes
  - Ch14 Testing Disciplines（**Discipline 1: TDD; Discipline 2: Test && Commit || Revert (TCR); Discipline 3: Small Bundles**; Design; Discipline; Keeping Tests Clean; Tests Enable the -ilities）
  - Ch15 Clean Tests（Domain-Specific Testing Language; F.I.R.S.T.; Test Design）；Ch16 Acceptance Testing
  - **Ch17 AIs, LLMs, and God Knows What 317（Programming by Prompt 319; Conclusion 328）**
- Part II: Design — Ch18 Simple Design（YAGNI; Covered by Tests; Maximize Expression; Minimize Duplication）；Ch19 The SOLID Principles（SRP/OCP/LSP/ISP/DIP）；Ch20 Component Principles；Ch21 Continuous Design（Sailing on the Four Cs of Continuous Design）；Ch22 Concurrency（**2025 Update and Report from the Field 437**）
- Part III: Architecture — Ch23 The Two Values of Software（Keeping Options Open）；Ch24 Independence（Leaving Options Open）；Ch25 Architectural Boundaries（Plug-in Architecture; Case Study: FitNesse）；Ch26 Clean Boundaries；Ch27 The Clean Architecture（The Dependency Rule）
- Part IV: Craftmanship（TOC 原文拼写如此；导言正文写作 "Craftsmanship"）— 前导 "A Great Number"／"Eight Decades"／**"The Oath" 492**；Ch28 Harm；Ch29 No Defect in Behavior or Structure；Ch30 Repeatable Proof；Ch31 Small Cycles；Ch32 Relentless Improvement（含 Mutation Testing; Semantic Stability）；Ch33 Maintain High Productivity；Ch34 Work as a Team；Ch35 Estimate Honestly and Fairly；Ch36 Respect for Fellow Programmers；Ch37 Never Stop Learning
- Afterword 557；**Appendix: The Clean Code Debate 561**（Introductions; Method Length; Comments; John's Rewrite of PrimeGenerator; A Tale of Two Programmers; Bob's Rewrite of PrimeGenerator2; Test-Driven Development; Closing Remarks）；Bibliography 615；Index 619

InformIT WebFetch 摘要称 "37 chapters plus appendix"（S01），与上表一致；本路未发现章节数冲突。

第一版结构（S06 TOC【一手原文】）：17 章 + 3 附录 + Epilogue。其中 Ch7 Error Handling、Ch8 Boundaries、Ch9 Unit Tests（The Three Laws of TDD; One Assert per Test; F.I.R.S.T.）、Ch11 Systems、Ch12 Emergence（Simple Design Rule 1: Runs All the Tests; Rules 2–4: No Duplication, Expressive, Minimal Classes and Methods）、Ch14 Successive Refinement、Ch15 JUnit Internals、Ch16 Refactoring SerialDate、Ch17 Smells and Heuristics、Appendix A Concurrency II。出版社文案："Clean Code is divided into three parts. The first describes the principles, patterns, and practices… The second part consists of several case studies… The third part is the payoff: a single chapter containing a list of heuristics and 'smells'…"（S06【出版社文案】）。

### 2.2 作者自述的「改版动机与改动范围」（S04 Introduction，【一手原文】【作者自述】）

- "Recently it occurred to me that there are quite a few more things I could say; and several more that I would say differently than I did in 2008."
- "The essence of that message has not changed; but after a decade and a half our industry has—and remarkably so. … I decided to significantly restate and expand the original message."
- "I have added chapters on design, architecture, and even ethics. These were missing from the first edition, and I felt it necessary to repair that omission. In some cases, these chapters are heavily edited and abridged excerpts from my more recent books, Clean Architecture and Clean Craftsmanship; others are entirely new."
- 关于自信程度："In the original edition, I was reluctant to assert my ideas as anything more than one programmer's way of looking at things. Now, many years later, I'm a bit more confident than that. The ideas in that original edition have withstood the test of time and have quite a bit more staying power."
- 关于收录反对意见："there are other very experienced programmers who have different ideas, and I thought it wise to include some of their contrary viewpoints. … I like my ideas best, but I think all creditable ideas should be heard and considered."
- 关于 "Future Bob"："in the process of reviewing the newer chapters months after they had been written, I was surprised to find that I had issues with some of the examples I had posed. Rather than erasing that surprise by further 'cleaning' the examples, I added some Future Bob comments so that you could see my own reaction."
- 目标："My goal for this book is to provide some standards of code cleanliness, some disciplines of code creation and maintenance, and the beginnings of an ethical framework to help us define a true profession."
- 旧章处理："I have taken a great deal of liberty with the older chapters for which I was the sole author. In many cases they have been completely rewritten, or very substantially edited. Most of the authors of the chapters that I did not write have submitted second editions of their chapters to this effort."
- 结构："Possibly the greatest change between the first and second editions is the structure of the material. I have divided the book into four parts: Code, Design, Architecture, and Craftsmanship." "Part III: Architecture is a set of deeply edited and abridged excerpts from my book Clean Architecture." "Part IV: Craftsmanship is, once again, a set of deeply edited and abridged excerpts from my book Clean Craftsmanship—specifically the chapters that have to do with the ethics of software development. It is included as a way to underscore that there is an ethical imperative to writing clean code."

出版社对同一改版的定性（S01【出版社文案】）："This new edition--a comprehensive rewrite of the original bestseller"；要点列表含 "Coverage of more languages, including Java, JavaScript, Go, Python, Clojure, C#, and C"、"Productive use of AI tools for coding"、"Soft skills and the ethics of programming"。作者 GitHub 有为第二版写的示例仓库：GoVideoStore（"Martin Fowler's lovely Video Store problem, in GoLang. For Clean Code 2d. ed."，创建 2024-08-16）https://github.com/unclebob/GoVideoStore 、BoboliaTaxes（Python，"Example from Clean Code 2d. ed."，创建 2024-08-15）https://github.com/unclebob/BoboliaTaxes 【一手原文】。

### 2.3 第 17 章 "AIs, LLMs, and God Knows What" 与 Postscript "Future Bob Playing with Grok3"

更正前提：**"Future Bob Playing with Grok3" 不是全书后记**，而是第 2 章末的 Postscript（p.37–40），其后还有 "Postscript Conclusion 40"（S01 TOC【一手原文】）。全书 Afterword 在 p.557；据 Micah Martin 所写的 Foreword："please allow me to introduce my brother, Justin, also a Clean Coder, who wrote the afterword"（S04【一手原文】）——即 Afterword 作者是 Justin Martin，不是 Robert Martin 本人。

能拿到的一手内容：
- 第 17 章正文不在任何出版社公开样章里；O'Reilly 目录页 403。**第 17 章具体论点 = 待验证。**
- 出版社托管样章里的书后索引给出与 AI 相关的页码分布（S04【一手原文】，属【TOC/索引推断】）：
  - "AI (artificial intelligence): editing help from, 40, 210, 287 / fear of job theft by, 319 / how to train, 286–287 / limits of, 69, 287, 328 / need for programmers and, 488 / productivity acceleration via, 560 / prompt-based programming, 319–328 / requirements specification for, 2–3"
  - "Grok3: code production by, 560 / editing help from, 37, 39, 40 / implementation improvement by, 47 / limits of, 69, 319–321, 328"
  - "LLMs (large language models), 322, 324, 328"；"errors: AI, 321–322"
  - "prompts, AI: code as basis for, 2–3 / debugging, 328 / formalized language for, 324, 328 / prompt-based programming, 319–328"；"testing: AI prompts, 327"；"testing: Grok3 test improvements, 39"
  - "cleaning code: AI support for, 37, 40"；"Copilot, 20, 24, 210"
  - 由页码可推断：第 1 章 "There Will Be Code"（p.2–3）在第二版里讨论了 AI 提示与需求规格；第 17 章（p.317–328）涉及对失业的担忧、Grok3 的局限、AI 错误、「提示的形式化语言」、用测试/调试对待提示；p.560（Afterword，Justin Martin）涉及 AI 带来的生产率加速。以上只是主题定位，不是论点。
- 第 3 章里两条 Future Bob 批注是目前唯一逐字可得的第二版 AI 相关正文（S04/S05【一手原文】【作者自述】）：
  - p.47："★FUTURE BOB: Having used Grok3 on the fromRoman module in the last chapter, I thought I'd do the same here. So I told Grok3 to improve my initial implementation. It was not particularly surprising that its solution was nearly identical to mine."
  - p.69："★FUTURE BOB: Grok3, good as it is, did not drive the design of the original code to the level of depth we just saw. Grok3 did not invert the dependencies, nor did it attempt to separate high-level policy from low-level detail. Large language models (LLMs)/AIs have their uses; but they are not human and are not adept at understanding higher architectural goals."
  - 另有脚注 "6. An archaic term that means nervous, uneasy, or creeped out. (According to Grok.)"（p.51）。
- Postscript 内容的第三方转述：Grok3 被要求改进一个 FromRoman 类，返回的代码能编译并通过他的全部测试（S121【搜索摘要】，待一手核验）。
- 第一版同一位置的原话（S07 p.2【一手原文】，用于对照第 1 章是否改写）："specifying requirements in such detail that a machine can execute them is programming. Such a specification is code." 以及关于「能理解模糊需求的机器」："This will never happen." 第二版 p.2–3 是否保留这句，**待验证**（索引显示该页已加入 AI/提示相关内容）。

### 2.4 原则逐条对照（最新表述 → 更早表述 → 变化判定）

| 原则 | 最新表述（出处、年份） | 更早表述 | 判定 | 来源性质 |
|---|---|---|---|---|
| 总体地位：规则还是准则 | 2e Ch3 开篇："Keep in mind that these are not strict laws. They are not rules that must be followed. They are, more or less, guidelines. Each should be applied in the context of the problem at hand, and every programmer should feel free to take whatever license is necessary to solve that problem."（S04/S05，2025） | 1e Ch1 "Schools of Thought"："We will present these opinions as absolutes, and we will not apologize for our stridence."；同时："Consider this book a description of the Object Mentor School of Clean Code… don't make the mistake of thinking that we are somehow 'right' in any absolute sense."（S07，2008） | 加限定（从「作为绝对呈现」到「准则、按语境取舍」）；但 2e 导言又说对原书观点 "a bit more confident"——两处自述方向不同，照实并列 | 【一手原文】【作者自述】 |
| 核心浓缩 | 2e Ch3："Everything Small, Well Named, Organized, and Ordered … Keep everything small. Choose names for those small elements that communicate to other programmers. Define and maintain a structure and organization that present the software in such a way that others can easily consume it."；"If you read this chapter and grasp all the principles within, then you'll be 90% of the way toward cleaning code." | 1e 无此章（1e 第 1 章为多位名家对 clean code 的定义） | 新增（新的一章式总纲） | 【一手原文】【作者自述】 |
| 函数长度 | 2e Ch3："Functions should be small. Most should be just a handful of lines. This allows them to have nice, descriptive names and promotes the separation of concerns. It ensures that each function does one, and only one, thing."；"If you see a snippet of lines that does something that can be reasonably named, then that snippet should be moved into a function named for what that snippet does." | 1e Ch3 "Functions" 小节标题 "Small!"、"Do One Thing"（S06 TOC）；1e 具体行数表述（常被引为 "smaller than that"、"hardly ever be 20 lines"）本路未抓到原文 → 待验证 | 保留（"Small!" 小节在 2e Ch7 仍在）；2e 另立 Ch10 "What Are Large Functions Anyway?" 与 Ch8 "This Is Too Much to Constantly Keep in Mind"，正文未见 | 【一手原文】（2e）；1e 行数表述待验证 |
| 过度拆分的代价 | 2e Ch3 "A Final Thought"："the new structure is not cost free. Those who complain that it is harder to read because of all the different modules and all the indirection are not without a point. Yes, adding structure adds complexity—and that complexity is not free. There's a cognitive price to pay." | 与 Ousterhout 的辩论（2024-09～2025-02，S86）：Martin 认可的总结包括 "We agree that it is possible to over-decompose, and that Clean Code 1st ed. doesn't provide much guidance on how to recognize over-decomposition." 以及 "We agree that the internal decomposition of PrimeGenerator into methods is problematic."；Martin："We both value decomposition, and we both avoid entanglement; but we disagree on the relative weighting of those two values." | 加限定（承认代价与 1e 缺少护栏）；该辩论全文收入 2e 附录（Martin 在 S86 结尾："I have integrated several of your better ideas, as well as this entire document, into the second edition of Clean Code."） | 【一手原文】【作者自述】 |
| 命名 | 2e Ch3："Remember that your own understanding of the code will likely bias your attempts at providing good names and structures; so work hard to put yourself in the headspace of those who do not understand the code."；p.58："When the problem is small, names can afford to be inconsistent or vague … But as the problem grows, names become much more important" | 1e Ch2 "Meaningful Names" 各小节（Use Intention-Revealing Names … Don't Add Gratuitous Context）（S06 TOC） | 保留并加语境条件（问题规模越大命名越重要） | 【一手原文】 |
| 注释 | 2e Ch5 小节 "Compensating for Failure"、"Good Comments"、"Bad Comments"（S01 TOC）；索引保留 "Comments Do Not Make Up for Bad Code 92"（S04）| 1e Ch4 "Comments Do Not Make Up for Bad Code; Explain Yourself in Code"（S06）；博客 2017-02-23 "Necessary Comments"："I have often suggested that every comment represents a failure to make the code self explanatory. … I recently came across that last resort. … This doesn't happen all the time. Indeed, I have found this kind of thing to be relatively rare."（S47）；S86 Martin 认可的总结："you believe that comments are a net negative, as generally practiced"，Martin："Over the years I have found the vast majority of comments, as generally practiced in the industry, to be unhelpful." | 基本没变（立场保留，承认少数必要场景；对公共 API 注释让步——S86 总结："You agree for public APIs, but see little need to comment interfaces that are internal to the team."） | 【一手原文】（2e 只到 TOC 层） |
| 格式 | 2e Ch6 保留 "Team Rules"、"Uncle Bob's Formatting Rules" | 1e Ch5 同名小节 | 未见变化（TOC 层） | 【TOC/索引推断】 |
| 错误处理 | 2e 无独立 "Error Handling" 章；"Prefer Exceptions to Returning Error Codes" 并入 Ch8 Function Heuristics；出版社称 "Comprehensive error handling and testing practices" | 1e Ch7 Error Handling（Use Unchecked Exceptions; Don't Return Null; Don't Pass Null…） | 收窄/并入（TOC 层；正文是否保留 1e 的 null 规则待验证） | 【TOC/索引推断】【出版社文案】 |
| TDD | 2e Ch14 "Testing Disciplines" 列三种纪律：TDD、TCR、Small Bundles；索引 "bundling test approach, 293, 604, 605, 607" 把 p.293 的 Small Bundles 与附录中 Ousterhout 的 "bundling" 讨论相连（S04） | 1e Ch9 "The Three Laws of TDD"（S06）；The Clean Coder Ch5 "The Jury Is In"（S08 TOC）；S86 Martin 认可的总结："You agree that bundling can produce outcomes just as good as TDD but think it may lead to somewhat less test coverage."，Martin："I prefer a disciplined approach to keep the code covered by tests written first in very short cycles." | 加限定（TDD 从唯一纪律变为三种并列纪律之一；作者个人偏好不变）。注意：TOC/索引层证据，Ch14 正文未读 | 【TOC/索引推断】+【一手原文】（S86） |
| 单元测试形态 | 2e Ch15 小节：Domain-Specific Testing Language; F.I.R.S.T.; Test Design | 1e Ch9 含 "One Assert per Test" | "One Assert per Test" 不再出现在 TOC（是否删除待验证） | 【TOC/索引推断】 |
| 验收测试 | 2e 新增 Ch16 Acceptance Testing | 1e 无对应章（The Clean Coder 2011 Ch7 已有） | 新增（并入 Clean Code） | 【TOC/索引推断】 |
| Simple Design | 2e Ch18：YAGNI; Covered by Tests; Maximize Expression; Minimize Duplication | 1e Ch12 Emergence：Runs All the Tests; No Duplication; Expressive; Minimal Classes and Methods；Clean Craftsmanship Ch6 另有第五条 "Minimize Size"（S14 TOC） | 变了（YAGNI 进入并列首位；1e 的 "Minimal Classes and Methods" 不在 2e 小节标题中） | 【TOC/索引推断】 |
| YAGNI 的含义 | 2e Ch3 p.56–57："Some folks might charge us with violating YAGNI. They think it stands for You Aren't Going to Need It. But the original intent of YAGNI was to ask yourself: 'What if you aren't going to need it?' It was a way of asking us to count the cost before we invested in making room in our code for things we might not need." | —（1e 未作为小节） | 新增的重新解释（把 YAGNI 表述为成本核算问题，而非禁令） | 【一手原文】【作者自述】 |
| SRP | 2e Ch3 p.48："This is an example of the Single Responsibility Principle (SRP) in action. The stakeholders of our system who are most concerned about taxation will most probably be the only ones asking for changes to the getTax function"（以利益相关方为变化来源） | 2014 博客："each software module should have one and only one reason to change"，并提出 "Another wording … Gather together the things that change for the same reasons. Separate those things that change for different reasons."、"remember that the reasons for change are people"（S51）；Clean Architecture 2017 的 "A module should be responsible to one, and only one, actor."（S120【搜索摘要】，待一手核验） | 表述收窄到「人/角色」为变化来源（2014 起），2e 延续 | 【一手原文】+搜索摘要 |
| DIP / 依赖方向 | 2e Ch3："This principle is violated when high-level policies directly depend on low-level details."；"Just say this to yourself, over and over: High-level policy should not depend on low-level details."；"the rule for architectural boundaries is that dependencies cross only toward the higher-level side."；并加条件："For small projects, you could be right to make that decision. But for larger projects, the recompile and redeployment burden can get pretty large." | 见 §4（2012 博客、2017 书、2020 博客） | 没变；2e 显式加了「小项目可以不做」的条件 | 【一手原文】【作者自述】 |
| 性能 | 2e Ch3："What about performance? Is the new structure slower than the old one? Probably so. … For most applications, that tiny decrease in performance would be of no concern at all."；Ch12 新增小节 "But What About Performance?"；Ch22 新增 "2025 Update and Report from the Field" | 2023 与 Muratori 的问答（S87）：Martin 承认 "the structures you were presenting are not the best way to squeeze every nanosecond of performance out of a system"；被问是否把性能意识当成理所当然时："Frankly, I think that's a fair criticism."、"After some self-reflection I think that's likely. I am not an expert in performance."；"If you are trying to squeeze every nanosecond from a battery of GPUs, then Clean Code may not be for you; at least in the most taxing of your deepest inner loops." | 加限定（承认性能代价与适用边界，2e 增加相应小节） | 【一手原文】【作者自述】 |
| Boy Scout Rule | 2e Ch1 仍有 "The Boy Scout Rule"（S01 TOC） | 1e："Leave the campground cleaner than you found it."（S07） | 保留（TOC 层） | 【TOC/索引推断】 |
| 读多于写 | 2e Ch1 小节 "We Read More Than We Write" | 1e "We Are Authors"："the ratio of time spent reading vs. writing is well over 10:1."（S07） | 保留（2e 改为独立小节标题；比例数字是否保留待验证） | 【TOC/索引推断】 |
| 伦理 / 誓言 | 2e Part IV：前导 "The Oath" p.492 + 十章，章名对应十条誓言（Harm … Never Stop Learning）；导言："there is an ethical imperative to writing clean code." | 1e 无伦理部分（导言："These were missing from the first edition, and I felt it necessary to repair that omission."） | 新增（来自 Clean Craftsmanship 摘编） | 【一手原文】（导言）+【TOC/索引推断】 |
| 并发 | 2e Ch22 Concurrency Defense Principles + "2025 Update and Report from the Field" | 1e Ch13 Concurrency + Appendix A Concurrency II | 更新（新增 2025 现场报告，内容未见） | 【TOC/索引推断】 |
| AI 编程 | 2e Ch17 + Ch2 Postscript + Ch3 Future Bob 批注（见 §2.3）；出版社："Productive use of AI tools for coding" | 1e：机器按模糊需求编程 "This will never happen."（S07） | 新增（立场细节待验证；可逐字确认的只有「LLM 不擅长高层架构目标」一句） | 【一手原文】+【TOC/索引推断】 |

---

## 3. The Clean Coder（2011）

- 版本：见 §1（S08）。
- 结构（S08 TOC【一手原文】）：Professionalism（Taking Responsibility; First, Do No Harm; Work Ethic）→ Saying No → Saying Yes（A Language of Commitment）→ Coding → TDD（The Jury Is In; The Three Laws of TDD; What TDD Is Not）→ Practicing → Acceptance Testing → Testing Strategies（QA Should Find Nothing; The Test Automation Pyramid）→ Time Management → Estimation（PERT）→ Pressure → Collaboration → Teams and Projects → Mentoring, Apprenticeship, and Craftsmanship；Appendix A Tooling。
- 作者自述（S09 前言，【一手原文】）："As an engineer, you have a depth of knowledge about your systems and projects that no managers can possibly have. With that knowledge comes the responsibility to act."
- 作者自述（S09 第 4 章，【一手原文】）："If you are tired or distracted, do not code."；"The moral of this story is: Don't write code when you are tired."；"Here's a little hint from someone whose been there and back: Avoid the Zone."（并说明 "There are times when the Zone is exactly where you…" ——即作者本人对「避免心流」加了例外）。
- 与后来表述的关系：
  - "First, Do No Harm"（2011）→ Programmer's Oath 第一条 "I will not produce harmful code."（2015，S60）→ Clean Craftsmanship Ch12 "Harm"（2021）→ Clean Code 2e Ch28 "Harm"（2025）：措辞连续，未见撤回。
  - "QA Should Find Nothing"（2011）→ Clean Agile Ch2 "QA Should Find Nothing"（2019，S13 TOC）→ Clean Craftsmanship Ch10 "QA Will Find Nothing"（2021，S14 TOC）：连续。
  - 结对：2011 书中把结对作为处理打断与「避免心流」的手段（S09）；2021 博客 "Pairing Guidelines"："A mature team might pair 50% of the time, or even less."、"Pair sometimes, don't pair other times."（S74）——**收窄**（从推荐做法到明确的非强制比例与时长建议 "20-40 minutes at a time"）。
- 出版社文案（S08）："Great software isn't written by machines. It is written by professionals with an unshakable commitment to craftsmanship."

---

## 4. Clean Architecture（2017）

### 4.1 依赖规则（Dependency Rule）的三次表述

| 年份 | 表述 | 来源 |
|---|---|---|
| 2012 | "This rule says that source code dependencies can only point inwards. Nothing in an inner circle can know anything at all about something in an outer circle."；"No, the circles are schematic. … However, The Dependency Rule always applies." | 博客 "The Clean Architecture"，2012-08-13：https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html（S40）【一手原文】 |
| 2017 | "Source code dependencies must point only inward, toward higher-level policies."（其余段落与 2012 博客基本同文；列举的同类架构为 Hexagonal、DCI、BCE——2012 博客另列的 Onion Architecture 与 Screaming Architecture 未出现在该样章列表中） | Clean Architecture 第 22 章在线样章（S11）【一手原文】 |
| 2025 | "the rule for architectural boundaries is that dependencies cross only toward the higher-level side."；2e Ch27 保留 "The Dependency Rule" 小节 | Clean Code 2e Ch3（S04）；TOC（S01）【一手原文】 |

判定：没变，2017 起补上「朝向更高层策略」的方向说明。书中 "The web is a detail. The database is a detail. We keep these things on the outside where they can do little harm."（S11）。

### 4.2 SOLID 的当前表述（作者最近一次完整逐条表述：2020-10-18 "Solid Relevance"，S76【一手原文】【作者自述】）

- 前提："The SOLID principles remain as relevant to day as they were in the 90s … Software is still if statements, while loops, and assignment statements — Sequence, Selection, and Iteration."
- SRP："Gather together the things that change for the same reasons. Separate things that change for different reasons."；"Microservices do not solve this problem."
- OCP："A Module should be open for extension but closed for modification."
- LSP："A program that uses an interface must not be confused by an implementation of that interface." **作者自我修正**："People (including me) have made the mistake that this is about inheritance. It is not. It is about sub-typing. All implementations of interfaces are subtypes of an interface. All duck-types are subtypes of an implied interface."
- ISP："Keep interfaces small so that users don't end up depending on things they don't need."；加条件："This issue is especially acute in statically typed languages … Dynamicaly typed languages are affected much less; but are still not immune."；并承认 "such separation is often not feasible, nor even desirable."
- DIP："Depend in the direction of abstraction. High level modules should not depend upon low level details."
- 结语："simplicity requires disciplines guided by principles. … The best way to make a complicated mess is to tell everyone to 'just be simple' and give them no further guidance."
- Clean Architecture（2017）中 SRP 的 "actor" 表述与 LSP 章节（"Guiding the Use of Inheritance"、"LSP and Architecture"）只在 TOC 层可见（S10）；"actor" 原句见 S120【搜索摘要】，待一手核验。
- 书的 TOC 还显示：ISP 章有 "ISP and Language"、DIP 章有 "Stable Abstractions"、"Factories"（S10）。
- 2025-10-26 cleancoder.com 列出一条 "SOLID Up Front" 的 Morning Bathrobe Rant（链接到 X，S32），内容属 X 路，本路未读。

### 4.3 组件原则（S10 TOC【一手原文】）

- 内聚：The Reuse/Release Equivalence Principle；The Common Closure Principle；The Common Reuse Principle；The Tension Diagram for Component Cohesion。
- 耦合：The Acyclic Dependencies Principle；Top-Down Design；The Stable Dependencies Principle；The Stable Abstractions Principle。
- 2e：Ch20 "Component Principles"（Component Cohesion 368；Component Coupling 373）仍在（S01）。判定：保留（TOC 层）。

### 4.4 「架构是推迟决策」

- 书：Ch15 "What Is Architecture?" 含 "Keeping Options Open"；Ch16 "Independence" 含 "Leaving Options Open"、"Decoupling Mode"、"Independent Deployability"（S10 TOC）；2e Ch23 "Keeping Options Open"、Ch24 "Leaving Options Open"（S01）——保留。
- 作者自述（2016-01-04 "A Little Architecture"，S62【一手原文】）："The important decisions that a Software Architect makes are the ones that allow you to NOT make the decisions about the database, and the webserver, and the frameworks."；"you want to be allowed to make them much later in the development cycle – when you have more information."；"The database is merely an IO device."
- 出版社文案（S10）："Clean Architecture doesn't merely present multiple choices and options, and say 'use your best judgment': it tells you what choices to make, and why those choices are critical to your success."

### 4.5 微服务 / 部署模型（作者自述）

- 2014-09-19 "Microservices and Jars"（S52）："For most systems the independent deployability of jar files (or DLLS, or Gems, or Shared Libraries) is more than adequate."；"Don't leap into microservices just because it sounds cool. Segregate the system into jars using a plugin architecture first. If that's not sufficient, then consider introducing service boundaries at strategic points."；代价："you lose … debuggability. You can't single step across a REST call"。https://blog.cleancoder.com/uncle-bob/2014/09/19/MicroServicesAndJars.html
- 2014-10-01 "Clean Micro-service Architecture"（S53）："Treat the deployment model as a detail, and leave the options open. Build your system so that you can deploy it into jars, or into micro-services, or anywhere in between."；"If you can only deploy your system with micro-services, then you have coupled your architecture to that particular deployment model; and that's just as bad." https://blog.cleancoder.com/uncle-bob/2014/10/01/CleanMicroserviceArchitecture.html
- 2015-05-28 "The First Micro-service Architecture"（S55）：以 1960 年 62 个阶段的编译器为例，"there's nothing new under the Sun." https://blog.cleancoder.com/uncle-bob/2015/05/28/TheFirstMicroserviceArchitecture.html
- Clean Architecture Ch18 "Boundary Anatomy" 含 "The Dreaded Monolith"、"Services"（S10 TOC）。
- 2025-05-12 cleancoder.com 列出 "Micro Services" rant（S32，X 路，未读）。
- 判定：2014 至今未见撤回；「部署模型是细节」一贯。

---

## 5. Clean Agile（2019）

- 版本：§1（S12）。前言与完整 TOC 取自 S13【一手原文】。
- 对敏捷的定义（作者自述，S13 前言）："Agile is a small idea about the small problem of small programming teams doing small things. Agile is not a big idea about the big problem of big programming teams doing big things."；"big things don't get done by big teams; big things get done by the collaboration of many small teams doing many small things."
- 对「异化」的判断（S13 前言）："the simple and small message of Agile has become muddled over the intervening years. It's been mixed with the concepts of Lean, Kanban, LeSS, SAFe, Modern, Skilled, and so many others. These other ideas are not bad, but they are not the original Agile message."；"What you will find is a restatement of Agile as it was told in 2000."
- 作者对本书性质的限定（S13 前言）："This book is not a work of research. I have not done a diligent literature review. What you are about to read are my personal recollections, observations, and opinions"；"you should not think of this book as a scholarly work. It may be better to think of it as a memoir"。
- 最小集 = XP 的 "Circle of Life"（TOC 层，S13）：Ch3 Business Practices（Planning, Small Releases, Acceptance Tests, Whole Team）；Ch4 Team Practices（Metaphor, Sustainable Pace, Collective Ownership, Continuous Integration, Standup Meetings）；Ch5 Technical Practices（TDD, Refactoring, Simple Design, Pair Programming）。出版社文案同步列出 "TDD, refactoring, simple design, and pair programming"（S12）。
- 第 2 章（S13/S24【一手原文】）："What drew me to Agile in the first place was the high commitment to discipline over ceremony."；"view each one of those practices as a promise, a commitment"。
- 认证/教练：Ch6 小节 "Coaching"、"Scrum Masters"、"Certification"、"Real Certification"、"Agile in the Large"（S13 TOC；正文未见）。
- 注意署名：样章版权页写明 "Chapter 7 by Sandro Mancuso, April 27, 2019. Used with permission."（S13）——常被引用的 "The Agile Hangover"（Ch7）不是 Martin 本人所写；Ch6 另有 "Coaching—An Alternative View" 一节，其后 "Conclusion (Bob Again)"，说明 Ch6 中段为他人撰写（撰写人本路未核实）。
- 博客延续（作者自述）：
  - 2014-03-28 "The True Corruption of Agile"（S50）："No. Agile is a culture expressed through a set of practices."；"Are the original 13 practices of XP the holy writ? … Of course not. But if you don't use those particular practices, you'd better use some that are as good or better." https://blog.cleancoder.com/uncle-bob/2014/03/28/The-Corruption-of-Agile.html
  - 2018-04-02 "In The Large"（S67）："Once you are doing something big, you have left the realm of Agile. Hopefully your development teams are using Agile disciplines; but the overall project is not Agile. Because Agile is about the small things." https://blog.cleancoder.com/uncle-bob/2018/04/02/InTheLarge.html
  - 2018-08-28 "The Tragedy of Craftsmanship"（S69）："The Agile movement got so involved with promoting conferences and with certifying Scrum Masters and Project Managers that they abandoned the programmers, and the values and disciplines of Craftsmanship."；"The tragedy was that the Agile movement became a business that left the original values and disciplines of Agile behind." https://blog.cleancoder.com/uncle-bob/2018/08/28/CraftsmanshipMovement.html
- 判定：2014→2019 立场一致（敏捷=小团队纪律+实践；大规模框架「不是敏捷」）；2019 书把它正式化。

---

## 6. Clean Craftsmanship（2021）

- 三层结构（S16 前言【一手原文】【作者自述】）："This book is written in three parts that describe three levels: disciplines, standards, and ethics. Disciplines are the lowest level. This part of the book is pragmatic, technical, and prescriptive. … Standards are the middle level. This section outlines the expectations that the world has of our profession. … Ethics are at the highest level. … It does so in the form of an oath, or a set of promises."
- 五项纪律（S14 TOC；出版社文案）：TDD、Refactoring、Simple Design、Collaborative Programming、Acceptance Tests（均来自 "Extreme Programming" 小节）。Ch4 含 "Transformation Priority Premise"；Ch6 Simple Design 含第五条 "Minimize Size"。
- 标准（S14 TOC）：Productivity（We Will Never Ship S**T; Inexpensive Adaptability; We Will Always Be Ready; Stable Productivity）、Quality（QA Will Find Nothing; Test Automation…）、Courage（Honest Estimates; You Must Say NO; Continuous Aggressive Learning; Mentoring）。Part II 前导 "Your New CTO"——对应 2012 博客 "The New CTO"（https://blog.cleancoder.com/uncle-bob/2012/09/06/I-am-Your-New-CTO.html，未读正文）。
- 作者对「唯一正道」的限定（S16 前言）："you may get the feeling that this is the One True Path to Craftsmanship. It may be that for me, but not necessarily for you. I am offering this book to you as an example of my path."；同时："The days of 'Judges' are over. It is no longer sufficient that every programmer does what is right in their own eyes. Some disciplines, standards, and ethics will come. The decision before us today is whether we programmers will define them for ourselves or have them forced upon us by those who don't know us."
- 社会论据（S16）：引 737 Max（"Would 346 people have died in the two 737 Max crashes?"）、Knight Capital、Toyota、VW、2020 Iowa Caucus；"it is the fragile foundation of public trust that is at risk. … And then the regulations will follow"。
- Programmer's Oath 的演变：
  - 2015-11-18 博客版（S60【一手原文】）九条："I will not produce harmful code. / The code that I produce will always be my best work. I will not knowingly allow code that is defective either in behavior or structure to accumulate. / I will produce, with each release, a quick, sure, and repeatable proof that every element of the code works as it should. / I will make frequent, small, releases so that I do not impede the progress of others. / I will fearlessly and relentlessly improve my creations at every opportunity. I will never degrade them. / I will do all that I can to keep the productivity of myself, and others, as high as possible. … / I will continuously ensure that others can cover for me, and that I can cover for them. / I will produce estimates that are honest both in magnitude and precision. I will not make promises without certainty. / I will never stop learning and improving my craft." https://blog.cleancoder.com/uncle-bob/2015/11/18/TheProgrammersOath.html
  - 2021 书（S14）：出版社文案 "ten specific commitments every software professional should make"；TOC 在 Part III 下列出十个小节：First, Do No Harm; Best Work; Repeatable Proof; Small Cycles; Relentless Improvement; Maintain High Productivity; Work as a Team; Estimate Honestly and Fairly; **Respect**; Never Stop Learning。
  - 2025 Clean Code 2e Part IV（S01）：十章，"Best Work" 改名为 "No Defect in Behavior or Structure"，"Respect" 为 "Respect for Fellow Programmers"。
  - 判定：从 9 条增加到 10 条（新增「尊重同行」），第二条的标题在 2e 改为「行为与结构无缺陷」。第十条誓言原文本路未取到，待验证。
  - 立誓理由（2015-11-27 "Prelude to a Profession"，S61）："A few year ago I would have been strongly against it as well. An oath implies a surrender of freedom."；"there are certain promises we need to make to society at large." https://blog.cleancoder.com/uncle-bob/2015/11/27/OathDiscussion.html
- 「Craftsman」一词的前后说法（作者自己改口的例子）：
  - 2018-05-02 博客（S66）：接受 Liz Keogh 意见后定下规则——"In the singular gender neutral case I will use 'Craftsman or -woman', or possibly 'Craftsperson'"；同时 "the term 'Craftsman' is in such common usage that I feel I must continue using it." https://blog.cleancoder.com/uncle-bob/2018/05/02/Craftsman-Craftswoman-Craftsperson.html
  - 2021 书前言（S16）："Alternatives to craftsman were considered, including craftsperson, craftsfolk, and crafter, among others. But none of those terms carries the historical gravitas of craftsman."——在书面中性场合回到单用 "craftsman"。

---

## 7. Functional Design（2023）

- 版本：§1（S18、S19）。样章 PDF 链接（S18 页上的 /content/images/9780138176396/samplepages/9780138176396_Sample.pdf）返回 "Not found"；在线样章为第 3 章 "Recursion and Iteration"（https://www.informit.com/articles/article.aspx?p=3188182，站内日期 Dec 23, 2023，未含 SOLID/模式章）。示例代码：https://github.com/unclebob/FunctionalDesign（README："These are the code examples for the book Functional Design."）。
- 结构（S18 TOC【一手原文】）：Part I Functional Basics（Immutability; Persistent Data; Recursion and Iteration; Laziness; Statefulness—"When We MUST Mutate", STM）→ Part II Comparative Analysis（Java vs Clojure：Prime Factors, Bowling Game, Gossiping Bus Drivers; Ch9 OOP; Ch10 Types）→ Part III Functional Design（Ch11 Data Flow; **Ch12 SOLID**：SRP/OCP/LSP/ISP/DIP 各一节）→ Part IV Functional Pragmatics（Tests: "But What about the REPL?", "What about Mocks?", Property-Based Testing; GUI; Concurrency）→ **Part V Design Patterns（Ch16 Design Patterns Review：Abstract Server, Adapter, Command, Composite, Decorator, Visitor, Abstract Factory；"Postscript: OO Poison?"）** → Part VI Case Study（Wa-Tor）。
- 结论（只能取到出版社文案，S18【出版社文案】）："Martin examines well-known SOLID principles and Gang of Four Design Patterns from a functional perspective, revealing why patterns remain extremely valuable to functional programmers, and how to use them to achieve superior results."；"Use classic SOLID principles to write better Clojure code"。书内原文结论 → 待验证。
- 作者博客中与该书结论一致的自述（【一手原文】）：
  - 2018-04-13 "FP vs. OO"（S68）："OO and FP are orthogonal, they are not mutually exclusive. That a good functional program can (and should) be object oriented."；"There is no FP vs OO."；"Excluding one in favor of the other can only weaken the structure of a system." https://blog.cleancoder.com/uncle-bob/2018/04/13/FPvsOO.html
  - 2023-01-18 "Functional Classes"（S84）：推文原句 "Should you subdivide a functional program into classes the way you would an object oriented program? Yes. You should. Because the rules don't change just because you've chosen to use immutable data structures."；自我检讨："I had not been paying enough attention to class structure when writing complex Clojure programs. Instead, I had been allowing functions to accumulate in modules in a, more or less, ad hoc fashion … But that was lazy." https://blog.cleancoder.com/uncle-bob/2023/01/18/functional-classes.html
  - 2023-01-19 "Functional Classes in Clojure"（S85）："A class is an intentionally named abstraction that consists of a set of narrowly cohesive functions that operate over an internally defined data structure. We do not need the class keyword. Nor do we need polymorphic dispatch. Nor do we need inheritance." https://blog.cleancoder.com/uncle-bob/2023/01/19/functional-classes-clojure.html
  - 2021-10-28 "Functional Duplications"（S81，FP 的代价）："if you are writing functional programs, you will face this issue, and you'll likely face it a lot. Dealing with immutable lists of objects means that when you update such a list you must recreate it." https://blog.cleancoder.com/uncle-bob/2021/10/28/functional-duplication.html
  - 2019-06-16 "Classes vs. Data Structures"（S75）："Classes make it easy to add types but hard to add functions. Data structures make it easy to add functions but hard to add types."；"Data Structures expose callers to recompilation and redeployment. Classes isolate callers from recompilation and redeployment." https://blog.cleancoder.com/uncle-bob/2019/06/16/ObjectsAndDataStructures.html
- 判定：原则在函数式下「成立且照用」是出版社文案与作者博客的一致说法；书内具体论证未取到。

---

## 8. We, Programmers（2024）

- 版本：§1（S20、S21）。样章（S22）含 ThePrimeagen 写的 Foreword、作者 Preface、Timeline、About This Book、第 6 章 Dijkstra、索引。
- 结构（S20 TOC【一手原文】）：Part I Who Are We?；Part II The Giants（Babbage/Lovelace, Hilbert/Turing/von Neumann, Hopper, Backus, Dijkstra, Nygaard & Dahl, Kemeny, Judith Allen, Thompson/Ritchie/Kernighan）；Part III The Knee of the Curve（作者自传 1960s–2023，末节 "2023: The Plateau"）；Part IV The Future：Ch16 Languages（Types; Lisp）、**Ch17 AI（The Human Brain; Neural Nets; Building Neural Nets Is Not Programming; Large Language Models; The DISRUPTION of Large X Models）**、Ch18 Hardware、Ch19 The World Wide Web、**Ch20 Programming（The Aviation Analogy; Principles; Methods; Disciplines; Ethics）**。
- 作者自述（S22 Preface【一手原文】）："The social networks blossomed and then decayed while AI reared up to threaten everything."
- 索引（S22【TOC/索引推断】）："AI: … programmer obsoletion and, 4 / large language models, 37, 340, 343–351 / large x models, 351–353"；"programmers: AI and job security of, 352 / crucial role of, 3, 4, 6–9, 352–353 / detail managers as, 6, 9, 353 / future outlook for, 367–370 / neural nets vs. programming, 342"；"programs: AI-written, 345–349"；"Java: AI programs with, 345–349"。可推断：书中有一段让 AI 写 Java 程序的实例（p.345–349），并以「程序员是细节管理者」讨论 AI 下的职业前景（p.6、9、353）。具体结论待验证。
- 出版社文案（S20）："With the rise of AI, Martin also explores how this technology is transforming the future of programming and the ethical challenges that come with it."；"Insights and predictions regarding the ethical considerations surrounding AI and the future of programming"。
- 早期对 AI 的作者自述（对照用）：2017-07-28 "The Brain Problem"（S64）："No, we will not be achieving artificial sentience any time soon." https://blog.cleancoder.com/uncle-bob/2017/07/28/TheBrainProblem.html ；2017-07-24 "Drive me to Toronto, Hal."（S63）以 Watson 的 "Toronto" 错误质疑无人驾驶的可解释性。https://blog.cleancoder.com/uncle-bob/2017/07/24/DriveMeToTorontoHal.html
- 与书名同名的 2018 博客 "We Programmers"（S65）结尾采纳 Grady Booch 的话作为座右铭："Every line of code represents an ethical and moral decision." https://blog.cleancoder.com/uncle-bob/2018/03/29/WeProgrammers.html

---

## 9. blog.cleancoder.com：与「原则更新」相关的博文

总体状态：首页索引与 Atom feed 最新条目均为 2023-01-19 "Functional Classes in Clojure"（S30、S31【一手原文】）；博客源码仓库 unclebob/unclebob.github.io 最后推送 2023-01-19（S33 API【一手原文】）。与「2023-01 后停更」一致。cleancoder.com 首页已把作者标注为 "Programmer, Speaker, Teacher, Retired (mostly)"（S32）。

以下均为【一手原文】【作者自述】；URL 前缀 https://blog.cleancoder.com/uncle-bob/ 。

### 9.1 TDD / 测试

| 日期 | 标题 | URL | 要点 |
|---|---|---|---|
| 2014-12-17 | The Cycles of TDD | 2014/12/17/TheCyclesOfTDD.html | 三层循环：三定律（秒级 nano-cycle）、Red-Green-Refactor（分钟级）、按小时检查架构边界的 primary cycle。 |
| 2016-03-19 | Giving Up on TDD | 2016/03/19/GivingUpOnTDD.html | 回应 Sommerville：脆弱测试是测试与生产代码耦合的设计问题；"TDD never promised to solve that problem."（未预料到的输入） |
| 2016-06-10 | Mutation Testing | 2016/06/10/MutationTesting.html | 松动 test-first 的必要性："if I saw a team using mutation testing to guarantee the semantic stability of a test-after suite; I would smile, and nod, and consider them to be highly professional." |
| 2016-11-10 | TDD Doesn't Work | 2016/11/10/TDD-Doesnt-work.html | 解读一项 TDD vs 测试后写的研究："The benefit of writing the tests first is disciplinary. Writing the test first keeps your cycles short"；并承认在保持短周期前提下三小时实验看不出差异。 |
| 2017-03-03 | TDD Harms Architecture | 2017/03/03/TDD-Harms-Architecture.html | "architecture does not emerge from TDD"（引与 Coplien 的访谈）；"it is not TDD that creates bad designs. It is not TDD that creates good designs. It's you."；测试越来越具体、生产代码越来越通用。 |
| 2017-03-07 | Symmetry Breaking | 2017/03/07/SymmetryBreaking.html | 类比复式记账："there is a well defined discipline of test-first … but there is no such discipline for test-after." |
| 2017-05-05 | First-Class Tests. | 2017/05/05/TestDefinitions.html | 给出单元/系统测试定义；自称不用 mocking 工具、手写 test double；"Keep your tests clean. Treat them as first-class citizens of the system." |
| 2017-10-03 | Test Contra-variance | 2017/10/03/TestContravariance.html | "The structure of the tests must not reflect the structure of the production code"；测试更具体、代码更通用。 |
| 2017-10-04 | Tools are not the Answer | 2017/10/04/CodeIsNotTheAnswer.html | 回应 The Atlantic：TLA+、MDE、Light Table 等 "Tools are fine; but the solution to the software apocalypse is not more tools. The solution is better programming discipline."；"You don't test things in the REPL; you try things in the REPL." |
| 2020-05-27 | REPL Driven Design | 2020/05/27/ReplDrivenDesign.html | 亲身试用 REPL 驱动后回到 TDD："REPL driven development feels easier and faster than TDD; but it is not."（因缺少 TDD 会逼出的解耦而引入 4 天后才发现的 bug） |
| 2021-01-17 | Pairing Guidelines | 2021/01/17/Pairing.html | 结对非强制："A mature team might pair 50% of the time, or even less."；每次 20–40 分钟。 |

### 9.2 类型

| 日期 | 标题 | URL | 要点 |
|---|---|---|---|
| 2016-05-01 | Type Wars | 2016/05/01/TypeWars.html | 预测："You don't need static type checking if you have 100% unit test coverage. … I predict … dynamic languages will become the preferred languages." |
| 2017-01-11 | The Dark Path | 2017/01/11/TheDarkPath.html | 批 Swift/Kotlin 过强的静态类型："these languages … presume that the programmer has perfect knowledge of the system"；"you'd better get used to writing lots and lots of tests" |
| 2017-01-13 | Types and Tests | 2017/01/13/TypesAndTests.html | 澄清："that blog was not an indictment of static typing"；"types are not tests"；"type systems do not decrease the testing load. Not even the tiniest bit. But they can prevent some errors that unit tests might not see." |
| 2019-06-08 | Types and Tests | 2019/06/08/TestsAndTypes.html | 与 Mark Seemann 辩论；"Whether you use static, or dynamic typing, you must still demonstrate correctness by executing tests."；对比 TDD 与类型+性质测试："Which is better? … above my pay grade." |
| 2021-06-25 | On Types | 2021/06/25/OnTypes.html | "static typing is not for me. I prefer the flexibility of dynamic typing, and the ability to enforce types if, and when, I need such enforcement."（clojure/spec，"an almost perfect way to engage in Design by Contract"） |
| 2021-06-29 | More On Types | 2021/06/29/MoreOnTypes.html | 后置条件+穷尽测试；"What clojure/spec has taught me is that the two [TDD 与 DBC] play very well together, and both should be in every programmer's toolkit." |

判定：2016 的「100% 覆盖可替代静态类型、动态语言会胜出」预测，在 2017 被限定为「不反对静态类型，只反对过度」；2021 转为「个人偏好动态类型 + 按需契约（DBC）」，并把 DBC 纳入工具箱（新增）。「类型不减少测试量」一以贯之。

### 9.3 函数式 / OO

| 日期 | 标题 | URL | 要点 |
|---|---|---|---|
| 2017-07-11 | Pragmatic Functional Programming | 2017/07/11/PragmaticFunctionalProgramming.html | "Functional programming is important. You should learn it. … I suggest Clojure." |
| 2018-04-13 | FP vs. OO | 2018/04/13/FPvsOO.html | "There is no FP vs OO." |
| 2019-06-16 | Classes vs. Data Structures | 2019/06/16/ObjectsAndDataStructures.html | 类与数据结构三重对立。 |
| 2019-08-22 | Why Clojure? | 2019/08/22/WhyClojure.html | "Lisp is functional. And the future is looking very functional to me." |
| 2021-03-06 | if-else-switch | 2021/03/06/ifElseSwitch.html | 用工厂+多态让 if/else 链只出现一次；跨组件边界的判别值用整数/字符串："It may not be type safe. Indeed, it cannot be type safe. But it will allow you to preserve the component structure of your architecture." |
| 2021-10-28 | Functional Duplications | 2021/10/28/functional-duplication.html | 不可变数据的更新陷阱（见 §7）。 |
| 2023-01-18 | Functional Classes | 2023/01/18/functional-classes.html | 函数式程序也应按类划分；自我检讨 Clojure 中函数随意堆积。 |
| 2023-01-19 | Functional Classes in Clojure | 2023/01/19/functional-classes-clojure.html | 「类」无需关键字、多态、继承。 |

### 9.4 SOLID / Clean Architecture 补充

| 日期 | 标题 | URL | 要点 |
|---|---|---|---|
| 2011-09-30 | Screaming Architecture | 2011/09/30/Screaming-Architecture.html | （锚点，范围外早期文）Clean Architecture Ch21 同名。 |
| 2012-08-13 | The Clean Architecture | 2012/08/13/the-clean-architecture.html | 依赖规则首次成文（§4.1）。 |
| 2014-05-08 | The Single Responsibility Principle | 2014/05/08/SingleReponsibilityPrinciple.html | 从 Parnas 出发；"remember that the reasons for change are people." |
| 2014-05-12 | The Open Closed Principle | 2014/05/12/TheOpenClosedPrinciple.html | 以插件架构论证 OCP："a strong plugin architecture is likely to be the most important aspect of future software systems." |
| 2014-09-19 / 2014-10-01 / 2015-05-28 | 微服务三篇 | 见 §4.5 | 部署模型是细节。 |
| 2016-01-04 | A Little Architecture | 2016/01/04/ALittleArchitecture.html | 架构=让你能推迟数据库/框架决策。 |
| 2017-12-09 | Dbtails | 2017/12/09/Dbtails.html | 从卡片、磁带、磁盘到 SSD 的存取抽象史，问 SSD 会改变什么。 |
| 2020-10-18 | Solid Relevance | 2020/10/18/Solid-Relevance.html | SOLID 辩护 + LSP 自我修正（§4.2）。 |

### 9.5 敏捷 / 手艺 / 伦理 / 公开信

| 日期 | 标题 | URL | 要点 |
|---|---|---|---|
| 2014-03-28 | The True Corruption of Agile | 2014/03/28/The-Corruption-of-Agile.html | "Agile is a culture expressed through a set of practices." |
| 2015-11-18 | The Programmer's Oath | 2015/11/18/TheProgrammersOath.html | 九条誓言（§6）。 |
| 2015-11-27 | Prelude to a Profession | 2015/11/27/OathDiscussion.html | 立誓理由：社会依赖与信任危机。 |
| 2017-11-18 | Living on the Plateau | 2017/11/18/OnThePlateau.html | 语言演化趋缓；"I, for one, look forward to … the era of professional, and ethical craftsmanship." |
| 2018-03-29 | We Programmers | 2018/03/29/WeProgrammers.html | "Every line of code represents an ethical and moral decision."（引 Booch） |
| 2018-04-02 | In The Large | 2018/04/02/InTheLarge.html | 大规模框架不是敏捷。 |
| 2018-05-02 | Craftsman, Craftswoman, Craftsperson | 2018/05/02/Craftsman-Craftswoman-Craftsperson.html | 用词规则（后在 2021 书中改回，§6）。 |
| 2018-08-13 | Too Clean? | 2018/08/13/TooClean.html | **自我限定**：接受 Sarah Mei 的 "livable code"："there are also little places where I break the rules specifically because those breakages create affordances for transient issues."；"We should not be ashamed if our code looks a little bit lived in." |
| 2018-08-28 | The Tragedy of Craftsmanship. | 2018/08/28/CraftsmanshipMovement.html | 敏捷运动商业化、抛弃程序员。 |
| 2019-05-18 | 737 Max 8 | 2019/05/18/737-Max-8.html | "We, programmers, are killing people."；"We need to have the courage to say 'No' when we assess that the risk of deploying our code is too high." |
| 2019-11-08 | Open Letter to the Linux Foundation | 2019/11/08/OpenLetterLinuxFoundation.html | 就 Charles Max Wood 事件质询 LF 行为准则的公开处理程序，要求保密处理、公布裁决流程与道歉。 |

---

## 10. cleancoder.com 自营渠道（2025–2026）

- cleancoder.com 首页侧栏 "Morning Bathrobe Rants" 列出 26 条日期标题，全部链接到 x.com/unclebobmartin（S32【一手原文】，仅列表层；内容属 X 路，本路未读）。与本研究相关的条目：
  - 2026-09-30 Software Products；2026-09-15 WE'RE ALL DOOMED… again.；2026-09-14 No bathrobe. No rant. The AI threat.；**2026-09-12 Rethinking Harnesses**；2026-09-01 AI slop；2026-07-26 20X；2026-05-06 Disengage from the Syntax；**2026-04-20 AI Out-Codes You; Deal with It**；2025-12-13 Truly Bizarre Failure Modes；**2025-10-26 SOLID Up Front**；2025-07-21 Casey Muratori's Talk at the Better Software Conference；2025-06-05 Agile；2025-06-03 Testing Discipline；2025-05-16 Vibe Coding；2025-05-15 Bad Code；2025-05-14 Code Reviews；2025-05-12 Micro Services；2025-05-10 Design Patterns Will Destroy You as a Programmer；2025-05-09 Write Your Damned Tests；2025-05-08 Types；2025-05-05 Scrum；2025-05-02 OOP；2025-05-01 ORMs；2025-04-30 SQL。
  - 例：Rethinking Harnesses → https://x.com/unclebobmartin/status/2098744156709441896 ；SOLID Up Front → https://x.com/unclebobmartin/status/1982432101665484900 ；AI Out-Codes You → https://x.com/unclebobmartin/status/2046206145597972849 。
- cleancoder.com 站点源码 unclebob/ubc-website 最后推送 2026-09-30（S33），首页含 Space War、Missile Command、Othello 游戏页。

---

## 11. github.com/unclebob：2025–2026 与 AI agent / harness / 约束工具相关的仓库

（S33 GitHub API，2026-09-30 抓取；「最近提交」为默认分支最新 commit 的 committer 日期。全部【一手原文】。）

| 仓库 | 描述（原文） | 创建 | 最近提交 | 与本题关系 |
|---|---|---|---|---|
| swarm-forge https://github.com/unclebob/swarm-forge | "A simple tool for coordinating several AI agents." | 2026-04-17 | 2026-09-04（"Explain configuration and instruction layers"） | 多 agent harness：README："SwarmForge coordinates AI agents in isolated git worktrees and tmux sessions. Agents exchange committed work through durable handoffs, while the operator uses a local dashboard to start work, inspect agents, handle approval gates, answer clarifications, and stop the swarm."；后端 "codex, grok, claude, or copilot"；3942 stars。 |
| crap4clj https://github.com/unclebob/crap4clj | "A skill implementing the CRAP formula for clojure with speclj." | 2026-02-24 | 2026-09-17 | CRAP=圈复杂度×覆盖率的约束工具，输出 .metrics/crap.edn。 |
| clj-mutate https://github.com/unclebob/clj-mutate | "A mutation tester for clojure, specific to speclj" | 2026-02-24 | 2026-09-19 | 变异测试约束。 |
| dry4clj / dry4go / dry4java | 重复代码检测（dry4clj、dry4go、dry4java） | 2026-05 | 2026-06-20 / 2026-05-11 / —— | SwarmForge 宪法指定的 DRY 工具。 |
| mutate4go / crap4go / mutate4java / crap4java | Go/Java 版变异与 CRAP 工具 | 2026-03～05 | 2026-05-23 / 2026-05-21 / — | 同上。 |
| speclj-structure-check https://github.com/unclebob/speclj-structure-check | "A Claude skill for clojure and speclj that keeps the parentheses and the spec structure sane." | 2026-02-24 | 2026-06-03 | 面向 Claude 的结构校验。 |
| scrap https://github.com/unclebob/scrap | "Tool for assessing whether, where, and how speclj specs should be refactored." | 2026-03-15 | 2026-03-17 | README："Its overall goal is to guide an AI assistant in whether, where, and how to refactor a poorly structured spec file. The output is a set of recommendations, not directives." |
| Acceptance-Pipeline-Specification https://github.com/unclebob/Acceptance-Pipeline-Specification | "Portable acceptance pipeline specification" | 2026-05-13 | 2026-06-12 | README："a portable acceptance-test pipeline that agents can install in a project"；Gherkin→JSON IR→生成测试；"acceptance mutation" 检查样例值是否真连到被测应用。 |
| AIR-J https://github.com/unclebob/AIR-J | "A simple language for AIs to use and humans to ignore." | 2026-03-14 | 2026-03-16 | README："an AI-first, JVM-targeting programming language … meant to be written, transformed, checked, and lowered by software agents, not optimized for direct human authorship."；"Principle: one meaning, one representation"；显式类型、效应、变更。 |
| dependency-checker https://github.com/unclebob/dependency-checker | "A namespace dependency checker for clojure apps." | 2026-03-07 | 2026-06-17 | 依赖方向检查。 |
| arch-view / uml-viewer / crapper | 结构可视化；crapper："CRAP scores for Clojure, Java, Go, TypeScript, Rust, and Python, in the snapshot uml-viewer reads." | 2026-03 / 2026-09-13 / 2026-09-30 | 2026-03-20 / 2026-09-30 / 2026-09-30 | 度量可视化。 |
| deintroverter4clj | （无描述） | 2026-06-19 | 2026-06-22 | README 未读全文。 |
| negative-test-experiment https://github.com/unclebob/negative-test-experiment | "Eight independent Hunt the Wumpus runs: testing discipline × CRAP, then mutation." | 2026-08-17 | 2026-08-17（提交人 "Robert C. Martin"） | 见下。 |
| experiment-htw-clj-swarm / experiment-htw-go-swarm | "Hunt the Wumpus in Clojure built with SwarmForge" | 2026-06-02 | 2026-06-02 | swarm 实验。 |
| Pharaoh / Pharaoh-js | "My old Mac game from the '80s. Rewritten in Clojure by Claude." / "generated from gherkin by Claude in Javascript." | 2026-02-20/21 | 2026-02-21/22 | AI 代写实例。 |
| bookwriter | "A small writing application for one long book"（TypeScript） | 2026-09-28 | 2026-09-30 | 与 AI 关系未知。 |

关键一手内容：

1. SwarmForge 的「宪法」把整洁之道的做法写成 agent 约束（https://github.com/unclebob/swarm-forge/blob/main/swarmforge/constitution/articles/engineering.prompt，【一手原文】）：
   - 启动即安装 CRAP、变异、DRY 工具，"Do not rely on stale cached, vendored, or preinstalled copies"。
   - "Work in small, reviewable increments."；"Prefer the simplest design that supports the current behavior and leaves clear options for the next step."
   - "Separate testable modules from environmentally unsuitable modules … Maximize testable code and minimize the unsuitable boundary."
   - "IO-near modules must not reimplement a domain question. If a high-level module already answers it, call that module and translate the result. Walking the same facts again is a defect even when the dependency arrow already points inward."
   - Guardrails："Do not invent project-local CRAP, DRY, mutation, or coverage proxies."；"Do not edit mutation testing or Gherkin acceptance mutation manifests by hand"。
   - six-pack 角色（https://github.com/unclebob/swarm-forge/tree/six-pack/swarmforge/roles）：specifier → coder → cleaner → architect → hardender → QA；coder 用 TDD（"First write focused unit tests that express the requested observable behavior and would fail for a plausible wrong implementation. Then write only enough production code to pass those tests."）且 "Do not run language mutation, CRAP, or DRY checks"；architect 执行依赖规则（"Manage dependencies so they point from low-level modules toward high-level modules."）并 "Add lightweight automated architecture checks when practical"；README："Do not pin prompt prose with automated tests. Test observable runtime behavior instead."
   - workflow.prompt 规定提交信息附 "By <role>." 角色署名。
2. 作者对约束阈值的自我修订（git 历史，【一手原文】）：six-pack 的 cleaner.prompt 在 2026-09-02 由 Robert C. Martin 提交 "Raise CRAP to 10 and skip Gherkin mutation when there are no features."，diff 把 "reduce CRAP to 6 or below" 改为 "reduce CRAP to 10 or below. A single `cond` or `case` that answers one question may stay above 10; do not split it into helpers that take booleans the caller already knew. Nested or mixed-duty functions over 10 must split, and an extract must own its inputs."；同日另一提交把「变异点超过 100 就拆文件」改为 "Split a source file when it has more than one job … Do not split a one-job module to chase a mutation-site count."（https://github.com/unclebob/swarm-forge/commit/27f596adbe22938d4b716cf81721314dc226d91a）。判定：约束**放宽并改为以「职责」而非「度量值」为拆分依据**。
3. 早于上述修订两周的实验结论（negative-test-experiment/experiment-abstract.txt 与 experiment-conclusion.md，提交人 Robert C. Martin，2026-08-17，【一手原文】；文档是否由其 agent 起草未知）："We wrote Hunt the Wumpus eight times from empty: four testing disciplines, with and without forcing CRAP below 4. … CRAP then split functions and added tests until every score was under 4. It raised coverage … and made every program harder to read. It did not improve design."；Bottom line："Changing CRAP changed function size and, when there were no tests, forced a suite; it raised coverage and lowered cleanliness and never raised design."；"Acceptance is cheap to satisfy and silent on suite quality."；"Coverage is a weak distinguisher among the three testing disciplines." 四种纪律为 Three laws、Test-last、Bundling、None（Bundling 即与 Ousterhout 辩论中的方案）。

---

## 12. 作者本人承认的限定、代价与后来修改（汇总）

1. 结构化拆分有认知成本（2e Ch3 "A Final Thought"，S04）。
2. 1e 缺少识别过度拆分的指导；PrimeGenerator 的方法拆分有问题（S86，2025）。
3. 性能：承认 Clean Code 的结构在纳秒级不高效、自己在教学中低估性能（"Frankly, I think that's a fair criticism."，S87，2023）；2e 增加性能小节（S01）。
4. DIP 的收益随项目规模：小项目可以不做（2e Ch3，S04）。
5. LSP 原先被他自己讲成继承问题，2020 改为子类型问题（S76）。
6. 注释：承认存在罕见但必要的注释（S47，2017）；对公共 API 注释让步（S86）。
7. 「太干净」：接受「可居住的代码」，承认自己有意破例（S70，2018）。
8. TDD：承认架构不从 TDD 中涌现（S57，2017）；承认变异测试保证的测试后套件是专业的（S46，2016）；承认 bundling 可达同等结果（S86）；2e 把 TDD 与 TCR、Small Bundles 并列（S01 TOC）。
9. 类型：2016 预测动态语言胜出，2017 收回为「只反对过度」，2021 纳入 DBC（S44、S56、S58、S79、S80）。
10. 规则地位：从 1e「作为绝对呈现」到 2e「准则，可按语境取舍」（S07、S04）。
11. AI：2e 可逐字确认的判断是 LLM "are not adept at understanding higher architectural goals"（S04）；2026 年自建工具实验承认强制 CRAP 阈值降低可读性、不改善设计，随后放宽 harness 阈值（§11）。
12. 结对：从推荐做法到「成熟团队 50% 或更少」（S74）。
13. 用词：2018 采用中性用词规则，2021 书中回到 "craftsman"（S66、S16）。

---

## 未决与冲突

1. **Clean Code 2e 出版日期三种说法**：InformIT 纸书页 "Published Oct 8, 2025"（S01）；InformIT 电子书页 "Published Sep 30, 2025"（S02）；Pearson.com "30 September 2025" 且标 "© 2026"（S03）；书内版权页 "Copyright © 2026"（S04）。任务给出的 2025-10-08 与纸书页一致。MIT Press Bookstore 的搜索摘要给 September 30, 2025（S122【搜索摘要】）。
2. **Clean Code 2e 的 ISBN 映射**：9780135398579 = 纸书（S01、S04 版权页、S03 "Paperback"）；9780135398548 = Pearson VitalSource eTextbook（S03）；9780135398517 = InformIT EPUB/PDF 电子书（S02）；9780135398586 = O'Reilly 版本（403 未核）。任务中「9780135398548/9780135398579」都属第二版，但分属电子教材与纸书。
3. **任务前提更正**："Future Bob Playing with Grok3" 是第 2 章末的 Postscript（p.37–40），不是全书后记；全书 Afterword（p.557）据 Foreword 由 Justin Martin 撰写（S01、S04）。
4. **其他书的纸书/电子书日期不一致**：Clean Craftsmanship 纸书 Nov 4, 2021 vs 电子书 Sep 16, 2021；Functional Design 纸书 Sep 11, 2023 vs 电子书 Sep 20, 2023；We, Programmers 纸书 Nov 20, 2024 vs 电子书 Dec 5, 2024；多本书 InformIT 页的 "Copyright" 年份比出版年晚一年（Clean Code 1e 2009、Clean Architecture 2018、Clean Agile 2020、Clean Craftsmanship 2022、Functional Design 2024、We, Programmers 2025、Clean Code 2e 2026）。
5. **自信程度的两处自述方向不同**：2e 导言称比初版 "a bit more confident"；2e Ch3 称原则 "not strict laws … more or less, guidelines"。而 1e 本身既说 "present these opinions as absolutes"，又说 "don't … think that we are somehow 'right' in any absolute sense"——2e 导言对 1e 的回顾（"reluctant to assert my ideas as anything more than one programmer's way"）与 1e 原文的「绝对呈现」措辞不完全吻合。照实并列，不作裁决。
6. **待验证（未取到正文）**：
   - Clean Code 2e 第 17 章 "Programming by Prompt" 的论点；Ch2 Postscript 正文；Ch1 "There Will Be Code" 在 2e 中如何改写 1e 的 "This will never happen."；Ch14 "Small Bundles" 与 TCR 的正文；Ch22 "2025 Update and Report from the Field"；Afterword 关于 AI 生产率的内容。
   - 1e 函数长度的原句（"smaller than that"/"20 lines" 一类）——本路未抓到 1e 第 3 章原文。
   - Clean Architecture 的 SRP "actor" 原句与页码（仅 S120 搜索摘要）；「架构的目标是最小化人力」原句（仅第三方搜索摘要，未收入正文）。
   - Clean Craftsmanship 第十条誓言（"Respect"）原文。
   - Functional Design 第 12 章（SOLID）与第 16 章（Design Patterns、"OO Poison?"）的结论——只有出版社文案。
   - We, Programmers 第 17 章 AI 的论点（只有索引与出版社文案）。
   - Clean Agile 第 6 章中 "Coaching—An Alternative View" 的撰写人。
   - negative-test-experiment 文档是否由 Martin 本人执笔（提交人是他，仓库内容可能由其 agent 生成）。
7. O'Reilly 与 Pearson eLibrary 403；Functional Design 与 Clean Architecture 的样章 PDF 在 InformIT/ptgmedia 均 404（尝试了 8 个候选 URL）。

## 本路未覆盖

- X/Twitter 内容：cleancoder.com 列出的 2025-04～2026-09 共 26 条 "Morning Bathrobe Rants"（含 "Rethinking Harnesses"、"SOLID Up Front"、"AI Out-Codes You; Deal with It"、"Vibe Coding"、"Testing Discipline"、"Design Patterns Will Destroy You as a Programmer"）全部托管在 X，本路只记录了列表与链接，内容归 X 路。
- 播客、会议演讲、视频（cleancoders.com 视频课程、Book Overflow 播客等），以及第三方书评/批评（如 bugzmanov 的第二版书评、Hacker News 讨论），归另外两路。
- 第二版正文除样章（前言、导言、第 3 章、索引）以外的所有章节；Clean Architecture、Clean Agile、Clean Craftsmanship、Functional Design、We, Programmers 样章以外的正文。
- butunclebob.com（"Ancient Blogs"）与 Uncle Bob Consulting 旧文章站点；blog.cleancoder.com 的 "Craftsman" 连载。
- 早期著作（Agile Software Development: Principles, Patterns, and Practices, 2002 等）中 SOLID 的原始表述。
- SwarmForge 其他分支（two-pack、four-pack、lieutenant、project-manager、squad、adversaries）的角色提示与 handoff 协议细节；AIR-J 的 language-reference/formal-v0-spec；各工具仓库的完整 README。
- 与 Ousterhout 辩论（S86）中 Method Length、Comments、TDD 三节的逐段内容（只读了各节总结与结束语）。
