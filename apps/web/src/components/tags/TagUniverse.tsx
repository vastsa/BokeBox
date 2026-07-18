import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { LibraryItem } from '../../types/job';
import { hashSeed } from '../../lib/format';

export type TagStar = {
  name: string;
  count: number;
  items: LibraryItem[];
};

type Props = {
  tags: TagStar[];
  selected?: string | null;
  onSelect: (name: string | null) => void;
  /** WebGL 首帧绘制完成后回调，用于收起加载层 */
  onReady?: () => void;
  className?: string;
};

type StarRuntime = {
  name: string;
  group: THREE.Group;
  core: THREE.Mesh;
  corona: THREE.Mesh;
  halo: THREE.Mesh;
  spike: THREE.Mesh;
  label: CSS2DObject;
  basePos: THREE.Vector3;
  baseScale: number;
  phase: number;
  color: THREE.Color;
  count: number;
  /** 上一帧交互态，避免每帧改 material */
  visual: 'idle' | 'hover' | 'active';
  lastDim: number;
};

const BG = 0x02030a;
const ZERO = new THREE.Vector3(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);

type Quality = {
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

function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const low = saveData || mobile || cores <= 4 || mem <= 4;
  const mid = !low && (cores <= 6 || mem <= 6);

  if (low) {
    return {
      dpr: 1,
      farStars: 520,
      nearStars: 90,
      milkyStars: 280,
      dustPoints: 60,
      nebulae: 3,
      orbitRings: 1,
      antialias: false,
      animateIdle: false,
      twinkle: false,
      labelSortEvery: 10,
    };
  }
  if (mid) {
    return {
      dpr: Math.min(window.devicePixelRatio || 1, 1.25),
      farStars: 900,
      nearStars: 150,
      milkyStars: 480,
      dustPoints: 110,
      nebulae: 4,
      orbitRings: 2,
      antialias: false,
      animateIdle: true,
      twinkle: true,
      labelSortEvery: 6,
    };
  }
  return {
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    farStars: 1400,
    nearStars: 220,
    milkyStars: 720,
    dustPoints: 180,
    nebulae: 5,
    orbitRings: 3,
    antialias: true,
    animateIdle: true,
    twinkle: true,
    labelSortEvery: 5,
  };
}

/** 基于标签名的冷暖光谱色，偏深空科技感 */
function colorForTag(name: string): THREE.Color {
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

function fibSphere(i: number, n: number, radius: number): THREE.Vector3 {
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

function makeRadialTexture(stops: Array<[number, string]>, size = 128): THREE.CanvasTexture {
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
function makeSpikeTexture(): THREE.CanvasTexture {
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
function makeSpaceBgTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size * 0.48, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.72);
  g.addColorStop(0, '#0a1020');
  g.addColorStop(0.35, '#050812');
  g.addColorStop(0.7, '#03040c');
  g.addColorStop(1, '#010208');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 极淡色偏，增强景深
  const g2 = ctx.createRadialGradient(size * 0.72, size * 0.68, 0, size * 0.72, size * 0.68, size * 0.42);
  g2.addColorStop(0, 'rgba(70, 40, 120, 0.12)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, size, size);

  const g3 = ctx.createRadialGradient(size * 0.22, size * 0.28, 0, size * 0.22, size * 0.28, size * 0.38);
  g3.addColorStop(0, 'rgba(40, 90, 160, 0.1)');
  g3.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 恒星光谱色温采样（更真实，略偏冷色） */
function sampleStellarColor(seed: number, out: THREE.Color) {
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

type StarfieldOpts = {
  count: number;
  rMin: number;
  rMax: number;
  /** 银河盘面压扁 + 密度偏置 */
  milky?: boolean;
  seed?: number;
};

function makeStarfield(opts: StarfieldOpts) {
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

function attachStarShader(
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

function buildLinks(tags: TagStar[], positions: THREE.Vector3[]): {
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
  const maxLinks = Math.min(pairs.length, Math.max(3, Math.floor(tags.length * 1.15)));
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

function setStarVisual(s: StarRuntime, mode: 'idle' | 'hover' | 'active', dim: number) {
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

export function TagUniverse({ tags, selected, onSelect, onReady, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const selectedRef = useRef(selected);
  const starsRef = useRef<StarRuntime[]>([]);
  const hoverRef = useRef<string | null>(null);

  const tagKey = useMemo(
    () => tags.map((t) => `${t.name}:${t.count}`).join('|'),
    [tags],
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    selectedRef.current = selected;
    for (const s of starsRef.current) {
      const active = Boolean(selected && s.name === selected);
      s.label.element.classList.toggle('is-focus', active);
    }
  }, [selected]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let disposed = false;
    let ignoreCanvasPickUntil = 0;
    const quality = detectQuality();

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.012);

    const bgTex = makeSpaceBgTexture();
    scene.background = bgTex;

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 180);
    camera.position.set(0.55, 1.65, 15.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(quality.dpr);
    renderer.setClearColor(BG, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 避免 ACES/Bloom 卡顿；靠贴图与叠加混合做“发光感”
    renderer.toneMapping = THREE.NoToneMapping;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.className = 'tu-canvas';

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'tu-labels';
    wrap.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.46;
    controls.zoomSpeed = 0.72;
    controls.minDistance = 6;
    controls.maxDistance = 34;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.24;
    controls.target.copy(ZERO);

    const dustTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,1)'],
        [0.18, 'rgba(255,255,255,0.72)'],
        [0.45, 'rgba(255,255,255,0.18)'],
        [0.78, 'rgba(255,255,255,0.04)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      64,
    );

    const shaderUniforms = {
      uTime: { value: 0 },
      uTwinkle: { value: quality.twinkle ? 1 : 0 },
    };

    // 远景星场
    const farGeo = makeStarfield({
      count: quality.farStars,
      rMin: 24,
      rMax: 72,
      seed: 11,
    });
    const farMat = new THREE.PointsMaterial({
      size: 0.055,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    attachStarShader(farMat, shaderUniforms);
    const farPoints = new THREE.Points(farGeo, farMat);
    scene.add(farPoints);

    // 银河带：盘面致密星云
    const milkyGeo = makeStarfield({
      count: quality.milkyStars,
      rMin: 14,
      rMax: 58,
      milky: true,
      seed: 29,
    });
    const milkyMat = new THREE.PointsMaterial({
      size: 0.07,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    attachStarShader(milkyMat, shaderUniforms);
    const milkyPoints = new THREE.Points(milkyGeo, milkyMat);
    milkyPoints.rotation.z = 0.18;
    scene.add(milkyPoints);

    // 近景亮星
    const nearGeo = makeStarfield({
      count: quality.nearStars,
      rMin: 9,
      rMax: 24,
      seed: 47,
    });
    const nearMat = new THREE.PointsMaterial({
      size: 0.11,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    attachStarShader(nearMat, shaderUniforms);
    const nearPoints = new THREE.Points(nearGeo, nearMat);
    scene.add(nearPoints);

    // 星尘微粒（更软、更大）
    const dustGeo = makeStarfield({
      count: quality.dustPoints,
      rMin: 8,
      rMax: 30,
      milky: true,
      seed: 73,
    });
    const dustSoftTex = makeRadialTexture(
      [
        [0, 'rgba(200,220,255,0.55)'],
        [0.4, 'rgba(140,170,255,0.12)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      64,
    );
    const dustMat = new THREE.PointsMaterial({
      size: 0.55,
      map: dustSoftTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    scene.add(dustPoints);

    // 星云体
    const nebulaGroup = new THREE.Group();
    scene.add(nebulaGroup);
    const nebulaTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,0.55)'],
        [0.22, 'rgba(255,255,255,0.28)'],
        [0.55, 'rgba(255,255,255,0.08)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      256,
    );
    const nebulaColors = [0x3d7cff, 0x7c5cff, 0x2fd6cf, 0x5b8dff, 0xa06bff];
    for (let i = 0; i < quality.nebulae; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: nebulaTex,
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.1 + (i % 3) * 0.02,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const ang = (i / Math.max(quality.nebulae, 1)) * Math.PI * 2 + 0.4;
      const rad = 6.5 + (i % 4) * 1.6;
      const elev = ((i % 5) - 2) * 1.05;
      mesh.position.set(Math.cos(ang) * rad, elev, Math.sin(ang) * rad * 0.78);
      mesh.scale.set(10 + (i % 3) * 2.4, 7 + (i % 2) * 2.2, 1);
      mesh.userData.phase = i * 1.37;
      mesh.userData.spin = 0.02 + (i % 3) * 0.01;
      nebulaGroup.add(mesh);
    }

    // 科技感轨道环（中心参考平面）
    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);
    for (let i = 0; i < quality.orbitRings; i += 1) {
      const r = 5.2 + i * 2.1;
      const curve = new THREE.EllipseCurve(0, 0, r, r * (0.72 + i * 0.04), 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(96 + i * 16);
      const geo = new THREE.BufferGeometry().setFromPoints(
        pts.map((p) => new THREE.Vector3(p.x, 0, p.y)),
      );
      const mat = new THREE.LineBasicMaterial({
        color: i === 0 ? 0x6aa8ff : 0x5b7cff,
        transparent: true,
        opacity: 0.07 + i * 0.02,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.LineLoop(geo, mat);
      line.rotation.x = 0.18 + i * 0.05;
      line.rotation.z = i * 0.35;
      line.userData.spin = 0.015 + i * 0.008;
      orbitGroup.add(line);
    }

    const glowTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,1)'],
        [0.1, 'rgba(255,255,255,0.92)'],
        [0.28, 'rgba(255,255,255,0.38)'],
        [0.55, 'rgba(255,255,255,0.1)'],
        [0.82, 'rgba(255,255,255,0.02)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      160,
    );
    const coronaTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,0.95)'],
        [0.2, 'rgba(255,255,255,0.45)'],
        [0.55, 'rgba(255,255,255,0.08)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      96,
    );
    const spikeTex = makeSpikeTexture();
    // 低面数内核
    const coreGeo = new THREE.SphereGeometry(1, 14, 14);
    const planeGeo = new THREE.PlaneGeometry(1, 1);

    const root = new THREE.Group();
    scene.add(root);

    const maxCount = Math.max(1, ...tags.map((t) => t.count));
    const radius = Math.max(4.6, Math.min(10.2, 3.4 + Math.sqrt(Math.max(tags.length, 1)) * 0.95));
    const positions = tags.map((_, i) => fibSphere(i, Math.max(tags.length, 1), radius));
    const runtimes: StarRuntime[] = [];

    tags.forEach((tag, i) => {
      const color = colorForTag(tag.name);
      const weight = tag.count / maxCount;
      const baseScale = 0.12 + weight * 0.28 + 0.04;

      const group = new THREE.Group();
      group.position.copy(positions[i]);
      group.userData.name = tag.name;

      const core = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({
          color: WHITE,
          transparent: true,
          opacity: 0.98,
        }),
      );
      core.scale.setScalar(baseScale * 0.52);

      // 恒星色球层：给内核一点真实色温
      const corona = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: coronaTex,
          color,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      corona.scale.setScalar(baseScale * 2.7);

      const halo = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.scale.setScalar(baseScale * 7.4);

      const spike = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: spikeTex,
          color,
          transparent: true,
          opacity: 0.18 + weight * 0.28,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spike.scale.setScalar(baseScale * 11.2);
      spike.visible = tag.count > 1;

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tu-label' + (selectedRef.current === tag.name ? ' is-focus' : '');
      const dot = document.createElement('span');
      dot.className = 'tu-label-dot';
      const text = document.createElement('span');
      text.className = 'tu-label-text';
      text.textContent = tag.name;
      const count = document.createElement('span');
      count.className = 'tu-label-count';
      count.textContent = String(tag.count);
      el.append(dot, text, count);
      el.style.setProperty('--star', `#${color.getHexString()}`);
      el.dataset.tagName = tag.name;
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        ignoreCanvasPickUntil = performance.now() + 500;
      });
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ignoreCanvasPickUntil = performance.now() + 500;
        const next = selectedRef.current === tag.name ? null : tag.name;
        onSelectRef.current(next);
      });

      const label = new CSS2DObject(el);
      label.position.set(0, baseScale * 1.85, 0);

      group.add(core);
      group.add(corona);
      group.add(halo);
      group.add(spike);
      group.add(label);
      root.add(group);

      const runtime: StarRuntime = {
        name: tag.name,
        group,
        core,
        corona,
        halo,
        spike,
        label,
        basePos: positions[i].clone(),
        baseScale,
        phase: (hashSeed(tag.name) % 360) * (Math.PI / 180),
        color,
        count: tag.count,
        visual: 'idle',
        lastDim: 1,
      };
      setStarVisual(runtime, 'idle', 1);
      runtimes.push(runtime);
    });
    starsRef.current = runtimes;

    const linkData = buildLinks(tags, positions);
    let linkLines: THREE.LineSegments | null = null;
    if (linkData.positions.length) {
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkData.positions, 3));
      linkGeo.setAttribute('color', new THREE.Float32BufferAttribute(linkData.colors, 3));
      const linkMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      linkLines = new THREE.LineSegments(linkGeo, linkMat);
      root.add(linkLines);
    }

    // 全息选中环：双环 + 刻度
    const selectGroup = new THREE.Group();
    selectGroup.visible = false;
    scene.add(selectGroup);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8fb8ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringInner = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 64), ringMat);
    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 0.96, 64),
      new THREE.MeshBasicMaterial({
        color: 0x6ec8ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    selectGroup.add(ringInner);
    selectGroup.add(ringOuter);

    // 四向刻度
    const tickGeo = new THREE.PlaneGeometry(0.035, 0.14);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xb8d8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ticks: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i += 1) {
      const tick = new THREE.Mesh(tickGeo, tickMat);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
      tick.rotation.z = a + Math.PI / 2;
      selectGroup.add(tick);
      ticks.push(tick);
    }

    const ndc = new THREE.Vector3();
    const world = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const camOffset = new THREE.Vector3();
    let pointerDown: { x: number; y: number } | null = null;

    const setSize = () => {
      if (disposed) return;
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(wrap);

    const pickName = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      root.updateMatrixWorld(true);

      let bestName: string | null = null;
      let bestScore = Infinity;
      for (const s of runtimes) {
        s.group.getWorldPosition(world);
        ndc.copy(world).project(camera);
        if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 1.25 || Math.abs(ndc.y) > 1.25) continue;
        const sx = (ndc.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-ndc.y * 0.5 + 0.5) * rect.height + rect.top;
        const pixelDist = Math.hypot(clientX - sx, clientY - sy);
        const depthScale = 1.12 - Math.min(0.4, Math.max(0, ndc.z) * 0.35);
        const hitRadius = (34 + s.baseScale * 48) * depthScale;
        if (pixelDist > hitRadius) continue;
        const score = pixelDist + (ndc.z + 1) * 18;
        if (score < bestScore) {
          bestScore = score;
          bestName = s.name;
        }
      }
      return bestName;
    };

    const applyHover = (name: string | null) => {
      if (name === hoverRef.current) return;
      hoverRef.current = name;
      renderer.domElement.style.cursor = name ? 'pointer' : 'grab';
      for (const s of runtimes) {
        s.label.element.classList.toggle('is-hover', s.name === name);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (performance.now() < ignoreCanvasPickUntil) return;
      pointerDown = { x: e.clientX, y: e.clientY };
      controls.autoRotate = false;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (performance.now() < ignoreCanvasPickUntil) {
        pointerDown = null;
        return;
      }
      if (!pointerDown) return;
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      pointerDown = null;
      if (Math.hypot(dx, dy) < 8) {
        const name = pickName(e.clientX, e.clientY);
        if (!name) onSelectRef.current(null);
        else onSelectRef.current(selectedRef.current === name ? null : name);
      }
      window.setTimeout(() => {
        if (!disposed && !selectedRef.current) controls.autoRotate = true;
      }, 1800);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (performance.now() < ignoreCanvasPickUntil) return;
      // 拖拽中不刷 hover，减拾取开销
      if (pointerDown) return;
      applyHover(pickName(e.clientX, e.clientY));
    };
    const onPointerLeave = () => {
      pointerDown = null;
      applyHover(null);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    let raf = 0;
    let frame = 0;
    let last = performance.now();
    let rootAngle = 0;
    let readyNotified = false;
    const clockStart = performance.now();

    const tick = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      // 页面隐藏时停更
      if (document.hidden) return;

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame += 1;
      const t = (now - clockStart) / 1000;
      const heavyFrame = frame % 2 === 0;

      controls.update();
      shaderUniforms.uTime.value = t;

      if (heavyFrame) {
        farPoints.rotation.y = t * 0.006;
        milkyPoints.rotation.y = t * 0.004;
        nearPoints.rotation.y = -t * 0.012;
        dustPoints.rotation.y = t * 0.009;
        orbitGroup.rotation.y = t * 0.02;
      }

      if (!selectedRef.current) {
        rootAngle += dt * 0.1;
        root.rotation.y = rootAngle;
      }

      if (heavyFrame) {
        for (const n of nebulaGroup.children) {
          const mesh = n as THREE.Mesh;
          mesh.quaternion.copy(camera.quaternion);
          const phase = Number(mesh.userData.phase || 0);
          const spin = Number(mesh.userData.spin || 0.02);
          mesh.rotation.z = phase + t * spin;
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.08 + (Math.sin(t * 0.32 + phase) * 0.5 + 0.5) * 0.08;
        }
        for (const o of orbitGroup.children) {
          const line = o as THREE.LineLoop;
          const spin = Number(line.userData.spin || 0.02);
          line.rotation.y = t * spin;
        }
      }

      const selectedName = selectedRef.current;
      const hoverName = hoverRef.current;
      let activeStar: StarRuntime | null = null;

      for (const s of runtimes) {
        const active = Boolean(selectedName && s.name === selectedName);
        const hover = !active && hoverName === s.name;
        if (active) activeStar = s;

        // 浮动：仅中高质量，或当前交互星
        if (quality.animateIdle || active || hover) {
          const floatY = Math.sin(t * 1.05 + s.phase) * (active ? 0.075 : 0.045);
          const floatX = Math.cos(t * 0.68 + s.phase) * (active ? 0.038 : 0.022);
          s.group.position.set(
            s.basePos.x + floatX,
            s.basePos.y + floatY,
            s.basePos.z,
          );
        }

        const mode: 'idle' | 'hover' | 'active' = active ? 'active' : hover ? 'hover' : 'idle';
        const dim = selectedName && !active ? 0.72 : 1;
        setStarVisual(s, mode, dim);

        // billboard：仅交互星每帧，其余半频
        if (active || hover || heavyFrame) {
          s.corona.quaternion.copy(camera.quaternion);
          s.halo.quaternion.copy(camera.quaternion);
          if (s.spike.visible) {
            s.spike.quaternion.copy(camera.quaternion);
            if (active) s.spike.rotation.z = t * 0.35 + s.phase;
          }
        }

        if (active) {
          const pulse = 1 + Math.sin(t * 1.35 + s.phase) * 0.028;
          s.halo.scale.setScalar(s.baseScale * 1.24 * 9.2 * pulse);
          s.corona.scale.setScalar(s.baseScale * 1.24 * 3.4 * (1 + Math.sin(t * 2.1 + s.phase) * 0.04));
        }
      }

      // 标签深度排序降频
      if (frame % quality.labelSortEvery === 0) {
        root.updateMatrixWorld(true);
        for (const s of runtimes) {
          s.group.getWorldPosition(world);
          ndc.copy(world).project(camera);
          const z = Math.round((1 - (ndc.z + 1) * 0.5) * 1000);
          s.label.element.style.zIndex = String(100 + Math.max(0, Math.min(999, z)));
        }
      }

      if (activeStar) {
        activeStar.group.getWorldPosition(tmp);
        selectGroup.visible = true;
        selectGroup.position.copy(tmp);
        selectGroup.quaternion.copy(camera.quaternion);
        const beat = 1 + Math.sin(t * 1.55) * 0.035;
        const sc = Math.max(0.5, activeStar.baseScale * 3.5) * beat;
        selectGroup.scale.setScalar(sc);
        ringMat.opacity = 0.48;
        (ringOuter.material as THREE.MeshBasicMaterial).opacity = 0.28;
        tickMat.opacity = 0.55;
        selectGroup.rotation.z = t * 0.32;
        // 外环反向微旋：通过子 mesh 本地旋转
        ringOuter.rotation.z = -t * 0.55;

        controls.target.lerp(tmp, 0.045);
        camOffset.copy(camera.position).sub(controls.target).normalize().multiplyScalar(9.5);
        desired.copy(tmp).add(camOffset);
        camera.position.lerp(desired, 0.03);
        controls.autoRotate = false;
      } else if (selectGroup.visible) {
        selectGroup.visible = false;
        ringMat.opacity = 0;
        (ringOuter.material as THREE.MeshBasicMaterial).opacity = 0;
        tickMat.opacity = 0;
        controls.target.lerp(ZERO, 0.025);
      }

      if (linkLines && heavyFrame) {
        const mat = linkLines.material as THREE.LineBasicMaterial;
        mat.opacity = 0.14 + Math.sin(t * 0.75) * 0.035;
      }

      renderer.render(scene, camera);
      if (activeStar || hoverName || frame % 2 === 0) {
        labelRenderer.render(scene, camera);
      }

      if (!readyNotified) {
        readyNotified = true;
        queueMicrotask(() => {
          if (!disposed) onReadyRef.current?.();
        });
      }
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (!document.hidden && !disposed) {
        last = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      starsRef.current = [];
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.LineSegments ||
          obj instanceof THREE.LineLoop
        ) {
          obj.geometry?.dispose?.();
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose?.();
        }
      });
      dustTex.dispose();
      dustSoftTex.dispose();
      glowTex.dispose();
      coronaTex.dispose();
      spikeTex.dispose();
      nebulaTex.dispose();
      bgTex.dispose();
      coreGeo.dispose();
      planeGeo.dispose();
      tickGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentElement === wrap) wrap.removeChild(labelRenderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey]);

  return (
    <div ref={wrapRef} className={['tu-stage', className].filter(Boolean).join(' ')}>
      <div className="tu-vignette" aria-hidden />
      <div className="tu-aurora" aria-hidden />
      <div className="tu-scan" aria-hidden />
    </div>
  );
}
