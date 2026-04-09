import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";

import { loadCatalogSnapshot, type CatalogToolDefinition } from "./catalog.js";
import { executeTool } from "./executor.js";
import { jsonSchemaToZodShape } from "./schema.js";

dotenv.config();

const createServer = (): McpServer =>
  new McpServer({
    name: "diakonos-assist-mcp-server",
    version: "1.0.0",
  });

const registerBuiltinTools = (server: McpServer, catalogSource: "builtin" | "postgres"): void => {
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
        catalogSource,
        integrations: "generic_executor",
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
};

const registerCatalogTools = (server: McpServer, tools: CatalogToolDefinition[]): void => {
  for (const tool of tools) {
    if (tool.name === "system.health" || tool.name === "system.echo") {
      continue;
    }

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: jsonSchemaToZodShape(tool.inputSchema),
      },
      async (args) => {
        const result = await executeTool(tool, args as Record<string, unknown>);

        return {
          content: [
            {
              type: "text",
              text: result.contentText,
            },
          ],
          structuredContent: result.structuredContent,
        };
      },
    );
  }
};

async function main(): Promise<void> {
  const catalog = await loadCatalogSnapshot();
  const server = createServer();

  registerBuiltinTools(server, catalog.source);
  registerCatalogTools(server, catalog.tools);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Diakonos Assist MCP server running on stdio (catalogSource=${catalog.source}, tools=${catalog.tools.length}, resources=${catalog.resources.length})`,
  );
}

main().catch((error: unknown) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
