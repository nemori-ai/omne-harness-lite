# Writing the description and the body

## The description

An agent sees the description before anything else, in search results or in the system prompt. It chooses the Skill from the description alone. So the description carries two things: what the Skill does, and when to use it.

- Start with what it does, as a verb: "Write the weekly report from the notes of the week."
- Then say when: "Use when asked for a weekly report, a week summary or a status update."
- Use the words that a user would say. A user asks for "a status update", not for "an aggregation of notes".
- Name each distinct case once. Synonyms of one case add length, not reach.

Weak: "Helps with reports." It says neither what kind of report nor when.

Strong: "Write the weekly report from the notes of the week. Use when asked for a weekly report, a week summary or a status update."

## The body

- Write in the imperative: "Run the collector", not "The collector can be run".
- Order the steps as the agent does them. End each step with how the agent knows the step is done.
- Give the reason with a rule. The reason lets the agent handle a case that the rule does not name. Example: `Keep each item to one line, because people read the report on a phone.`
- State what to do, not what to avoid. When a hard limit must be stated as a limit, pair it with the right action.
- Show one example of a good result, short and complete.
- Keep `SKILL.md` short. Put long tables, full examples and background in `references/`. In the body, say when to read which file: "For the format of each section, read references/sections.md."
- Name the scripts that the agent runs, what each takes and what each prints.

## Before you publish

Read the body as an agent that has never seen the task. Mark each sentence where that agent would have to guess. Make each one exact.
