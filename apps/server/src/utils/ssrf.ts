/**
 * 出站 URL SSRF 防护
 *
 * 目标：阻止服务端 fetch 打到本机/私网/云元数据等危险目标。
 * 覆盖：字面量 IP、危险主机名、DNS 解析结果、重定向每一跳。
 *
 * 本地调试可设 BOKEBOX_ALLOW_PRIVATE_URLS=1 临时放行（生产勿开）。
 */
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export const MAX_REDIRECTS = 5;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google',
  'metadata.google.internal',
  'metadata.gce.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function allowPrivateUrls(): boolean {
  const v = String(process.env.BOKEBOX_ALLOW_PRIVATE_URLS || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** IPv4 是否属于不可达公网的保留/私网段 */
export function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local / cloud metadata
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  // 198.18.0.0/15 benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 TEST-NET-2
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 TEST-NET-3
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  if (a >= 224) return true;

  return false;
}

/** 规范化 IPv6 并判断是否应拦截 */
export function isBlockedIPv6(ip: string): boolean {
  const raw = ip.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped :ffff:x.x.x.x
  const v4mapped = raw.match(/:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped?.[1]) return isBlockedIPv4(v4mapped[1]);

  // 压缩形式粗检
  if (raw === '::' || raw === '::1') return true;
  if (raw.startsWith('fe80:')) return true; // link-local
  if (raw.startsWith('fc') || raw.startsWith('fd')) return true; // unique local
  if (raw.startsWith('ff')) return true; // multicast

  // 展开关键前缀判断 loopback / unspecified
  // ::1 已覆盖；::ffff:127.0.0.1 由 v4mapped 覆盖
  try {
    // Node isIP 接受完整地址
    if (isIP(raw) !== 6) return true;
  } catch {
    return true;
  }

  // 0:0:0:0:0:0:0:0 / ::
  if (/^0{0,4}(:0{0,4}){7}$/.test(raw.replace(/\b0+\b/g, '0'))) return true;

  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIPv4(ip);
  if (v === 6) return isBlockedIPv6(ip);
  return true;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/** 主机名是否明显危险（不含 DNS） */
export function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.endsWith('.internal') || host.endsWith('.intranet')) return true;
  if (host.endsWith('.localdomain')) return true;

  // 字面量 IP 主机
  if (isIP(host)) return isBlockedIp(host);

  // 十进制/八进制等怪异 IPv4（如 http://2130706433/）
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      const c = (n >>> 8) & 0xff;
      const d = n & 0xff;
      return isBlockedIPv4(`${a}.${b}.${c}.${d}`);
    }
  }

  return false;
}

/**
 * 同步形态检查：协议 + 主机名/字面量 IP。
 * 不通过时返回错误文案；通过返回 null。
 */
export function getOutboundUrlSyncError(raw: string): string | null {
  if (allowPrivateUrls()) {
    try {
      const u = new URL(String(raw || '').trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return '仅允许 http/https 链接';
      }
      return null;
    } catch {
      return '无效的 URL';
    }
  }

  let u: URL;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return '无效的 URL';
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return '仅允许 http/https 链接';
  }

  // 禁止带用户名密码的 SSRF 变体（user:pass@host）
  if (u.username || u.password) {
    return 'URL 不允许包含用户名或密码';
  }

  if (!u.hostname) {
    return 'URL 缺少主机名';
  }

  if (isBlockedHostname(u.hostname)) {
    return '禁止访问内网、本机或云元数据地址';
  }

  return null;
}

/** 同步：协议合法且非明显危险目标 */
export function isSafeHttpUrl(raw: string): boolean {
  return getOutboundUrlSyncError(raw) === null;
}

/**
 * 异步完整校验：同步规则 + DNS 解析后的所有 A/AAAA 记录。
 * 通过则返回规范化 URL 对象。
 */
export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  const syncErr = getOutboundUrlSyncError(raw);
  if (syncErr) throw new UnsafeUrlError(syncErr);

  const u = new URL(String(raw).trim());
  if (allowPrivateUrls()) return u;

  const host = normalizeHostname(u.hostname);

  // 字面量 IP：已在 sync 阶段拦过，这里再确认一次
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new UnsafeUrlError('禁止访问内网、本机或云元数据地址');
    }
    return u;
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError('无法解析目标主机名');
  }

  if (!records.length) {
    throw new UnsafeUrlError('无法解析目标主机名');
  }

  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw new UnsafeUrlError('禁止访问内网、本机或云元数据地址');
    }
  }

  return u;
}

/**
 * 安全跟随重定向的 GET。
 * 每一跳都做 SSRF 校验；最多 MAX_REDIRECTS 次。
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 120_000, headers, ...rest } = init;
  let current = String(rawUrl).trim();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeOutboundUrl(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        ...rest,
        method: rest.method || 'GET',
        headers,
        redirect: 'manual',
        signal: rest.signal || controller.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(msg)) {
        throw new Error(`下载超时（超过 ${Math.round(timeoutMs / 1000)} 秒）`);
      }
      throw new Error(`下载失败: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      // 释放 body，避免挂起
      try {
        await res.arrayBuffer();
      } catch {
        // ignore
      }
      if (!loc) {
        throw new UnsafeUrlError(`重定向缺少 Location（HTTP ${res.status}）`);
      }
      if (hop === MAX_REDIRECTS) {
        throw new UnsafeUrlError(`重定向次数过多（>${MAX_REDIRECTS}）`);
      }
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new UnsafeUrlError('重定向地址无效');
      }
      current = next.href;
      continue;
    }

    // 给调用方一个可用的最终 URL（manual 模式下 res.url 可能仍是请求 URL）
    Object.defineProperty(res, 'url', {
      value: current,
      configurable: true,
    });
    return res;
  }

  throw new UnsafeUrlError(`重定向次数过多（>${MAX_REDIRECTS}）`);
}
