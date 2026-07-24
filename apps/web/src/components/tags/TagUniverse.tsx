import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { hashSeed } from '../../lib/format';
import type { TagStar } from './types';
export type { TagStar } from './types';
import {
  ZERO,
  WHITE,
  attachStarShader,
  buildLinks,
  colorForTag,
  detectQuality,
  detectUniverseMode,
  fibSphere,
  makeRadialTexture,
  makeSpaceBgTexture,
  makeSpikeTexture,
  makeStarfield,
  resolveUniverseTheme,
  setStarVisual,
  type StarRuntime,
  type UniverseMode,
} from './universeKit';

type Props = {
  tags: TagStar[];
  selected?: string | null;
  onSelect: (name: string | null) => void;
  /** WebGL 首帧绘制完成后回调，用于收起加载层 */
  onReady?: () => void;
  className?: string;
};

export function TagUniverse({ tags, selected, onSelect, onReady, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const selectedRef = useRef(selected);
  const starsRef = useRef<StarRuntime[]>([]);
  const hoverRef = useRef<string | null>(null);
  const themeModeRef = useRef<UniverseMode>(detectUniverseMode());

  const tagKey = useMemo(
    () => tags.map((t) => `${t.name}:${t.count}`).join('|'),
    [tags],
  );

  // 跟随站点亮/暗主题重建星图（亮色日间深空 / 暗色夜空）
  const [themeMode, setThemeMode] = useState<UniverseMode>(() => detectUniverseMode());

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const next = detectUniverseMode();
      themeModeRef.current = next;
      setThemeMode(next);
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);


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

    const theme = resolveUniverseTheme(themeMode);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(theme.bg, theme.fogDensity);

    const bgTex = makeSpaceBgTexture(theme.mode);
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
    renderer.setClearColor(theme.bg, 1);
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
      size: theme.mode === 'light' ? 0.06 : 0.055,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: theme.starOpacity,
      depthWrite: false,
      blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
      size: theme.mode === 'light' ? 0.075 : 0.07,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: theme.milkyOpacity,
      depthWrite: false,
      blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
      size: theme.mode === 'light' ? 0.12 : 0.11,
      map: dustTex,
      vertexColors: true,
      transparent: true,
      opacity: theme.nearOpacity,
      depthWrite: false,
      blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
      size: theme.mode === 'light' ? 0.48 : 0.55,
      map: dustSoftTex,
      vertexColors: true,
      transparent: true,
      opacity: theme.dustOpacity,
      depthWrite: false,
      blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
        opacity: theme.nebulaOpacity * (0.75 + (i % 3) * 0.12),
        depthWrite: false,
        blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
        color: i === 0 ? (theme.mode === 'light' ? 0x4f8ef7 : 0x6aa8ff) : (theme.mode === 'light' ? 0x7aa2ef : 0x5b7cff),
        transparent: true,
        opacity: theme.orbitOpacity * (0.45 + i * 0.12),
        blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
      if (theme.mode === 'light') {
        // 日间提高饱和与明度，避免白底上发灰
        color.offsetHSL(0, 0.08, 0.06);
      }
      const weight = tag.count / maxCount;
      const baseScale = 0.12 + weight * 0.28 + 0.04;

      const group = new THREE.Group();
      group.position.copy(positions[i]);
      group.userData.name = tag.name;

      const glowBlend =
        theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending;
      const core = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({
          color: theme.mode === 'light' ? color.clone().lerp(WHITE, 0.35) : WHITE,
          transparent: true,
          opacity: theme.mode === 'light' ? 0.95 : 0.98,
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
          opacity: theme.mode === 'light' ? 0.55 : 0.34,
          depthWrite: false,
          blending: glowBlend,
        }),
      );
      corona.scale.setScalar(baseScale * 2.7);

      const halo = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: theme.mode === 'light' ? 0.62 : 0.86,
          depthWrite: false,
          blending: glowBlend,
        }),
      );
      halo.scale.setScalar(baseScale * 7.4);

      const spike = new THREE.Mesh(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: spikeTex,
          color,
          transparent: true,
          opacity: theme.mode === 'light' ? 0.28 + weight * 0.22 : 0.18 + weight * 0.28,
          depthWrite: false,
          blending: glowBlend,
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
        opacity: theme.linkOpacity,
        blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
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
      color: theme.selectRing,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const ringInner = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.78, 64), ringMat);
    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 0.96, 64),
      new THREE.MeshBasicMaterial({
        color: theme.selectOuter,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: theme.mode === 'light' ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    selectGroup.add(ringInner);
    selectGroup.add(ringOuter);

    // 四向刻度
    const tickGeo = new THREE.PlaneGeometry(0.035, 0.14);
    const tickMat = new THREE.MeshBasicMaterial({
      color: theme.selectTick,
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
        ringMat.opacity = theme.mode === 'light' ? 0.7 : 0.48;
        (ringOuter.material as THREE.MeshBasicMaterial).opacity = theme.mode === 'light' ? 0.42 : 0.28;
        tickMat.opacity = theme.mode === 'light' ? 0.72 : 0.55;
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
        const base = theme.linkOpacity;
        mat.opacity = base + Math.sin(t * 0.75) * (base * 0.22);
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
  }, [tagKey, themeMode]);

  return (
    <div
      ref={wrapRef}
      className={['tu-stage', `is-${themeMode}`, className].filter(Boolean).join(' ')}
      data-universe-theme={themeMode}
    >
      <div className="tu-vignette" aria-hidden />
      <div className="tu-aurora" aria-hidden />
      <div className="tu-scan" aria-hidden />
    </div>
  );
}
