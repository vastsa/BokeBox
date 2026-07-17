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
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  label: CSS2DObject;
  baseScale: number;
  phase: number;
  color: THREE.Color;
};

function colorForTag(name: string): THREE.Color {
  const h = hashSeed(name);
  // 星点配色：品牌蓝 / 青 / 紫 混搭
  const palette = [
    [0.12, 0.72, 0.72], // gold
    [0.55, 0.55, 0.78], // cyan-blue
    [0.78, 0.45, 0.78], // pink-violet
    [0.48, 0.62, 0.72], // teal
    [0.92, 0.55, 0.72], // rose
    [0.62, 0.35, 0.82], // violet
  ] as const;
  const [hh, s, l] = palette[h % palette.length];
  const c = new THREE.Color();
  c.setHSL(hh + ((h % 100) - 50) * 0.0004, s, l);
  return c;
}

/** 斐波那契球面分布 */
function fibSphere(i: number, n: number, radius: number): THREE.Vector3 {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r = radius * (0.72 + (hashSeed(String(i)) % 100) / 280);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi) * 0.86,
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function TagUniverse({ tags, selected, onSelect, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const starsRef = useRef<StarRuntime[]>([]);
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
      const active = selected && s.name === selected;
      s.label.element.classList.toggle('is-focus', Boolean(active));
      s.mesh.userData.active = Boolean(active);
    }
  }, [selected]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04050a, 0.018);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    camera.position.set(0, 2.2, 14.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x04050a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrap.appendChild(renderer.domElement);
    renderer.domElement.className = 'tu-canvas';

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'tu-labels';
    wrap.appendChild(labelRenderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    controls.minDistance = 5;
    controls.maxDistance = 36;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    // 背景星尘
    const starCount = 1800;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 18 + Math.random() * 42;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi) * 0.75;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const warm = Math.random() > 0.72;
      starCol[i * 3] = warm ? 1 : 0.72 + Math.random() * 0.25;
      starCol[i * 3 + 1] = warm ? 0.86 + Math.random() * 0.1 : 0.8 + Math.random() * 0.2;
      starCol[i * 3 + 2] = warm ? 0.55 + Math.random() * 0.2 : 1;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 微弱星云面片
    const nebulaGeo = new THREE.SphereGeometry(28, 32, 32);
    const nebulaMat = new THREE.MeshBasicMaterial({
      color: 0x1a2240,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(nebulaGeo, nebulaMat));

    const glowTex = makeGlowTexture();
    const coreGeo = new THREE.SphereGeometry(1, 24, 24);
    const glowGeo = new THREE.PlaneGeometry(1, 1);

    const group = new THREE.Group();
    scene.add(group);

    const maxCount = Math.max(1, ...tags.map((t) => t.count));
    const radius = Math.max(4.2, Math.min(9.5, 3.2 + Math.sqrt(tags.length) * 0.85));
    const runtimes: StarRuntime[] = [];

    tags.forEach((tag, i) => {
      const color = colorForTag(tag.name);
      const weight = 0.55 + (tag.count / maxCount) * 0.9;
      const baseScale = 0.14 + weight * 0.22;

      const coreMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(coreGeo, coreMat);
      mesh.scale.setScalar(baseScale);
      mesh.position.copy(fibSphere(i, Math.max(tags.length, 1), radius));
      mesh.userData.name = tag.name;
      mesh.userData.active = selectedRef.current === tag.name;

      const glowMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.scale.setScalar(baseScale * 6.2);
      glow.position.copy(mesh.position);

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tu-label' + (mesh.userData.active ? ' is-focus' : '');
      el.textContent = tag.name;
      el.style.color = `#${color.getHexString()}`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const next = selectedRef.current === tag.name ? null : tag.name;
        onSelectRef.current(next);
      });
      const label = new CSS2DObject(el);
      label.position.copy(mesh.position);
      label.center.set(0.5, 1.15);

      group.add(mesh);
      group.add(glow);
      group.add(label);

      runtimes.push({
        name: tag.name,
        mesh,
        glow,
        label,
        baseScale,
        phase: (hashSeed(tag.name) % 360) * (Math.PI / 180),
        color,
      });
    });
    starsRef.current = runtimes;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
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

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        runtimes.map((s) => s.mesh),
        false,
      );
      if (!hits.length) {
        onSelectRef.current(null);
        return;
      }
      const name = String(hits[0].object.userData.name || '');
      if (!name) return;
      onSelectRef.current(selectedRef.current === name ? null : name);
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
      if (Math.hypot(dx, dy) < 6) pick(e.clientX, e.clientY);
      window.setTimeout(() => {
        if (!disposed) controls.autoRotate = !selectedRef.current;
      }, 1800);
    };
    const onPointerLeave = () => {
      pointerDown = null;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      if (disposed) return;
      const t = clock.getElapsedTime();
      controls.update();

      for (const s of runtimes) {
        const pulse = 1 + Math.sin(t * 1.4 + s.phase) * 0.08;
        const boost = s.mesh.userData.active ? 1.35 : 1;
        s.mesh.scale.setScalar(s.baseScale * pulse * boost);
        s.glow.scale.setScalar(s.baseScale * 6.2 * pulse * boost);
        s.glow.quaternion.copy(camera.quaternion);
        const mat = s.glow.material as THREE.MeshBasicMaterial;
        mat.opacity = s.mesh.userData.active ? 0.95 : 0.55 + Math.sin(t * 1.2 + s.phase) * 0.12;
      }

      starField.rotation.y = t * 0.012;
      group.rotation.y = t * 0.02;
      renderer.render(scene, camera);
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
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      controls.dispose();
      starsRef.current = [];
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose?.();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose?.();
        }
      });
      glowTex.dispose();
      coreGeo.dispose();
      glowGeo.dispose();
      starGeo.dispose();
      starMat.dispose();
      nebulaGeo.dispose();
      nebulaMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === wrap) wrap.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentElement === wrap) wrap.removeChild(labelRenderer.domElement);
    };
    // tags 变化通过 tagKey 重建场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagKey]);

  return <div ref={wrapRef} className={['tu-stage', className].filter(Boolean).join(' ')} />;
}
