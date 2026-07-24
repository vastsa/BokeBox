/**
 * TagUniverse 场景构建工具（three.js）
 * 与 React 组件解耦，便于拆包与单测
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { hashSeed } from '../../lib/format';
import type { TagStar } from './types';

export type StarRuntime = {
  name: string;
  group: THREE.Group;
  core: THREE.Mesh;
  corona: THREE.Mesh;
  halo: THREE.Mesh;
  spike: THREE.Mesh;
  label: CSS2DObject | null;
  basePos: THREE.Vector3;
  baseScale: number;
  phase: number;
  color: THREE.Color;
  count: number;
  /** 上一帧交互态，避免每帧改 material */
  visual: 'idle' | 'hover' | 'active';
  lastDim: number;
};

export const BG_DARK = 0x02030a;
export const BG_LIGHT = 0xf3f7fc;
/** @deprecated 使用 resolveUniverseTheme().bg */
export const BG = BG_DARK;
export const ZERO = new THREE.Vector3(0, 0, 0);
export const WHITE = new THREE.Color(1, 1, 1);

export type UniverseMode = 'dark' | 'light';

export type UniverseTheme = {
  mode: UniverseMode;
  bg: number;
  fogDensity: number;
  /** 背景星 / 尘埃整体亮度倍率 */
  fieldBoost: number;
  starOpacity: number;
  milkyOpacity: number;
  nearOpacity: number;
  dustOpacity: number;
  nebulaOpacity: number;
  orbitOpacity: number;
  linkOpacity: number;
  selectRing: number;
  selectOuter: number;
  selectTick: number;
};

export function detectUniverseMode(): UniverseMode {
  if (typeof document === 'undefined') return 'dark';
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? 'light' : 'dark';
}

export function resolveUniverseTheme(mode: UniverseMode = detectUniverseMode()): UniverseTheme {
  if (mode === 'light') {
    return {
      mode,
      bg: BG_LIGHT,
      fogDensity: 0.008,
      fieldBoost: 0.92,
      starOpacity: 0.78,
      milkyOpacity: 0.5,
      nearOpacity: 0.86,
      dustOpacity: 0.28,
      nebulaOpacity: 0.18,
      orbitOpacity: 0.22,
      linkOpacity: 0.2,
      selectRing: 0x4f8ef7,
      selectOuter: 0x3b7aef,
      selectTick: 0x6aa8ff,
    };
  }
  return {
    mode,
    bg: BG_DARK,
    fogDensity: 0.012,
    fieldBoost: 1,
    starOpacity: 0.9,
    milkyOpacity: 0.55,
    nearOpacity: 0.95,
    dustOpacity: 0.35,
    nebulaOpacity: 0.22,
    orbitOpacity: 0.28,
    linkOpacity: 0.14,
    selectRing: 0x8fb8ff,
    selectOuter: 0x6ec8ff,
    selectTick: 0xb8d2ff,
  };
}

export type Quality = {
  dpr: number;
  farStars: number;
  nearStars: number;
  milkyStars: number;
  dustPoints: number;
  nebulae: number;
  orbitRings: number;
  antialias: boolean;
  animateIdle: boolean;
  twinkle: boolean;
  labelSortEvery: number;
};

export function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  const saveData = Boolean(conn?.saveData);
  const slowNet = Boolean(conn?.effectiveType && /2g|slow-2g|3g/i.test(conn.effectiveType));
  const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 多数设备默认走 low/mid，避免桌面也堆 2k+ 点云
  const low = saveData || slowNet || reducedMotion || mobile || cores <= 6 || mem <= 4;
  const mid = !low && (cores <= 10 || mem <= 8);

  if (low) {
    return {
      dpr: 1,
      farStars: 220,
      nearStars: 48,
      milkyStars: 120,
      dustPoints: 24,
      nebulae: 1,
      orbitRings: 0,
      antialias: false,
      animateIdle: false,
      twinkle: false,
      labelSortEvery: 12,
    };
  }
  if (mid) {
    return {
      dpr: Math.min(window.devicePixelRatio || 1, 1.15),
      farStars: 420,
      nearStars: 80,
      milkyStars: 220,
      dustPoints: 48,
      nebulae: 2,
      orbitRings: 1,
      antialias: false,
      animateIdle: true,
      twinkle: false,
      labelSortEvery: 8,
    };
  }
  return {
    dpr: Math.min(window.devicePixelRatio || 1, 1.25),
    farStars: 560,
    nearStars: 96,
    milkyStars: 280,
    dustPoints: 56,
    nebulae: 2,
    orbitRings: 1,
    antialias: false,
    animateIdle: true,
    twinkle: false,
    labelSortEvery: 8,
  };
}

/** 基于标签名的冷暖光谱色，偏深空科技感 */
export function colorForTag(name: string): THREE.Color {
  const h = hashSeed(name);
  const palette = [
    [0.58, 0.72, 0.7], // 冰蓝
    [0.54, 0.68, 0.66], // 青蓝
    [0.72, 0.55, 0.7], // 紫
    [0.08, 0.62, 0.72], // 琥珀
    [0.48, 0.5, 0.72], // 蓝白
    [0.62, 0.48, 0.76], // 品红紫
    [0.5, 0.42, 0.78], // 冷白
    [0.15, 0.55, 0.68], // 金橙
  ] as const;
  const [hh, s, l] = palette[h % palette.length];
  const c = new THREE.Color();
  c.setHSL(hh + ((h % 40) - 20) * 0.0011, s, l);
  return c;
}

export function fibSphere(i: number, n: number, radius: number): THREE.Vector3 {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  const jitter = 0.86 + (hashSeed(`${i}-r`) % 100) / 380;
  const rr = radius * jitter;
  return new THREE.Vector3(
    Math.cos(theta) * r * rr,
    y * rr * 0.88,
    Math.sin(theta) * r * rr,
  );
}

export function makeRadialTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 望远镜衍射十字 + 对角次级射线 */
export function makeSpikeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const drawRay = (angle: number, len: number, width: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, -len, 0, len);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.42, `rgba(255,255,255,${alpha * 0.55})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.58, `rgba(255,255,255,${alpha * 0.55})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -len, width, len * 2);
    ctx.restore();
  };

  // 主十字（更锐）
  drawRay(0, 118, 1.6, 0.95);
  drawRay(Math.PI / 2, 118, 1.6, 0.95);
  // 次级斜向
  drawRay(Math.PI / 4, 62, 0.9, 0.28);
  drawRay(-Math.PI / 4, 62, 0.9, 0.28);
  // 轻微加宽的弥散射线
  drawRay(0, 80, 4.5, 0.12);
  drawRay(Math.PI / 2, 80, 4.5, 0.12);

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 深空渐变背景（中心略亮、边缘冷暗） */
export function makeSpaceBgTexture(mode: UniverseMode = 'dark'): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (mode === 'light') {
    // 日间深空：冷白到冰蓝的天穹，保留星图气质但不压黑
    const g = ctx.createRadialGradient(
      size * 0.5,
      size * 0.42,
      0,
      size * 0.5,
      size * 0.52,
      size * 0.78,
    );
    g.addColorStop(0, '#fbfcfe');
    g.addColorStop(0.28, '#f3f7fc');
    g.addColorStop(0.62, '#e8f0f8');
    g.addColorStop(1, '#dce7f2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const g2 = ctx.createRadialGradient(
      size * 0.74,
      size * 0.7,
      0,
      size * 0.74,
      size * 0.7,
      size * 0.44,
    );
    g2.addColorStop(0, 'rgba(124, 92, 255, 0.05)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, size, size);

    const g3 = ctx.createRadialGradient(
      size * 0.22,
      size * 0.28,
      0,
      size * 0.22,
      size * 0.28,
      size * 0.4,
    );
    g3.addColorStop(0, 'rgba(79, 142, 247, 0.08)');
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, size, size);

    const g4 = ctx.createRadialGradient(
      size * 0.5,
      size * 0.9,
      0,
      size * 0.5,
      size * 0.9,
      size * 0.5,
    );
    g4.addColorStop(0, 'rgba(47, 214, 207, 0.04)');
    g4.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g4;
    ctx.fillRect(0, 0, size, size);
  } else {
    const g = ctx.createRadialGradient(
      size * 0.48,
      size * 0.42,
      0,
      size * 0.5,
      size * 0.5,
      size * 0.72,
    );
    g.addColorStop(0, '#0a1020');
    g.addColorStop(0.35, '#050812');
    g.addColorStop(0.7, '#03040c');
    g.addColorStop(1, '#010208');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // 极淡色偏，增强景深
    const g2 = ctx.createRadialGradient(
      size * 0.72,
      size * 0.68,
      0,
      size * 0.72,
      size * 0.68,
      size * 0.42,
    );
    g2.addColorStop(0, 'rgba(70, 40, 120, 0.12)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, size, size);

    const g3 = ctx.createRadialGradient(
      size * 0.22,
      size * 0.28,
      0,
      size * 0.22,
      size * 0.28,
      size * 0.38,
    );
    g3.addColorStop(0, 'rgba(40, 90, 160, 0.1)');
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 恒星光谱色温采样（更真实，略偏冷色） */
export function sampleStellarColor(seed: number, out: THREE.Color) {
  const roll = ((seed * 9301 + 49297) % 233280) / 233280;
  if (roll > 0.92) {
    // O/B 热蓝白
    out.setRGB(0.72 + roll * 0.15, 0.82 + roll * 0.1, 1);
  } else if (roll > 0.72) {
    // A 白
    out.setRGB(0.92, 0.94, 1);
  } else if (roll > 0.45) {
    // F/G 微黄白
    out.setRGB(1, 0.94, 0.86);
  } else if (roll > 0.22) {
    // K 橙
    out.setRGB(1, 0.78, 0.55);
  } else {
    // M 红矮
    out.setRGB(1, 0.55, 0.42);
  }
}

export type StarfieldOpts = {
  count: number;
  rMin: number;
  rMax: number;
  /** 银河盘面压扁 + 密度偏置 */
  milky?: boolean;
  seed?: number;
};

export function makeStarfield(opts: StarfieldOpts) {
  const { count, rMin, rMax, milky = false, seed = 1 } = opts;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tmp = new THREE.Color();

  // 银河盘面朝向
  const tilt = 0.42;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  for (let i = 0; i < count; i += 1) {
    const s = seed * 9973 + i * 7919;
    const rand = (n: number) => {
      const x = Math.sin(s * 0.001 + n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    let x: number;
    let y: number;
    let z: number;

    if (milky) {
      // 盘面高斯分布 + 径向带
      const r = rMin + rand(1) * (rMax - rMin);
      const theta = rand(2) * Math.PI * 2;
      const arm = Math.sin(theta * 2.2 + r * 0.08) * 0.35;
      const thick = (rand(3) - 0.5) * (1.8 + r * 0.04);
      const px = Math.cos(theta + arm) * r;
      const py = thick;
      const pz = Math.sin(theta + arm) * r * 0.92;
      // 倾斜
      x = px;
      y = py * cosT - pz * sinT;
      z = py * sinT + pz * cosT;
    } else {
      const r = rMin + rand(1) * (rMax - rMin);
      const phi = Math.acos(2 * rand(2) - 1);
      const theta = rand(3) * Math.PI * 2;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi) * (milky ? 0.35 : 0.72);
      z = r * Math.sin(phi) * Math.sin(theta);
    }

    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;

    sampleStellarColor(s, tmp);
    // 远星更淡、更冷
    const fade = milky ? 0.78 + rand(4) * 0.22 : 0.7 + rand(4) * 0.3;
    col[i * 3] = tmp.r * fade;
    col[i * 3 + 1] = tmp.g * fade;
    col[i * 3 + 2] = tmp.b * fade;

    // 视星等：少数亮星
    const bright = rand(5);
    sizes[i] = bright > 0.97 ? 2.4 + rand(6) * 1.6 : bright > 0.85 ? 1.3 + rand(6) * 0.7 : 0.55 + rand(6) * 0.7;
    phases[i] = rand(7) * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geo;
}

export function attachStarShader(
  mat: THREE.PointsMaterial,
  uniforms: { uTime: { value: number }; uTwinkle: { value: number } },
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uTwinkle = uniforms.uTwinkle;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aSize;
         attribute float aPhase;
         uniform float uTime;
         uniform float uTwinkle;
         varying float vTwinkle;`,
      )
      .replace(
        'gl_PointSize = size;',
        `float tw = 1.0 + uTwinkle * 0.22 * sin(uTime * (1.3 + aPhase * 0.15) + aPhase);
         vTwinkle = tw;
         gl_PointSize = size * aSize * tw;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vTwinkle;`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity * clamp(vTwinkle, 0.75, 1.35) );`,
      );
  };
  mat.needsUpdate = true;
}

export function buildLinks(tags: TagStar[], positions: THREE.Vector3[]): {
  positions: number[];
  colors: number[];
} {
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < tags.length; i += 1) {
    const setA = new Set(tags[i].items.map((x) => x.job.id));
    for (let j = i + 1; j < tags.length; j += 1) {
      let shared = 0;
      for (const it of tags[j].items) {
        if (setA.has(it.job.id)) shared += 1;
      }
      if (shared <= 0) continue;
      const dist = positions[i].distanceTo(positions[j]);
      pairs.push([i, j, shared * 10 - dist * 0.15]);
    }
  }
  pairs.sort((a, b) => b[2] - a[2]);
  // 连线 O(n^2) 结果再截断，控制线段数量避免填充率爆炸
  const maxLinks = Math.min(
    pairs.length,
    Math.max(2, Math.min(28, Math.floor(tags.length * 0.55))),
  );
  const outPos: number[] = [];
  const outCol: number[] = [];
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  for (let k = 0; k < maxLinks; k += 1) {
    const [i, j] = pairs[k];
    outPos.push(
      positions[i].x,
      positions[i].y,
      positions[i].z,
      positions[j].x,
      positions[j].y,
      positions[j].z,
    );
    cA.copy(colorForTag(tags[i].name));
    cB.copy(colorForTag(tags[j].name));
    outCol.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
  }
  return { positions: outPos, colors: outCol };
}

export function setStarVisual(s: StarRuntime, mode: 'idle' | 'hover' | 'active', dim: number) {
  if (s.visual === mode && Math.abs(s.lastDim - dim) < 0.001) return;
  s.lastDim = dim;
  const coreMat = s.core.material as THREE.MeshBasicMaterial;
  const coronaMat = s.corona.material as THREE.MeshBasicMaterial;
  const haloMat = s.halo.material as THREE.MeshBasicMaterial;
  const spikeMat = s.spike.material as THREE.MeshBasicMaterial;

  const sc =
    s.baseScale * (mode === 'active' ? 1.24 : mode === 'hover' ? 1.13 : 1);

  s.core.scale.setScalar(sc * (mode === 'active' ? 0.58 : 0.52));
  s.corona.scale.setScalar(sc * (mode === 'active' ? 3.4 : mode === 'hover' ? 3.0 : 2.7));
  s.halo.scale.setScalar(sc * (mode === 'active' ? 9.2 : mode === 'hover' ? 8.2 : 7.4));
  s.spike.scale.setScalar(sc * (mode === 'active' ? 14.5 : mode === 'hover' ? 12.8 : 11.2));

  if (mode === 'active') {
    coreMat.color.copy(WHITE);
    coronaMat.color.copy(s.color).lerp(WHITE, 0.35);
    haloMat.color.copy(s.color).lerp(WHITE, 0.14);
    spikeMat.color.copy(s.color).lerp(WHITE, 0.08);
    coreMat.opacity = 1;
    coronaMat.opacity = 0.55;
    haloMat.opacity = 0.92;
    spikeMat.opacity = 0.5;
    s.spike.visible = true;
  } else if (mode === 'hover') {
    coreMat.color.copy(WHITE);
    coronaMat.color.copy(s.color).lerp(WHITE, 0.2);
    haloMat.color.copy(s.color);
    spikeMat.color.copy(s.color);
    coreMat.opacity = 1;
    coronaMat.opacity = 0.42;
    haloMat.opacity = 0.9;
    spikeMat.opacity = 0.36;
    s.spike.visible = true;
  } else {
    coreMat.color.copy(WHITE);
    coronaMat.color.copy(s.color);
    haloMat.color.copy(s.color);
    spikeMat.color.copy(s.color);
    coreMat.opacity = 0.68 + 0.32 * dim;
    coronaMat.opacity = 0.28 * dim;
    haloMat.opacity = 0.74 * dim;
    spikeMat.opacity = (0.12 + (s.count > 1 ? 0.1 : 0)) * dim;
    // 低占用：非强调星隐藏十字炫光 draw call
    s.spike.visible = dim > 0.85 && s.count > 1;
  }
  s.visual = mode;
}

