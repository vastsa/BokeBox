/**
 * Schedule 插件宿主：内置插件 + 外部刷新 + 统一拉取
 */
import { STORAGE_DIR } from '../../../utils/paths.js';
import { safeFetch } from '../../../utils/ssrf.js';
import { createConfigAccessor, resolveRuntimeConfig } from './config.js';
import {
  getSchedulePluginRegistration,
  isSchedulePluginEnabled,
  listSchedulePluginsPublic,
  registerSchedulePlugin,
  resetSchedulePluginConfigForId,
  resetSchedulePluginEnabled,
  setSchedulePluginEnabled,
  updateSchedulePluginConfigForId,
} from './registry.js';
import { scanAndLoadExternalSchedulePlugins } from './loader.js';
import type {
  SchedulePlugin,
  SchedulePluginContext,
  SchedulePluginFetchInput,
  SchedulePluginFetchResult,
} from './types.js';
import type { Schedule } from '../types.js';
import { candidatesFromUrlList, fetchRssItems } from '../rss.js';
import { builtinGithubTrending } from './builtinGithubTrending.js';
import { builtinHackerNews } from './builtinHackerNews.js';

let builtinsReady = false;

/** 内置：RSS（兼容旧 kind=rss） */
const builtinRss: SchedulePlugin = {
  id: 'schedule.rss',
  name: 'RSS / Atom',
  description: '拉取标准 RSS/Atom Feed，解析条目链接与标题',
  version: '1.0.0',
  riskLevel: 'low',
  capabilities: ['rss', 'poll'],
  defaultEnabled: true,
  configSchema: [
    {
      key: 'userAgent',
      label: 'User-Agent',
      type: 'string',
      required: false,
      placeholder: 'BokeBoxSchedule/1.0',
      description: '可选；订阅级可覆盖，默认优先使用插件中心配置',
    },
  ],
  isAvailable() {
    return true;
  },
  canHandle(input) {
    const feedUrl = String(input.params.feedUrl || '').trim();
    return /^https?:\/\//i.test(feedUrl);
  },
  async fetch(input, ctx) {
    const feedUrl = String(input.params.feedUrl || '').trim();
    // 订阅 params 优先，否则插件中心全局配置
    const ua = String(
      input.params.userAgent ?? ctx.getConfig('userAgent') ?? '',
    ).trim();
    const items = await fetchRssItems(feedUrl, {
      userAgent: ua || undefined,
    });
    return {
      items,
      strategy: 'builtin-rss',
      rawMeta: { feedUrl, ua: ua || undefined },
    };
  },
};

/** 内置：URL 列表（兼容旧 kind=url_list） */
const builtinUrlList: SchedulePlugin = {
  id: 'schedule.url-list',
  name: 'URL 列表',
  description: '按配置的固定链接列表生成候选条目',
  version: '1.0.0',
  riskLevel: 'low',
  capabilities: ['list', 'poll'],
  defaultEnabled: true,
  isAvailable() {
    return true;
  },
  canHandle(input) {
    const urls = input.params.urls;
    return Array.isArray(urls) && urls.some((u) => /^https?:\/\//i.test(String(u || '')));
  },
  async fetch(input) {
    const urls = Array.isArray(input.params.urls)
      ? input.params.urls.map((u) => String(u || ''))
      : [];
    return {
      items: candidatesFromUrlList(urls),
      strategy: 'builtin-url-list',
    };
  },
};

export function ensureBuiltinSchedulePlugins(): void {
  if (builtinsReady) return;
  registerSchedulePlugin(builtinRss, { origin: 'builtin', apiVersion: 1 });
  registerSchedulePlugin(builtinUrlList, { origin: 'builtin', apiVersion: 1 });
  registerSchedulePlugin(builtinGithubTrending, {
    origin: 'builtin',
    apiVersion: 1,
  });
  registerSchedulePlugin(builtinHackerNews, {
    origin: 'builtin',
    apiVersion: 1,
  });
  builtinsReady = true;
}

export async function refreshExternalSchedulePlugins() {
  ensureBuiltinSchedulePlugins();
  return scanAndLoadExternalSchedulePlugins();
}

function buildContext(
  schedule: Schedule,
  pluginId: string,
): SchedulePluginContext {
  const reg = getSchedulePluginRegistration(pluginId);
  const schema = reg?.configSchema || reg?.plugin?.configSchema;
  const config = resolveRuntimeConfig(pluginId, schema);
  const accessor = createConfigAccessor(config);
  return {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    storageDir: STORAGE_DIR,
    pluginDir: reg?.dirPath,
    config,
    getConfig: (key) => accessor.getConfig(key),
    safeFetch,
  };
}

function paramsFromSchedule(schedule: Schedule): Record<string, unknown> {
  const src = schedule.sourceConfig || {};
  const base: Record<string, unknown> = {
    ...(src.params && typeof src.params === 'object' ? src.params : {}),
  };
  if (src.feedUrl) base.feedUrl = src.feedUrl;
  if (src.urls) base.urls = src.urls;
  if (src.pluginId) base.pluginId = src.pluginId;
  return base;
}

/**
 * 统一拉取：优先订阅指定的 pluginId；否则按 kind 映射内置插件
 */
export async function fetchScheduleCandidates(
  schedule: Schedule,
): Promise<SchedulePluginFetchResult & { pluginId: string }> {
  ensureBuiltinSchedulePlugins();

  const explicit =
    String(schedule.sourceConfig.pluginId || schedule.jobDefaults.pluginId || '').trim() ||
    (schedule.kind === 'plugin'
      ? String(schedule.sourceConfig.pluginId || '').trim()
      : '');

  let pluginId = explicit;
  if (!pluginId) {
    if (schedule.kind === 'url_list') pluginId = 'schedule.url-list';
    else if (schedule.kind === 'rss') pluginId = 'schedule.rss';
    else pluginId = String(schedule.sourceConfig.pluginId || '').trim();
  }
  if (!pluginId) {
    throw new Error('未指定订阅插件');
  }

  const reg = getSchedulePluginRegistration(pluginId);
  if (!reg?.plugin) {
    throw new Error(`订阅插件不存在或加载失败: ${pluginId}${reg?.loadError ? ` (${reg.loadError})` : ''}`);
  }
  if (!isSchedulePluginEnabled(pluginId)) {
    throw new Error(`订阅插件未启用: ${pluginId}`);
  }

  const ctx = buildContext(schedule, pluginId);
  const plugin = reg.plugin;
  if (!plugin.isAvailable(ctx)) {
    throw new Error(`订阅插件不可用（检查配置）: ${pluginId}`);
  }

  const input: SchedulePluginFetchInput = {
    params: paramsFromSchedule(schedule),
    maxItems: schedule.limits.maxItemsPerRun,
    timezone: schedule.timezone,
  };

  if (!plugin.canHandle(input, ctx)) {
    throw new Error(`订阅插件无法处理当前参数: ${pluginId}`);
  }

  const result = await plugin.fetch(input, ctx);
  const items = Array.isArray(result.items) ? result.items : [];
  return {
    items,
    strategy: result.strategy,
    rawMeta: result.rawMeta,
    pluginId,
  };
}

export {
  listSchedulePluginsPublic,
  setSchedulePluginEnabled,
  resetSchedulePluginEnabled,
  updateSchedulePluginConfigForId,
  resetSchedulePluginConfigForId,
  getSchedulePluginRegistration,
  isSchedulePluginEnabled,
};
