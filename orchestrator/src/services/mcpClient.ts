import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HttpError } from "../utils/errors.js";
import { logEvent } from "../utils/logger.js";

const DEFAULT_SERVER_NAME = "diakonos-assist-mcp-client";
const DEFAULT_SERVER_VERSION = "1.0.0";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

const resolveDefaultServerScript = (): string =>
  resolve(currentDirectory, "..", "..", "..", "mcp-server", "dist", "index.js");

export class LocalMcpClient {
  private readonly client = new Client({
    name: DEFAULT_SERVER_NAME,
    version: DEFAULT_SERVER_VERSION,
  });

  private transport: StdioClientTransport | null = null;
  private connected = false;

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const serverScript =
      process.env.MCP_SERVER_SCRIPT?.trim() !== ""
        ? resolve(process.cwd(), process.env.MCP_SERVER_SCRIPT as string)
        : resolveDefaultServerScript();

    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverScript],
    });

    logEvent("subrequest", {
      service: "mcp-server",
      action: "connect",
      command: process.execPath,
      serverScript,
    });

    try {
      await this.client.connect(this.transport);
      this.connected = true;

      logEvent("subresponse", {
        service: "mcp-server",
        action: "connect",
        status: "connected",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      logEvent("subrequest_failed", {
        service: "mcp-server",
        action: "connect",
        error: message,
      });

      throw new HttpError(502, "MCP server connection failed.", {
        service: "mcp-server",
        serverScript,
        error: message,
      });
    }
  }

  public async listTools() {
    await this.connect();

    logEvent("subrequest", {
      service: "mcp-server",
      action: "list_tools",
    });

    try {
      const result = await this.client.listTools();

      logEvent("subresponse", {
        service: "mcp-server",
        action: "list_tools",
        toolCount: result.tools.length,
      });

      return result.tools;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      logEvent("subrequest_failed", {
        service: "mcp-server",
        action: "list_tools",
        error: message,
      });

      throw new HttpError(502, "Failed to list MCP tools.", {
        service: "mcp-server",
        error: message,
      });
    }
  }

  public async callTool(name: string, args: Record<string, unknown>) {
    await this.connect();

    logEvent("subrequest", {
      service: "mcp-server",
      action: "call_tool",
      tool: name,
      args,
    });

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      logEvent("subresponse", {
        service: "mcp-server",
        action: "call_tool",
        tool: name,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      logEvent("subrequest_failed", {
        service: "mcp-server",
        action: "call_tool",
        tool: name,
        error: message,
      });

      throw new HttpError(502, "MCP tool call failed.", {
        service: "mcp-server",
        tool: name,
        error: message,
      });
    }
  }

  public getConfiguration(): { command: string; serverScript: string } {
    const configuredPath =
      process.env.MCP_SERVER_SCRIPT?.trim() !== ""
        ? resolve(process.cwd(), process.env.MCP_SERVER_SCRIPT as string)
        : resolveDefaultServerScript();

    return {
      command: process.execPath,
      serverScript: configuredPath,
    };
  }

  public async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.close();
    this.connected = false;
    this.transport = null;
  }
}

export const mcpClient = new LocalMcpClient();
