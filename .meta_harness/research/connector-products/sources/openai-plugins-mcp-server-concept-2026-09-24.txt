# MCP server

> For the complete documentation index, see [llms.txt](/llms.txt). Markdown versions of documentation pages are available by appending `.md` to the page URL.

The [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) is an open
specification for connecting AI clients to external tools and data. A plugin
can include an MCP server when it needs to read live information, take actions,
or integrate with another service.

The MCP server is optional. A plugin that only provides instructions and
resources can consist of [skills](https://developers.openai.com/plugins/concepts/skills) alone.

## What an MCP server provides

An MCP server can expose:

- **Tools:** Functions the model can call with structured inputs.
- **Resources:** Data or content the client can read.
- **Prompts:** Reusable prompt templates.
- **Instructions:** Server-wide guidance for using its capabilities.

Plugins primarily use tools. Each tool has a name, description, input schema,
and optional output schema. These fields help the model decide when to call the
tool and how to use its result.

## How tool calls work

When a user asks for something that matches a tool:

1. The client discovers the tools exposed by the MCP server.
2. The model selects a tool and supplies arguments that match its input schema.
3. The server validates the request, performs the operation, and returns a
   result.
4. The model uses the result to continue the conversation.

Tool results should work without custom UI. Return concise text or structured
content that gives the model enough information to answer the user. An MCP
server can also return an optional UI resource for clients that support
[MCP Apps](https://developers.openai.com/plugins/build/chatgpt-ui#start-with-mcp-apps).

## Transport and authorization

Deploy production MCP servers at stable HTTPS endpoints using the streamable
HTTP transport. If tools access private data or perform actions for a user,
protect the server with the authorization flow defined by the MCP
specification.

For protocol details, see the
[MCP specification](https://modelcontextprotocol.io/specification). The
[Python](https://github.com/modelcontextprotocol/python-sdk) and
[TypeScript](https://github.com/modelcontextprotocol/typescript-sdk) software
development kits provide server implementations and helpers.

## Next step

After defining the tools your plugin needs,
[build the MCP server](https://developers.openai.com/plugins/build/mcp-server).