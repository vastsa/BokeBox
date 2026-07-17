import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconCheck, IconClose } from '../icons';
import { useI18n } from '../../i18n';

type ToastTone = 'ok' | 'err';

export function SettingsToast({
  message,
  tone,
  onDismiss,
  durationMs,
}: {
  message: string;
  tone: ToastTone;
  onDismiss: () => void;
  /** 自动消失时长；错误默认更久一点 */
  durationMs?: number;
}) {
  const { t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const ttl = durationMs ?? (tone === 'ok' ? 2800 : 4200);

  useEffect(() => {
    setLeaving(false);
    const leaveAt = window.setTimeout(() => setLeaving(true), Math.max(0, ttl - 220));
    const doneAt = window.setTimeout(() => dismissRef.current(), ttl);
    return () => {
      window.clearTimeout(leaveAt);
      window.clearTimeout(doneAt);
    };
  }, [message, tone, ttl]);

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(() => dismissRef.current(), 180);
  };

  return (
    <div
      className={[
        'settings-toast',
        tone === 'ok' ? 'is-ok' : 'is-err',
        leaving ? 'is-leaving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={tone === 'err' ? 'alert' : 'status'}
      aria-live={tone === 'err' ? 'assertive' : 'polite'}
    >
      <span className="settings-toast-icon" aria-hidden>
        {tone === 'ok' ? <IconCheck size={15} /> : <IconAlert size={15} />}
      </span>
      <span className="settings-toast-text">{message}</span>
      <button
        type="button"
        className="settings-toast-close"
        onClick={dismiss}
        aria-label={t('common.close')}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
