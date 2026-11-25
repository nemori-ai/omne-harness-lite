---
name: skill-authoring
description: Write, try and publish a Skill, a folder whose SKILL.md teaches an agent one kind of task. Use it to keep a way of working for reuse, to change a held Skill, or to fix a Skill that agents miss or misuse.
---

# Writing a Skill

A Skill is a folder. Its `SKILL.md` tells an agent how to do one kind of task. Other files sit beside it: references to read when needed, scripts to run, templates to copy. You write the folder with Files, publish it with `OmneExtensions`, and find and read it with `Skills`. The next `Skills search` in this session finds a Skill you published.

`OmneExtensions help` with `name: publish` and `category: skill` prints the short checklist of this guide.

## 1. Decide whether it is worth a Skill

Make a Skill for a way of working that will come back: a procedure with steps, a format, checks, or scripts. A one-off task, or a fact that fits in one sentence, needs no Skill. Tell the user so, and do the task.

## 2. Settle the intent

Answer four questions before you write. Take the answers from the conversation first. Ask the user only for what is still missing.

1. What will an agent be able to do with this Skill?
2. When should an agent reach for it? Write down what a user would say.
3. What does a good result look like?
4. Does it need a script, or are instructions enough?

## 3. Write the folder

Write a new folder in the working directory, for example `work/<name>/`:

- `SKILL.md`: a frontmatter with `name` and `description`, then the body.
- `references/`: longer material that the body points to.
- `scripts/`: programs that the agent runs with Shell.
- `.omne/skill.json`: the tools that the Skill needs.

The exact format, the limits and every refusal are in `references/format.md`.

An agent meets a Skill in three steps. Put each kind of material where the agent needs it:

1. The name and the description. Search results show them, and so does the system prompt when a definition keeps the Skill resident. The agent chooses the Skill from these alone.
2. The body of `SKILL.md`. The agent reads it with `Skills read` after it chooses the Skill.
3. The other files. The agent reads them with `Skills read_file`, or runs them with Shell, when the body says so.

## 4. Write the description

The description decides whether an agent finds the Skill and chooses it. Say what the Skill does and when to use it, in the words that a user would use. Keep it under 1024 characters. Examples and the common faults are in `references/writing.md`.

## 5. Write the body

Write instructions in the imperative. Give the reason for each rule, so that the agent can apply it to a case you did not foresee. Show one example of a good result. Keep the body short: move long material into `references/`, and say in the body when to read which file. More in `references/writing.md`.

## 6. Scripts

Put scripts in `scripts/`. `Skills read` gives `directory=<absolute path>`. Run a script with Shell by that path, for example `node <directory>/scripts/run.mjs`. Skills itself runs nothing. Write in the body what each script takes and what it prints.

A session that works in a workspace reaches that directory only when the tenant's setting for files outside the workspace allows reading. When Shell refuses the path for that reason, run the copy that you wrote in the workspace. Tell the user that the setting keeps the published copy out of reach.

## 7. Tools the Skill needs

Declare each tool that the steps of the Skill use in `.omne/skill.json`. When a session lacks one, `Skills search` marks the Skill `[needs: ...]`, and `Skills read` adds `missing-tools=...`. The text is still given, so the agent can tell the user what is missing.

## 8. Publish

1. Ask `OmneExtensions impact` with `category: skill` and `dir`. It says what the publish would change, and it changes nothing.
2. Call `OmneExtensions publish` with an `id` of your own, `category: skill`, `name` and `dir`. Keep the id. When an answer is lost, `OmneExtensions result` with that id tells what the publish did.

A refused publish says why, as `code: detail`. Fix that and publish again. `references/format.md` says what each code means.

The deployment brings some Skills that no tenant may replace, this one among them. A publish under such a name is refused. Choose another name.

## 9. Try it

Try the Skill in this session, right after the publish:

1. `Skills search` with the words that a user would say. The Skill should be on the first page. When it is not, change the description.
2. `Skills read` it. Check that it says `source=tenant` and the version that the publish gave.
3. Do two or three real tasks with it. Follow the body as it is written, and run its scripts.
4. Note each place where you hesitated, guessed or went wrong.

How to judge a try, and when to stop, is in `references/trying.md`.

## 10. Change it

Edit the folder and publish it again with a new id. That makes a new version. The next search or read in any session of the tenant gets it. When you do not have the folder of a held Skill, write it out first with `OmneExtensions export`.

## 11. Keep it safe

Write only what the user asked for and would expect to find. Keep keys, passwords and tokens out of every file: any session of the tenant can read a Skill.
