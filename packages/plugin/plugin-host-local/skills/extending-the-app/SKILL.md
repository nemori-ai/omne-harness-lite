---
name: extending-the-app
description: Extend this app itself with a plugin, such as a page, a server protocol, a tool, a skill or a look, published for this tenant while the app runs. Use when the person asks to add to the app or change what it can do or show, not to change a project of their own.
---

# Extending the app

A plugin is one directory with `plugin.json` at its root. Each member puts one item on one point of the app, on the server or on the client. Each point says what it accepts and whether a plugin may put there. This skill gives the method and whole examples. The rules come from the two tools.

## The method

1. Find the place. Call `OmneExtensionPoints find` with the person's words, or walk `tree` level by level. `show <point>` tells you these things about a point: whether plugins may put there, and why not; what a member gives; a member to copy; what your code is called with. For `plugin.ports` it also tells how to ask for a port.
2. Write the directory in the workspace with Files: `plugin.json` and the files its members name. Copy the member `show` gave. Change the values, not the field names.
3. Before publishing, call `OmneExtensions impact` with category `plugin` and `dir`. It says what would take effect and what would not, and why.
4. Publish with `OmneExtensions publish`. Give category `plugin`, the name in `plugin.json`, and `dir`.
5. Check with `OmneExtensions show`, category `plugin` and the name. It lists each member and whether it is in effect, with the reason when it is not.
6. See it work before you say it is done. A member in effect can still do the wrong thing. Look with `AppView` at what the person will see. For a part that reacts to something, make that thing happen first, for example a short conversation, and then look. Fix and publish again until it does what the person asked.
7. To undo, `disable` keeps the plugin and stops it. `remove` drops it.

`OmneExtensions help` with name `publish` and category `plugin` gives the fields of `plugin.json`.

## A page and its server side

A page is drawn as soon as the plugin loads, hidden until the person opens it, so its first calls run before anyone looks. Its protocol can reach the app a moment after the page. Until then a call answers `{ outcome: 'unavailable' }`. Read that as not yet: ask again after a short wait, as `notes-page` does, and keep an error for the other outcomes.

## Examples

Each directory is a whole plugin. A test of the release publishes it as it is here. Read the files with Skills `read_file`.

| Directory | What it adds |
| --- | --- |
| `examples/weather-protocol/` | A server protocol `weather/v1` with one read operation, on `access.protocols`. |
| `examples/send-button-look/` | A look on the client: the accent token of the app, and the style of the send button. |
| `examples/notes-page/` | A page in the sidebar that shows notes its own server side keeps: a client page that needs `notes/v1`, and the server protocol `notes/v1`. The page asks again until the server side answers. |
| `examples/page-reader/` | A tool the agent calls in a session: `reader__read` on `tool.entry-sources`, which reads a page through the port `web`. The first call asks the person, as any tool of a plugin does. |

To start from one, copy its directory into the workspace, give it a new name in `plugin.json`, and change what it does.
