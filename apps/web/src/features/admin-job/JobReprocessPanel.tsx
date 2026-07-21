import { IconRefresh, IconTrash } from '../../components/icons';
import { ContentLocaleSelect } from '../../components/admin/ContentLocaleSelect';
import { deleteJob, retryJob } from '../../api/client';
import { useI18n, type Locale } from '../../i18n';
import type { Job, PipelineFromStep } from '../../types/job';
import {
  RERUN_STEPS,
  canSelectFromStep,
} from './pipelineSteps';

type ActionKind = 'publish' | 'retry' | 'delete' | 'flashcards';

type Props = {
  job: Job;
  fromStep: PipelineFromStep;
  jobContentLocale: Locale;
  active: boolean;
  busy: ActionKind | null;
  canRerun: boolean;
  selectedStepOk: boolean;
  selectedMeta: (typeof RERUN_STEPS)[number] | undefined;
  confirmDelete: boolean;
  onFromStepChange: (step: PipelineFromStep) => void;
  onContentLocaleChange: (locale: Locale) => void;
  onConfirmDeleteChange: (next: boolean) => void;
  runAction: (kind: ActionKind, fn: () => Promise<unknown>) => Promise<void>;
};

export function JobReprocessPanel({
  job,
  fromStep,
  jobContentLocale,
  active,
  busy,
  canRerun,
  selectedStepOk,
  selectedMeta,
  confirmDelete,
  onFromStepChange,
  onContentLocaleChange,
  onConfirmDeleteChange,
  runAction,
}: Props) {
  const { t } = useI18n();

  return (
    <section id="jd-reprocess-panel" className="jd-panel jd-panel-ops">
      <div className="jd-side-head">
        <h2 className="jd-side-title">{t('job.reprocess')}</h2>
      </div>

      <div className="jd-ops">
        <p className="jd-hint jd-hint-top">{t('job.reprocessHint')}</p>

        <label className="jd-select-field">
          <span className="jd-select-label">{t('job.contentLocale')}</span>
          <ContentLocaleSelect
            value={jobContentLocale}
            disabled={active || Boolean(busy)}
            aria-label={t('job.contentLocaleAria')}
            onChange={onContentLocaleChange}
          />
        </label>
        <p className="jd-select-desc">{t('job.contentLocaleRerunHint')}</p>

        <label className="jd-select-field">
          <span className="jd-select-label">{t('job.fromStep')}</span>
          <select
            className="jd-select"
            value={fromStep}
            disabled={active || Boolean(busy)}
            aria-label={t('job.fromStepAria')}
            onChange={(e) =>
              onFromStepChange(e.target.value as PipelineFromStep)
            }
          >
            {RERUN_STEPS.map((step) => {
              const enabled = canSelectFromStep(job, step.key);
              return (
                <option key={step.key} value={step.key} disabled={!enabled}>
                  {t(step.labelKey)}
                  {!enabled ? t('job.missingPrereq') : ''}
                </option>
              );
            })}
          </select>
        </label>

        {selectedMeta && (
          <p className="jd-select-desc">{t(selectedMeta.descKey)}</p>
        )}

        <button
          type="button"
          className="nl-btn nl-btn-primary"
          disabled={!canRerun || !selectedStepOk || busy === 'retry'}
          onClick={() =>
            void runAction('retry', () =>
              retryJob(job.id, {
                tts: job.tts,
                fromStep,
                locale: jobContentLocale,
              }),
            )
          }
        >
          <IconRefresh size={14} />
          {busy === 'retry'
            ? t('common.processingEllipsis')
            : t('job.startFrom', {
                label: selectedMeta
                  ? t(selectedMeta.labelKey)
                  : t('job.startPoint'),
              })}
        </button>

        <p className="jd-hint">
          {fromStep === 'extract' && t('job.hintExtract')}
          {fromStep === 'transcribe' && t('job.hintTranscribe')}
          {fromStep === 'script' && t('job.hintGenerate')}
          {fromStep === 'cover' && t('job.hintCover')}
          {fromStep === 'flashcards' && t('job.hintFlashcards')}
          {fromStep === 'synthesize' && t('job.hintSynthesize')}
        </p>

        <div className="jd-danger">
          {!confirmDelete ? (
            <button
              type="button"
              className="nl-btn nl-btn-danger"
              disabled={Boolean(busy)}
              onClick={() => onConfirmDeleteChange(true)}
            >
              <IconTrash size={14} />
              {t('job.deleteJob')}
            </button>
          ) : (
            <div className="jd-confirm">
              <strong>{t('job.deleteConfirmTitle')}</strong>
              <p>{t('job.deleteConfirmBody')}</p>
              <div className="jd-confirm-actions">
                <button
                  type="button"
                  className="nl-btn nl-btn-danger"
                  disabled={busy === 'delete'}
                  onClick={() =>
                    void runAction('delete', () => deleteJob(job.id))
                  }
                >
                  {busy === 'delete'
                    ? t('common.deleting')
                    : t('common.confirmDelete')}
                </button>
                <button
                  type="button"
                  className="nl-btn nl-btn-secondary"
                  disabled={busy === 'delete'}
                  onClick={() => onConfirmDeleteChange(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
