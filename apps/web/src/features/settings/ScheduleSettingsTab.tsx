import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createScheduleApi,
  deleteScheduleApi,
  fetchAllAlbums,
  fetchSchedules,
  runScheduleApi,
  updateScheduleApi,
  type Schedule,
  type ScheduleKind,
  type SchedulePreset,
} from '../../api/client';
import type { AlbumSummary } from '../../types/album';
import { useI18n } from '../../i18n';
import { SettingsBlock, SettingsCard, SettingsPanel } from './SettingsChrome';

type Draft = {
  name: string;
  kind: ScheduleKind;
  feedUrl: string;
  urlsText: string;
  preset: SchedulePreset;
  cron: string;
  timezone: string;
  enabled: boolean;
  albumId: string;
  maxItemsPerRun: number;
  onlyNew: boolean;
  titlePrefix: string;
};

const emptyDraft = (): Draft => ({
  name: '',
  kind: 'rss',
  feedUrl: '',
  urlsText: '',
  preset: 'daily',
  cron: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  albumId: '',
  maxItemsPerRun: 3,
  onlyNew: true,
  titlePrefix: '',
});

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
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, albumList] = await Promise.all([
        fetchSchedules(),
        fetchAllAlbums().catch(() => [] as AlbumSummary[]),
      ]);
      setItems(list);
      setAlbums(albumList);
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
      if (s.kind === 'rss') return s.sourceConfig.feedUrl || '—';
      const urls = s.sourceConfig.urls || [];
      if (!urls.length) return '—';
      if (urls.length === 1) return urls[0]!;
      return t('settings.scheduleUrlCount', { n: urls.length });
    },
    [t],
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setShowForm(true);
  };

  const openEdit = (s: Schedule) => {
    setEditingId(s.id);
    setDraft({
      name: s.name,
      kind: s.kind,
      feedUrl: s.sourceConfig.feedUrl || '',
      urlsText: (s.sourceConfig.urls || []).join('\n'),
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

  const bodyFromDraft = useMemo(() => {
    return () => {
      const urls = draft.urlsText
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      return {
        name: draft.name.trim(),
        enabled: draft.enabled,
        kind: draft.kind,
        sourceConfig:
          draft.kind === 'rss'
            ? { feedUrl: draft.feedUrl.trim() }
            : { urls },
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
    };
  }, [draft]);

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

  return (
    <SettingsPanel id="schedules" active={active}>
      <div className="settings-stack">
        <SettingsCard>
          <SettingsBlock
            title={t('settings.scheduleTitle')}
            desc={t('settings.scheduleDesc')}
          >
            <div className="settings-card-actions" style={{ marginTop: 0 }}>
              <span className="settings-card-hint">
                {t('settings.scheduleHint')}
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
                  <span>{t('settings.scheduleKind')}</span>
                  <select
                    className="nl-input"
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        kind: e.target.value as ScheduleKind,
                      }))
                    }
                  >
                    <option value="rss">{t('settings.scheduleKindRss')}</option>
                    <option value="url_list">
                      {t('settings.scheduleKindUrlList')}
                    </option>
                  </select>
                </label>

                {draft.kind === 'rss' ? (
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
                ) : (
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
                )}

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
                        {s.kind === 'rss'
                          ? t('settings.scheduleKindRss')
                          : t('settings.scheduleKindUrlList')}
                        {' · '}
                        {presetLabel(s.preset, s.cron)}
                        {' · '}
                        {s.timezone}
                      </p>
                      <p className="schedule-item-source" title={sourceSummary(s)}>
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
