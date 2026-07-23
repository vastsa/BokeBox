import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleApi,
  deleteScheduleApi,
  fetchAllAlbums,
  fetchSchedulePlugins,
  fetchScheduleRuns,
  fetchSchedules,
  fetchSourcePlugins,
  runScheduleApi,
  updateScheduleApi,
  type Schedule,
  type SchedulePluginDescriptor,
  type SchedulePreset,
  type ScheduleRun,
  type ScheduleRunStatus,
  type SourcePluginConfigField,
  type SourcePluginDescriptor,
} from '../../api/client';
import type { AlbumSummary } from '../../types/album';
import { useI18n } from '../../i18n';
import { navigate } from '../../lib/router';
import {
  PluginConfigFields,
  draftToConfigPatch,
  type PluginConfigDraft,
} from '../../components/admin/PluginConfigFields';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

const PLUGIN_RSS = 'schedule.rss';
const PLUGIN_URL_LIST = 'schedule.url-list';

type Draft = {
  name: string;
  pluginId: string;
  /** RSS */
  feedUrl: string;
  /** URL 列表 */
  urlsText: string;
  /** 来自 configSchema 的订阅级参数草稿 */
  schemaDraft: PluginConfigDraft;
  /** 无 schema 时的自由 JSON */
  paramsText: string;
  preset: SchedulePreset;
  cron: string;
  timezone: string;
  enabled: boolean;
  albumId: string;
  /** 内容采集 Source 插件；空 = 自动匹配 */
  sourcePluginId: string;
  maxItemsPerRun: number;
  onlyNew: boolean;
  titlePrefix: string;
};

function emptyDraft(defaultPluginId = PLUGIN_RSS): Draft {
  return {
    name: '',
    pluginId: defaultPluginId,
    feedUrl: '',
    urlsText: '',
    schemaDraft: {},
    paramsText: '',
    preset: 'daily',
    cron: '0 8 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
    albumId: '',
    sourcePluginId: '',
    maxItemsPerRun: 3,
    onlyNew: true,
    titlePrefix: '',
  };
}

/** 旧 kind 或显式 pluginId → 统一插件 id */
function resolvePluginId(s: Schedule): string {
  const explicit = String(s.sourceConfig.pluginId || '').trim();
  if (explicit) return explicit;
  if (s.kind === 'url_list') return PLUGIN_URL_LIST;
  if (s.kind === 'rss') return PLUGIN_RSS;
  return explicit;
}

function formatTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

function statusClass(status: Schedule['lastStatus'] | ScheduleRunStatus | null): string {
  if (status === 'success') return 'is-ok';
  if (status === 'partial') return 'is-warn';
  if (status === 'failed') return 'is-bad';
  if (status === 'running') return 'is-run';
  return '';
}

function formatDuration(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string | null {
  if (!startedAt || !finishedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

const RUNS_LIMIT = 15;

function pluginLabel(
  pluginId: string,
  plugins: SchedulePluginDescriptor[],
): string {
  const p = plugins.find((x) => x.id === pluginId);
  return p ? p.name : pluginId || '—';
}

/** 用订阅 params 覆盖插件默认值，生成表单 draft */
function buildSchemaDraft(
  schema: SourcePluginConfigField[] | undefined,
  params: Record<string, unknown>,
  plugin?: SchedulePluginDescriptor | null,
): PluginConfigDraft {
  const draft: PluginConfigDraft = {};
  for (const field of schema || []) {
    const fromParams = params[field.key];
    const fromPlugin = plugin?.configValues?.[field.key];
    const fallback =
      field.default !== undefined && field.default !== null
        ? field.default
        : '';

    let raw: unknown = fromParams;
    if (raw === undefined || raw === null || raw === '') {
      raw = fromPlugin;
    }
    if (raw === undefined || raw === null || raw === '') {
      raw = fallback;
    }

    if (field.type === 'boolean') {
      draft[field.key] =
        raw === true || raw === 'true' || raw === 1 || raw === '1'
          ? 'true'
          : 'false';
    } else if (field.type === 'password') {
      // 订阅级一般不存密钥；密钥走插件中心全局配置
      draft[field.key] = '';
    } else {
      draft[field.key] = raw === undefined || raw === null ? '' : String(raw);
    }
  }
  return draft;
}

function stripEmptyParams(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

export function ScheduleSettingsTab({
  active,
  onMessage,
  onError,
}: {
  active: boolean;
  onMessage: (msg: string | null) => void;
  onError: (msg: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Schedule[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [plugins, setPlugins] = useState<SchedulePluginDescriptor[]>([]);
  const [sourcePlugins, setSourcePlugins] = useState<SourcePluginDescriptor[]>(
    [],
  );
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedRunDetailId, setExpandedRunDetailId] = useState<string | null>(
    null,
  );
  const [runsMap, setRunsMap] = useState<Record<string, ScheduleRun[]>>({});
  const [runsLoadingId, setRunsLoadingId] = useState<string | null>(null);

  const enabledPlugins = useMemo(
    () => plugins.filter((p) => p.enabled && !p.loadError),
    [plugins],
  );

  const selectedPlugin = useMemo(
    () => plugins.find((p) => p.id === draft.pluginId) || null,
    [plugins, draft.pluginId],
  );

  const paramSchema = useMemo(
    () => (selectedPlugin?.configSchema || []) as SourcePluginConfigField[],
    [selectedPlugin],
  );

  const hasParamSchema = paramSchema.length > 0;
  const isRss = draft.pluginId === PLUGIN_RSS;
  const isUrlList = draft.pluginId === PLUGIN_URL_LIST;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, albumList, pluginList, sourcePluginList] = await Promise.all([
        fetchSchedules(),
        fetchAllAlbums().catch(() => [] as AlbumSummary[]),
        fetchSchedulePlugins()
          .then((r) => r.plugins || [])
          .catch(() => [] as SchedulePluginDescriptor[]),
        fetchSourcePlugins()
          .then((r) => (r.plugins || []).filter((p) => p.enabled && !p.loadError))
          .catch(() => [] as SourcePluginDescriptor[]),
      ]);
      setItems(list);
      setAlbums(albumList);
      setPlugins(pluginList);
      setSourcePlugins(sourcePluginList);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const presetLabel = useCallback(
    (preset: SchedulePreset, cron: string) => {
      if (preset === 'hourly') return t('settings.schedulePresetHourly');
      if (preset === 'every_6h') return t('settings.schedulePresetEvery6h');
      if (preset === 'daily') return t('settings.schedulePresetDaily');
      if (preset === 'weekly') return t('settings.schedulePresetWeekly');
      return cron || t('settings.schedulePresetCron');
    },
    [t],
  );

  const sourceSummary = useCallback(
    (s: Schedule) => {
      const pluginId = resolvePluginId(s);
      const params = s.sourceConfig.params || {};
      if (pluginId === PLUGIN_RSS) {
        return String(s.sourceConfig.feedUrl || params.feedUrl || pluginId);
      }
      if (pluginId === PLUGIN_URL_LIST) {
        const urls =
          s.sourceConfig.urls ||
          (Array.isArray(params.urls) ? (params.urls as string[]) : []);
        if (!urls.length) return pluginId;
        if (urls.length === 1) return urls[0]!;
        return t('settings.scheduleUrlCount', { n: urls.length });
      }
      const keys = Object.keys(params);
      if (!keys.length) return pluginId || '—';
      // 展示前两个参数摘要
      const bits = keys.slice(0, 2).map((k) => `${k}=${String(params[k])}`);
      return bits.join(' · ') + (keys.length > 2 ? ' …' : '');
    },
    [t],
  );

  const applyPluginDefaults = useCallback(
    (pluginId: string, params: Record<string, unknown> = {}) => {
      const plugin = plugins.find((p) => p.id === pluginId) || null;
      const schema = (plugin?.configSchema || []) as SourcePluginConfigField[];
      return buildSchemaDraft(schema, params, plugin);
    },
    [plugins],
  );

  const openCreate = () => {
    setEditingId(null);
    const preferred =
      enabledPlugins.find((p) => p.id === PLUGIN_RSS)?.id ||
      enabledPlugins[0]?.id ||
      PLUGIN_RSS;
    const base = emptyDraft(preferred);
    base.schemaDraft = applyPluginDefaults(preferred, {});
    setDraft(base);
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    const pluginId = resolvePluginId(s);
    const params = { ...(s.sourceConfig.params || {}) };
    const feedUrl = String(
      s.sourceConfig.feedUrl || params.feedUrl || '',
    ).trim();
    const urlsFromParams = Array.isArray(params.urls)
      ? (params.urls as unknown[]).map((u) => String(u || ''))
      : [];
    const urls = s.sourceConfig.urls?.length
      ? s.sourceConfig.urls
      : urlsFromParams;

    // 结构化字段不重复塞进 JSON
    const paramsForSchema = { ...params };
    delete paramsForSchema.feedUrl;
    delete paramsForSchema.urls;

    const plugin = plugins.find((p) => p.id === pluginId);
    const schema = (plugin?.configSchema || []) as SourcePluginConfigField[];
    const hasSchema = schema.length > 0;

    setDraft({
      name: s.name,
      pluginId,
      feedUrl,
      urlsText: urls.join('\n'),
      schemaDraft: buildSchemaDraft(schema, paramsForSchema, plugin),
      paramsText:
        !hasSchema && Object.keys(paramsForSchema).length
          ? JSON.stringify(paramsForSchema, null, 2)
          : '',
      preset: s.preset,
      cron: s.cron,
      timezone: s.timezone || 'Asia/Shanghai',
      enabled: s.enabled,
      albumId: s.jobDefaults.albumId || '',
      sourcePluginId: String(
        s.jobDefaults.sourcePluginId || s.jobDefaults.pluginId || '',
      ).trim(),
      maxItemsPerRun: s.limits.maxItemsPerRun,
      onlyNew: s.limits.onlyNew,
      titlePrefix: s.jobDefaults.titlePrefix || '',
    });
    setShowForm(true);
  };

  const onPluginChange = (pluginId: string) => {
    setDraft((d) => ({
      ...d,
      pluginId,
      schemaDraft: applyPluginDefaults(pluginId, {}),
      paramsText: '',
    }));
  };

  const bodyFromDraft = useCallback(() => {
    const pluginId = draft.pluginId.trim();
    if (!pluginId) {
      throw new Error(t('settings.schedulePluginPick'));
    }

    let params: Record<string, unknown> = {};

    if (isRss) {
      const feedUrl = draft.feedUrl.trim();
      if (!feedUrl) throw new Error(t('settings.scheduleFeedUrlRequired'));
      params.feedUrl = feedUrl;
    } else if (isUrlList) {
      const urls = draft.urlsText
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!urls.length) throw new Error(t('settings.scheduleUrlsRequired'));
      params.urls = urls;
    }

    if (hasParamSchema) {
      const patch = stripEmptyParams(
        draftToConfigPatch(paramSchema, draft.schemaDraft),
      );
      params = { ...params, ...patch };
    } else if (!isRss && !isUrlList && draft.paramsText.trim()) {
      try {
        const parsed = JSON.parse(draft.paramsText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('params');
        }
        params = { ...params, ...(parsed as Record<string, unknown>) };
      } catch {
        throw new Error(t('settings.scheduleParamsInvalid'));
      }
    }

    const sourceConfig: {
      pluginId: string;
      params: Record<string, unknown>;
      feedUrl?: string;
      urls?: string[];
    } = {
      pluginId,
      params,
    };
    if (isRss) sourceConfig.feedUrl = String(params.feedUrl || '');
    if (isUrlList) {
      sourceConfig.urls = Array.isArray(params.urls)
        ? (params.urls as string[])
        : [];
    }

    return {
      name: draft.name.trim(),
      enabled: draft.enabled,
      kind: 'plugin' as const,
      sourceConfig,
      preset: draft.preset,
      cron: draft.preset === 'cron' ? draft.cron.trim() : undefined,
      timezone: draft.timezone.trim() || 'Asia/Shanghai',
      jobDefaults: {
        albumId: draft.albumId || null,
        titlePrefix: draft.titlePrefix.trim() || undefined,
        published: true,
        sourcePluginId: draft.sourcePluginId.trim() || null,
        // 清掉旧字段，避免和 sourcePluginId 语义打架
        pluginId: undefined,
      },
      limits: {
        maxItemsPerRun: draft.maxItemsPerRun,
        onlyNew: draft.onlyNew,
      },
    };
  }, [draft, t, isRss, isUrlList, hasParamSchema, paramSchema]);

  const onSave = async () => {
    setSaving(true);
    onError(null);
    try {
      const body = bodyFromDraft();
      if (editingId) {
        await updateScheduleApi(editingId, body);
        onMessage(t('settings.scheduleSaved'));
      } else {
        await createScheduleApi(body);
        onMessage(t('settings.scheduleCreated'));
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (s: Schedule) => {
    setBusyId(s.id);
    onError(null);
    try {
      await updateScheduleApi(s.id, { enabled: !s.enabled });
      onMessage(
        s.enabled
          ? t('settings.scheduleDisabled')
          : t('settings.scheduleEnabled'),
      );
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = useCallback(
    (status: ScheduleRunStatus | Schedule['lastStatus'] | null | undefined) => {
      if (status === 'success') return t('settings.scheduleStatusSuccess');
      if (status === 'partial') return t('settings.scheduleStatusPartial');
      if (status === 'failed') return t('settings.scheduleStatusFailed');
      if (status === 'running') return t('settings.scheduleStatusRunning');
      return status || '—';
    },
    [t],
  );

  const loadRuns = useCallback(
    async (id: string, options: { silent?: boolean } = {}) => {
      if (!options.silent) setRunsLoadingId(id);
      try {
        const runs = await fetchScheduleRuns(id, RUNS_LIMIT);
        setRunsMap((prev) => ({ ...prev, [id]: runs }));
        return runs;
      } catch (err) {
        if (!options.silent) {
          onError(err instanceof Error ? err.message : String(err));
        }
        return null;
      } finally {
        if (!options.silent) setRunsLoadingId(null);
      }
    },
    [onError],
  );

  const onRun = async (s: Schedule, force = false) => {
    setBusyId(s.id);
    onError(null);
    try {
      const res = await runScheduleApi(s.id, { force });
      onMessage(
        t(force ? 'settings.scheduleRunForceDone' : 'settings.scheduleRunDone', {
          status: statusLabel(res.run.status),
          n: res.run.createdJobs,
        }),
      );
      setExpandedRunId(s.id);
      setExpandedRunDetailId(res.run.id);
      try {
        // 把本次 run 顶到列表，再拉全量校正
        setRunsMap((prev) => {
          const cur = prev[s.id] || [];
          const rest = cur.filter((x) => x.id !== res.run.id);
          return { ...prev, [s.id]: [res.run, ...rest].slice(0, RUNS_LIMIT) };
        });
        await loadRuns(s.id, { silent: true });
      } catch {
        // ignore
      }
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleRuns = async (id: string) => {
    if (expandedRunId === id) {
      setExpandedRunId(null);
      setExpandedRunDetailId(null);
      return;
    }
    setExpandedRunId(id);
    // 每次展开都刷新，避免看到过期账本
    await loadRuns(id);
  };

  const onDelete = async (s: Schedule) => {
    if (!window.confirm(t('settings.scheduleDeleteConfirm', { name: s.name }))) {
      return;
    }
    setBusyId(s.id);
    onError(null);
    try {
      await deleteScheduleApi(s.id);
      onMessage(t('settings.scheduleDeleted'));
      if (editingId === s.id) {
        setShowForm(false);
        setEditingId(null);
      }
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const paramFields = (
    <>
      {isRss ? (
        <label className="settings-field settings-field-span">
          <span>{t('settings.scheduleFeedUrl')}</span>
          <input
            className="nl-input"
            value={draft.feedUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, feedUrl: e.target.value }))
            }
            placeholder="https://example.com/feed.xml"
          />
        </label>
      ) : null}

      {isUrlList ? (
        <label className="settings-field settings-field-span">
          <span>{t('settings.scheduleUrls')}</span>
          <textarea
            className="nl-input"
            rows={4}
            value={draft.urlsText}
            onChange={(e) =>
              setDraft((d) => ({ ...d, urlsText: e.target.value }))
            }
            placeholder={t('settings.scheduleUrlsPh')}
          />
        </label>
      ) : null}

      {hasParamSchema ? (
        <div className="settings-field-span schedule-schema-fields">
          <div className="schedule-schema-label">
            {t('settings.schedulePluginParams')}
          </div>
          <p className="settings-card-hint" style={{ marginBottom: '0.5rem' }}>
            {t('settings.schedulePluginParamsHint')}
          </p>
          <PluginConfigFields
            schema={paramSchema}
            draft={draft.schemaDraft}
            status={selectedPlugin?.configStatus}
            idPrefix={`schedule-param-${draft.pluginId || 'x'}`}
            onChange={(key, value) =>
              setDraft((d) => ({
                ...d,
                schemaDraft: { ...d.schemaDraft, [key]: value },
              }))
            }
          />
        </div>
      ) : null}

      {!hasParamSchema && !isRss && !isUrlList ? (
        <label className="settings-field settings-field-span">
          <span>{t('settings.scheduleParams')}</span>
          <textarea
            className="nl-input"
            rows={4}
            value={draft.paramsText}
            onChange={(e) =>
              setDraft((d) => ({ ...d, paramsText: e.target.value }))
            }
            placeholder={t('settings.scheduleParamsPh')}
          />
        </label>
      ) : null}
    </>
  );

  return (
    <SettingsPanel id="schedules" active={active}>
      <div className="settings-stack">
        <SettingsCard>
          <SettingsBlock
            title={t('settings.scheduleTitle')}
            desc={t('settings.scheduleDescUnified')}
          >
            <div className="settings-card-actions" style={{ marginTop: 0 }}>
              <span className="settings-card-hint">
                {t('settings.scheduleHintUnified')}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="nl-btn"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  {t('common.refresh')}
                </button>
                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  onClick={openCreate}
                >
                  {t('settings.scheduleCreate')}
                </button>
              </div>
            </div>
          </SettingsBlock>
        </SettingsCard>

        {showForm ? (
          <SettingsCard>
            <SettingsBlock
              title={
                editingId
                  ? t('settings.scheduleEdit')
                  : t('settings.scheduleCreate')
              }
            >
              <div className="settings-form-grid">
                <label className="settings-field">
                  <span>{t('settings.scheduleName')}</span>
                  <input
                    className="nl-input"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder={t('settings.scheduleNamePh')}
                  />
                </label>

                <label className="settings-field">
                  <span>{t('settings.schedulePlugin')}</span>
                  <select
                    className="nl-input"
                    value={draft.pluginId}
                    onChange={(e) => onPluginChange(e.target.value)}
                  >
                    {!enabledPlugins.length ? (
                      <option value="">{t('settings.schedulePluginNone')}</option>
                    ) : null}
                    {enabledPlugins.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                    {draft.pluginId &&
                    !enabledPlugins.some((p) => p.id === draft.pluginId) ? (
                      <option value={draft.pluginId}>
                        {draft.pluginId} ({t('settings.schedulePluginDisabled')})
                      </option>
                    ) : null}
                  </select>
                </label>

                {paramFields}

                <label className="settings-field">
                  <span>{t('settings.schedulePreset')}</span>
                  <select
                    className="nl-input"
                    value={draft.preset}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        preset: e.target.value as SchedulePreset,
                      }))
                    }
                  >
                    <option value="hourly">
                      {t('settings.schedulePresetHourly')}
                    </option>
                    <option value="every_6h">
                      {t('settings.schedulePresetEvery6h')}
                    </option>
                    <option value="daily">
                      {t('settings.schedulePresetDaily')}
                    </option>
                    <option value="weekly">
                      {t('settings.schedulePresetWeekly')}
                    </option>
                    <option value="cron">
                      {t('settings.schedulePresetCron')}
                    </option>
                  </select>
                </label>

                {draft.preset === 'cron' ? (
                  <label className="settings-field">
                    <span>{t('settings.scheduleCron')}</span>
                    <input
                      className="nl-input"
                      value={draft.cron}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, cron: e.target.value }))
                      }
                      placeholder="0 8 * * *"
                    />
                  </label>
                ) : (
                  <label className="settings-field">
                    <span>{t('settings.scheduleTimezone')}</span>
                    <input
                      className="nl-input"
                      value={draft.timezone}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, timezone: e.target.value }))
                      }
                    />
                  </label>
                )}

                {draft.preset === 'cron' ? (
                  <label className="settings-field">
                    <span>{t('settings.scheduleTimezone')}</span>
                    <input
                      className="nl-input"
                      value={draft.timezone}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, timezone: e.target.value }))
                      }
                    />
                  </label>
                ) : null}

                <label className="settings-field">
                  <span>{t('settings.scheduleAlbum')}</span>
                  <select
                    className="nl-input"
                    value={draft.albumId}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, albumId: e.target.value }))
                    }
                  >
                    <option value="">{t('settings.scheduleAlbumNone')}</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span>{t('settings.scheduleSourcePlugin')}</span>
                  <select
                    className="nl-input"
                    value={draft.sourcePluginId}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        sourcePluginId: e.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {t('settings.scheduleSourcePluginAuto')}
                    </option>
                    {sourcePlugins.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {draft.sourcePluginId &&
                    !sourcePlugins.some((p) => p.id === draft.sourcePluginId) ? (
                      <option value={draft.sourcePluginId}>
                        {draft.sourcePluginId} (
                        {t('settings.scheduleSourcePluginMissing')})
                      </option>
                    ) : null}
                  </select>
                  <span className="settings-card-hint">
                    {t('settings.scheduleSourcePluginHint')}
                  </span>
                </label>

                <label className="settings-field">
                  <span>{t('settings.scheduleMaxItems')}</span>
                  <input
                    className="nl-input"
                    type="number"
                    min={1}
                    max={20}
                    value={draft.maxItemsPerRun}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        maxItemsPerRun: Number(e.target.value) || 1,
                      }))
                    }
                  />
                </label>

                <label className="settings-field settings-field-span">
                  <span>{t('settings.scheduleTitlePrefix')}</span>
                  <input
                    className="nl-input"
                    value={draft.titlePrefix}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, titlePrefix: e.target.value }))
                    }
                    placeholder={t('settings.scheduleTitlePrefixPh')}
                  />
                </label>

                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={draft.onlyNew}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, onlyNew: e.target.checked }))
                    }
                  />
                  <span>{t('settings.scheduleOnlyNew')}</span>
                </label>

                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, enabled: e.target.checked }))
                    }
                  />
                  <span>{t('settings.scheduleEnabledLabel')}</span>
                </label>
              </div>

              <div className="settings-card-actions">
                <button
                  type="button"
                  className="nl-btn"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </SettingsBlock>
          </SettingsCard>
        ) : null}

        <SettingsCard>
          <SettingsBlock title={t('settings.scheduleList')}>
            {loading && !items.length ? (
              <p className="settings-card-hint">{t('common.loading')}</p>
            ) : null}
            {!loading && !items.length ? (
              <p className="settings-card-hint">{t('settings.scheduleEmpty')}</p>
            ) : null}
            <ul className="schedule-list">
              {items.map((s) => {
                const busy = busyId === s.id;
                const pluginId = resolvePluginId(s);
                return (
                  <li key={s.id} className="schedule-item">
                    <div className="schedule-item-main">
                      <div className="schedule-item-title-row">
                        <strong>{s.name}</strong>
                        <span
                          className={[
                            'schedule-badge',
                            s.enabled ? 'is-on' : 'is-off',
                          ].join(' ')}
                        >
                          {s.enabled
                            ? t('settings.scheduleOn')
                            : t('settings.scheduleOff')}
                        </span>
                        {s.lastStatus ? (
                          <span
                            className={[
                              'schedule-badge',
                              statusClass(s.lastStatus),
                            ].join(' ')}
                          >
                            {statusLabel(s.lastStatus)}
                          </span>
                        ) : null}
                      </div>
                      <p className="schedule-item-meta">
                        {pluginLabel(pluginId, plugins)}
                        {(() => {
                          const pl = plugins.find((x) => x.id === pluginId);
                          if (!pluginId) return null;
                          if (!pl) {
                            return (
                              <span className="schedule-badge is-bad">
                                {' '}
                                {t('settings.schedulePluginMissing')}
                              </span>
                            );
                          }
                          if (!pl.enabled || pl.loadError) {
                            return (
                              <span className="schedule-badge is-bad">
                                {' '}
                                {t('settings.schedulePluginDisabled')}
                              </span>
                            );
                          }
                          return null;
                        })()}
                        {' · '}
                        {presetLabel(s.preset, s.cron)}
                        {' · '}
                        {s.timezone}
                        {' · '}
                        {(() => {
                          const sp = String(
                            s.jobDefaults.sourcePluginId ||
                              s.jobDefaults.pluginId ||
                              '',
                          ).trim();
                          if (!sp) return t('settings.scheduleSourcePluginAuto');
                          const name =
                            sourcePlugins.find((p) => p.id === sp)?.name || sp;
                          return t('settings.scheduleSourcePluginPinned', {
                            id: name,
                          });
                        })()}
                      </p>
                      <p
                        className="schedule-item-source"
                        title={sourceSummary(s)}
                      >
                        {sourceSummary(s)}
                      </p>
                      <p className="schedule-item-meta">
                        {t('settings.scheduleNextRun')}:{' '}
                        {formatTime(s.nextRunAt, locale)}
                        {' · '}
                        {t('settings.scheduleLastRun')}:{' '}
                        {formatTime(s.lastRunAt, locale)}
                      </p>
                      {s.lastError ? (
                        <p className="schedule-item-last-error" title={s.lastError}>
                          {s.lastError}
                        </p>
                      ) : null}
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => void onRun(s, false)}
                        title={t('settings.scheduleRunHint')}
                      >
                        {t('settings.scheduleRun')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => void onRun(s, true)}
                        title={t('settings.scheduleRunForceHint')}
                      >
                        {t('settings.scheduleRunForce')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy || runsLoadingId === s.id}
                        onClick={() => void toggleRuns(s.id)}
                      >
                        {expandedRunId === s.id
                          ? t('settings.scheduleHideRuns')
                          : t('settings.scheduleShowRuns')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => void onToggle(s)}
                      >
                        {s.enabled
                          ? t('settings.scheduleDisable')
                          : t('settings.scheduleEnable')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => openEdit(s)}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => void onDelete(s)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                    {expandedRunId === s.id ? (
                      <div className="schedule-runs">
                        <div className="schedule-runs-toolbar">
                          <span className="settings-card-hint">
                            {t('settings.scheduleShowRuns')}
                            {(runsMap[s.id] || []).length
                              ? ` · ${(runsMap[s.id] || []).length}`
                              : ''}
                          </span>
                          <button
                            type="button"
                            className="nl-btn schedule-runs-refresh"
                            disabled={runsLoadingId === s.id}
                            onClick={() => void loadRuns(s.id)}
                          >
                            {t('settings.scheduleRefreshRuns')}
                          </button>
                        </div>
                        {runsLoadingId === s.id && !(runsMap[s.id] || []).length ? (
                          <p className="settings-card-hint">
                            {t('common.loading')}
                          </p>
                        ) : (runsMap[s.id] || []).length ? (
                          <ul className="schedule-runs-list">
                            {(runsMap[s.id] || []).map((r) => {
                              const open = expandedRunDetailId === r.id;
                              const duration = formatDuration(
                                r.startedAt,
                                r.finishedAt,
                              );
                              const errCount = r.errors?.length || 0;
                              const jobCount = r.jobIds?.length || 0;
                              return (
                                <li
                                  key={r.id}
                                  className={[
                                    'schedule-runs-item',
                                    open ? 'is-open' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  <button
                                    type="button"
                                    className="schedule-runs-summary"
                                    onClick={() =>
                                      setExpandedRunDetailId(open ? null : r.id)
                                    }
                                  >
                                    <span
                                      className={[
                                        'schedule-badge',
                                        statusClass(r.status),
                                      ].join(' ')}
                                    >
                                      {statusLabel(r.status)}
                                    </span>
                                    <span className="schedule-runs-summary-text">
                                      {formatTime(r.startedAt, locale)}
                                      {' · '}
                                      {t('settings.scheduleRunStats', {
                                        fetched: r.fetched,
                                        created: r.createdJobs,
                                        skipped: r.skipped,
                                      })}
                                      {duration
                                        ? ` · ${t('settings.scheduleRunDuration', {
                                            duration,
                                          })}`
                                        : ''}
                                      {errCount
                                        ? ` · ${t('settings.scheduleRunErrors', {
                                            n: errCount,
                                          })}`
                                        : ''}
                                      {jobCount
                                        ? ` · ${t('settings.scheduleRunJobs')} ${jobCount}`
                                        : ''}
                                    </span>
                                  </button>
                                  {!open && errCount ? (
                                    <p className="schedule-runs-error">
                                      {r.errors[0]}
                                      {errCount > 1
                                        ? ` ${t('settings.scheduleRunMoreErrors', {
                                            n: errCount - 1,
                                          })}`
                                        : ''}
                                    </p>
                                  ) : null}
                                  {open ? (
                                    <div className="schedule-runs-detail">
                                      <p className="schedule-runs-detail-meta">
                                        id: {r.id}
                                        {r.finishedAt
                                          ? ` · ${formatTime(r.finishedAt, locale)}`
                                          : ''}
                                      </p>
                                      {jobCount ? (
                                        <div className="schedule-runs-jobs">
                                          <span className="schedule-runs-jobs-label">
                                            {t('settings.scheduleRunJobs')}
                                          </span>
                                          <div className="schedule-runs-jobs-list">
                                            {r.jobIds.map((jobId) => (
                                              <button
                                                key={jobId}
                                                type="button"
                                                className="schedule-runs-job-chip"
                                                title={t(
                                                  'settings.scheduleRunOpenJob',
                                                )}
                                                onClick={() =>
                                                  navigate({
                                                    name: 'job',
                                                    id: jobId,
                                                  })
                                                }
                                              >
                                                {jobId}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                      {errCount ? (
                                        <ul className="schedule-runs-error-list">
                                          {r.errors.map((msg, idx) => (
                                            <li key={`${r.id}-err-${idx}`}>
                                              {msg}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        <p className="settings-card-hint">
                                          —
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="settings-card-hint">
                            {t('settings.scheduleRunsEmpty')}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SettingsBlock>
        </SettingsCard>
      </div>
    </SettingsPanel>
  );
}
