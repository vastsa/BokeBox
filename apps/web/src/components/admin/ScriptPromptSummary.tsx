import { hasScriptPrompt, SCRIPT_PROMPT_FIELDS, summarizeScriptPrompt } from '../../lib/scriptPrompt';
import type { ScriptPromptOptions } from '../../types/job';
import { useI18n } from '../../i18n';

export function ScriptPromptSummary({
  value,
  compact = false,
}: {
  value?: ScriptPromptOptions | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const summary = summarizeScriptPrompt(value);

  if (compact) {
    return <span>{summary}</span>;
  }

  if (!hasScriptPrompt(value)) {
    return (
      <div className="script-prompt-summary">
        <div className="script-prompt-summary-hero">
          <div className="script-prompt-summary-mode">{t('scriptPrompt.defaultPersona')}</div>
          <div className="script-prompt-summary-desc">
            {t('scriptPrompt.defaultHint')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="script-prompt-summary">
      <div className="script-prompt-summary-hero">
        <div className="script-prompt-summary-mode">{t('scriptPrompt.customPersona')}</div>
        <div className="script-prompt-summary-desc">{summary}</div>
      </div>
      <div className="script-prompt-summary-grid">
        {SCRIPT_PROMPT_FIELDS.filter((f) => value?.[f.key]).map((f) => (
          <div key={f.key} className="script-prompt-summary-item">
            <span className="label">{f.label}</span>
            <span className="value">{value?.[f.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
