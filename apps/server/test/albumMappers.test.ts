import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Album } from '../src/types/album.js';
import {
  albumToRow,
  rowToAlbum,
  rowToAlbumItem,
  type AlbumItemRow,
  type AlbumRow,
} from '../src/services/album/albumStore.js';

describe('album row mappers', () => {
  it('rowToAlbum maps snake_case and booleans', () => {
    const row: AlbumRow = {
      id: 'a1',
      title: '合集',
      summary: '简介',
      cover_job_id: 'j1',
      has_cover_image: 1,
      published: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    assert.deepEqual(rowToAlbum(row), {
      id: 'a1',
      title: '合集',
      summary: '简介',
      coverJobId: 'j1',
      hasOwnCoverImage: true,
      published: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('rowToAlbum treats null/0 as empty defaults', () => {
    const row: AlbumRow = {
      id: 'a2',
      title: '空',
      summary: '',
      cover_job_id: null,
      has_cover_image: null,
      published: 0,
      created_at: 't1',
      updated_at: 't2',
    };
    const album = rowToAlbum(row);
    assert.equal(album.coverJobId, null);
    assert.equal(album.hasOwnCoverImage, false);
    assert.equal(album.published, false);
    assert.equal(album.summary, '');
  });

  it('albumToRow round-trips with rowToAlbum', () => {
    const album: Album = {
      id: 'a3',
      title: '往返',
      summary: 's',
      coverJobId: 'j9',
      hasOwnCoverImage: true,
      published: false,
      createdAt: 'c',
      updatedAt: 'u',
    };
    assert.deepEqual(rowToAlbum(albumToRow(album)), album);

    const unpublished: Album = {
      ...album,
      id: 'a4',
      coverJobId: null,
      hasOwnCoverImage: false,
      published: true,
      summary: '',
    };
    assert.deepEqual(rowToAlbum(albumToRow(unpublished)), unpublished);
  });

  it('rowToAlbumItem maps item positions', () => {
    const row: AlbumItemRow = {
      album_id: 'a1',
      job_id: 'j1',
      position: 3,
    };
    assert.deepEqual(rowToAlbumItem(row), {
      albumId: 'a1',
      jobId: 'j1',
      position: 3,
    });
  });
});
