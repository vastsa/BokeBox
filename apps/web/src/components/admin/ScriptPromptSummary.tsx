import { hasScriptPrompt, SCRIPT_PROMPT_FIELDS, summarizeScriptPrompt } from '../../lib/scriptPrompt';
import type { ScriptPromptOptions } from '../../types/job';

export function ScriptPromptSummary({
  value,
  compact = false,
}: {
  value?: ScriptPromptOptions | null;
  compact?: boolean;
}) {
  const summary = summarizeScriptPrompt(value);

  if (compact) {
    return <span>{summary}</span>;
  }

  if (!hasScriptPrompt(value)) {
    return (
      <div className="script-prompt-summary">
        <div className="script-prompt-summary-hero">
          <div className="script-prompt-summary-mode">默认人设</div>
          <div className="script-prompt-summary-desc">
            未设置干预项，使用系统内置口播提示词
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="script-prompt-summary">
      <div className="script-prompt-summary-hero">
        <div className="script-prompt-summary-mode">自定义人设</div>
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
