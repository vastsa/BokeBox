import { useMemo, useState } from 'react';
import type { AiPromptKind } from '../../api/client';
import { useI18n } from '../../i18n';
import { GlobalAiPromptSettings } from './GlobalAiPromptSettings';
import { GlobalCoverPromptSettings } from './GlobalCoverPromptSettings';

type PromptSection = 'cover' | AiPromptKind;

/**
 * 设置页 · 提示词中心
 * 封面 + 口播 / 改写 / 闪卡 合并为一页，分段切换单编辑器展示。
 */
export function GlobalPromptSettings() {
  const { t } = useI18n();
  const [section, setSection] = useState<PromptSection>('podcastSystem');

  const items = useMemo(
    () =>
      (
        [
          {
            id: 'cover' as const,
            label: t('settings.promptNavCover'),
          },
          {
            id: 'podcastSystem' as const,
            label: t('settings.promptNavPodcast'),
          },
          {
            id: 'rewriteSystem' as const,
            label: t('settings.promptNavRewrite'),
          },
          {
            id: 'flashcardSystem' as const,
            label: t('settings.promptNavFlashcard'),
          },
        ] as const
      ).map((x) => ({ ...x })),
    [t],
  );

  return (
    <div className="settings-stack prompt-hub">
      <p className="settings-panel-note">{t('settings.promptHubNote')}</p>

      <div className="settings-subtabs" role="tablist" aria-label={t('settings.tabPrompts')}>
        {items.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={['settings-subtab', active ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="prompt-hub-body" key={section}>
        {section === 'cover' ? (
          <GlobalCoverPromptSettings />
        ) : (
          <GlobalAiPromptSettings lockedKind={section} hideNote />
        )}
      </div>
    </div>
  );
}
