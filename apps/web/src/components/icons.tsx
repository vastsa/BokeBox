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

