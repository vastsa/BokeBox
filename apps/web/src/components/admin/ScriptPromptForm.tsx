import {
  SCRIPT_PROMPT_FIELDS,
} from '../../lib/scriptPrompt';
import type { ScriptPromptOptions } from '../../types/job';

/** 口播人设表单字段 */
export function ScriptPromptForm({
  value,
  disabled,
  onChangeField,
}: {
  value: ScriptPromptOptions;
  disabled?: boolean;
  onChangeField: (key: keyof ScriptPromptOptions, text: string) => void;
}) {
  return (
    <div className="script-prompt-form">
      {SCRIPT_PROMPT_FIELDS.map((field) => (
        <label key={field.key} className="script-prompt-field">
          <span className="script-prompt-field-label">{field.label}</span>
          {field.multiline ? (
            <textarea
              className="nl-textarea"
              rows={3}
              disabled={disabled}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={(e) => onChangeField(field.key, e.target.value)}
            />
          ) : (
            <input
              className="nl-input"
              type="text"
              disabled={disabled}
              placeholder={field.placeholder}
              value={value[field.key] || ''}
              onChange={(e) => onChangeField(field.key, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}
