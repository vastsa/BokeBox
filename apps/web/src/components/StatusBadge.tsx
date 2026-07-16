import type { JobStatus } from '../types/job';

const MAP: Record<JobStatus, { label: string; className: string }> = {
  queued: { label: '排队中', className: 'nl-tag' },
  extracting_audio: { label: '提取音频', className: 'nl-tag nl-tag-brand' },
  transcribing: { label: '语音转写', className: 'nl-tag nl-tag-brand' },
  generating_podcast: { label: '生成脚本', className: 'nl-tag nl-tag-brand' },
  generating_cover: { label: '生成封面', className: 'nl-tag nl-tag-brand' },
  synthesizing_audio: { label: '合成音频', className: 'nl-tag nl-tag-warning' },
  done: { label: '已完成', className: 'nl-tag nl-tag-success' },
  failed: { label: '失败', className: 'nl-tag nl-tag-danger' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const item = MAP[status];
  return <span className={item.className}>{item.label}</span>;
}
