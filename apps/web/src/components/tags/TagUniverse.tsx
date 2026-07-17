import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
};

const BG = 0x03040c;

function colorForTag(name: string): THREE.Color {
  const h = hashSeed(name);
  const palette = [
    [0.58, 0.78, 0.68], // brand blue
    [0.52, 0.72, 0.66], // cyan
    [0.72, 0.62, 0.72], // violet
    [0.88, 0.58, 0.7], // rose
    [0.48, 0.55, 0.7], // teal
    [0.08, 0.7, 0.72], // warm
    [0.62, 0.48, 0.78], // indigo
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

function makeRadialTexture(
  stops: Array<[number, string]>,
  size = 256,
): THREE.CanvasTexture {
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
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  const drawRay = (angle: number, len: number, width: number, alpha: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, -len, 0, len);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(0.45, `rgba(255,255,255,${alpha * 0.15})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.15})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -len, width, len * 2);
    ctx.restore();
  };

  // 十字炫光
  drawRay(0, 120, 3.2, 0.9);
  drawRay(Math.PI / 2, 120, 3.2, 0.9);
  drawRay(Math.PI / 4, 70, 1.8, 0.35);
  drawRay(-Math.PI / 4, 70, 1.8, 0.35);

  // 中心光核
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStarfield(count: number, rMin: number, rMax: number, size: number) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const r = rMin + Math.random() * (rMax - rMin);
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.72;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const roll = Math.random();
    if (roll > 0.82) {
      // 暖白
      col[i * 3] = 1;
      col[i * 3 + 1] = 0.9 + Math.random() * 0.08;
      col[i * 3 + 2] = 0.72 + Math.random() * 0.15;
    } else if (roll > 0.55) {
      // 冷蓝
      col[i * 3] = 0.65 + Math.random() * 0.2;
      col[i * 3 + 1] = 0.78 + Math.random() * 0.15;
      col[i * 3 + 2] = 1;
    } else {
      col[i * 3] = 0.85 + Math.random() * 0.15;
      col[i * 3 + 1] = 0.88 + Math.random() * 0.12;
      col[i * 3 + 2] = 0.95 + Math.random() * 0.05;
    }
    sizes[i] = size * (0.45 + Math.random() * 1.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geo, sizes };
}

/** 基于共现关系构建星座连线 */
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
  const maxLinks = Math.min(pairs.length, Math.max(4, Math.floor(tags.length * 1.35)));
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

export function TagUniverse({ tags, selected, onSelect, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const starsRef = useRef<StarRuntime[]>([]);
  const focusTargetRef = useRef(new THREE.Vector3());
  const focusActiveRef = useRef(false);

  const tagKey = useMemo(
    () => tags.map((t) => `${t.name}:${t.count}`).join('|'),
    [tags],
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedRef.current = selected;
    let found: StarRuntime | null = null;
    for (const s of starsRef.current) {
      const active = Boolean(selected && s.name === selected);
      s.label.element.classList.toggle('is-focus', active);
      s.group.userData.active = active;
      if (active) found = s;
    }
    if (found) {
      focusTargetRef.current.copy(found.basePos);
      focusActiveRef.current = true;
    } else {
      focusActiveRef.current = false;
    }
  }, [selected]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BG, 0.012);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 220);
    camera.position.set(0.6, 1.8, 15.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(BG, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.className = 'tu-canvas';

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'tu-labels';
    wrap.appendChild(labelRenderer.domElement);

    // Bloom 合成
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.42, 0.72);
    composer.addPass(bloomPass);
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.048;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.75;
    controls.minDistance = 6;
    controls.maxDistance = 34;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.target.set(0, 0, 0);

    // 多层星尘
    const dustTex = makeRadialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.2, 'rgba(255,255,255,0.65)'],
      [0.55, 'rgba(255,255,255,0.12)'],
      [1, 'rgba(255,255,255,0)'],
    ], 64);

    const farStars = makeStarfield(2600, 22, 70, 0.055);
    const farMat = new THREE.PointsMaterial({
      size: 0.06,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const farPoints = new THREE.Points(farStars.geo, farMat);
    scene.add(farPoints);

    const nearStars = makeStarfield(420, 10, 28, 0.1);
    const nearMat = new THREE.PointsMaterial({
      size: 0.12,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const nearPoints = new THREE.Points(nearStars.geo, nearMat);
    scene.add(nearPoints);

    // 星云团
    const nebulaGroup = new THREE.Group();
    scene.add(nebulaGroup);
    const nebulaTex = makeRadialTexture([
      [0, 'rgba(255,255,255,0.55)'],
      [0.25, 'rgba(255,255,255,0.22)'],
      [0.6, 'rgba(255,255,255,0.05)'],
      [1, 'rgba(255,255,255,0)'],
    ], 256);
    const nebulaColors = [0x4f8ef7, 0x7c5cff, 0x2fd6cf, 0xf472b6, 0x38bdf8];
    for (let i = 0; i < 5; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: nebulaTex,
        color: nebulaColors[i % nebulaColors.length],
        transparent: true,
        opacity: 0.14 + (i % 3) * 0.03,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const ang = (i / 5) * Math.PI * 2;
      const rad = 6 + (i % 3) * 2.2;
      mesh.position.set(Math.cos(ang) * rad, (i - 2) * 1.4, Math.sin(ang) * rad * 0.7);
      mesh.scale.setScalar(8 + (i % 3) * 3);
      mesh.userData.phase = i * 1.3;
      nebulaGroup.add(mesh);
    }

    // 外围暗球罩，增强景深
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x050714,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.9,
      }),
    );
    scene.add(dome);

    const glowTex = makeRadialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.12, 'rgba(255,255,255,0.85)'],
      [0.35, 'rgba(255,255,255,0.28)'],
      [0.7, 'rgba(255,255,255,0.06)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    const spikeTex = makeSpikeTexture();
    const coreGeo = new THREE.SphereGeometry(1, 28, 28);
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
      group.userData.active = selectedRef.current === tag.name;

      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 1, 1),
        transparent: true,
        opacity: 0.98,
      });
      // 内核偏白，外层吃主题色
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.scale.setScalar(baseScale * 0.55);
      core.userData.name = tag.name;

      const haloMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Mesh(planeGeo, haloMat);
      halo.scale.setScalar(baseScale * 7.5);
      halo.userData.name = tag.name;

      const spikeMat = new THREE.MeshBasicMaterial({
        map: spikeTex,
        color,
        transparent: true,
        opacity: 0.22 + weight * 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const spike = new THREE.Mesh(planeGeo, spikeMat);
      spike.scale.setScalar(baseScale * (10 + weight * 8));
      spike.userData.name = tag.name;

      // 命中用透明大球
      const hit = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      hit.scale.setScalar(baseScale * 2.6);
      hit.userData.name = tag.name;

      const el = document.createElement('button');
      el.type = 'button';
      el.className =
        'tu-label' + (group.userData.active ? ' is-focus' : '');
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
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const next = selectedRef.current === tag.name ? null : tag.name;
        onSelectRef.current(next);
      });
      const label = new CSS2DObject(el);
      label.position.set(0, baseScale * 1.8, 0);

      group.add(hit);
      group.add(core);
      group.add(halo);
      group.add(spike);
      group.add(label);
      root.add(group);

      runtimes.push({
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
      });
    });
    starsRef.current = runtimes;

    // 星座连线
    const linkPositions = buildLinks(tags, positions);
    let linkLines: THREE.LineSegments | null = null;
    if (linkPositions.length) {
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(linkPositions, 3),
      );
      const linkMat = new THREE.LineBasicMaterial({
        color: 0x8fb8ff,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      linkLines = new THREE.LineSegments(linkGeo, linkMat);
      root.add(linkLines);
    }

    // 选中时环
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9ec1ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 64), ringMat);
    ring.visible = false;
    scene.add(ring);

    const raycaster = new THREE.Raycaster();
    // 放大命中半径
    raycaster.params.Points = { threshold: 0.2 };
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    let hoverName: string | null = null;

    const hitMeshes = runtimes.map((s) => s.group.children[0] as THREE.Mesh);

    const setSize = () => {
      if (disposed) return;
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(wrap);

    const pickName = (clientX: number, clientY: number): string | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (!hits.length) return null;
      return String(hits[0].object.userData.name || '') || null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
      controls.autoRotate = false;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      const dx = e.clientX - pointerDown.x;
      const dy = e.clientY - pointerDown.y;
      pointerDown = null;
      if (Math.hypot(dx, dy) < 7) {
        const name = pickName(e.clientX, e.clientY);
        if (!name) onSelectRef.current(null);
        else onSelectRef.current(selectedRef.current === name ? null : name);
      }
      window.setTimeout(() => {
        if (!disposed && !selectedRef.current) controls.autoRotate = true;
      }, 2200);
    };
    const onPointerMove = (e: PointerEvent) => {
      const name = pickName(e.clientX, e.clientY);
      if (name !== hoverName) {
        hoverName = name;
        renderer.domElement.style.cursor = name ? 'pointer' : 'grab';
        for (const s of runtimes) {
          s.label.element.classList.toggle('is-hover', s.name === name);
        }
      }
    };
    const onPointerLeave = () => {
      pointerDown = null;
      hoverName = null;
      renderer.domElement.style.cursor = 'grab';
      for (const s of runtimes) s.label.element.classList.remove('is-hover');
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const clock = new THREE.Clock();
    let raf = 0;
    const tmp = new THREE.Vector3();

    const tick = () => {
      if (disposed) return;
      const t = clock.getElapsedTime();
      controls.update();

      // 背景微动
      farPoints.rotation.y = t * 0.008;
      nearPoints.rotation.y = -t * 0.014;
      root.rotation.y = t * 0.012;

      for (const n of nebulaGroup.children) {
        const mesh = n as THREE.Mesh;
        mesh.quaternion.copy(camera.quaternion);
        const phase = Number(mesh.userData.phase || 0);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.1 + (Math.sin(t * 0.35 + phase) * 0.5 + 0.5) * 0.08;
        mesh.position.y += Math.sin(t * 0.2 + phase) * 0.0015;
      }

      let activeStar: StarRuntime | null = null;
      for (const s of runtimes) {
        const active = Boolean(s.group.userData.active);
        const hover = s.label.element.classList.contains('is-hover');
        if (active) activeStar = s;

        const floatY = Math.sin(t * 1.1 + s.phase) * 0.08;
        const floatX = Math.cos(t * 0.7 + s.phase) * 0.04;
        s.group.position.set(
          s.basePos.x + floatX,
          s.basePos.y + floatY,
          s.basePos.z,
        );

        const pulse = 1 + Math.sin(t * 1.6 + s.phase) * 0.07;
        const boost = active ? 1.55 : hover ? 1.22 : 1;
        const sc = s.baseScale * pulse * boost;
        s.core.scale.setScalar(sc * 0.55);
        s.halo.scale.setScalar(sc * 7.5);
        s.spike.scale.setScalar(sc * (active ? 18 : 12));
        s.halo.quaternion.copy(camera.quaternion);
        s.spike.quaternion.copy(camera.quaternion);
        s.spike.rotation.z = t * 0.15 + s.phase;

        const haloMat = s.halo.material as THREE.MeshBasicMaterial;
        const spikeMat = s.spike.material as THREE.MeshBasicMaterial;
        haloMat.opacity = active ? 1 : hover ? 0.95 : 0.72 + Math.sin(t * 1.3 + s.phase) * 0.1;
        spikeMat.opacity = active ? 0.85 : hover ? 0.45 : 0.18 + (s.count / maxCount) * 0.25;
      }

      // 选中环与镜头焦点
      if (activeStar) {
        ring.visible = true;
        ring.position.copy(activeStar.group.position);
        ring.quaternion.copy(camera.quaternion);
        const beat = 0.9 + Math.sin(t * 2.4) * 0.08;
        ring.scale.setScalar(activeStar.baseScale * 3.2 * beat);
        ringMat.opacity = 0.55 + Math.sin(t * 3) * 0.15;

        // 镜头轻轻拉近
        tmp.copy(activeStar.group.position);
        controls.target.lerp(tmp, 0.035);
        const desired = tmp.clone().add(new THREE.Vector3(0.4, 0.8, 9.2));
        camera.position.lerp(desired, 0.02);
        controls.autoRotate = false;
      } else {
        ring.visible = false;
        ringMat.opacity = 0;
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.02);
      }

      if (linkLines) {
        const mat = linkLines.material as THREE.LineBasicMaterial;
        mat.opacity = 0.12 + Math.sin(t * 0.8) * 0.04;
      }

      composer.render();
      labelRenderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      starsRef.current = [];
      composer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
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
