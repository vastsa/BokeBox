import ReactMarkdown from 'react-markdown';
import {
  generateFlashcards,
  sourceAudioUrl,
  videoUrl,
} from '../../api/client';
import { FlashcardsView } from '../../components/FlashcardsView';
import { ScriptFollow } from '../../components/listen/ScriptFollow';
import { IconSpark, IconVideo, IconWave } from '../../components/icons';
import { useI18n } from '../../i18n';
import type { Job } from '../../types/job';

export type ContentTab = 'script' | 'notes' | 'flashcards' | 'transcript' | 'source';

export const CONTENT_TABS: Array<{ key: ContentTab; labelKey: string }> = [
  { key: 'script', labelKey: 'job.tabScript' },
  { key: 'notes', labelKey: 'job.tabNotes' },
  { key: 'flashcards', labelKey: 'job.tabFlashcards' },
  { key: 'transcript', labelKey: 'job.tabTranscript' },
  { key: 'source', labelKey: 'job.tabSource' },
];

type ActionKind = 'publish' | 'retry' | 'delete' | 'flashcards';

type Props = {
  job: Job;
  tab: ContentTab;
  followScript: boolean;
  playState: { current: number; duration: number };
  active: boolean;
  busy: ActionKind | null;
  onTabChange: (tab: ContentTab) => void;
  onFollowScriptChange: (next: boolean) => void;
  onSeek: (sec: number) => void;
  runAction: (kind: ActionKind, fn: () => Promise<unknown>) => Promise<void>;
};

export function JobContentPanel({
  job,
  tab,
  followScript,
  playState,
  active,
  busy,
  onTabChange,
  onFollowScriptChange,
  onSeek,
  runAction,
}: Props) {
  const { t } = useI18n();

  return (
    <section className="jd-panel jd-content">
      <div className="jd-tabs" role="tablist">
        {CONTENT_TABS.map((item) => {
          const ready =
            item.key === 'script'
              ? Boolean(job.podcast?.script)
              : item.key === 'notes'
                ? Boolean(job.podcast?.showNotes)
                : item.key === 'flashcards'
                  ? Boolean(job.podcast?.flashcards?.length)
                  : item.key === 'transcript'
                    ? Boolean(job.transcript)
                    : Boolean(job.hasVideo || job.hasSourceAudio);
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={[
                'jd-tab',
                tab === item.key ? 'is-active' : '',
                ready ? 'is-ready' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onTabChange(item.key);
                if (item.key !== 'script') onFollowScriptChange(false);
              }}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
        {job.podcast?.script && job.hasPodcastAudio && tab === 'script' && (
          <button
            type="button"
            className={['jd-follow-btn', followScript ? 'is-on' : ''].join(' ')}
            onClick={() => onFollowScriptChange(!followScript)}
          >
            {followScript ? t('job.following') : t('job.followListen')}
          </button>
        )}
      </div>

      <div className="jd-tab-body">
        {tab === 'script' &&
          (job.podcast?.script ? (
            followScript ? (
              <ScriptFollow
                script={job.podcast.script}
                currentSec={playState.current}
                durationSec={playState.duration}
                onSeek={(sec) => onSeek(sec)}
                timing={job.podcast.scriptTiming}
              />
            ) : (
              <pre className="jd-pre">{job.podcast.script}</pre>
            )
          ) : (
            <div className="jd-placeholder soft">{t('job.scriptMissing')}</div>
          ))}

        {tab === 'notes' && (
          <article className="prose-soft max-w-none">
            {job.podcast?.showNotes ? (
              <ReactMarkdown>{job.podcast.showNotes}</ReactMarkdown>
            ) : (
              <div className="jd-placeholder soft">{t('job.notesMissing')}</div>
            )}
          </article>
        )}

        {tab === 'flashcards' && (
          <div className="jd-flashcards">
            <div className="jd-flashcards-bar">
              <p className="jd-hint jd-hint-top">{t('job.flashcardsHint')}</p>
              <button
                type="button"
                className="nl-btn nl-btn-secondary"
                disabled={
                  Boolean(busy) ||
                  active ||
                  !(job.transcript || job.hasTranscript) ||
                  !job.podcast
                }
                onClick={() =>
                  void runAction('flashcards', () => generateFlashcards(job.id))
                }
              >
                <IconSpark size={14} />
                {busy === 'flashcards'
                  ? t('job.flashcardsGenerating')
                  : job.podcast?.flashcards?.length
                    ? t('job.flashcardsRegen')
                    : t('job.flashcardsGenerate')}
              </button>
            </div>
            <FlashcardsView
              cards={job.podcast?.flashcards}
              emptyText={t('job.flashcardsEmpty')}
            />
          </div>
        )}

        {tab === 'transcript' && (
          <pre className="jd-pre">
            {job.transcript || t('job.transcriptMissing')}
          </pre>
        )}

        {tab === 'source' && (
          <div className="jd-source">
            <div className="jd-source-block">
              <div className="jd-source-h">
                <span>
                  <IconVideo size={14} /> {t('job.originalVideo')}
                </span>
                <span className={job.hasVideo ? 'nl-tag nl-tag-success' : 'nl-tag'}>
                  {job.hasVideo ? t('common.ready') : t('common.unreadied')}
                </span>
              </div>
              {job.hasVideo ? (
                <video
                  controls
                  playsInline
                  className="jd-video"
                  src={videoUrl(job.id)}
                />
              ) : (
                <div className="jd-placeholder soft">{t('job.videoUnavailable')}</div>
              )}
            </div>
            <div className="jd-source-block">
              <div className="jd-source-h">
                <span>
                  <IconWave size={14} /> {t('job.extractedAudio')}
                </span>
                <span
                  className={
                    job.hasSourceAudio ? 'nl-tag nl-tag-success' : 'nl-tag'
                  }
                >
                  {job.hasSourceAudio ? t('common.ready') : t('common.unreadied')}
                </span>
              </div>
              {job.hasSourceAudio ? (
                <audio
                  controls
                  className="jd-audio"
                  src={sourceAudioUrl(job.id)}
                />
              ) : (
                <div className="jd-placeholder soft">
                  {t('job.audioMissingExtract')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
