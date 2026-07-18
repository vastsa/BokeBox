import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  albumCoverUrl,
  coverImageUrl,
  createAlbumApi,
  deleteAlbumApi,
  fetchAlbums,
  fetchListenAlbums,
} from '../api/client';
import { Pagination } from '../components/ui/Pagination';
import { CoverArt } from '../components/ui/CoverArt';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { IconAlbum, IconPlus, IconTrash } from '../components/icons';
import { getToken } from '../lib/auth';
import { navigate, type Route } from '../lib/router';
import { useI18n } from '../i18n';
import { AppShell } from '../layouts/AppShell';
import type { AlbumSummary } from '../types/album';

function AlbumTile({
  album,
  onOpen,
  onDelete,
  canManage,
}: {
  album: AlbumSummary;
  onOpen: () => void;
  onDelete?: () => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const coverId = album.resolvedCoverJobId || album.coverJobId;
  return (
    <article className="al-card">
      <button type="button" className="al-card-main" onClick={onOpen}>
        <CoverArt
          seed={coverId || album.id}
          preferred={album.coverGradient}
          title={album.title}
          imageUrl={
            album.hasOwnCoverImage
              ? albumCoverUrl(album.id, album.updatedAt)
              : album.hasCoverImage && coverId
                ? coverImageUrl(coverId, album.updatedAt)
                : null
          }
          className="al-card-cover"
        />
        <div className="al-card-body">
          <h3 className="al-card-title">{album.title}</h3>
          <p className="al-card-meta">
            {t('album.itemCount', { n: album.itemCount })}
            {!album.published ? ` · ${t('album.draft')}` : ''}
          </p>
          {album.summary ? (
            <p className="al-card-summary">{album.summary}</p>
          ) : null}
        </div>
      </button>
      {canManage && onDelete ? (
        <button
          type="button"
          className="al-card-del"
          onClick={onDelete}
          aria-label={t('common.delete')}
          title={t('common.delete')}
        >
          <IconTrash size={14} />
        </button>
      ) : null}
    </article>
  );
}

export function AlbumsPage({ route }: { route: Route }) {
  const { t } = useI18n();
  const authed = Boolean(getToken());
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const PAGE_SIZE = 20;

  const refresh = useCallback(async () => {
    try {
      const res = authed
        ? await fetchAlbums({ page, pageSize: PAGE_SIZE })
        : await fetchListenAlbums({ page, pageSize: PAGE_SIZE });
      setAlbums(res.albums);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      if (res.page !== page && res.page >= 1) setPage(res.page);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authed, page]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const headSub = useMemo(() => {
    if (loading) return t('album.loading');
    if (!total) return t('album.emptyHint');
    return t('album.count', { n: total });
  }, [total, loading, t]);

  const onCreate = async () => {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const album = await createAlbumApi({
        title: name,
        summary: summary.trim(),
        published: true,
        jobIds: [],
      });
      setTitle('');
      setSummary('');
      setCreating(false);
      navigate({ name: 'album', id: album.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (album: AlbumSummary) => {
    if (!authed) return;
    const ok = window.confirm(t('album.confirmDelete', { title: album.title }));
    if (!ok) return;
    try {
      await deleteAlbumApi(album.id);
      setAlbums((prev) => prev.filter((a) => a.id !== album.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AppShell route={route}>
      <div className="al-page nl-enter">
        <div className="page-container app-page al-body">
          <PageHeader
            title={t('album.title')}
            subtitle={headSub}
            actions={
              authed ? (
                <button
                  type="button"
                  className="nl-btn nl-btn-primary al-create-btn"
                  onClick={() => setCreating((v) => !v)}
                >
                  <IconPlus size={14} />
                  {creating ? t('common.cancel') : t('album.create')}
                </button>
              ) : undefined
            }
          />

          {error && <div className="lh-error">{error}</div>}

          {authed && creating && (
            <section className="al-create-panel">
              <label className="al-field">
                <span>{t('album.fieldTitle')}</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('album.titlePlaceholder')}
                  maxLength={80}
                />
              </label>
              <label className="al-field">
                <span>{t('album.fieldSummary')}</span>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t('album.summaryPlaceholder')}
                  rows={3}
                  maxLength={400}
                />
              </label>
              <div className="al-create-actions">
                <button
                  type="button"
                  className="nl-btn nl-btn-primary"
                  disabled={!title.trim() || busy}
                  onClick={() => void onCreate()}
                >
                  {busy ? t('common.saving') : t('album.createSubmit')}
                </button>
              </div>
            </section>
          )}

          {loading ? (
            <div className="al-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="al-skel" />
              ))}
            </div>
          ) : !albums.length ? (
            <EmptyState
              icon={<IconAlbum size={28} />}
              title={t('album.emptyTitle')}
              description={t('album.emptyDesc')}
              actionLabel={authed ? t('album.create') : t('album.emptyAction')}
              onAction={() => {
                if (authed) setCreating(true);
                else navigate({ name: 'create' });
              }}
            />
          ) : (
            <>
              <div className="al-grid">
                {albums.map((album) => (
                  <AlbumTile
                    key={album.id}
                    album={album}
                    canManage={authed}
                    onOpen={() => navigate({ name: 'album', id: album.id })}
                    onDelete={() => void onDelete(album)}
                  />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                disabled={loading}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
