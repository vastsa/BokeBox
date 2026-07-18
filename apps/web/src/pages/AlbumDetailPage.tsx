import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  albumCoverUrl,
  coverImageUrl,
  fetchAllJobs,
  fetchListenAlbum,
  generateAlbumCoverApi,
  setAlbumItemsApi,
  updateAlbumApi,
} from '../api/client';
import {
  IconBack,
  IconPause,
  IconPlay,
  IconTrash,
} from '../components/icons';
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import { getToken } from '../lib/auth';
import { formatDuration, listenProgressPct } from '../lib/format';
import { navigate, type Route } from '../lib/router';
import { useI18n } from '../i18n';
import { AppShell } from '../layouts/AppShell';
import { usePlayer } from '../player/PlayerContext';
import { saveAlbumQueue } from '../player/albumQueue';
import { trackFromJob } from '../player/trackFromJob';
import { bestResumeSec, mergeListenRecord } from '../player/listenProgress';
import type { AlbumListenDetail, AlbumListenItem } from '../types/album';
import type { Job } from '../types/job';
import { AlbumItemsManager } from '../components/album/AlbumItemsManager';

function itemTitle(item: AlbumListenItem): string {
  return item.job.podcast?.title || item.job.title;
}

export function AlbumDetailPage({
  id,
  route,
}: {
  id: string;
  route: Route;
}) {
  const { t } = useI18n();
  const player = usePlayer();
  const authed = Boolean(getToken());
  const [album, setAlbum] = useState<AlbumListenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchListenAlbum(id);
      setAlbum(data);
      setTitle(data.title);
      setSummary(data.summary || '');
      setPublished(data.published);
      setSelectedIds(data.items.map((it) => it.job.id));
      setError(null);
    } catch (e) {
      setAlbum(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const coverId =
    album?.resolvedCoverJobId || album?.coverJobId || album?.items[0]?.job.id;
  const ownCoverUrl =
    album?.hasOwnCoverImage
      ? albumCoverUrl(album.id, album.updatedAt)
      : null;

  const playItem = (item: AlbumListenItem, openPlayer = false) => {
    if (!album) return;
    const jobIds = album.items.map((x) => x.job.id);
    saveAlbumQueue({
      albumId: album.id,
      albumTitle: album.title,
      jobIds,
    });
    const listen = mergeListenRecord(item.job.id, item.listen);
    if (player.track?.id === item.job.id) {
      if (openPlayer) navigate({ name: 'player', id: item.job.id });
      else player.toggle();
      return;
    }
    player.playTrack(trackFromJob(item.job), {
      autoplay: true,
      resume: true,
      serverProgress: listen,
      seekTo: bestResumeSec(item.job.id, listen),
    });
    if (openPlayer) navigate({ name: 'player', id: item.job.id });
  };

  const playAll = () => {
    if (!album?.items.length) return;
    const first = album.items[0];
    playItem(first, true);
  };

  const saveMeta = async () => {
    if (!album || !authed || busy) return;
    const name = title.trim();
    if (!name) {
      setError(t('album.titleRequired'));
      return;
    }
    setBusy(true);
    try {
      await updateAlbumApi(album.id, {
        title: name,
        summary: summary.trim(),
        published,
        coverJobId: album.coverJobId,
      });
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    if (!authed) return;
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const jobs = await fetchAllJobs({ filter: 'done' });
      const ready = jobs.filter(
        (j) => j.status === 'done' && j.podcast && j.published !== false,
      );
      setAllJobs(ready);
      setSelectedIds(album?.items.map((it) => it.job.id) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  };

  const saveItems = async () => {
    if (!album || !authed || busy) return;
    setBusy(true);
    try {
      await setAlbumItemsApi(album.id, selectedIds);
      setPickerOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (jobId: string) => {
    if (!album || !authed || busy) return;
    const next = album.items
      .map((it) => it.job.id)
      .filter((x) => x !== jobId);
    setBusy(true);
    try {
      await setAlbumItemsApi(album.id, next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const moveItem = async (jobId: string, dir: -1 | 1) => {
    if (!album || !authed || busy) return;
    const ids = album.items.map((it) => it.job.id);
    const idx = ids.indexOf(jobId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [row] = next.splice(idx, 1);
    next.splice(target, 0, row);
    setBusy(true);
    try {
      await setAlbumItemsApi(album.id, next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };


  const isPlayingId = player.track?.id;
  const isPlaying = player.playing;

  const generateCover = async () => {
    if (!album || !authed || generatingCover) return;
    setGeneratingCover(true);
    setError(null);
    try {
      await generateAlbumCoverApi(album.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingCover(false);
    }
  };

  const headMeta = useMemo(() => {
    if (!album) return '';
    return t('album.itemCount', { n: album.itemCount });
  }, [album, t]);

  return (
    <AppShell route={route}>
      <div className="al-page nl-enter">
        <div className="page-container app-page al-body">
          <div className="al-detail-nav">
            <button
              type="button"
              className="al-back"
              onClick={() => navigate({ name: 'albums' })}
            >
              <IconBack size={16} />
              {t('album.backToList')}
            </button>
          </div>

          {error && <div className="lh-error">{error}</div>}

          {loading ? (
            <div className="al-detail-skel" />
          ) : !album ? (
            <EmptyState
              icon={<span>∅</span>}
              title={t('album.notFoundTitle')}
              description={t('album.notFoundDesc')}
              actionLabel={t('album.backToList')}
              onAction={() => navigate({ name: 'albums' })}
            />
          ) : (
            <>
              <section className="al-hero">
                <CoverArt
                  seed={coverId || album.id}
                  preferred={album.coverGradient}
                  title={album.title}
                  imageUrl={
                    ownCoverUrl ||
                    (album.hasCoverImage && coverId
                      ? coverImageUrl(coverId, album.updatedAt)
                      : null)
                  }
                  className="al-hero-cover"
                />
                <div className="al-hero-copy">
                  <div className="al-hero-kicker">{t('album.kicker')}</div>
                  {editing ? (
                    <div className="al-edit-fields">
                      <input
                        className="al-edit-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                      />
                      <textarea
                        className="al-edit-summary"
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        rows={3}
                        maxLength={400}
                      />
                      <label className="al-check">
                        <input
                          type="checkbox"
                          checked={published}
                          onChange={(e) => setPublished(e.target.checked)}
                        />
                        {t('album.published')}
                      </label>
                    </div>
                  ) : (
                    <>
                      <h1 className="al-hero-title">{album.title}</h1>
                      <p className="al-hero-meta">{headMeta}</p>
                      {album.summary ? (
                        <p className="al-hero-summary">{album.summary}</p>
                      ) : null}
                    </>
                  )}

                  <div className="al-hero-actions">
                    <button
                      type="button"
                      className="nl-btn nl-btn-primary"
                      disabled={!album.items.length}
                      onClick={playAll}
                    >
                      <IconPlay size={14} />
                      {t('album.playAll')}
                    </button>
                    {authed && !editing && (
                      <>
                        <button
                          type="button"
                          className="nl-btn"
                          onClick={() => setEditing(true)}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className="nl-btn"
                          onClick={() => void openPicker()}
                        >
                          {t('album.manageItems')}
                        </button>
                        <button
                          type="button"
                          className="nl-btn"
                          disabled={generatingCover}
                          onClick={() => void generateCover()}
                        >
                          {generatingCover
                            ? t('album.generatingCover')
                            : album.hasOwnCoverImage
                              ? t('album.regenerateCover')
                              : t('album.generateCover')}
                        </button>
                      </>
                    )}
                    {authed && editing && (
                      <>
                        <button
                          type="button"
                          className="nl-btn nl-btn-primary"
                          disabled={busy}
                          onClick={() => void saveMeta()}
                        >
                          {busy ? t('common.saving') : t('common.save')}
                        </button>
                        <button
                          type="button"
                          className="nl-btn"
                          onClick={() => {
                            setEditing(false);
                            setTitle(album.title);
                            setSummary(album.summary || '');
                            setPublished(album.published);
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <section className="al-tracklist">
                <div className="lh-section-head">
                  <h2 className="lh-section-title">{t('album.tracklist')}</h2>
                  <span className="lh-section-meta">{album.items.length}</span>
                </div>

                {!album.items.length ? (
                  <div className="al-empty-items">
                    {t('album.noItems')}
                    {authed ? (
                      <button
                        type="button"
                        className="lh-empty-filter-btn"
                        onClick={() => void openPicker()}
                      >
                        {t('album.manageItems')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <ol className="al-tracks">
                    {album.items.map((item, index) => {
                      const titleText = itemTitle(item);
                      const pct = listenProgressPct(
                        item.listen?.progressSec,
                        item.listen?.durationSec,
                      );
                      const active = isPlayingId === item.job.id;
                      const playing = active && isPlaying;
                      const mins =
                        item.listen?.durationSec
                          ? formatDuration(item.listen.durationSec)
                          : item.job.podcast?.estimatedMinutes
                            ? t('common.minutes', {
                                n: item.job.podcast.estimatedMinutes,
                              })
                            : t('app.podcast');
                      return (
                        <li
                          key={item.job.id}
                          className={[
                            'al-track',
                            active ? 'is-active' : '',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            className="al-track-main"
                            onClick={() => playItem(item)}
                            onDoubleClick={() => playItem(item, true)}
                          >
                            <span className="al-track-idx">
                              {playing ? (
                                <IconPause size={14} />
                              ) : active ? (
                                <IconPlay size={14} />
                              ) : (
                                index + 1
                              )}
                            </span>
                            <CoverArt
                              seed={item.job.id}
                              preferred={item.job.podcast?.coverGradient}
                              title={titleText}
                              imageUrl={
                                item.job.podcast?.hasCoverImage
                                  ? coverImageUrl(
                                      item.job.id,
                                      item.job.updatedAt,
                                    )
                                  : null
                              }
                              className="al-track-cover"
                            />
                            <span className="al-track-copy">
                              <span className="al-track-title">{titleText}</span>
                              <span className="al-track-meta">
                                {mins}
                                {item.listen?.completed
                                  ? ` · ${t('home.finished')}`
                                  : pct > 0
                                    ? ` · ${Math.round(pct)}%`
                                    : ''}
                              </span>
                              {pct > 0 && !item.listen?.completed ? (
                                <span className="al-track-bar">
                                  <i style={{ width: `${pct}%` }} />
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <div className="al-track-actions">
                            <button
                              type="button"
                              className="al-icon-btn"
                              onClick={() => playItem(item, true)}
                              title={t('player.openPage')}
                            >
                              <IconPlay size={14} />
                            </button>
                            {authed ? (
                              <>
                                <button
                                  type="button"
                                  className="al-icon-btn"
                                  disabled={index === 0 || busy}
                                  onClick={() => void moveItem(item.job.id, -1)}
                                  title={t('album.moveUp')}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="al-icon-btn"
                                  disabled={
                                    index === album.items.length - 1 || busy
                                  }
                                  onClick={() => void moveItem(item.job.id, 1)}
                                  title={t('album.moveDown')}
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  className="al-icon-btn is-danger"
                                  disabled={busy}
                                  onClick={() => void removeItem(item.job.id)}
                                  title={t('album.removeItem')}
                                >
                                  <IconTrash size={14} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}

          {pickerOpen && (
            <AlbumItemsManager
              jobs={allJobs}
              selectedIds={selectedIds}
              loading={pickerLoading}
              busy={busy}
              onChange={setSelectedIds}
              onClose={() => {
                if (busy) return;
                setPickerOpen(false);
                setSelectedIds(album?.items.map((it) => it.job.id) || []);
              }}
              onSave={() => void saveItems()}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
