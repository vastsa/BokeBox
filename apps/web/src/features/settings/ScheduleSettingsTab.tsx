import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleApi,
  deleteScheduleApi,
  fetchAllAlbums,
  fetchSchedulePlugins,
  fetchSchedules,
  runScheduleApi,
  updateScheduleApi,
  type Schedule,
  type SchedulePluginDescriptor,
  type SchedulePreset,
} from '../../api/client';
import type { AlbumSummary } from '../../types/album';
import { useI18n } from '../../i18n';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

const PLUGIN_RSS = 'schedule.rss';
const PLUGIN_URL_LIST = 'schedule.url-list';

type Draft = {
  name: string;
  pluginId: string;
  feedUrl: string;
  urlsText: string;
  paramsText: string;
  preset: SchedulePreset;
  cron: string;
  timezone: string;
  enabled: boolean;
  albumId: string;
  maxItemsPerRun: number;
  onlyNew: boolean;
  titlePrefix: string;
};

const emptyDraft = (defaultPluginId = PLUGIN_RSS): Draft => ({
  name: '',
  pluginId: defaultPluginId,
  feedUrl: '',
  urlsText: '',
  paramsText: '',
  preset: 'daily',
  cron: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  albumId: '',
  maxItemsPerRun: 3,
  onlyNew: true,
  titlePrefix: '',
});

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

function statusClass(status: Schedule['lastStatus']): string {
  if (status === 'success') return 'is-ok';
  if (status === 'partial') return 'is-warn';
  if (status === 'failed') return 'is-bad';
  if (status === 'running') return 'is-run';
  return '';
}

function pluginLabel(
  pluginId: string,
  plugins: SchedulePluginDescriptor[],
): string {
  const p = plugins.find((x) => x.id === pluginId);
  return p ? `${p.name}` : pluginId || '—';
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
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const enabledPlugins = useMemo(
    () => plugins.filter((p) => p.enabled && !p.loadError),
    [plugins],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, albumList, pluginList] = await Promise.all([
        fetchSchedules(),
        fetchAllAlbums().catch(() => [] as AlbumSummary[]),
        fetchSchedulePlugins()
          .then((r) => r.plugins || [])
          .catch(() => [] as SchedulePluginDescriptor[]),
      ]);
      setItems(list);
      setAlbums(albumList);
      setPlugins(pluginList);
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
      if (pluginId === PLUGIN_RSS) {
        return s.sourceConfig.feedUrl || s.sourceConfig.params?.feedUrl
          ? String(s.sourceConfig.feedUrl || s.sourceConfig.params?.feedUrl)
          : pluginId;
      }
      if (pluginId === PLUGIN_URL_LIST) {
        const urls =
          s.sourceConfig.urls ||
          (Array.isArray(s.sourceConfig.params?.urls)
            ? (s.sourceConfig.params?.urls as string[])
            : []);
        if (!urls.length) return pluginId;
        if (urls.length === 1) return urls[0]!;
        return t('settings.scheduleUrlCount', { n: urls.length });
      }
      if (s.sourceConfig.params && Object.keys(s.sourceConfig.params).length) {
        return `${pluginId} · JSON`;
      }
      return pluginId || '—';
    },
    [t],
  );

  const openCreate = () => {
    setEditingId(null);
    const preferred =
      enabledPlugins.find((p) => p.id === PLUGIN_RSS)?.id ||
      enabledPlugins[0]?.id ||
      PLUGIN_RSS;
    setDraft(emptyDraft(preferred));
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    const pluginId = resolvePluginId(s);
    const params = s.sourceConfig.params || {};
    const feedUrl = String(
      s.sourceConfig.feedUrl || params.feedUrl || '',
    ).trim();
    const urlsFromParams = Array.isArray(params.urls)
      ? (params.urls as unknown[]).map((u) => String(u || ''))
      : [];
    const urls = s.sourceConfig.urls?.length
      ? s.sourceConfig.urls
      : urlsFromParams;

    // 内置插件参数用专用字段；其余进 JSON（去掉已提升字段）
    let paramsText = '';
    if (pluginId !== PLUGIN_RSS && pluginId !== PLUGIN_URL_LIST) {
      paramsText = Object.keys(params).length
        ? JSON.stringify(params, null, 2)
        : '';
    }

    setDraft({
      name: s.name,
      pluginId,
      feedUrl,
      urlsText: urls.join('\n'),
      paramsText,
      preset: s.preset,
      cron: s.cron,
      timezone: s.timezone || 'Asia/Shanghai',
      enabled: s.enabled,
      albumId: s.jobDefaults.albumId || '',
      maxItemsPerRun: s.limits.maxItemsPerRun,
      onlyNew: s.limits.onlyNew,
      titlePrefix: s.jobDefaults.titlePrefix || '',
    });
    setShowForm(true);
  };

  const bodyFromDraft = useCallback(() => {
    const pluginId = draft.pluginId.trim();
    if (!pluginId) {
      throw new Error(t('settings.schedulePluginPick'));
    }

    let params: Record<string, unknown> = {};
    if (pluginId === PLUGIN_RSS) {
      const feedUrl = draft.feedUrl.trim();
      if (!feedUrl) throw new Error(t('settings.scheduleFeedUrlRequired'));
      params = { feedUrl };
    } else if (pluginId === PLUGIN_URL_LIST) {
      const urls = draft.urlsText
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!urls.length) throw new Error(t('settings.scheduleUrlsRequired'));
      params = { urls };
    } else if (draft.paramsText.trim()) {
      try {
        const parsed = JSON.parse(draft.paramsText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('params');
        }
        params = parsed as Record<string, unknown>;
      } catch {
        throw new Error(t('settings.scheduleParamsInvalid'));
      }
    }

    // 同步顶层字段，便于列表摘要与兼容旧读法
    const sourceConfig: {
      pluginId: string;
      params: Record<string, unknown>;
      feedUrl?: string;
      urls?: string[];
    } = {
      pluginId,
      params,
    };
    if (pluginId === PLUGIN_RSS) {
      sourceConfig.feedUrl = String(params.feedUrl || '');
    }
    if (pluginId === PLUGIN_URL_LIST) {
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
      },
      limits: {
        maxItemsPerRun: draft.maxItemsPerRun,
        onlyNew: draft.onlyNew,
      },
    };
  }, [draft, t]);

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

  const onRun = async (s: Schedule, force = false) => {
    setBusyId(s.id);
    onError(null);
    try {
      const res = await runScheduleApi(s.id, { force });
      onMessage(
        t('settings.scheduleRunDone', {
          status: res.run.status,
          n: res.run.createdJobs,
        }),
      );
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
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

  const paramFields = (() => {
    if (draft.pluginId === PLUGIN_RSS) {
      return (
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
      );
    }
    if (draft.pluginId === PLUGIN_URL_LIST) {
      return (
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
      );
    }
    return (
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
    );
  })();

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
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        pluginId: e.target.value,
                      }))
                    }
                  >
                    {!enabledPlugins.length ? (
                      <option value="">{t('settings.schedulePluginNone')}</option>
                    ) : null}
                    {enabledPlugins.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                    {/* 编辑旧数据时插件可能已停用，仍展示当前值 */}
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
                            {s.lastStatus}
                          </span>
                        ) : null}
                      </div>
                      <p className="schedule-item-meta">
                        {pluginLabel(pluginId, plugins)}
                        {' · '}
                        {presetLabel(s.preset, s.cron)}
                        {' · '}
                        {s.timezone}
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
                        {s.lastError ? ` · ${s.lastError}` : ''}
                      </p>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        type="button"
                        className="nl-btn"
                        disabled={busy}
                        onClick={() => void onRun(s, false)}
                      >
                        {t('settings.scheduleRun')}
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
