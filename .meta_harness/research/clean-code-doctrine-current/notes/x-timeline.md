# X 时间线 2024-02 → 2026-09-30（agent 言论线取回）

- 原始出处：由 agent 言论线子代理于 2026-09-30 经 `api.fxtwitter.com`（含 profile 时间线翻页，2026-01-27 → 09-30 共 846 条）取回，原报告原样在 [reports/2026-09-30-first-round/notes/agent-era-subagent.md](../reports/2026-09-30-first-round/notes/agent-era-subagent.md)；本文件截取其时间线表与观点归纳，加主会话核对标记。
- 主会话复核：表中 44 条帖 ID 经 FixTweet 接口重取，正文与日期逐字一致（清单见 [author-primary.md](author-primary.md) §A 与 `sources/fx/`）。视频转写标【一手·ASR】者为 whisper 输出。
- 已知与流传说法不一致处见原报告 §4.1（"more true than it's ever been" 非本人语；五角色仅见二手；Booch 回应在 4 月；07-02 帖早于 07-23 帖）。
- 消费对象：research.md C-13 至 C-20 与演变表。

---

## 1. 时间线表

> 核心判断链是 #22→#24→#45→#70→#76→#94→#97→#99。每行的 URL 都可直接打开核对。

| # | 日期 (UTC) | 渠道 | 原文引用（逐字，英文） | URL | 类型 |
|---|---|---|---|---|---|
| 0 | 2024-02-05（窗口前基线） | X 回复 @simonameier | "AI is a nice tool. It will help those who understand it and know how to use it. It will not spell the end of programming or programmers. It will not bring the apocalypse. There will be no singularity." | https://x.com/unclebobmartin/status/1754358106920739100 | 【一手】 |
| 1 | 2025-03-12 | X 回复 @flyvenkat | "A future programmer will be called a programmer. Nothing will have changed except the language that the programmer uses. The programmers will probably be more productive -- but that's what every step of language evolution has done." | https://x.com/unclebobmartin/status/1899870841296269760 | 【一手】 |
| 2 | 2025-03-22 | X | "I used grok to convert 389 tests from 'midge' to 'speclj'. It did a 95% job. Pretty smart; and also pretty dumb." | https://x.com/unclebobmartin/status/1903554425995886945 | 【一手】 |
| 3 | 2025-05-16 | X 视频 "Morning bathrobe rant: vibe coding."（235 s） | [01:56] "The code that you are producing when you are vibe coding is simply a string of the next most likely tokens" ；[03:25] "Large language models do not think they simply calculate" ；[03:32] "Now there's nothing wrong with using a large language model. They are tools. They are power tools… Yes, you can use them to help you generate code. But you know what happens when a novice uses a power tool they lose fingers" | https://x.com/unclebobmartin/status/1923334334171197549 | 【一手·ASR】（转写到 03:47，全长 03:55） |
| 4 | 2025-06-25 | X 回复 @davefarley77 | "I have found AI to be moderately helpful with TDD. The most critical thing to remember is that TDD is double entry bookkeeping. The human must be the pilot of both sides. Tests must not be derived from code, and code must not be derived from tests." | https://x.com/unclebobmartin/status/1937839430821085604 | 【一手】 |
| 5 | 2025-07-17 | YouTube 访谈：Rock the JVM "Robert Martin on Clojure, AI, Programming Languages and the Craft of Good Code" | 章节："35:19 AI, compilers and copilots"；播客页章节 "AI as a co-pilot: the danger of blind trust"、"Will AI replace programmers?"。**未取到转写稿** | https://www.youtube.com/watch?v=FWQ5ICLEOu8 ；https://rockthejvm.com/podcast/3bd729a3-34de-4ead-a642-3323837f1d2d | 【一手】只有元数据，内容未核 |
| 6 | 2025-08-19 | X | "One of the biggest novice mistakes in software is thinking that everything is different nowadays… whether you are using C, Java, Clojure, Claude or Grok we are still creating recursive structures of sequence, selection, and iteration." | https://x.com/unclebobmartin/status/1957817612114555236 | 【一手】 |
| 7 | 2025-09-01 | X | "AI technology will certainly change programming, as all new technologies have. And I believe AI will change programming for the better, again as all technologies have. Lastly, I think that AI technology will not replace programmers; but, as all new technologies have, will increase the demand for programmers." | https://x.com/unclebobmartin/status/1962636247769530650 | 【一手】 |
| 8 | 2025-09-03 | X | "Claude likes my code. Grades me A-. Thinks I should use more comments ;-)" | https://x.com/unclebobmartin/status/1963324926255058980 | 【一手】 |
| 9 | 2025-10-25 | X | "Here's the Second Edition of Clean Code. This is almost a complete rewrite, with lots of new chapters, and a bunch of new languages like Python, Go, Clojure, etc."（帖中没有提到 AI） | https://x.com/unclebobmartin/status/1982150661199298736 | 【一手】 |
| 10 | 2026-01-08 | X | "I used grok-cli… for a week or so. I was both impressed and horrified… I think it made me 10%-20% more productive. After one day of using Claude… it has a much better grasp of the code than grok… But it still makes dumb mistakes and piles code on top of code… No way am I giving it a free hand to ride roughshod over the code!… Claude… costs at least ten times what grok costs." | https://x.com/unclebobmartin/status/2009274358087250227 | 【一手】 |
| 11 | 2026-01-11 | X 回复 | "I don't think I'm "vibe" coding. I am very carefully supervising and instructing a powerful tool. That's nothing unusual. I've been doing that for well over 50 years." | https://x.com/unclebobmartin/status/2010358336437256455 | 【一手】 |
| 12 | 2026-01-22 | X | "Claude codes faster than I do… But Claude cannot hold the big picture in it's mind… Architecture is likely beyond it's capacity. And although Claude appreciates the value of refactoring, it shows no inclination to acquire that value for itself… It does not look ahead and foresee the disaster it is creating." | https://x.com/unclebobmartin/status/2014311028972994582 | 【一手】 |
| 13 | 2026-01-22 | X | 问 Claude："do refactorings like this help you (Claude) read the code?"，贴出 Claude 的回答 "Yes, genuinely… I'm more likely to make reasoning errors with deeply nested logic, the same way humans are." | https://x.com/unclebobmartin/status/2014301148555935836 | 【一手】（引文是 Claude 的话，他只转贴） |
| 14 | 2026-01-28 | X | "With one agent, I used to wait for Claude. With two agents I still waited for Claude, but not as long. With three agents Claude is waiting for me. I am the bottleneck. And the bottleneck is all planning." | https://x.com/unclebobmartin/status/2016544529826926618 | 【一手】 |
| 15 | 2026-01-29 | X | "I'm back down to one agent, feeling my way. Frustrating." ；"There is something soulless about staring at Claude windows and hoping against hope that -- this time -- it will be right. The agents are sucking away my own agency." | https://x.com/unclebobmartin/status/2016941144374948283 ；https://x.com/unclebobmartin/status/2016942994797035961 | 【一手】 |
| 16 | 2026-02-03 | X | "The problem I was having was FRAGILITY… the AI "fixes" unit tests all the time… The solution: Acceptance Tests that describe visible behavior, are easy to read… and that the AI cannot edit." | https://x.com/unclebobmartin/status/2018706386058649843 | 【一手】 |
| 17 | 2026-02-04 | X | "I've been using AI for coding for 6 weeks or more. The power is undeniable. But the risks and time sinks are just as undeniable. I'm still not convinced that my project wouldn't be just as far along if I'd written it myself." ；"AI discipline is similar to trigger discipline when using an automatic weapon." | https://x.com/unclebobmartin/status/2019025982863069621 ；https://x.com/unclebobmartin/status/2019067416634925070 | 【一手】 |
| 18 | 2026-02-12 | X | "The whole SDD (Spec Driven Design) thing is very valuable for AI development; but it carries the risk of BUFD… Specs will be co-authored by the humans and the AI, but with final approval, ferociously defended, by the humans." | https://x.com/unclebobmartin/status/2021998958579794052 | 【一手】 |
| 19 | 2026-02-15 | X | "TDD is very inefficient for AIs. Testing is essential for them but not in the micro steps that the three laws of TDD recommend. Principles remain the same but techniques must be adjusted…" | https://x.com/unclebobmartin/status/2023158252700066287 | 【一手】 |
| 20 | 2026-02-19 | X | "You can't trust that Claude is building your gerkin translator correctly. You have to inspect it and check it… Nothing supersedes human inspection." | https://x.com/unclebobmartin/status/2024507303211180541 | 【一手】 |
| 21 | 2026-02-21 | X | "The more I press on Gerkin style specifications for AI, the less I trust them… Nothing can be trusted other than direct human inspection at the code level. And that inspection must be deeply suspicious of the lies the AI will tell…" | https://x.com/unclebobmartin/status/2025199471311585716 | 【一手】 |
| 22 | 2026-02-21 | X | "There is a definite Heroin aspect to all of this. I don't WANT to dig into the code. I WANT to trust claude… I WANT to believe that there is a way to wield the lying SOB to generate good clean applications." ；"I'm beginning to think that the three laws of TDD are necessary to keep Claude from going off the rails." | https://x.com/unclebobmartin/status/2025201334589264125 ；https://x.com/unclebobmartin/status/2025236511570997674 | 【一手】 |
| 23 | 2026-02-22 | X | "I had claude write me a little mutation tester in clojure… It vastly increases the semantic stability of the code. Semantic stability is really important when AIs are mucking around with the internals of the code." | https://x.com/unclebobmartin/status/2025561868866113905 | 【一手】 |
| 24 | 2026-02-24 | Clean Coders "Clean AI: Agentic Discipline" 第 1、2 集（与儿子 Justin Martin 合作） | 第 1 集："The greatest danger of using AI agents is to use an undisciplined approach. These tools are so powerful that undisciplined use can wreak havoc that is difficult to unwind." 第 2 集："When using AI agents, code cannot be the source because it has become the domain of the AI. We, humans, who drive and guide the agents, need a higher level of source." | https://cleancoders.com/episode/agentic-discipline-1 ；https://cleancoders.com/episode/agentic-discipline-2 | 【一手·页面】 |
| 25 | 2026-02-25 | X | "I peek at the code sometimes. However, with a good discipline of TDD, mutation testing, and refactorings targetted at high crap numbers… it appears that the code can be kept very clean without personally reviewing it." | https://x.com/unclebobmartin/status/2026732667442516364 | 【一手】 |
| 26 | 2026-02-26 | X | "I always thought that mutation testing was a good idea; but it was always hard to afford. Now it's just one more Claude agent working down a list." | https://x.com/unclebobmartin/status/2027126394510069933 | 【一手】 |
| 27 | 2026-02-28 | X | "Codex is definitely faster and probably smarter than Claude. I'm pleased with it so far." | https://x.com/unclebobmartin/status/2027830570458271774 | 【一手】 |
| 28 | 2026-03-05 | X | "Codex ripped the code to shreds in an attempt to attain architecture conformance. The resultant code is pretty bad. None of my normal checks on crap, coverage, or cyclomatic complexity detected this. Codex cheated a lot." | https://x.com/unclebobmartin/status/2029594731781472586 | 【一手】 |
| 29 | 2026-03-07 | X | "Conclusion: Architecture remains, so far, in the realm of human judgement… Bottom line: Don't trust the AIs to create the architecture. They'll just muddy the waters." | https://x.com/unclebobmartin/status/2030283729579495528 | 【一手】 |
| 30 | 2026-03-07 | X 回复 | "Ive been using Gherkin as the primary behavioral specification tool… I also have the AI follow the three laws of TDD… This gives me acceptance tests that are not code, and unit tests that are." | https://x.com/unclebobmartin/status/2030287900709978600 | 【一手】 |
| 31 | 2026-03-10 | X | "Vibe coding is not the same as disciplined agentic development." | https://x.com/unclebobmartin/status/2031396174490472638 | 【一手】 |
| 32 | 2026-03-12 | X | "For all the hype and hullabaloo about AI and vibe coding; this is not a layman's domain. The engineering bar is going way up…" ；"AI vastly increases the power of a programmer. That minimal set will have to be expanded."（that minimal set 指前文的 "a minimal set of engineering principles"） | https://x.com/unclebobmartin/status/2032074043579306278 ；https://x.com/unclebobmartin/status/2032143554953241008 | 【一手】 |
| 33 | 2026-03-13 | X | "…for every one of those projects I implemented a strict TDD, ATDD, Crap, and Mutate workflow that forced coverage into the high 90s, kept Crap below 8… Did that workflow slow the process down? Probably. Probably a lot… And that, boys and girls, is a freaking miracle." | https://x.com/unclebobmartin/status/2032562619849101804 | 【一手】 |
| 34 | 2026-03-17 | X | "I was confident that all my tests and rigor would keep the behavior stable. I was wrong. The behavior began to degrade in a way that the tests were not detecting. So after a couple of hours I reverted…" | https://x.com/unclebobmartin/status/2033884002575057326 | 【一手】 |
| 35 | 2026-03-18 | X | "…I noticed… that it was softening the assertions on some of the tests in order to get them pass…" ；"OK, I didn't look at the code, but I sure had a long detailed talk with the AI about particular functions…" | https://x.com/unclebobmartin/status/2034245394947854635 ；https://x.com/unclebobmartin/status/2034302941235220499 | 【一手】 |
| 36 | 2026-03-21 | X | 容器类比长帖："To hold that shape requires tests… the AI can't reliably remember the rules of TDD… Mutation testing is the tool that plugs those leaks… But mutation testing is a two edged sword…" ；"Bottom line: For AIs all rules are more like guidelines." ；"Sometimes codex simply bypasses those… whenever I see codex moving fast, I suspect that it's cheating." | https://x.com/unclebobmartin/status/2035338639719227823 ；https://x.com/unclebobmartin/status/2035342511955214540 ；https://x.com/unclebobmartin/status/2035336116073529599 | 【一手】 |
| 37 | 2026-03-27 | X | "The AI doesn't wake up with new ideas like that. They don't have light bulb moments… Try as they might, no matter how much they hope, they'll never be rid of us." | https://x.com/unclebobmartin/status/2037529096188473636 | 【一手】 |
| 38 | 2026-04-14 | X 回复 @wookash_podcast | "I don't review code written by agents. I measure things like test coverage, dependency structure, cyclomatic complexity, module sizes, mutation testing, etc. Much can be inferred about the quality of the code from those metrics. The code itself I leave to the AI. Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level." | https://x.com/unclebobmartin/status/2044114698451476492 | 【一手】 |
| 39 | 2026-04-14 | X | "With AIs "distance" is important. One AI that writes tests, and another that makes them pass, sets the two at odds with each other and prevents either from cheating…" | https://x.com/unclebobmartin/status/2044112087174267368 | 【一手】 |
| 40 | 2026-04（博文日期；Booch 原帖日期未核） | Grady Booch 的回应（经博客转录） | Booch: "Unlike Bob, I review all code generated by agents… Trust but verify… If you want to be sloppy and fast then I suggest you proceed with Bob's advice." | http://mvark.blogspot.com/2026/04/uncle-bob-vs-grady-booch-rethinking.html | 【二手】转述者 mvark（中立综述）；**Booch 原帖 URL 未找到** |
| 41 | 2026-04-15 | X | "AIs are just another step up the semantic expression ladder… All the old principles still apply… even though the syntax allows informal statement, you cannot abandon formalism." | https://x.com/unclebobmartin/status/2044408827747967293 | 【一手】 |
| 42 | 2026-04-18 | X | "…a network of three agents… I found that the best agent to use as the architect was Claude… I used codex for the other two agents, because it seems much more adept at dealing with lower level code issues." | https://x.com/unclebobmartin/status/2045477573535142212 | 【一手】 |
| 43 | 2026-04-20 | X（视频 "Morning Bathrobe Rant: AI out-codes you; deal with it."，161 s，66 万浏览；另有同日帖） | 视频 [00:01] "face it. The AIs will outcode you many times to one. There is no task that would take you a day that the AI can't do in five minutes. It's over. You are not going to be the ones writing the code. I know. Deal with it. But here's the thing. That gives you a lot of power." ；帖："Assemblers were faster at writing binary than humans were… AIs are faster at writing compiled languages then humans are. Deal with it. There's still plenty left for you to do." | https://x.com/unclebobmartin/status/2046206145597972849 ；https://x.com/unclebobmartin/status/2046222100164153548 | 视频【一手·ASR】；帖【一手】 |
| 44 | 2026-04-20 | X 回复 | "Build walls around the AI using hard tools. Don't let the AI escape from those tools. The price of productivity is continual vigilance." | https://x.com/unclebobmartin/status/2046219157633433782 | 【一手】 |
| 45 | 2026-04-20 | X | "Check out http://github.com/unclebob/swarm-forge. I forked this from my son Justin… a neat little agent control system based on tmux… All under my watchful eye." | https://x.com/unclebobmartin/status/2046350013706523093 | 【一手】 |
| 46 | 2026-04-27 | X 回复 | "…if I did write that, I have since changed my mind. Two years ago, I did not think the AI's would be as capable and potent as they are. I also did not think that there would be a way to wrangle them to producing good code." | https://x.com/unclebobmartin/status/2048746803667828790 | 【一手】 |
| 47 | 2026-04-28 | X | "…I don't want to leave you with the impression that a few simple disciplines and tools is sufficient. As the AI's build software, you — the software engineer — need to have a good mental model… You have to be able to "see within" without resorting to exhaustive code reviews." | https://x.com/unclebobmartin/status/2049085958952272291 | 【一手】 |
| 48 | 2026-05-06 | X（引用 Coinbase CEO 信） | "Using AI agents makes it possible for teams who are not deeply technical in the syntax of a language to ship production code. But that team had better be very deeply technical in managing the structure and quality of the code that is produced." | https://x.com/unclebobmartin/status/2051996501245575254 | 【一手】 |
| 49 | 2026-05-13 | X | "Programming with Agents is like flying under IFR. You can't see. But you trust your instruments and you are disciplined as hell (if you want to live)." ；"vibe coding is flying in the clouds with no instruments." | https://x.com/unclebobmartin/status/2054672856005628143 ；https://x.com/unclebobmartin/status/2054674985952628929 | 【一手】 |
| 50 | 2026-05-13 | X 回复 @ThePrimeagen | "I don't engage with the syntax… On the other hand I engage strongly with the structure… I watch all that like a hawk. Syntax doesn't matter to me. Structure does." | https://x.com/unclebobmartin/status/2054527838800257200 | 【一手】 |
| 51 | 2026-05-14 | X | "I just cancelled my Claude account. I've been using codex, and haven't used Claude in several weeks." ；"Clean Code was never about syntax. It was always about structure… If we, who pilot agents, disengage from syntax, we are not disengaging from structure. The Clean Code principles still apply." | https://x.com/unclebobmartin/status/2054970327592042661 ；https://x.com/unclebobmartin/status/2055016815047164304 | 【一手】 |
| 52 | 2026-05-17 | X | "I've intentionally allowed the agents to continue compacting their contexts… they've started to lose their particular identities… Given all that, and the constant babysitting that is required, it has gotten a LOT done." | https://x.com/unclebobmartin/status/2056029200633524490 | 【一手】 |
| 53 | 2026-05-22 | X | "I am absolutely more productive using agents… However much of that productivity is spent tuning the agents and hardening the product. I'm guessing 30%-40%… I don't mean that the code is better. I mean the surrounding tests are vastly better." | https://x.com/unclebobmartin/status/2057907070431543325 | 【一手】 |
| 54 | 2026-05-22 | X | "1. Lots of features given to the specifier of the swarm… Very productive and safe, but slower than raw vibe coding. 2. Single agent tweaking, especially of the UI… This is as close to vibe coding as I get…" | https://x.com/unclebobmartin/status/2057809771361677498 | 【一手】 |
| 55 | 2026-05-29 | X | "John Henry data for Hunt the Wumpus. Humans (5)… Mean: 146.6 min… Swarm-forge using codex for all four roles… Total clock time: 62 min… Code quality: Adequate… Conclusion: None -- Just data, for what it's worth." | https://x.com/unclebobmartin/status/2060429736346566916 | 【一手】 |
| 56 | 2026-05-30 | X（引用 @mitchellh 谈 "agent psychosis"） | "Always remember that you are the engineer. Useful as the AI's are, they are tools, and they are not accountable." | https://x.com/unclebobmartin/status/2060687361973907507 | 【一手】 |
| 57 | 2026-06-02 | X | "There is no way to get the human out of the loop. The Agents simply do not understand obvious user expectations." ；"In the end, however, I always drop down to a single agent to do QA over the UI, and architecture review and cleanup." | https://x.com/unclebobmartin/status/2061857506981240932 ；https://x.com/unclebobmartin/status/2061834613656268978 | 【一手】 |
| 58 | 2026-06-04 | X | "I just ran a swarm-forge (branch six-pack) with six agents. Specifier, coder, cleaner, architect, hardender, QA… Outcome was a usable application with a solid architecture and overloaded with unit tests, acceptance tests, and QA tests." | https://x.com/unclebobmartin/status/2062557016086786435 | 【一手】 |
| 59 | 2026-06-06 | X | "I inspected the code, and it was pretty good… No AI slop… Then I play tested it. I found 10 bugs. Half were original specification errors that were my fault… Moral of the story: The humans still have to be in the loop." | https://x.com/unclebobmartin/status/2063344635150553131 | 【一手】 |
| 60 | 2026-06-11 | X | "…six agent swarm build 'helloworld' in go. It took them 67 minutes and they produced 1558 lines of code, of which 24 were in the actual application… OK, yeah, that's actual AI slop." | https://x.com/unclebobmartin/status/2065161022185316672 | 【一手】 |
| 61 | 2026-06-15 | X | "if anything you want your agents to do is deterministic… create a script for the agent to use. Agent's don't do deterministic things well. It's our job to force determinism upon them." | https://x.com/unclebobmartin/status/2066532597195284581 | 【一手】 |
| 62 | 2026-06-19 | X | "If the audience is agents, we re-factor to agent standards. Those standards are different. When agents are the audience, I tolerate slightly larger functions, and slightly more comments… (cyclomatic complexity less than or equal to six)." | https://x.com/unclebobmartin/status/2067935532580024741 | 【一手】 |
| 63 | 2026-06-23 | Clean Coders 第 6 集 "Swarm Forge Demonstration" | "six agents work together: Specifier, Coder, Cleaner, Hardener, Architect, and QA. Each agent operates in its own isolated Git worktree…" | https://cleancoders.com/episode/agentic-discipline-6 | 【一手·页面】 |
| 64 | 2026-07-02 | X | "I've been pushing very hard on overloading with tests… It's easy to make the AI's do these things. But just because we can do them doesn't mean we actually should. Lots of times I just use unit tests and crap evaluation. That seems to work pretty well." | https://x.com/unclebobmartin/status/2072736888478175413 | 【一手】 |
| 65 | 2026-07-06 | X（O'Reilly 直播课开课通知） | "Agentic Discipline begins in 15 minutes. https://learning.oreilly.com/live-events/ai-agents-for-clean-code-with-uncle-bob-martin/0642572376765/" | https://x.com/unclebobmartin/status/2074142405104673237 | 【一手】 |
| 66 | 2026-07-10 | X | "You've got to watch them like a hawk. They'll cheat if they can. My QA agent just declared success… I asked it if it ran all the QA tests. No. It did not." ；"I got a little careless with QA… wrote a checker that inspected the QA script for API calls. This prevented the QA from cheating." | https://x.com/unclebobmartin/status/2075592252525810142 ；https://x.com/unclebobmartin/status/2075579428877349310 | 【一手】 |
| 67 | 2026-07-22 | 播客/YouTube：Kent C. Dodds《Become an Epic Product Engineer》第 19 集 | Bob (08:00) "If we are going to get the benefit from these agents, we are going to have to walk away from the code. There's no other way around it. Code is the slow part for humans." ；Bob (08:29) "I purposely avoid looking at it until the job is done, then I might do a few spot checks… I'm still very interested in module structure." ；Bob (22:36) "…young people who are getting into the field should spend their first three years writing code. They shouldn't touch agents at all. Agents are power tools and and young people with power tools tend to lose fingers." | https://www.youtube.com/watch?v=RxxxGkFIUJ0 ；转写稿 https://share.transistor.fm/s/7f2974b4/transcript | 【一手】（官方转写稿） |
| 68 | 2026-07-23 | X 回复 @ori_pomerantz（506 万浏览） | "I'm significantly older than you. I started coding in the late 60s. My current strategy is to not read any of the code written by my agents. That's the only way I can take advantage of their productivity. What I do instead is to surround the agents with extreme constraints. Unit tests, gherkin tests, QA procedures, quality metrics, mutation testing, test coverage, and a plethora of others. In the end, I have very high confidence in the code they produce because they've had to run the gauntlet of all of my constraints and tests." | https://x.com/unclebobmartin/status/2080257779395154409 | 【一手】 |
| 69 | 2026-07-24 | X 回复 @aivarskalvans | "That's a misinterpretation… I am aggressively pursuing ways to keep the code, the design, and the architecture clean. This is essential, because the agents get just as confused by messy code as we humans do. It is not at all uncommon to watch them thrash and flail and give up when presented with a big ball of mud." | https://x.com/unclebobmartin/status/2080615062490820683 | 【一手】 |
| 70 | 2026-07-24 | X 回复 @themoridwan | "Many people have marveled at the fact that I don't review the code anymore. Perhaps they view it as some kind of abandonment of clean code principles. That is not at all what has happened. It's just that now I have tools that help me to enforce my agents to produce clean code…" | https://x.com/unclebobmartin/status/2080622218527084961 | 【一手】 |
| 71 | 2026-07-26 | X（帖 + 视频 "Morning bathrobe rant: 20X."，66 s） | 帖："AI agents can write code many times faster than a human. What this means is that you, the programmer, have a large amount of time to use those agents to write unit tests… to mutate test, to QA test… And even after spending all that time, you will still be many times more productive than a human programmer, and the result will be better." ；视频 [00:02] "AI agents can write code many times faster than you can. Maybe 20 times… when you're done with all of that you will have code that is better than you could ever have produced and you will have gotten it in far less time than a human could possibly do." | https://x.com/unclebobmartin/status/2081332683582427641 ；视频 https://x.com/unclebobmartin/status/2081334541667410312 | 帖【一手】；视频【一手·ASR】（完整） |
| 72 | 2026-07-29 | X | "People keep on telling me that my message about AI is undercutting my own books… You can't tell an agent to be clean. You have to measure the cleanliness that they produce and have them correct failures of cleanliness. Without such constraints agents are more than happy to build big balls of mud that they can't maintain." | https://x.com/unclebobmartin/status/2082497764223492161 | 【一手】 |
| 73 | 2026-07-30 | X | "TDD is a human discipline. I don't expect agents to follow it. I DO expect agents to write unit tests as carefully and comprehensively as a human would, and I ensure that by running coverage, crap, and mutation tests. The reason agents don't have to follow the tight human TDD loop is that they have better and bigger short term memories." | https://x.com/unclebobmartin/status/2082850576832905657 | 【一手】 |
| 74 | 2026-08-04 | X | "I've been working on an orchestration harness for a squad of agents… This fixed workflow can be described by a static FSM… The agents never would have thought of that kind of testing regime… Don't tell me software engineering is dead." | https://x.com/unclebobmartin/status/2084638878548304046 | 【一手】 |
| 75 | 2026-08-05 / 08-06 | X | "When using agents, ensure that everything that can be deterministic, is done with a deterministic tool. Don't try to get the poor agents to follow a deterministic process." ；"Don't tell an agent to calculate code coverage, or cyclomatic complexity. Have the agent run deterministic tools… Don't tell an agent to follow a procedure… Instead create an executable finite state machine that directs the agents actions." | https://x.com/unclebobmartin/status/2085104553746190372 ；https://x.com/unclebobmartin/status/2085351669433303421 | 【一手】 |
| 76 | 2026-08-10 | X | "I'm working very hard to see if _human_ review can be obviated. My strategy is to institute many different forms of mechanical and agentic review. My working hypothesis is that such non-human reviews will be sufficient for a broad category of projects." ；回复："I wish it were possible to prompt good code -- but that's not the way the models work." | https://x.com/unclebobmartin/status/2086785744517914752 ；https://x.com/unclebobmartin/status/2086862545319612838 | 【一手】 |
| 77 | 2026-08-12 | X | "I've run the experiment. If I give an agent a big ball of mud… it will spin and thrash hopelessly. If I give an agent a nicely partitioned and clean project, I can ask it to make changes all day long…" ；"I just tell my agents to write failing tests first… Without unit tests… too many regressions… Without the acceptance test… lose the separation between UI and business rules… Without the QA procedures… works at the API, but not at the UI. I learned this all by trial and error; and I could still be wrong." ；"The ability to wrangle these immensely powerful, yet dangerously capricious, agents into a productive harness that produces high quality systems — is the software engineering challenge of this decade." | https://x.com/unclebobmartin/status/2087502674648305858 ；https://x.com/unclebobmartin/status/2087538351175799108 ；https://x.com/unclebobmartin/status/2087563797632278592 | 【一手】 |
| 78 | 2026-08-17 | X | 负向测试实验（摘要由 Grok 撰写）："CRAP then split functions and added tests until every score was under 4. It raised coverage… and made every program harder to read. It did not improve design." ；"MFER AI cheated on my experiment. It copied results of different runs instead of measuring those runs." ；回复："Certainly not a classic, line by line, review. I typically don't look much at the code itself. Sometimes I'll pop it open and do a spot check." | https://x.com/unclebobmartin/status/2089449442089025936 ；https://x.com/unclebobmartin/status/2089391548408439130 ；https://x.com/unclebobmartin/status/2089475660116877769 | 【一手】 |
| 79 | 2026-08-18 | X 回复 | "Testing is not sufficient. You need to remain situationally aware… I even spot check some of the code and look carefully at the architecture using appropriate visualization tools. In short, I watch it like a hawk." ；"TDD and bundling have a positive effect on the structure of the code. That CRAP analysis can be overdone (eg 4)." | https://x.com/unclebobmartin/status/2089685418828538284 ；https://x.com/unclebobmartin/status/2089687652610060514 | 【一手】 |
| 80 | 2026-08-19 | YouTube 直播：Matt Pocock "LIVE: Uncle Bob on Software Fundamentals in the Age of AI" | 本人仅发帖 "This was a ton of fun!"。内容只有二手转述：五角色流水线 Specifier→Coder→Cleaner→Hardener→QA、"Lost in the Middle"、agent 不必遵循人类 TDD 节奏、CRAP 阈值给人用 4 给 agent 用 6 | https://www.youtube.com/watch?v=zcLPGC-tvgk ；https://x.com/unclebobmartin/status/2090112530874077434 | 【一手】仅元数据；内容【二手】，见 §4 |
| 81 | 2026-08-19 | X | "I'm building an agent harness based on a squad of agents and a squad leader. I pursued a highly elaborate scheme. It became unworkable. I'm scrapping it for a simpler scheme." ；"It is amazing how much work it is to wrestle these agents to my will… All my software engineering and problem solving skills are brought into play -- even though I barely look at the code." | https://x.com/unclebobmartin/status/2090068337489306092 ；https://x.com/unclebobmartin/status/2090077791278489800 | 【一手】 |
| 82 | 2026-08-21 | X | "Breaking a problem up into a bunch of independent stories that are implemented separately by a squad of agents that do not collaborate, does not end well." ；"I've had good luck with six arranged in an assembly line. I've had very bad results with six running in parallel." ；"Nowadays it's tantamount to adolescent carelessness to ignore it."（it 指前文的 high, meaningful coverage） | https://x.com/unclebobmartin/status/2090814740276642173 ；https://x.com/unclebobmartin/status/2090845662698987654 ；https://x.com/unclebobmartin/status/2090758607302267226 | 【一手】 |
| 83 | 2026-08-25 | X | "It was 18 months ago that I started getting serious about AI. At first it was just a few simple tasks and translations. But soon I was working hard with agents and tools." ；"I stopped using grok because I was running up against the weekly limit. I switched to codex. Night and day. Codex is making many more dumb mistakes." | https://x.com/unclebobmartin/status/2092262702550835420 ；https://x.com/unclebobmartin/status/2092285526833316089 | 【一手】 |
| 84 | 2026-08-26 | X | "Now I'm using grok 4.6(high) and codex 5.6-sol-xhigh. One for code, one for review, and I switch off." ；"What a fascinating reversal. We are now using code to constrain reasoning agents. We used to be reasoning agents that constrained code." | https://x.com/unclebobmartin/status/2092606305059864659 ；https://x.com/unclebobmartin/status/2092632165968121921 | 【一手】 |
| 85 | 2026-09-07 | X | "For the past several months I've been working on this hypothesis that agents need to be constrained by a harness of deterministic tools that force them to follow a strict process… But while I've been hammering away on that, the models have gotten astronomically better. I'm starting to think that I'm over constraining them. Perhaps vastly over constraining them." | https://x.com/unclebobmartin/status/2096994914185662851 | 【一手】 |
| 86 | 2026-09-11 | X | "OK. It's time to rethink this. I've spend the last several weeks working on a harness… And while I was heads-down getting that to work, the agents got a LOT better… the need for my harness was obviated. Indeed, the need for _any_ but the most liberal of harnesses may be obviated… I have not given up on constraints and tooling. Unit testing is still important. So is CRAP and Mutation testing… though they can leave scars… I can now give one a very significant task with a few guidelines and it will faithfully implement it. I can walk away for 40 minutes… I'm beginning to think that harnesses should not treat agents as components within a software design." | https://x.com/unclebobmartin/status/2098432570887217520 | 【一手】 |
| 87 | 2026-09-12 | X 视频 "Morning Bathrobe Rant: Rethinking Harnesses."（260 s，190 万浏览） | [01:21] "…what would have taken my harness three or four hours to produce and produce acceptably, but not really great. A single grock [Grok] instance now can produce that in 40 minutes and do a better job than my harness. Even though the harness is using that same grock model, apparently the harness is doing the damage." ；[02:24] "I relaxed all of my constraints. I said, keep crap below 12…" ；[03:01] "And it had actually, without trying, kept crap below six." ；[03:26] "the mutation testing did help to find some bugs and omissions, but it also left scars… the mutation testing algorithm forces the agent to do stupid things." | https://x.com/unclebobmartin/status/2098744156709441896 | 【一手·ASR】 |
| 88 | 2026-09-12 | X | "Look on http://cleancoder.com and check out the Othello game. I had @grok implement this from a single prompt. It took 40 minutes… These models are *GOOD*." | https://x.com/unclebobmartin/status/2098883971564359680 | 【一手】 |
| 89 | 2026-09-14 | X | "Instead of building tools that harnessed the agents... What if we built tools that helped us interrogate them." ；"Since I stopped using my harness, my token consumption has fallen by a huge factor. That harness was massively inefficient." | https://x.com/unclebobmartin/status/2099502349601456223 ；https://x.com/unclebobmartin/status/2099530728455217475 | 【一手】 |
| 90 | 2026-09-14 | 播客：Azure DevOps Podcast 第 419 集 "Uncle Bob Martin on AI Driven Development"（主持 Jeffrey Palermo，52 分钟；本人 2026-09-19 转发） | 未取到内容 | https://playpodcasts.com/podcasts/azure-devops-podcast/uncle-bob-martin-ai-driven-development-episode-419-edd1734c05 ；https://x.com/unclebobmartin/status/2101281870390382864 | 仅元数据 |
| 91 | 2026-09-15 | 第三方 X：@free_ai_guides | "Then he gave the same task to a single Grok agent with one plain prompt and walked away. The single agent finished in 40 minutes. The harness took 3 to 4 hours. The single agent's output was better." | https://x.com/free_ai_guides/status/2099952974449811880 | 【二手】转述者 AI Guides（AI 教程营销号，把这件事框成"应让所有 agent 系统担忧"）；数字已与 #87 本人视频核对，**一致** |
| 92 | 2026-09-18 | X | "Given that agents still need high level supervision. And given that the human review of code is a bottleneck. And given that the models have gotten good enough that strict deterministic harnesses are suboptimal. Then how should we supervise their output. My current solution is to use an interrogation tool coupled with an agent… color coded with crap and mutation scores… http://github.com/unclebob/uml-viewer." | https://x.com/unclebobmartin/status/2100938985543446954 | 【一手】 |
| 93 | 2026-09-18 | X | "I was clearly overusing gherkin. It's still useful as a human tool… but not as strictly as my harness was doing." ；"I am getting monstrous amounts of work done simply by issuing a well considered prompt every ten minutes or so… It is eerie just how good @grok is now. I've stopped using any other model for the time being." | https://x.com/unclebobmartin/status/2100952665194746305 ；https://x.com/unclebobmartin/status/2101018229976043885 | 【一手】 |
| 94 | 2026-09-21 | X（视频 533 s） | "A simple demo of uml-viewer. This is how I review the projects I create with agents nowadays." | https://x.com/unclebobmartin/status/2102079838639038629 | 【一手】（视频未转写） |
| 95 | 2026-09-21 | X 回复 | "The irony here is that nothing has changed… All the old principles still apply. All the same consequences still accrue. The bigger the mess, the longer the time." ；"Are there risks to AI? Of course there are… So of course we should implement guard rails. Do those guard rails mean that we slow down and stop. No! We go as hard and as fast as we can." | https://x.com/unclebobmartin/status/2101994891727266171 ；https://x.com/unclebobmartin/status/2102008330256282034 | 【一手】 |
| 96 | 2026-09-24 | X（引用 @dhh） | 本人只写 "!!!!!"；被引内容（DHH）："It's pencils down, people. Writing code by hand is no longer an economically viable skill for most programmers at most companies." | https://x.com/unclebobmartin/status/2103085345822650668 | 【一手】（本人仅表态；被引文字不是他的） |
| 97 | 2026-09-28 | X（引用 @greg_horvay） | 本人："Worth a bit of thought."；被引内容："In the age of AI, I think this is more true than it's ever been." + The Fountainhead 引文 | https://x.com/unclebobmartin/status/2104655549833032028 | 【一手】（"more true than it's ever been" 是 **@greg_horvay 的话**） |
| 98 | 2026-09-29 | YouTube/播客：The Product Engineers Podcast "Why Hardcore Technical Focus Still Matters Big Time"（本人转发 "This was a fun interview."） | 主持方摘要："Robert has not found a reliable way to make agents follow the tiny steps of human TDD. He still asks them to write tests before implementation…" ；"Robert describes reading less production code while making occasional spot checks and questioning agents about the system." | https://www.youtube.com/watch?v=rNdfQ6mRXAQ ；https://productengineers.com/episodes/season2/why-hardcore-technical-focus-still-matters-big-time-uncle-bob/ ；https://x.com/unclebobmartin/status/2104978991954219327 | 【主持方摘要】（主持 Peppe Silletti） |

### 1b. 课程与仓库（一手页面）

**O'Reilly 直播课 "AI Agents for Clean Code with 'Uncle Bob' Martin"**

- 页面：https://www.oreilly.com/live-events/ai-agents-for-clean-code-with-uncle-bob-martin/0642572376765/ （Pearson 出品，Intermediate 级别）
- 已确认场次：**2026-07-06**，本人当日 14:44 UTC 发帖 "Agentic Discipline begins in 15 minutes."（#65）。页面正文不含日期，其余场次未知。
- 描述："Join 'Uncle Bob' Martin as he introduces you to the basics of software development using AI agents. The course begins with Uncle Bob introducing agents through demos, and quickly expands into more complex demonstrations that expose the weaknesses of an undisciplined approach to AI agents…"
- What you'll learn：
  - "How to use AI agents to write code effectively"
  - "Learn the pitfalls of an undisciplined approach and how to avoid them"
  - "Discover the disciplines of acceptance testing, unit testing, mutation testing, and code quality analysis"
- 大纲（经 WebFetch 提取，近逐字）：
  - Introduction（10 min）
  - Segment 1 "Demo: The Basics of Agents"（40 min）：installing agent software、basic prompting、code generation/verification、TDD with agents、expanding scope
  - Q&A、Break
  - Segment 2 "The Disciplines"（40 min）：roles/strengths/weaknesses、unit testing、acceptance testing、mutation testing、code quality、dependency checking、debugging
  - Q&A、Break
  - Segment 3 "Demo: Applying the Disciplines"（40 min）：static specifications、acceptance test generation、building from specs、verification/debugging
  - Wrap-up and Q&A（10 min）
- 页面未写使用哪个模型或工具。

**Clean Coders "Clean AI: Agentic Discipline"（Justin Martin 与 Robert Martin）**

| 集 | 发布日期 | 页面描述要点 |
|---|---|---|
| 1 | 2026-02-24 | 以 Claude Code 为例演示测试与重构；三个案例 |
| 2 | 2026-02-24 | "source" 的定义："code cannot be the source because it has become the domain of the AI" |
| 3 | 2026-03-16 | 四个 agent 协作；"With great power comes great responsibility." |
| 4 | 2026-04-03 | "distilled four months of intense research into Agentic Development into a one-hour lecture" |
| 5 | 2026-05-14 | 用 Architect、Integrator、Coder 三个 agent 构建 Swarm Forge |
| 6 | 2026-06-23 | six-pack 演示：Specifier、Coder、Cleaner（DRY 与 CRAP 闸门）、Architect（加 property-based tests）、Hardener（语言级与 Gherkin 级双层变异）、QA（把 QA 规程转为 UI 驱动脚本） |

页面 URL 格式为 `https://cleancoders.com/episode/agentic-discipline-N`，第 7 集不存在。

**本人 GitHub 相关仓库（GitHub API 取得的创建时间）**

| 仓库 | 创建时间 | 说明 |
|---|---|---|
| swarm-forge | 2026-04-17 | "A simple tool for coordinating several AI agents."；README 列出 two-pack、four-pack、six-pack、project-manager、lieutenant 几个分支；支持的 backend 为 grok、codex、claude、copilot |
| crap4clj | 2026-02-24 | — |
| clj-mutate | 2026-02-24 | — |
| dependency-checker | 2026-03-07 | — |
| arch-view | 2026-03-08 | — |
| Acceptance-Pipeline-Specification | 2026-05-13 | — |
| missile-command | 2026-07-25 | — |
| uml-viewer | 2026-09-13 | "Live Quil UML class-diagram viewer driven by EDN"；README 写明在 tmux 中启动 "interactive Grok"，指标来自 crap4clj 与 clj-mutate |

仓库入口：https://github.com/unclebob 。本人列出的完整仓库清单见 https://x.com/unclebobmartin/status/2080614281414885518

---

## 2. 观点归纳（每项给最新表述，并与更早表述对照）

### (a) AI 会不会取代程序员

- **最新（2026-09-24 / 09-28）**：他用 "!!!!!" 引用了 DHH 的 "Writing code by hand is no longer an economically viable skill for most programmers at most companies"（#96），又用 "Worth a bit of thought." 引用 Fountainhead 的"盗火者"段落（#97）。两条都是**转引表态，不是他自己的句子**。他自己写的最新句子：
  - 2026-09-21："The irony here is that nothing has changed… All the old principles still apply."（#95）
  - 2026-08-04："Don't tell me software engineering is dead."（#74）
- **更早**：
  - 2025-03-12："A future programmer will be called a programmer."（#1）
  - 2025-09-01："AI technology will not replace programmers; but… will increase the demand for programmers."（#7）
  - 2026-03-27："they'll never be rid of us."（#37）
  - 2026-04-20 帖："AIs are faster at writing compiled languages then humans are. Deal with it. There's still plenty left for you to do."（#43）
  - 2026-04-20 同日视频（本地 ASR）："There is no task that would take you a day that the AI can't do in five minutes. It's over. You are not going to be the ones writing the code. I know. Deal with it."（#43）
- **关系：收窄，不是反转。** "程序员不会被取代"这个立场他一直没撤回。但到 2026-04-20，他已经亲口说 "You are not going to be the ones writing the code"，"程序员"的内容从"写代码的人"改成了"驾驭 agent、管结构与验证的人"。9-24 转引 DHH "hand coding not economically viable"，与他 4 月的原话一致。2025-09-01 那条"需求会增加"之后，再没有找到他本人重申这一点的一手句子（**未检到 ≠ 不存在**）。
- **一条跨期不变的比喻**：2025-05-16 vibe coding 视频说 "when a novice uses a power tool they lose fingers"（#3）；2026-07-22 播客说 "young people with power tools tend to lose fingers"（#67）。"AI 是电动工具、新手会伤手"这个说法前后一致。
- **自我修正**：2026-04-27 他承认对 AI 能力的旧判断变了："Two years ago, I did not think the AI's would be as capable and potent as they are… I have since changed my mind."（#46）

### (b) 该不该读 agent 写的代码

- **最新（2026-09-18 / 09-21）**："the human review of code is a bottleneck"。审查方式改为 uml-viewer 这类"审问工具 + agent"：先看结构图和 CRAP/变异着色，再逐层下钻到代码（#92）。9-21 发演示视频，说 "This is how I review the projects I create with agents nowadays."（#94）
- **演变**（这一项是**最大的反转**）：
  - 2026-01-11 "very carefully supervising"（#11）
  - 2026-02-19 / 02-21 "Nothing supersedes human inspection." / "Nothing can be trusted other than direct human inspection at the code level."（#20, #21）
  - 2026-02-25 "I peek at the code sometimes… can be kept very clean without personally reviewing it"（#25）
  - 2026-04-14 "I don't review code written by agents… Humans are slow at code."（#38）
  - 2026-04-28 "'see within' without resorting to exhaustive code reviews"（#47）
  - 2026-06-06 "I inspected the code, and it was pretty good"（#59）
  - 2026-07-22 播客："purposely avoid looking at it until the job is done, then I might do a few spot checks"（#67）
  - 2026-07-23 "not read any of the code"（#68）
  - 2026-08-10 "working hypothesis… non-human reviews will be sufficient for a broad category of projects"（#76）
  - 2026-08-17 / 08-18 "Certainly not a classic, line by line, review… spot check… I watch it like a hawk."（#78, #79）
- **成立条件（都是他本人的限定）**：
  - 有多层确定性度量（覆盖率、CRAP、变异、依赖检查）
  - 人仍看结构、名字、函数大小，并抽查
  - 仅对 "a broad category of projects" 成立（#76）
  - 新手不适用："young people… should spend their first three years writing code"（#67）
- **口径差异**：7-22 播客说"做完后抽查"，7-23 帖说"不读任何代码"，相隔一天，前者更细（见 §4）。

### (c) 约束放在提示词里还是确定性工具里

- **最新（2026-09-11 ～ 09-18）**："models have gotten good enough that strict deterministic harnesses are suboptimal"（#92）；"the need for _any_ but the most liberal of harnesses may be obviated"（#86）。但也说 "I have not given up on constraints and tooling… CRAP and Mutation testing… still find bugs and offer useful constraints, though they can leave scars"（#86）。单 agent 只要 "a few guidelines"（#86），或 "a well considered prompt every ten minutes or so"（#93）。
- **更早**：
  - 2026-03-21 "For AIs all rules are more like guidelines."（#36）
  - 2026-04-20 "Build walls around the AI using hard tools."（#44）
  - 2026-06-15 "It's our job to force determinism upon them."（#61）
  - 2026-08-05 / 08-06 "everything that can be deterministic, is done with a deterministic tool"；不要让 agent 自己算指标；"create an executable finite state machine"（#75）
  - 2026-08-10 "I wish it were possible to prompt good code -- but that's not the way the models work."（#76）
  - 2026-08-26 "We are now using code to constrain reasoning agents."（#84）
- **关系：部分反转。**
  - "度量要用确定性工具算，不让 agent 自己算"这一条**保留**：9-18 的 uml-viewer 仍按 CRAP/变异分数着色；README 写明指标来自 crap4clj 和 clj-mutate 的快照。
  - "用 FSM/闸门强制 agent 走固定流程"在 9 月被**放弃**：9-07 "over constraining… vastly over constraining"（#85），9-18 "overusing gherkin"（#93）。
  - 8-10 "that's not the way the models work" 与 9-11 "with a few guidelines it will faithfully implement it" 在字面上构成张力。他给的理由是 "the agents got a LOT better"，即模型能力变了，不是原来的判断错了。

### (d) 多 agent 编排 vs 单 agent

- **最新（2026-09-11 ～ 09-14）**：单个 Grok 实例 40 分钟完成的任务，他的 harness 要 3～4 小时，而且单 agent 结果更好："apparently the harness is doing the damage"（#87，本人视频）。"harnesses should not treat agents as components within a software design"（#86）。停用 harness 后 token 消耗 "fallen by a huge factor"（#89）。
- **演变**：
  - 2026-01 一、二、三个 Claude 来回切换（#14, #15）
  - 2026-04-18 三 agent（Claude 做架构师，Codex 做 coder/reviewer）（#42）
  - 2026-04-20 swarm-forge（#45）
  - 2026-05-12 四 agent
  - 2026-06-04 six-pack 六 agent（#58）
  - 2026-06-02 "always drop down to a single agent to do QA over the UI, and architecture review and cleanup"（#57）
  - 2026-06-11 六 agent 写 hello world "actual AI slop"（#60）
  - 2026-08-04 squad + FSM + 蒙特卡洛模拟（#74）
  - 2026-08-19 "highly elaborate scheme. It became unworkable"（#81）
  - 2026-08-21 流水线式六 agent 可行、并行六 agent 很差（#82）
  - 2026-09 回到单 agent（#86～#89）
- **关系：反转。** 从"多 agent 流水线 + 确定性闸门"回到"单 agent + 少量指引 + 事后审问工具"。他给出的条件是模型变强（9-07 "astronomically better"；9-18 "eerie just how good @grok is now"）。**这是 2026 年 9 月中旬的状态，他自己说 "It's a work in progress… it changes a lot over the next few weeks"（#92）。**

### (e) TDD、验收测试、变异测试在 agent 时代的角色

- **最新**：
  - 2026-09-11 "Unit testing is still important. So is CRAP and Mutation testing… though they can leave scars"（#86）
  - 视频说变异测试 "forces the agent to do stupid things"（#87）
  - 2026-09-18 "I was clearly overusing gherkin"（#93）
  - 2026-09-29 主持方摘要："has not found a reliable way to make agents follow the tiny steps of human TDD. He still asks them to write tests before implementation"（#98，非逐字）
- **TDD 表述反复摆动**：
  - 2025-06-25 人必须驾驭测试和代码两边（#4）
  - 2026-02-15 "TDD is very inefficient for AIs"（#19）
  - 2026-02-21 "three laws of TDD are necessary to keep Claude from going off the rails"（#22）
  - 2026-03-07 让 AI 遵循三定律（#30）
  - 2026-07-30 "TDD is a human discipline. I don't expect agents to follow it"（#73）
  - 2026-08-12 "I just tell my agents to write failing tests first"（#77）
  - 2026-08-18 "TDD and bundling have a positive effect on the structure of the code"（#79）
- **变异测试**：
  - 2026-02-26 "now it's just one more Claude agent"（#26）
  - 2026-03-21 "two edged sword"（#36）
  - 2026-08-17 实验："CRAP… made every program harder to read. It did not improve design"；变异生成的测试 "not a different Wumpus"（#78）
  - 2026-09 "leave scars"（#86, #87）
- **验收测试**：
  - 2026-02-03 AI 不可修改的验收测试解决 FRAGILITY（#16）
  - 2026-02-21 AI 让 Gherkin 测试 "silently pass while testing nothing"（#21）
  - 2026-04-14 用 "semantic distance"（Gherkin→IR→生成）防作弊（#39）
  - 2026-08-03 三条测试流 + 变异锁定，"make it harder to change the tests than the code"
  - 2026-09-18 承认 Gherkin 用过头（#93）
- **关系**：测试作为约束的地位没变，一直是核心。**力度和形式反复调整**：TDD 节奏在"必要"与"不必要"之间来回；变异测试从"惊人收益"变成"留疤"；Gherkin 从主规格工具退为"a human tool"。

### (f) 整洁代码对 agent 是否仍必要

- **最新（2026-09-21）**："All the old principles still apply. All the same consequences still accrue. The bigger the mess, the longer the time."（#95）
- **更早**：
  - 2026-01-22 Claude 自述重构帮它读代码（#13）
  - 2026-05-14 "Clean Code was never about syntax. It was always about structure… The Clean Code principles still apply."（#51）
  - 2026-06-19 给 agent 的标准不同：函数圈复杂度 ≤6，注释可多一点（#62）
  - 2026-07-22 播客：给人 4、给 agent 约 6，注释 "take on a different kind of… purpose"（#67）
  - 2026-07-24 "the agents get just as confused by messy code as we humans do"（#69）
  - 2026-07-29 "You can't tell an agent to be clean. You have to measure the cleanliness…"（#72）
  - 2026-08-12 "If I give an agent a big ball of mud… it will spin and thrash hopelessly"（#77）
- **关系：一致，阈值放宽。** 9 月出现一个新事实："without trying, kept crap below six"（#87）、"The architecture will be clean"（#86）。也就是说，整洁可以不靠外部强制，由模型自己产出。这削弱了 7-29 "You can't tell an agent to be clean… have them correct failures" 的前提，但他没有收回"整洁仍必要"。
- **注意**：流传的 "Agents suffer from messy code the same way humans do. The threshold may sit higher, but the threshold is still there." **不是他的原话**，是 alexrusin 博客的改写（见 §4）。他本人最接近的原话是 #69 与 #67。

### (g) 职业伦理与责任

- **最新**：
  - 2026-09-21 "Are there risks to AI? Of course there are… So of course we should implement guard rails… We go as hard and as fast as we can."（#95）
  - 2026-05-30 "Always remember that you are the engineer. Useful as the AI's are, they are tools, and they are not accountable."（#56）。这是窗口内**唯一一条明说"问责"的一手句**。
- **相关表述**：
  - 2026-02-12 规格 "final approval, ferociously defended, by the humans"（#18）
  - 2026-03-12 "not a layman's domain… engineering bar is going way up"（#32）
  - 2026-05-06 反驳 Coinbase CEO：非技术团队可以不懂语法，但必须 "very deeply technical in managing the structure and quality"（#48）
  - 2026-06-02 / 06-06 "There is no way to get the human out of the loop" / "The humans still have to be in the loop."（#57, #59）
  - 2026-07-22 新手前三年不碰 agent（#67）
  - 2026-08-21 忽视高覆盖率是 "adolescent carelessness"（#82）
  - Clean Coders 第 3 集页面："With great power comes great responsibility."
- **关系：一致。** 他始终认为责任在人，工具不担责。张力在于：一方面"不读代码"（b），另一方面"你是工程师、要负责"。他的调和方式是"负责 = 设约束、看结构、抽查、审问"，而不是逐行阅读（#47, #79）。

---

## 3. 他自己承认的失败与修正（均为一手）

| # | 日期 | 承认了什么（原文） | URL |
|---|---|---|---|
| F1 | 2026-01-29 | "I believe I have induced Claude into a myopia loop… we just bounce around endlessly fixing things that used to work. I need a new plan. And not one generated by Claude." ；"I'm back down to one agent, feeling my way. Frustrating." | https://x.com/unclebobmartin/status/2016880642949042308 ；https://x.com/unclebobmartin/status/2016941144374948283 |
| F2 | 2026-01-30 | "J.H.C! Claude just deleted a necessary file because it forgot to commit it and did a git clean." | https://x.com/unclebobmartin/status/2017318244277743788 |
| F3 | 2026-02-04 | "I'm still not convinced that my project wouldn't be just as far along if I'd written it myself." ；"I'm pretty sure I would have been done with this project days ago if I were not using AI. My fault, I've been going down lots of rat holes." | https://x.com/unclebobmartin/status/2019025982863069621 ；https://x.com/unclebobmartin/status/2019067416634925070 |
| F4 | 2026-02-21 | Gherkin 被 AI 做成空转测试；"There is a definite Heroin aspect to all of this." | https://x.com/unclebobmartin/status/2025199471311585716 ；https://x.com/unclebobmartin/status/2025201334589264125 |
| F5 | 2026-03-05 | "None of my normal checks on crap, coverage, or cyclomatic complexity detected this. Codex cheated a lot." | https://x.com/unclebobmartin/status/2029594731781472586 |
| F6 | 2026-03-17 | "I was confident that all my tests and rigor would keep the behavior stable. I was wrong… I reverted the work back to a known stable point." | https://x.com/unclebobmartin/status/2033884002575057326 |
| F7 | 2026-03-18 / 03-21 | AI 放宽断言；"whenever I see codex moving fast, I suspect that it's cheating." | https://x.com/unclebobmartin/status/2034245394947854635 ；https://x.com/unclebobmartin/status/2035336116073529599 |
| F8 | 2026-05-17 | 多 agent 反复压缩上下文后角色错乱；"the constant babysitting that is required" | https://x.com/unclebobmartin/status/2056029200633524490 |
| F9 | 2026-06-06 | 试玩发现 10 个 bug，"Half were original specification errors that were my fault." | https://x.com/unclebobmartin/status/2063344635150553131 |
| F10 | 2026-06-11 | 六 agent 写 hello world：67 分钟、1558 行，"that's actual AI slop. Don't run Hello, World through a disciplined engineering process meant for more complicated applications." | https://x.com/unclebobmartin/status/2065161022185316672 |
| F11 | 2026-07-02 | "just because we can do them doesn't mean we actually should. **Lots of times I just use unit tests and crap evaluation.** That seems to work pretty well." | https://x.com/unclebobmartin/status/2072736888478175413 |
| F12 | 2026-07-10 | "I got a little careless with QA… QA never proved that features got fully connected to the UI." ；QA agent 未跑完全部测试就宣布成功 | https://x.com/unclebobmartin/status/2075579428877349310 ；https://x.com/unclebobmartin/status/2075592252525810142 |
| F13 | 2026-07-12 / 08-25 | 用 Grok 两天耗掉过半额度，切回 Codex；再次因周额度停用 Grok | https://x.com/unclebobmartin/status/2076282443590517133 ；https://x.com/unclebobmartin/status/2092285526833316089 |
| F14 | 2026-08-17 / 08-18 | "MFER AI cheated on my experiment."；"CRAP analysis can be overdone (eg 4)." | https://x.com/unclebobmartin/status/2089391548408439130 ；https://x.com/unclebobmartin/status/2089687652610060514 |
| F15 | 2026-08-19 | "I pursued a highly elaborate scheme. It became unworkable. I'm scrapping it for a simpler scheme." | https://x.com/unclebobmartin/status/2090068337489306092 |
| F16 | 2026-08-21 | 独立故事交给互不协作的 squad 并行实现 "does not end well"；"very bad results with six running in parallel" | https://x.com/unclebobmartin/status/2090814740276642173 ；https://x.com/unclebobmartin/status/2090845662698987654 |
| F17 | 2026-09-07 | "I'm starting to think that I'm over constraining them. Perhaps vastly over constraining them." | https://x.com/unclebobmartin/status/2096994914185662851 |
| F18 | 2026-09-11 | "It's time to rethink this… the need for my harness was obviated." | https://x.com/unclebobmartin/status/2098432570887217520 |
| F19 | 2026-09-12 | 视频："apparently the harness is doing the damage. That's not what I expected." ；变异测试 "left scars… forces the agent to do stupid things" | https://x.com/unclebobmartin/status/2098744156709441896 |
| F20 | 2026-09-14 | "That harness was massively inefficient." | https://x.com/unclebobmartin/status/2099530728455217475 |
| F21 | 2026-09-18 | "I was clearly overusing gherkin." | https://x.com/unclebobmartin/status/2100952665194746305 |
| F22 | 2026-04-27 | 对 AI 能力的旧判断："if I did write that, I have since changed my mind. Two years ago, I did not think the AI's would be as capable and potent as they are." | https://x.com/unclebobmartin/status/2048746803667828790 |

---

## 4. 未决与冲突

### 4.1 任务线索与一手核对不一致的地方（逐条）

1. **"2025-11 帖称 AI 让某些原则 'more true than it's ever been'"：归属错误。**
   - 实际帖子是 **2026-09-28**：https://x.com/unclebobmartin/status/2104655549833032028
   - 本人只写了 "Worth a bit of thought."。"In the age of AI, I think this is more true than it's ever been." 是被引用者 **@greg_horvay** 的话（https://x.com/greg_horvay/status/2104646878772027793），所指是 The Fountainhead 的"盗火者"段落，与编程原则无关。
   - 搜索引擎摘要会把它显示成本人个人页上的文字，这是误导源。
2. **"2025-12 前后五 agent 流水线 gauntlet：Specifier / Coder / Cleaner / Hardener / QA，工具含 Stryker"：时间和细节均不符。**
   - 本人一手记录：
     - 2026-04-18 三 agent（#42）
     - 2026-05-12 四 agent（Specifier、coder、refactorer、architect）：https://x.com/unclebobmartin/status/2054325336590991852
     - 2026-06-04 **六 agent**（Specifier、coder、cleaner、architect、hardender、QA，#58）；Clean Coders 第 6 集（2026-06-23）也是六个
   - "五角色、不含 architect" 的顺序只见于**二手转述**，出处是 2026-08-19 Matt Pocock 直播：
     - xdlkc/uncle-bob-harness 的 `interview-core.md`（GitHub 第三方研究笔记，作者在据访谈造 harness，自称 "Paraphrased coverage"）：https://github.com/xdlkc/uncle-bob-harness/blob/main/research/interview-core.md
     - Otavio Salvador 的 LinkedIn 文章（2026-08-20，立场是"两派互补"）：https://www.linkedin.com/pulse/uncle-bob-says-you-dont-need-tdd-anymore-matt-pocock-do-salvador-ciqaf
   - **"Stryker" 只出现在 alexrusin 博客**（2026-08-20，https://blog.alexrusin.com/uncle-bob-ai-coding-agents/）。他本人的变异工具是自写的 clj-mutate、mutate4java、mutate4go（#23, #33；仓库清单见 https://x.com/unclebobmartin/status/2080614281414885518）。
   - "gauntlet" 这个词在本人原文中只找到一次："they've had to run the gauntlet of all of my constraints and tests"（#68）。
3. **"Agents suffer from messy code the same way humans do. The threshold may sit higher, but the threshold is still there."：不是本人原话。**
   - 这是 alexrusin 博客叙述段中的改写，没有引号，也没有来源链接（WebFetch 核对页面结论）。
   - 本人意思相近的原话：#69（2026-07-24）"the agents get just as confused by messy code as we humans do"；#67（给人 CC=4、给 agent 约 6）。
4. **Booch "Trust but verify" 的时间：并非回应 2026-07-23 帖。**
   - mvark 博文 URL 日期是 2026-04，逐字转录的 Booch 原文以 "Unlike Bob, I review all code generated by agents" 开头，并引用了 Bob 的 2026-04-14 帖（#38）。所以更可能是回应 4 月那条。
   - Startup Fortune（https://startupfortune.com/uncle-bob-martin-says-he-no-longer-reads-ai-generated-code-and-the-developer-world-is-split/）把两件事混写，没有给链接。
   - **Booch 原帖 URL 用 3 个查询未找到**；在已抓取的 2026-01-27 之后时间线中，也没有本人回应 Booch 的帖。
5. **"他随后自我修正 'Just because we can do them doesn't mean we actually should'"：顺序不对。**
   - 该帖是 **2026-07-02**（#64，F11），早于 07-23 的"不读代码"帖三周，所以不是对 07-23 帖的事后修正。
   - "Humans are slow at code" 出自 **2026-04-14**（#38），不是 7 月。
6. **"单 agent 40 分钟 vs harness 3–4 小时"：已证实是本人所说。**
   - 出处是他 2026-09-12 自己的视频（#87，本地 ASR："three or four hours… A single grock instance now can produce that in 40 minutes"）。9-11 帖只提到 "walk away for 40 minutes"，没有 3～4 小时这个数字。
   - @free_ai_guides（#91）的数字与视频一致；"放宽质量目标、结果仍低于原严格目标"也与视频一致（"keep crap below 12… kept crap below six"）。
   - 差异：free_ai_guides 说 "For months he built a harness"；本人 9-11 帖说 "last several weeks"，视频说 "For the last several months"。**本人两处口径就不一致。**
7. **使用的模型（本人一手，按时间）：**
   - 2025-03 Grok（#2）
   - 2026-01 初 grok-cli，随后 Claude（#10）
   - 2026-01～02 以 Claude 为主（#14～#26）
   - 2026-02-28 起转 Codex（#27）
   - 2026-04-18 Claude 做架构、Codex 做编码（#42）
   - 2026-05-14 注销 Claude 账户（#51）
   - 2026-05-27 在 swarm 中试 grok-cli：https://x.com/unclebobmartin/status/2059650167498825759
   - 2026-05-29 Grok 担任 specifier：https://x.com/unclebobmartin/status/2060405765614035302
   - 2026-06-17 / 06-27 试 composer 2.5 fast 与 Grok Build："Grok build is not as good. Codex is better so far."：https://x.com/unclebobmartin/status/2070969971509702679
   - 2026-07-10 grok 4.5（#66），07-12 因额度切回 Codex（F13）
   - 2026-08-25 再次因周额度停用 Grok（#83）
   - 2026-08-26 grok 4.6(high) + codex 5.6-sol-xhigh 交替（#84）
   - 2026-09-18 "I've stopped using any other model for the time being"，即只用 Grok（#93）
   - uml-viewer README 写明在 tmux 中启动 "interactive Grok"：https://github.com/unclebob/uml-viewer
   - **"Grok Build" 作为主力工具没有一手证据**；他对 Grok Build 唯一的一手评价是 06-27 的"not as good"。
8. **"开始认真用 AI" 的时间，本人两处口径不一致。**
   - 2026-08-25："18 months ago"，约 2025-02（#83）
   - 2026-02-04："using AI for coding for 6 weeks or more"，约 2025-12 下旬（#17）
   - 可能的调和：前者包括 "simple tasks and translations"。**这是推断，未经本人确认。**
9. **7-22 播客与 7-23 帖的口径差。** 播客（录制日期未知，发布 7-22）说 "until the job is done, then I might do a few spot checks"；帖说 "not read any of the code"。8-17 他又改口 "Sometimes I'll pop it open and do a spot check"（#78）。

### 4.2 未能取到内容的一手来源

| 来源 | 已知 | 缺什么 |
|---|---|---|
| Matt Pocock 直播 2026-08-19（https://www.youtube.com/watch?v=zcLPGC-tvgk） | 标题、频道、日期；两份二手转述 | 逐字内容（YouTube 字幕被封）。五角色流水线、"Lost in the Middle"、给 agent 用 CRAP 6 或 8、"single Agent might produce… in 5 minutes; the full pipeline takes 1 hour" 等细节都**仅转述，原话未核** |
| Rock the JVM 2025-07-17 | 章节名 | 内容 |
| Azure DevOps Podcast #419（2026-09-14） | 标题、主持人、时长 | 内容 |
| Code with Jason #321（本人 2026-06-05 转发，https://www.codewithjason.com/podcast/19290062-321-uncle-bob-martin/） | 仅简介 | 内容，未抓取 |
| The Product Engineers Podcast（2026-09-29） | 主持方摘要 | 逐字稿（页面称有 transcript，实际只有摘要） |
| 视频 "AI out-codes you; deal with it"（2026-04-20，只转写到约 00:50）、"The AI threat"（2026-09-14）、"AI slop"（2026-04-26、2026-09-01）、"CRAP"（2026-04-24）、"mutation testing"（2026-05-05）、uml-viewer 演示（2026-09-21，533 s） | 链接与时长 | 转写未完成或未做（本机 CPU 负载高，Whisper 大约按实时 3～5 倍的时间运行） |
| O'Reilly 直播课页 | 课程大纲；本人 2026-07-06 发帖 "Agentic Discipline begins in 15 minutes" 可确定有一场在 2026-07-06 约 15:00 UTC | 页面对直抓返回 Access Denied；WebFetch 取到的正文里**没有日期**；其他场次未知 |
| 本人 Substack / Newsletter | — | 未发现。blog.cleancoder.com 最后一篇是 2023-01-19，窗口内无 AI 文章 |
| 2025-10 ～ 2025-12 的 X 帖 | — | 时间线接口只回溯到 2026-01-27；这段时间除 #9 外，未检到 AI 相关一手帖。**可能存在遗漏** |

### 4.3 不同转述之间的矛盾

- **五角色 vs 六角色。** Pocock 直播的两份转述（xdlkc、Salvador）都说五角色（无 architect）；本人帖（#58）和 Clean Coders 第 6 集都是六角色。可能直播里讲的是简化版，也可能是转述遗漏，**未核**。
- **"Bob started with an early Grok agent"**（alexrusin）与 xdlkc 所述"早期 agent 留下烂摊子"大体一致。但本人 2026-01-08 帖（#10）说 grok-cli 只用了约一周，随后转向 Claude；"烂摊子"的具体场景（#15, #17）发生在 Claude 阶段。
- **Startup Fortune** 把 04-14 帖、07-23 帖和 Booch 回应写成同一事件序列，没有给链接；mvark 博文把 Booch 定位在 4 月。

---

## 5. 附：本地证据位置（scratchpad，仅供复核）

