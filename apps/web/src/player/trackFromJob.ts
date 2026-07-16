import { coverImageUrl, podcastAudioUrl } from '../api/client';
import { coverGradientFor } from '../lib/format';
import type { Job } from '../types/job';
import type { PlayerTrack } from './PlayerContext';

/** 从 Job 构建全局播放轨；version 用于重合成后强制刷新缓存 */
export function trackFromJob(
  job: Job,
  opts?: { version?: string | number | null },
): PlayerTrack {
  const version = opts?.version ?? job.updatedAt;
  const versionKey =
    version != null && version !== '' ? String(version) : undefined;
  const src = podcastAudioUrl(job.id, false, versionKey);

  return {
    id: job.id,
    title: job.podcast?.title || job.title,
    src,
    coverClassName: coverGradientFor(job.id, job.podcast?.coverGradient),
    coverImageUrl: job.podcast?.hasCoverImage
      ? coverImageUrl(job.id, versionKey)
      : undefined,
    downloadUrl: podcastAudioUrl(job.id, true),
    summary: job.podcast?.summary,
  };
}
