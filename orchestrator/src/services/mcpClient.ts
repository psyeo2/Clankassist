import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

    await this.client.connect(this.transport);
    this.connected = true;
  }

  public async listTools() {
    await this.connect();
    const result = await this.client.listTools();
    return result.tools;
  }

  public async callTool(name: string, args: Record<string, unknown>) {
    await this.connect();
    return this.client.callTool({
      name,
      arguments: args,
    });
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
