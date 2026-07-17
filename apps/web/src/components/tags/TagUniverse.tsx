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
  className?: string;
};

type StarRuntime = {
  name: string;
  group: THREE.Group;
  core: THREE.Mesh;
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

const BG = 0x03040c;
const ZERO = new THREE.Vector3(0, 0, 0);
const WHITE = new THREE.Color(1, 1, 1);

type Quality = {
  dpr: number;
  farStars: number;
  nearStars: number;
  nebulae: number;
  antialias: boolean;
  animateIdle: boolean;
  labelSortEvery: number;
};

function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  const low = saveData || mobile || cores <= 4 || mem <= 4;
  const mid = !low && (cores <= 6 || mem <= 6);

  if (low) {
    return {
      dpr: 1,
      farStars: 420,
      nearStars: 80,
      nebulae: 2,
      antialias: false,
      animateIdle: false,
      labelSortEvery: 10,
    };
  }
  if (mid) {
    return {
      dpr: Math.min(window.devicePixelRatio || 1, 1.25),
      farStars: 700,
      nearStars: 120,
      nebulae: 3,
      antialias: false,
      animateIdle: true,
      labelSortEvery: 6,
    };
  }
  return {
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    farStars: 1000,
    nearStars: 160,
    nebulae: 3,
    antialias: true,
    animateIdle: true,
    labelSortEvery: 5,
  };
}

function colorForTag(name: string): THREE.Color {
  const h = hashSeed(name);
  const palette = [
    [0.58, 0.78, 0.68],
    [0.52, 0.72, 0.66],
    [0.72, 0.62, 0.72],
    [0.88, 0.58, 0.7],
    [0.48, 0.55, 0.7],
    [0.08, 0.7, 0.72],
    [0.62, 0.48, 0.78],
  ] as const;
  const [hh, s, l] = palette[h % palette.length];
  const c = new THREE.Color();
  c.setHSL(hh + ((h % 40) - 20) * 0.0012, s, l);
  return c;
}

function fibSphere(i: number, n: number, radius: number): THREE.Vector3 {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - ((i + 0.5) / n) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * i;
  const jitter = 0.88 + (hashSeed(`${i}-r`) % 100) / 450;
  const rr = radius * jitter;
  return new THREE.Vector3(
    Math.cos(theta) * r * rr,
    y * rr * 0.9,
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

function makeSpikeTexture(): THREE.CanvasTexture {
  const size = 128;
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
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -len, width, len * 2);
    ctx.restore();
  };
  drawRay(0, 58, 2.2, 0.85);
  drawRay(Math.PI / 2, 58, 2.2, 0.85);
  drawRay(Math.PI / 4, 34, 1.2, 0.3);
  drawRay(-Math.PI / 4, 34, 1.2, 0.3);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStarfield(count: number, rMin: number, rMax: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = rMin + Math.random() * (rMax - rMin);
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.72;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const roll = Math.random();
    if (roll > 0.8) {
      col[i * 3] = 1;
      col[i * 3 + 1] = 0.9;
      col[i * 3 + 2] = 0.75;
    } else if (roll > 0.5) {
      col[i * 3] = 0.7;
      col[i * 3 + 1] = 0.82;
      col[i * 3 + 2] = 1;
    } else {
      col[i * 3] = 0.9;
      col[i * 3 + 1] = 0.92;
      col[i * 3 + 2] = 0.98;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function buildLinks(tags: TagStar[], positions: THREE.Vector3[]): number[] {
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
  const maxLinks = Math.min(pairs.length, Math.max(3, Math.floor(tags.length * 1.1)));
  const out: number[] = [];
  for (let k = 0; k < maxLinks; k += 1) {
    const [i, j] = pairs[k];
    out.push(
      positions[i].x,
      positions[i].y,
      positions[i].z,
      positions[j].x,
      positions[j].y,
      positions[j].z,
    );
  }
  return out;
}

function setStarVisual(s: StarRuntime, mode: 'idle' | 'hover' | 'active', dim: number) {
  if (s.visual === mode && Math.abs(s.lastDim - dim) < 0.001) return;
  s.lastDim = dim;
  const coreMat = s.core.material as THREE.MeshBasicMaterial;
  const haloMat = s.halo.material as THREE.MeshBasicMaterial;
  const spikeMat = s.spike.material as THREE.MeshBasicMaterial;
  // 选中只轻微放大，避免过曝刺眼
  const sc =
    s.baseScale *
    (mode === 'active' ? 1.22 : mode === 'hover' ? 1.12 : 1);

  s.core.scale.setScalar(sc * (mode === 'active' ? 0.6 : 0.55));
  s.halo.scale.setScalar(sc * (mode === 'active' ? 8.6 : mode === 'hover' ? 7.8 : 7.2));
  s.spike.scale.setScalar(sc * (mode === 'active' ? 13 : mode === 'hover' ? 12 : 11));

  if (mode === 'active') {
    coreMat.color.copy(WHITE);
    haloMat.color.copy(s.color).lerp(WHITE, 0.12);
    spikeMat.color.copy(s.color);
    coreMat.opacity = 1;
    haloMat.opacity = 0.88;
    spikeMat.opacity = 0.42;
    s.spike.visible = true;
  } else if (mode === 'hover') {
    coreMat.color.copy(WHITE);
    haloMat.color.copy(s.color);
    spikeMat.color.copy(s.color);
    coreMat.opacity = 1;
    haloMat.opacity = 0.88;
    spikeMat.opacity = 0.32;
    s.spike.visible = true;
  } else {
    coreMat.color.copy(WHITE);
    haloMat.color.copy(s.color);
    spikeMat.color.copy(s.color);
    coreMat.opacity = 0.62 + 0.38 * dim;
    haloMat.opacity = 0.72 * dim;
    spikeMat.opacity = (0.14 + (s.count > 1 ? 0.08 : 0)) * dim;
    // 低占用：非强调星隐藏十字炫光 draw call
    s.spike.visible = dim > 0.85 && s.count > 1;
  }
  s.visual = mode;
}

export function TagUniverse({ tags, selected, onSelect, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
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
    scene.fog = new THREE.FogExp2(BG, 0.014);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160);
    camera.position.set(0.6, 1.8, 15.5);

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
    // 去掉 ACES + Bloom：这是卡顿主因
    renderer.toneMapping = THREE.NoToneMapping;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.className = 'tu-canvas';

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'tu-labels';
    wrap.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.75;
    controls.minDistance = 6;
    controls.maxDistance = 32;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.target.copy(ZERO);

    const dustTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,1)'],
        [0.25, 'rgba(255,255,255,0.5)'],
        [0.65, 'rgba(255,255,255,0.08)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      64,
    );

    const farGeo = makeStarfield(quality.farStars, 22, 64);
    const farMat = new THREE.PointsMaterial({
      size: 0.07,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const farPoints = new THREE.Points(farGeo, farMat);
    scene.add(farPoints);

    const nearGeo = makeStarfield(quality.nearStars, 10, 26);
    const nearMat = new THREE.PointsMaterial({
      size: 0.12,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const nearPoints = new THREE.Points(nearGeo, nearMat);
    scene.add(nearPoints);

    const nebulaGroup = new THREE.Group();
    scene.add(nebulaGroup);
    const nebulaTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,0.5)'],
        [0.35, 'rgba(255,255,255,0.14)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      128,
    );
    const nebulaColors = [0x4f8ef7, 0x7c5cff, 0x2fd6cf];
    for (let i = 0; i < quality.nebulae; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: nebulaTex,
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const ang = (i / Math.max(quality.nebulae, 1)) * Math.PI * 2;
      const rad = 7 + (i % 3) * 1.8;
      mesh.position.set(Math.cos(ang) * rad, (i - 1) * 1.2, Math.sin(ang) * rad * 0.7);
      mesh.scale.setScalar(9 + (i % 2) * 2);
      mesh.userData.phase = i * 1.3;
      nebulaGroup.add(mesh);
    }

    const glowTex = makeRadialTexture(
      [
        [0, 'rgba(255,255,255,1)'],
        [0.15, 'rgba(255,255,255,0.8)'],
        [0.4, 'rgba(255,255,255,0.22)'],
        [0.75, 'rgba(255,255,255,0.05)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      128,
    );
    const spikeTex = makeSpikeTexture();
    // 低面数内核
    const coreGeo = new THREE.SphereGeometry(1, 12, 12);
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
      core.scale.setScalar(baseScale * 0.55);

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
      halo.scale.setScalar(baseScale * 7.2);

      const spike = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: spikeTex,
          color,
          transparent: true,
          opacity: 0.2 + weight * 0.25,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      spike.scale.setScalar(baseScale * 11);
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
      label.position.set(0, baseScale * 1.8, 0);

      group.add(core);
      group.add(halo);
      group.add(spike);
      group.add(label);
      root.add(group);

      const runtime: StarRuntime = {
        name: tag.name,
        group,
        core,
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

    const linkPositions = buildLinks(tags, positions);
    let linkLines: THREE.LineSegments | null = null;
    if (linkPositions.length) {
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3));
      const linkMat = new THREE.LineBasicMaterial({
        color: 0x8fb8ff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      linkLines = new THREE.LineSegments(linkGeo, linkMat);
      root.add(linkLines);
    }

    // 单环选中指示
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8fb8ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 48), ringMat);
    ring.visible = false;
    scene.add(ring);

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
    const clockStart = performance.now();

    const tick = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      // 页面隐藏时停更
      if (document.hidden) return;

      // 简单帧率保护：掉帧时跳过部分装饰更新
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame += 1;
      const t = (now - clockStart) / 1000;
      const heavyFrame = frame % 2 === 0; // 半频更新装饰

      controls.update();

      if (heavyFrame) {
        farPoints.rotation.y = t * 0.008;
        nearPoints.rotation.y = -t * 0.014;
      }

      if (!selectedRef.current) {
        rootAngle += dt * 0.12;
        root.rotation.y = rootAngle;
      }

      if (heavyFrame) {
        for (const n of nebulaGroup.children) {
          const mesh = n as THREE.Mesh;
          mesh.quaternion.copy(camera.quaternion);
          const phase = Number(mesh.userData.phase || 0);
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.1 + (Math.sin(t * 0.35 + phase) * 0.5 + 0.5) * 0.07;
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
          const floatY = Math.sin(t * 1.1 + s.phase) * (active ? 0.08 : 0.05);
          const floatX = Math.cos(t * 0.7 + s.phase) * (active ? 0.04 : 0.025);
          s.group.position.set(
            s.basePos.x + floatX,
            s.basePos.y + floatY,
            s.basePos.z,
          );
        }

        const mode: 'idle' | 'hover' | 'active' = active ? 'active' : hover ? 'hover' : 'idle';
        const dim = selectedName && !active ? 0.78 : 1;
        setStarVisual(s, mode, dim);

        // billboard：仅交互星每帧，其余半频
        if (active || hover || heavyFrame) {
          s.halo.quaternion.copy(camera.quaternion);
          if (s.spike.visible) {
            s.spike.quaternion.copy(camera.quaternion);
            if (active) s.spike.rotation.z = t * 0.4 + s.phase;
          }
        }

        if (active) {
          // 轻微呼吸，不做强闪
          const pulse = 1 + Math.sin(t * 1.4 + s.phase) * 0.03;
          s.halo.scale.setScalar(s.baseScale * 1.22 * 8.6 * pulse);
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
        ring.visible = true;
        ring.position.copy(tmp);
        ring.quaternion.copy(camera.quaternion);
        const beat = 1 + Math.sin(t * 1.6) * 0.04;
        ring.scale.setScalar(Math.max(0.48, activeStar.baseScale * 3.4) * beat);
        ringMat.opacity = 0.38;
        ring.rotation.z = t * 0.25;

        controls.target.lerp(tmp, 0.045);
        camOffset.copy(camera.position).sub(controls.target).normalize().multiplyScalar(9.5);
        desired.copy(tmp).add(camOffset);
        camera.position.lerp(desired, 0.03);
        controls.autoRotate = false;
      } else if (ring.visible) {
        ring.visible = false;
        ringMat.opacity = 0;
        controls.target.lerp(ZERO, 0.025);
      }

      if (linkLines && heavyFrame) {
        const mat = linkLines.material as THREE.LineBasicMaterial;
        mat.opacity = 0.12 + Math.sin(t * 0.8) * 0.03;
      }

      renderer.render(scene, camera);
      // 标签半频刷新也够用（交互帧全量）
      if (activeStar || hoverName || frame % 2 === 0) {
        labelRenderer.render(scene, camera);
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
          obj instanceof THREE.LineSegments
        ) {
          obj.geometry?.dispose?.();
          const m = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose?.();
        }
      });
      dustTex.dispose();
      glowTex.dispose();
      spikeTex.dispose();
      nebulaTex.dispose();
      coreGeo.dispose();
      planeGeo.dispose();
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
    </div>
  );
}
