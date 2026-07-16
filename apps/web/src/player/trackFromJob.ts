import { podcastAudioUrl } from '../api/client';
import { coverGradientFor } from '../lib/format';
import type { Job } from '../types/job';
import type { PlayerTrack } from './PlayerContext';

/** 从 Job 构建全局播放轨；version 用于重合成后强制刷新缓存 */
export function trackFromJob(
  job: Job,
  opts?: { version?: string | number | null },
): PlayerTrack {
  const version = opts?.version ?? job.updatedAt;
  const src = podcastAudioUrl(
    job.id,
    false,
    version != null && version !== '' ? String(version) : undefined,
  );

  return {
    id: job.id,
    title: job.podcast?.title || job.title,
    src,
    coverClassName: coverGradientFor(job.id, job.podcast?.coverGradient),
    downloadUrl: podcastAudioUrl(job.id, true),
    summary: job.podcast?.summary,
  };
}
