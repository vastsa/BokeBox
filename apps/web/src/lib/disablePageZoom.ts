/**
 * 全局禁止浏览器页面缩放。
 * 星图（.tu-canvas / .tc-universe）仍允许内部手势交互（OrbitControls 缩放）。
 */

const STAR_MAP_ZOOM_SELECTOR = '.tu-canvas, .tc-universe, .tu-stage';

function isStarMapTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(STAR_MAP_ZOOM_SELECTOR));
}

/**
 * 安装页面缩放锁定。返回卸载函数。
 */
export function initDisablePageZoom(): () => void {
  // 触控板捏合 / Ctrl+滚轮：拦截浏览器级缩放。
  // 不 stopPropagation，星图 OrbitControls 仍可读 wheel 做场景缩放。
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  };

  // iOS / Safari 页面手势缩放（始终拦截；星图用 touch 事件缩放）
  const onGesture = (e: Event) => {
    e.preventDefault();
  };

  // 非星图区域：多指触控禁止，避免整页 pinch zoom
  const onTouchMove = (e: TouchEvent) => {
    if (isStarMapTarget(e.target)) return;
    if (e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    // Safari 非标准 scale
    const scale = (e as TouchEvent & { scale?: number }).scale;
    if (typeof scale === 'number' && scale !== 1) {
      e.preventDefault();
    }
  };

  // Ctrl/Cmd + +/- / 0 快捷键缩放
  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key;
    if (
      key === '+' ||
      key === '-' ||
      key === '=' ||
      key === '_' ||
      key === '0' ||
      e.code === 'NumpadAdd' ||
      e.code === 'NumpadSubtract' ||
      e.code === 'Numpad0'
    ) {
      e.preventDefault();
    }
  };

  const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
  const touchOpts: AddEventListenerOptions = { passive: false };
  const gestureOpts: AddEventListenerOptions = { passive: false };

  window.addEventListener('wheel', onWheel, wheelOpts);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('gesturestart', onGesture, gestureOpts);
  document.addEventListener('gesturechange', onGesture, gestureOpts);
  document.addEventListener('gestureend', onGesture, gestureOpts);
  document.addEventListener('touchmove', onTouchMove, touchOpts);

  return () => {
    window.removeEventListener('wheel', onWheel, wheelOpts);
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('gesturestart', onGesture, gestureOpts);
    document.removeEventListener('gesturechange', onGesture, gestureOpts);
    document.removeEventListener('gestureend', onGesture, gestureOpts);
    document.removeEventListener('touchmove', onTouchMove, touchOpts);
  };
}
