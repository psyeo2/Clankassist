import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "diakonos-assist-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "system.health",
  {
    description: "Return the current MCP server status.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: "MCP server is running.",
      },
    ],
    structuredContent: {
      status: "ok",
      server: "diakonos-assist-mcp-server",
      integrations: "pending",
    },
  }),
);

server.registerTool(
  "system.echo",
  {
    description: "Echo a message back to the caller.",
    inputSchema: {
      message: z.string().min(1).describe("Message to echo back to the caller."),
    },
  },
  async ({ message }) => ({
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    structuredContent: {
      echoed: message,
    },
  }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Diakonos Assist MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
