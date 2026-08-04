# mcp-worldbank-projects

World Bank Projects & Operations MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_projects` | Search World Bank development projects by free text and/or country and status. Returns financing, sectors, lending instrument, approval/closing dates, and status for each match. Keyless. Provide query and/or country_code. |
| `get_project` | Get the fuller record for a single World Bank project by its project id (e.g. "P006553", "P501648"): financing breakdown, implementing agency, borrower, sectors, themes, and the project development objective / abstract. Keyless. |
| `projects_by_country` | List a country's World Bank projects (newest board-approval first) filtered by status. Returns the compact project shape with financing, sectors, and dates. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "worldbank-projects": {
      "url": "https://gateway.pipeworx.io/worldbank-projects/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Worldbank Projects data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
