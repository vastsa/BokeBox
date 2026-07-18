import { request } from './http';


// ── MCP：AI 可安装的远程工具协议 ──

export type McpToolSummary = {
  name: string;
  description: string;
};

export type McpInstallBundle = {
  endpoint: string;
  token: string;
  headers: Record<string, string>;
  generic: Record<string, unknown>;
  streamableHttp: Record<string, unknown>;
  httpUrl: Record<string, unknown>;
  cursor: Record<string, unknown>;
  claudeDesktop: Record<string, unknown>;
  codex: Record<string, unknown>;
  openclaw: Record<string, unknown>;
  /** 直接粘贴给 AI 的安装提示词 */
  aiPrompt: string;
  snippets: {
    cursorJson: string;
    claudeDesktopJson: string;
    codexJson: string;
    openclawJson: string;
  };
};

export type McpStatus = {
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string;
  token?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  username?: string;
  endpoint: string;
  baseUrl: string;
  tools: McpToolSummary[];
};

export type McpInstallResponse = {
  ok: boolean;
  message: string;
  openSource: string;
  license: string;
  status: Omit<McpStatus, 'endpoint' | 'baseUrl' | 'tools' | 'token'>;
  tools: Array<McpToolSummary & { inputSchema?: Record<string, unknown> }>;
  install: McpInstallBundle;
};

export async function fetchMcpStatus(): Promise<McpStatus> {
  return request('/mcp/status');
}

export async function fetchMcpInstall(baseUrl?: string): Promise<McpInstallResponse> {
  const q = baseUrl?.trim()
    ? `?baseUrl=${encodeURIComponent(baseUrl.trim())}`
    : '';
  return request(`/mcp/install${q}`);
}

export async function regenerateMcpToken(): Promise<
  McpStatus & { ok: boolean; message: string; install: McpInstallBundle }
> {
  return request('/mcp/regenerate', { method: 'POST' });
}

