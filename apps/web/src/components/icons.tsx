type IconProps = {
  size?: number;
  className?: string;
};

function base({ size = 20, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  };
}

/** 听播 / 品牌：耳机 */
export function IconHeadphones(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 14v-1.5a8 8 0 0 1 16 0V14" />
      <path d="M18.5 14.2v3.3a1.8 1.8 0 0 1-1.8 1.8h-.9a1.5 1.5 0 0 1-1.5-1.5v-2.1a1.5 1.5 0 0 1 1.5-1.5H20" />
      <path d="M5.5 14.2v3.3a1.8 1.8 0 0 0 1.8 1.8h.9a1.5 1.5 0 0 0 1.5-1.5v-2.1a1.5 1.5 0 0 0-1.5-1.5H4" />
    </svg>
  );
}

/** 后台仪表盘 */
export function IconDashboard(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="3.5" width="7" height="8.5" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
      <rect x="3.5" y="15" width="7" height="5.5" rx="1.8" />
    </svg>
  );
}

/** 播放 */
export function IconPlay(p: IconProps) {
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <path d="M8.2 5.4a1 1 0 0 1 1.52-.86l9.2 5.6a1 1 0 0 1 0 1.72l-9.2 5.6A1 1 0 0 1 8.2 16.6V5.4z" />
    </svg>
  );
}

/** 暂停 */
export function IconPause(p: IconProps) {
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <rect x="6.4" y="5" width="3.6" height="14" rx="1.3" />
      <rect x="14" y="5" width="3.6" height="14" rx="1.3" />
    </svg>
  );
}

/** 返回 */
export function IconBack(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
      <path d="M8.2 12H20" />
    </svg>
  );
}

/** 上传 */
export function IconUpload(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 16V5.5" />
      <path d="M7.8 9.5 12 5.2l4.2 4.3" />
      <path d="M5 19h14" />
    </svg>
  );
}

/** 刷新 */
export function IconRefresh(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
      <path d="M20.2 4.2v5.2h-5.2" />
    </svg>
  );
}

/** 删除 */
export function IconTrash(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 7h15" />
      <path d="M9.2 7V5.3A1.3 1.3 0 0 1 10.5 4h3a1.3 1.3 0 0 1 1.3 1.3V7" />
      <path d="M7.2 7l.8 12.2A1.5 1.5 0 0 0 9.5 20.6h5a1.5 1.5 0 0 0 1.5-1.4L16.8 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/** 下载 */
export function IconDownload(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 4.5v10.8" />
      <path d="M7.8 11.5 12 15.8l4.2-4.3" />
      <path d="M5 19.5h14" />
    </svg>
  );
}

/** 智能 / 火花 */
export function IconSpark(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.2 13.5 8.8 19 10.2 13.5 11.6 12 17.2 10.5 11.6 5 10.2l5.5-1.4L12 3.2z" />
      <path d="M18.2 15.2 18.8 17.4 21 18l-2.2.6-.6 2.2-.6-2.2-2.2-.6 2.2-.6.6-2.2z" />
    </svg>
  );
}

/** 完成 */
export function IconCheck(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12.4 10.1 17.2 19 7.2" />
    </svg>
  );
}

/** 后退 */
export function IconSkipBack(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5.5 6.2v11.6" />
      <path d="M18.5 6.5 10.2 12l8.3 5.5V6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 前进 */
export function IconSkipForward(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M18.5 6.2v11.6" />
      <path d="M5.5 6.5 13.8 12 5.5 17.5V6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 波形 / 音频 */
export function IconWave(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3.5 12h1.8" />
      <path d="M7.2 8.2v7.6" />
      <path d="M10.8 5.2v13.6" />
      <path d="M14.4 9v6" />
      <path d="M18 7.2v9.6" />
      <path d="M20.8 10.5v3" />
    </svg>
  );
}

/** 视频 */
export function IconVideo(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.2" y="6.2" width="12.6" height="11.6" rx="2.2" />
      <path d="M15.8 10.2 20.8 7.6v8.8l-5-2.6" />
    </svg>
  );
}

/** 麦克风 */
export function IconMic(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="9" y="3.2" width="6" height="11" rx="3" />
      <path d="M6.2 11.2a5.8 5.8 0 0 0 11.6 0" />
      <path d="M12 17v3.5" />
      <path d="M9 20.5h6" />
    </svg>
  );
}

/** 文本 */
export function IconText(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 6.2h14" />
      <path d="M12 6.2v12" />
      <path d="M8.2 18.2h7.6" />
    </svg>
  );
}

/** 更多 */
export function IconMore(p: IconProps) {
  return (
    <svg {...base(p)} fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.55" />
      <circle cx="12" cy="12" r="1.55" />
      <circle cx="18" cy="12" r="1.55" />
    </svg>
  );
}

/** 关闭 */
export function IconClose(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M17.5 6.5 6.5 17.5" />
    </svg>
  );
}

/** 链接 */
export function IconLink(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11.2 17.2a3.6 3.6 0 0 1-5.1 0l-.3-.3a3.6 3.6 0 0 1 0-5.1l2.3-2.3a3.6 3.6 0 0 1 5.1 0" />
      <path d="M12.8 6.8a3.6 3.6 0 0 1 5.1 0l.3.3a3.6 3.6 0 0 1 0 5.1l-2.3 2.3a3.6 3.6 0 0 1-5.1 0" />
    </svg>
  );
}

/** 空状态：书架/内容 */
export function IconLibrary(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 4.5h3.2A1.8 1.8 0 0 1 10 6.3V19a1.4 1.4 0 0 0-1.4-1.1H5V4.5z" />
      <path d="M14 4.5h3.2A1.8 1.8 0 0 1 19 6.3V19a1.4 1.4 0 0 0-1.4-1.1H14V4.5z" />
      <path d="M10 6.5h4" />
      <path d="M10 19h4" />
    </svg>
  );
}

/** 睡眠定时 */
export function IconMoon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M20 14.2A7.4 7.4 0 0 1 9.8 4a7.6 7.6 0 1 0 10.2 10.2z" />
    </svg>
  );
}

/** 上一集 */
export function IconTrackPrev(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5.2 6.2v11.6" />
      <path d="M18.8 6.6 9.6 12l9.2 5.4V6.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 下一集 */
export function IconTrackNext(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M18.8 6.2v11.6" />
      <path d="M5.2 6.6 14.4 12 5.2 17.4V6.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 星图 */
export function IconStars(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.2 13.3 8.1 18.2 9.4 13.3 10.7 12 15.6 10.7 10.7 5.8 9.4 10.7 8.1 12 3.2z" />
      <path d="M18.6 14.2 19.2 16.5 21.5 17.1 19.2 17.7 18.6 20 18 17.7 15.7 17.1 18 16.5 18.6 14.2z" />
      <path d="M5.8 15.2 6.3 17 8.1 17.5 6.3 18 5.8 19.8 5.3 18 3.5 17.5 5.3 17 5.8 15.2z" />
    </svg>
  );
}

/** GitHub Octocat 风格开源标识 */
export function IconGitHub(p: IconProps) {
  const size = p.size ?? 20;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={p.className}
      aria-hidden
    >
      {/*
        Octocat 剪影（卡通猫 + 触手），区别于圆形 Invertocat 标。
        路径为项目内简化 mono 版本，适配顶栏 15px。
      */}
      <path d="M12 1.75c-1.62 0-3.08.7-4.1 1.82-.68-.35-1.48-.48-2.28-.36-.9.14-1.46 1.02-1.17 1.88.5 1.48 1.72 2.62 3.25 3.1-.35.72-.54 1.52-.54 2.36 0 1.18.4 2.24 1.08 3.1-.98.8-1.62 2-1.62 3.38v.42c-1.02.48-1.74 1.5-1.74 2.7 0 .55.45 1 1 1s1-.45 1-1c0-.4.32-.72.72-.72h1.18c.28 1.42 1.52 2.48 3.02 2.48h.8c1.5 0 2.74-1.06 3.02-2.48h1.18c.4 0 .72.32.72.72 0 .55.45 1 1 1s1-.45 1-1c0-1.2-.72-2.22-1.74-2.7v-.42c0-1.38-.64-2.58-1.62-3.38.68-.86 1.08-1.92 1.08-3.1 0-.84-.19-1.64-.54-2.36 1.53-.48 2.75-1.62 3.25-3.1.29-.86-.27-1.74-1.17-1.88-.8-.12-1.6.01-2.28.36C15.08 2.45 13.62 1.75 12 1.75Zm-2.15 7.4c.48 0 .88.48.88 1.08 0 .6-.4 1.08-.88 1.08s-.88-.48-.88-1.08c0-.6.4-1.08.88-1.08Zm4.3 0c.48 0 .88.48.88 1.08 0 .6-.4 1.08-.88 1.08s-.88-.48-.88-1.08c0-.6.4-1.08.88-1.08ZM9.7 13.55c.36-.22.82-.08 1.02.3.32.62.95 1.02 1.28 1.02.33 0 .96-.4 1.28-1.02.2-.38.66-.52 1.02-.3.36.22.5.68.28 1.04-.55 1.1-1.68 1.81-2.58 1.81s-2.03-.71-2.58-1.81c-.22-.36-.08-.82.28-1.04Z" />
      <path d="M4.55 10.7c-.25-.6-.95-.9-1.52-.6-.58.28-.82.98-.52 1.54.85 1.62 1.28 2.88 1.32 4.28.02.6.52 1.07 1.12 1.05.6-.02 1.07-.52 1.05-1.12-.05-1.6-.52-3.05-1.45-5.15Zm14.9 0c.25-.6.95-.9 1.52-.6.58.28.82.98.52 1.54-.85 1.62-1.28 2.88-1.32 4.28-.02.6-.52 1.07-1.12 1.05-.6-.02-1.07-.52-1.05-1.12.05-1.6.52-3.05 1.45-5.15Z" />
    </svg>
  );
}
