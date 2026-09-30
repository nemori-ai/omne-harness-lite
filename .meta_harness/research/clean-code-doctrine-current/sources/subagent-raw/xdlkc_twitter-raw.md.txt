# Raw @unclebobmartin posts (2025-08-24 → 2026-08-24)

Pulled 2026-08-24. Not exhaustive. Paraphrase for public output; keep short quotes. Label every claim **Twitter**. Do not treat these as interview words.

Account: Uncle Bob Martin (@unclebobmartin), Software Craftsman. User id 25575706.

## 2026-08 (days before this project)

- 2026-08-23 https://x.com/unclebobmartin/status/2091530576666710227
  "Probably not. I don't want a lot of chatter between agents. I fear the "fixed point" problem. I also don't want to burn a load of tokens that way. My preference is to have focussed work units that are independent of each other and who build components the communicate through a narrow focussed interface."

- 2026-08-23 https://x.com/unclebobmartin/status/2091530252803531107
  "My current plan for a squad based system is to use six-packs or 4-packs (or even 2-packs) as the workers. The squad leader divides the project into sub-projects and assigns them to the packs. It also designs the interfaces between the sub projects. The trick is going to be keeping those interfaces narrow and focussed so that the packs do not step on each other. Typical project lead stuff."

- 2026-08-23 https://x.com/unclebobmartin/status/2091511895324795292
  "Don't look at swarm-forge as a drop-in product that you can use. Look at it (and the many other harnesses out there) as templates that you can customize to your particular needs. One of the great powers of AI agents is that you can point them at an existing project and tell them to create something like it, but with a bunch of exceptions and differences. In the end you wind up with something tuned to you, not to me."

- 2026-08-22 https://x.com/unclebobmartin/status/2091146331892944975
  "Six-packs to a pretty good job. So... I'm thinking a good model for a squad would be a set of six-packs (or 4-packs in some cases) that work on independent issues, with a supervisor that designs the interfaces between them, integrates, and runs integration tests. Hmmm."

- 2026-08-21 https://x.com/unclebobmartin/status/2090877283305234651
  "I have a means of sending messages between agents. It's fast and reliable. That's not the issue. Collaboration requires a lot of discussion and compromise. The last thing I want is a gaggle of agents honking at each other like a flock of geese."

- 2026-08-21 https://x.com/unclebobmartin/status/2090851553527681288
  "subagents work ok. Though my impression is that with a group of subagents leave all the writing to one, while the others are readers. ... Give a squad of agents N stories, and have them assemble that into a cogent whole by working in parallel. Many writers. Lots of merges. Lots of stepping all over each other."

- 2026-08-21 https://x.com/unclebobmartin/status/2090848397846565150
  "They don't know enough about what each other is doing, so they create inappropriate interfaces, double up on functionality, create independent test access... And then there is the horrible cascade of merges."

- 2026-08-21 https://x.com/unclebobmartin/status/2090846406181322783
  "having one agent fix another agent's prompt is spooky."

- 2026-08-21 https://x.com/unclebobmartin/status/2090845662698987654
  "Wait. One agent makes us go faster. Two makes us go even faster. But does that scale linearly? I've had good luck with six arranged in an assembly line. I've had very bad results with six running in parallel."

- 2026-08-21 https://x.com/unclebobmartin/status/2090818167874449438
  "CRAP and MUTATE usually improve the tests considerably."

- 2026-08-21 https://x.com/unclebobmartin/status/2090814740276642173
  "Breaking a problem up into a bunch of independent stories that are implemented separately by a squad of agents that do not collaborate, does not end well. If only we could get the agents to pair..."

- 2026-08-21 https://x.com/unclebobmartin/status/2090786479744160075
  "From a research point of view, agents are an interesting tool. Every agent is in an equivalent state once started. So we can use them to compare different approaches, disciplines, and standards without the vagaries of human variability and human memory."

- 2026-08-21 https://x.com/unclebobmartin/status/2090758607302267226
  "Up until AI, driving coverage high, and making it real, had been considered so laborious as to be impractical for most projects. But AI trivializes the labor. High, meaningful coverage is within easy reach of even the most casual projects. So the question is no longer about the relative necessity of high coverage. Nowadays it's tantamount to adolescent carelessness to ignore it."

- 2026-08-19 https://x.com/unclebobmartin/status/2090077791278489800
  "It is amazing how much work it is to wrestle these agents to my will. Don't get me wrong, it's crazy productive. But it's also a lot of hard, focussed work. All my software engineering and problem solving skills are brought into play -- even though I barely look at the code."

- 2026-08-19 https://x.com/unclebobmartin/status/2090068337489306092
  "I'm building an agent harness based on a squad of agents and a squad leader. I pursued a highly elaborate scheme. It became unworkable. I'm scrapping it for a simpler scheme."

- 2026-08-18 https://x.com/unclebobmartin/status/2089687652610060514
  "For me the big takeaway ... is that TDD and bundling have a positive effect on the structure of the code. That CRAP analysis can be overdone (eg 4). And that the tests produced by mutation are not significantly different to justify the premise that negative tests are superior to intentional positive tests. That last was the goal of this experiment."

- 2026-08-18 https://x.com/unclebobmartin/status/2089685418828538284
  "Testing is not sufficient. You need to remain situationally aware. I do this by watching the process and probing the artifacts. I even spot check some of the code and look carefully at the architecture using appropriate visualization tools. In short, I watch it like a hawk."

- 2026-08-17 https://x.com/unclebobmartin/status/2089475660116877769
  "Certainly not a classic, line by line, review. I typically don't look much at the code itself. Sometimes I'll pop it open and do a spot check. Most of the time I'm reviewing the output of the tools that measure code quality, coverage, and conformance to requirements."

- 2026-08-17 https://x.com/unclebobmartin/status/2089449442089025936
  Hunt the Wumpus experiment: eight writes from empty; four testing disciplines × CRAP-below-4 on/off; same 25 acceptance cases; CRAP split functions and added tests, raised coverage, made programs harder to read, did not improve design; mutation wrote a second suite aimed at operators, not a different Wumpus. Acceptance never distinguished any of this.

- 2026-08-17 https://x.com/unclebobmartin/status/2089140250773696905
  "TDD tests are intentional. They are are "positive". Mutations tests are reactions to testing gaps. They are negative. Is there an advantage to a wholly negative test suite?"

- 2026-08-16 https://x.com/unclebobmartin/status/2088993782477811904
  "My son Justin has an interesting idea. What if you use TDD to get a module working. Then delete all the tests. And then run the mutation tester and kill all the mutants. Does that make a more efficient test suite?"

- 2026-08-12 https://x.com/unclebobmartin/status/2087565882079711599
  "If you go to the squad branch of https://github.com/unclebob/swarm-forge you’ll see what I’ve been spending a lot of time on. It’s still in progress, but early results are promising."

- 2026-08-12 https://x.com/unclebobmartin/status/2087563797632278592
  "The ability to wrangle these immensely powerful, yet dangerously capricious, agents into a productive harness that produces high quality systems — is the software engineering challenge of this decade."

- 2026-08-12 https://x.com/unclebobmartin/status/2087538351175799108
  "I just tell my agents to write failing tests first and write the production code that passes them second. They do this tolerably well -- just like people. Then I make sure they run coverage, CRAP, and Mutation tests to drive the test coverage to as close to 100% as possible. I also have the agents build three kinds of tests. Unit tests, which I don't look at much, Gherkin acceptance tests that I subject to slightly more scrutiny, and slightly more scrutinized QA procedures that test the system at the UI. Without unit tests I have found that the agents create too many regressions. ... Without the acceptance test I have found that the agents lose the separation between UI and business rules. ... Without the QA procedures I find that the agents deliver perfectly good software that works at the API, but not at the UI."

- 2026-08-12 https://x.com/unclebobmartin/status/2087502674648305858
  "If I give an agent a big ball of mud, and ask it to make a change, it will spin and thrash hopelessly. If I give an agent a nicely partitioned and clean project, I can ask it to make changes all day long, and it has no trouble. The rules that I find to be most useful are intense test coverage, three strands of tests: unit tests, acceptance tests, and QA tests. Small well named functions (although not as small for agents as for humans.) Well partitioned modules. Appropriate dependency structure. And the keen eye of the supervising human doing spot checks over all of it."

- 2026-08-11 https://x.com/unclebobmartin/status/2087240459949125984
  "I spot check the code looking for general conformance. The tools I use (CRAP, MUTATE, DRY, etc.) do a lot to constrain the agents to make the code clean."

- 2026-08-10 https://x.com/unclebobmartin/status/2086862545319612838
  "I wish it were possible to prompt good code -- but that's not the way the models work."

- 2026-08-08 https://x.com/unclebobmartin/status/2086141128768668111
  "The issue is that an Agile project that uses AI will have to shrink their Sprint size to one day (or less) in order to keep the feedback cycle meaningful."

- 2026-08-08 https://x.com/unclebobmartin/status/2086125060104810625
  "Let the agents write them. You spot check them. I use three separate threads of tests. Unit tests, gherkin tests, and QA procedures. The three of them together keep everything honest. In order to deviate from the desired path, the agent would have to modify more than one source file."

- 2026-08-06 https://x.com/unclebobmartin/status/2085351669433303421
  "Don’t tell an agent to calculate code coverage, or cyclomatic complexity. Have the agent run deterministic tools that calculate those metrics. Don’t tell the agents to mutate the code and check for survivors. Run deterministic mutation testers that do that. Don’t tell an agent to follow a procedure. Don’t give it a long chain of if/else statements to follow. It will lose track of them. Instead create an executable finite state machine that directs the agents actions."

- 2026-08-04 https://x.com/unclebobmartin/status/2084638878548304046
  Squad orchestration: squad leader + workers (analysts, reviewers, gherkin authors, QA authors, implementers, cleaners, code reviewers, hardeners, QA testers, architects, senior implementers). "There is a fixed workflow from themes to stories to gherkin and QA, to code, unit tests, and acceptance tests, to cleaned code, to hardened code, to QA'd code, to architecture. This fixed workflow can be described by a static FSM." Agents built the FSM, a simulator, jittered delays/failures, monte-carlo. "The agents never would have thought of that kind of testing regime."

- 2026-08-03 https://x.com/unclebobmartin/status/2084247338613162240
  "My strategy to prevent that is to make it harder to change the tests than the code. Towards that end I create three streams of tests at three different levels. Unit tests in code, acceptance tests in gherkin. QA tests in markdown. The first two are mutation tested to tightly lock them into the existing code."

## 2026-07

- 2026-07-30 https://x.com/unclebobmartin/status/2082850576832905657
  "TDD is a human discipline. I don't expect agents to follow it. I DO expect agents to write unit tests as carefully and comprehensively as a human would, and I ensure that by running coverage, crap, and mutation tests. The reason agents don't have to follow the tight human TDD loop is that they have better and bigger short term memories."

- 2026-07-24 https://x.com/unclebobmartin/status/2080622218527084961
  "Many people have marveled at the fact that I don’t review the code anymore. ... It’s just that now I have tools that help me to enforce my agents to produce clean code and follow those principles."

- 2026-07-23 https://x.com/unclebobmartin/status/2080257779395154409
  "My current strategy is to not read any of the code written by my agents. That’s the only way I can take advantage of their productivity. What I do instead is to surround the agents with extreme constraints. Unit tests, gherkin tests, QA procedures, quality metrics, mutation testing, test coverage, and a plethora of others."

## 2026-04

- 2026-04-14 https://x.com/unclebobmartin/status/2044114698451476492
  "I don’t review code written by agents. I measure things like test coverage, dependency structure, cyclomatic complexity, module sizes, mutation testing, etc. Much can be inferred about the quality of the code from those metrics. The code itself I leave to the AI. Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level."

## 2026-03

- 2026-03-13 https://x.com/unclebobmartin/status/2032562619849101804
  Three-day campaign: JVM language, wiki with Gherkin ATDD + internal web server, Empire game updates, crap4java + mutate4java, differential mutation. "strict TDD, ATDD, Crap, and Mutate workflow that forced coverage into the high 90s, kept Crap below 8, and split any files with more than 50 mutation sites." Wiki and AIR-J "worked first time." Workflow "Probably. Probably a lot" slower. Semantic stability.

## 2026-02

- 2026-02-26 https://x.com/unclebobmartin/status/2027126394510069933
  "I always thought that mutation testing was a good idea; but it was always hard to afford. Now it's just one more Claude agent working down a list. And the benefit is amazing. Lots of coverage. Lots of overloading. Lots of refactoring and separation of concerns. Astounding."

## 2025-07 and earlier (still in the year window)

- 2025-07-17 https://x.com/unclebobmartin/status/1945820624318075240
  YAGNI vs hammock / Agile vs waterfall: always a mix. "If you don’t plan, you die. If you don’t react, you die."

- 2025-06-25 https://x.com/unclebobmartin/status/1937839430821085604
  "I have found AI to be moderately helpful with TDD. The most critical thing to remember is that TDD is double entry bookkeeping. The human must be the pilot of both sides. Tests must not be derived from code, and code must not be derived from tests."

## Related artifacts to inspect if useful
- https://github.com/unclebob/swarm-forge (squad branch)
- Hunt the Wumpus negative-test experiment repo (linked from 2026-08-17 post; find via that tweet)
