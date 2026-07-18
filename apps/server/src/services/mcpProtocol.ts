import { callMcpTool, listMcpTools } from './mcpTools.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = {
  name: 'bokebox',
  title: 'BokeBox',
  version: '1.0.0',
} as const;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function asRequest(raw: unknown): JsonRpcRequest | null {
  if (!isObject(raw)) return null;
  return raw as JsonRpcRequest;
}

function result(id: JsonRpcId, value: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: value };
}

function error(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/** 处理单条 JSON-RPC 请求；通知（无 id）返回 null */
export async function handleMcpJsonRpc(
  raw: unknown,
): Promise<JsonRpcResponse | null> {
  const req = asRequest(raw);
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return error(null, -32600, 'Invalid Request');
  }

  const id = 'id' in req ? (req.id as JsonRpcId) : undefined;
  const isNotification = id === undefined;
  const method = req.method;
  const params = isObject(req.params) ? req.params : {};

  try {
    switch (method) {
      case 'initialize': {
        if (isNotification) return null;
        return result(id ?? null, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: MCP_SERVER_INFO,
          instructions:
            'BokeBox MCP：将 URL / 文稿等转化为可收听的私人播客。优先使用 create_podcast_from_url 或 create_podcast_from_text，再用 list_jobs / get_job 跟踪进度。',
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping': {
        if (isNotification) return null;
        return result(id ?? null, {});
      }
      case 'tools/list': {
        if (isNotification) return null;
        return result(id ?? null, { tools: listMcpTools() });
      }
      case 'tools/call': {
        if (isNotification) return null;
        const name = String(params.name || '').trim();
        if (!name) return error(id ?? null, -32602, 'tools/call 缺少 name');
        const args = isObject(params.arguments)
          ? params.arguments
          : isObject(params.args)
            ? params.args
            : {};
        const toolResult = await callMcpTool(name, args);
        return result(id ?? null, toolResult);
      }
      case 'resources/list': {
        if (isNotification) return null;
        return result(id ?? null, { resources: [] });
      }
      case 'prompts/list': {
        if (isNotification) return null;
        return result(id ?? null, { prompts: [] });
      }
      default: {
        if (isNotification) return null;
        return error(id ?? null, -32601, `Method not found: ${method}`);
      }
    }
  } catch (err) {
    if (isNotification) return null;
    const message = err instanceof Error ? err.message : String(err);
    return error(id ?? null, -32000, message);
  }
}

/** 支持单条对象或批量数组 */
export async function handleMcpPayload(
  body: unknown,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return error(null, -32600, 'Empty batch');
    }
    const out: JsonRpcResponse[] = [];
    for (const item of body) {
      const res = await handleMcpJsonRpc(item);
      if (res) out.push(res);
    }
    return out.length ? out : null;
  }
  return handleMcpJsonRpc(body);
}
