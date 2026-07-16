import {
  SCRIPT_PROMPT_FIELDS,
} from '../../lib/scriptPrompt';
import type { ScriptPromptOptions } from '../../types/job';

const BASIC_KEYS: Array<keyof ScriptPromptOptions> = [
  'hostName',
  'hostIdentity',
  'showName',
  'speakingStyle',
  'audience',
  'tone',
];

const ADVANCED_KEYS: Array<keyof ScriptPromptOptions> = [
  'openingStyle',
  'closingStyle',
  'maxChars',
  'extraInstructions',
];

/** 口播人设表单字段 */
export function ScriptPromptForm({
  value,
  disabled,
  onChangeField,
  group = 'all',
}: {
  value: ScriptPromptOptions;
  disabled?: boolean;
  onChangeField: (key: keyof ScriptPromptOptions, text: string) => void;
  /** 设置页可按区块拆分字段，制作页仍用 all */
  group?: 'all' | 'basic' | 'advanced';
}) {
  const fields = SCRIPT_PROMPT_FIELDS.filter((field) => {
    if (group === 'basic') return BASIC_KEYS.includes(field.key);
    if (group === 'advanced') return ADVANCED_KEYS.includes(field.key);
    return true;
  });

  const layoutClass =
    group === 'basic'
      ? 'is-grid'
      : group === 'advanced'
        ? 'is-grid is-advanced'
        : '';

  return (
    <div className={['script-prompt-form', layoutClass].filter(Boolean).join(' ')}>
      {fields.map((field) => {
        const fullSpan =
          field.multiline ||
          field.key === 'extraInstructions' ||
          field.key === 'showName' ||
          field.key === 'audience' ||
          field.key === 'speakingStyle';

        return (
          <label
            key={field.key}
            className={['script-prompt-field', fullSpan ? 'is-span' : '']
              .filter(Boolean)
              .join(' ')}
          >
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
                type={field.inputType || 'text'}
                inputMode={field.inputType === 'number' ? 'numeric' : undefined}
                min={field.inputType === 'number' ? 300 : undefined}
                max={field.inputType === 'number' ? 8000 : undefined}
                step={field.inputType === 'number' ? 50 : undefined}
                disabled={disabled}
                placeholder={field.placeholder}
                value={value[field.key] || ''}
                onChange={(e) => onChangeField(field.key, e.target.value)}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
