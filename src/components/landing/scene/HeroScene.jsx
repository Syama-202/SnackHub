import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, PerformanceMonitor, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

/**
 * SnackHub snack box hero (doc 22.9c timeline). The box and snacks are built
 * from primitives in code: a placeholder for the compressed GLB the doc asks
 * for (see public/models/README.md). Stylised, glossy, low-poly on purpose.
 *
 * 0.15-1.05 s box drops and bounces · 1.0-1.6 s lid opens with overshoot
 * 1.2-2.9 s ten snacks leave 0.07 s apart and settle in a ring
 * 2.4-3.2 s steam and sparkles fade in · 0-4.6 s camera moves in, then sways
 */
const ease = {
  outBounce(x) {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
  outBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
};
const seg = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);

const PALETTE = { sun: '#FFC300', orange: '#FF7A00', red: '#E23744', deep: '#C4222F', cream: '#FFF6E6', dark: '#1F2937' };

const VARIANT_COLORS = {
  hot: { body: PALETTE.red, band: PALETTE.sun, lid: '#F0434F' },
  sweet: { body: PALETTE.sun, band: PALETTE.red, lid: '#FFCF33' },
  mixture: { body: PALETTE.orange, band: PALETTE.dark, lid: '#FF8A1F' },
};

function Box({ t0, variant = 'hot' }) {
  const group = useRef();
  const lid = useRef();
  const c = VARIANT_COLORS[variant];
  const label = useLabel(c.band);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - t0.current;
    const drop = ease.outBounce(seg(t, 0.15, 1.05));
    group.current.position.y = THREE.MathUtils.lerp(4.5, 0, drop);
    group.current.rotation.y = -0.5 + Math.sin(clock.elapsedTime * 0.35) * 0.08 * seg(t, 3, 5);
    const open = ease.outBack(seg(t, 1.0, 1.6));
    lid.current.rotation.x = -open * 1.9;
  });
  return (
    <group ref={group}>
      <RoundedBox args={[2.2, 1.3, 1.6]} radius={0.12} smoothness={4} position={[0, 0.65, 0]} castShadow>
        <meshStandardMaterial color={c.body} roughness={0.35} metalness={0.05} />
      </RoundedBox>
      <mesh position={[0, 0.72, 0.805]}>
        <planeGeometry args={[2.0, 0.34]} />
        <meshStandardMaterial map={label} roughness={0.4} />
      </mesh>
      {/* Lid hinged at the back edge */}
      <group ref={lid} position={[0, 1.3, -0.8]}>
        <RoundedBox args={[2.28, 0.14, 1.66]} radius={0.06} smoothness={3} position={[0, 0.05, 0.83]} castShadow>
          <meshStandardMaterial color={c.lid} roughness={0.3} />
        </RoundedBox>
      </group>
      {/* inside */}
      <mesh position={[0, 1.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.0, 1.4]} />
        <meshStandardMaterial color="#7A1E26" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Box label drawn on a 2D canvas, so no font file is fetched at runtime. */
function useLabel(band) {
  const tex = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 174;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = band === PALETTE.dark ? '#FFF6E6' : PALETTE.dark;
    ctx.font = '800 104px "Baloo 2", "Nunito Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SNACKHUB', cv.width / 2, cv.height / 2 + 6);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [band]);
  return tex;
}

// Ten snacks: murukku, jalebi, mirchi bajji, samosa, laddu, repeated with variety
const SNACKS = [
  { kind: 'laddu', color: '#F2A516' },
  { kind: 'samosa', color: '#D8A04A' },
  { kind: 'murukku', color: '#C9893A' },
  { kind: 'bajji', color: '#E0A040' },
  { kind: 'jalebi', color: '#FF8C1A' },
  { kind: 'laddu', color: '#F7B733' },
  { kind: 'samosa', color: '#CF9541' },
  { kind: 'jalebi', color: '#F28C1B' },
  { kind: 'bajji', color: '#D99A3C' },
  { kind: 'murukku', color: '#B97E35' },
];

function SnackMesh({ kind, color }) {
  const mat = <meshStandardMaterial color={color} roughness={0.45} metalness={0.02} />;
  switch (kind) {
    case 'samosa':
      return <mesh castShadow rotation={[0.3, 0, 0]}><tetrahedronGeometry args={[0.32, 0]} />{mat}</mesh>;
    case 'murukku':
      return <mesh castShadow rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[0.24, 0.07, 10, 28]} />{mat}</mesh>;
    case 'jalebi':
      return <mesh castShadow rotation={[Math.PI / 2.2, 0, 0]}><torusKnotGeometry args={[0.16, 0.05, 64, 8, 2, 5]} />{mat}</mesh>;
    case 'bajji':
      return (
        <group rotation={[0, 0, 0.6]}>
          <mesh castShadow><capsuleGeometry args={[0.11, 0.42, 6, 12]} />{mat}</mesh>
          <mesh position={[0, 0.33, 0]}><cylinderGeometry args={[0.02, 0.03, 0.14, 6]} /><meshStandardMaterial color="#3F7D20" /></mesh>
        </group>
      );
    case 'laddu':
    default:
      return <mesh castShadow><icosahedronGeometry args={[0.24, 2]} />{mat}</mesh>;
  }
}

function Snack({ i, t0 }) {
  const ref = useRef();
  const s = SNACKS[i];
  const angle = (i / SNACKS.length) * Math.PI * 2 + 0.3;
  const ring = { x: Math.cos(angle) * 2.5, z: Math.sin(angle) * 1.7, y: 0.9 + (i % 3) * 0.35 };
  const start = 1.2 + i * 0.07;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - t0.current;
    const k = ease.outCubic(seg(t, start, start + 1.0));
    // Arc: rise out of the box, then settle into the ring
    const arc = Math.sin(k * Math.PI) * 1.6;
    ref.current.position.set(ring.x * k, 1.0 + (ring.y - 1.0) * k + arc, ring.z * k);
    const s2 = 0.2 + 0.8 * k;
    ref.current.scale.setScalar(s2);
    ref.current.visible = t > start - 0.02;
    ref.current.rotation.y = clock.elapsedTime * 0.4 + i;
    if (k >= 1) ref.current.position.y = ring.y + Math.sin(clock.elapsedTime * 1.2 + i) * 0.08;
  });
  return (
    <group ref={ref} visible={false}>
      <SnackMesh kind={s.kind} color={s.color} />
    </group>
  );
}

function Steam({ t0 }) {
  const group = useRef();
  const puffs = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ x: (i - 2.5) * 0.25, d: i * 0.4 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - t0.current;
    const fade = seg(t, 2.4, 3.2);
    group.current.children.forEach((m, i) => {
      const p = (clock.elapsedTime * 0.35 + puffs[i].d) % 1;
      m.position.y = 1.5 + p * 1.6;
      m.position.x = puffs[i].x + Math.sin(clock.elapsedTime + i) * 0.1;
      m.scale.setScalar(0.2 + p * 0.5);
      m.material.opacity = fade * 0.35 * (1 - p);
    });
  });
  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.4, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ t0 }) {
  const { camera, pointer } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime - t0.current;
    const k = ease.inOut(seg(t, 0, 4.6));
    // Scroll drift: read the scroll position, never take it over
    const scroll = Math.min(1, window.scrollY / (window.innerHeight || 1));
    const radius = THREE.MathUtils.lerp(10, 7.2, k) + scroll * 1.5;
    const sway = seg(t, 4.6, 6) * (Math.sin(clock.elapsedTime * 0.3) * 0.15 + pointer.x * 0.25);
    const angle = 0.35 + sway + scroll * 0.6;
    const y = THREE.MathUtils.lerp(5, 3.1, k) + pointer.y * 0.3 * seg(t, 4.6, 6) - scroll * 0.8;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, Math.sin(angle) * radius, 4, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, Math.cos(angle) * radius, 4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, y, 4, dt);
    camera.lookAt(target);
  });
  return null;
}

function Scene({ variant }) {
  const t0 = useRef(0);
  const started = useRef(false);
  useFrame(({ clock }) => {
    if (!started.current) {
      t0.current = clock.elapsedTime;
      started.current = true;
    }
  }, -1);
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 3, -4]} intensity={0.6} color="#FFC300" />
      <pointLight position={[0, 3, 3]} intensity={6} color="#FF7A00" distance={9} />
      <Box t0={t0} variant={variant} />
      {SNACKS.map((_, i) => (
        <Snack key={i} i={i} t0={t0} />
      ))}
      <Steam t0={t0} />
      <SparkleFade t0={t0} />
      <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={12} blur={2.4} far={4} color="#7A2A00" />
      <Rig t0={t0} />
    </>
  );
}

function SparkleFade({ t0 }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) ref.current.visible = clock.elapsedTime - t0.current > 2.4;
  });
  return <Sparkles ref={ref} count={40} scale={[6, 3, 4]} position={[0, 1.8, 0]} size={3} speed={0.4} color="#FFC300" />;
}

export default function HeroScene({ active = true, variant = 'hot', onReady }) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      shadows
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [3, 5, 10], fov: 35 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={() => onReady?.()}
      aria-hidden="true"
    >
      {/* Adaptive quality: lower dpr when the frame rate drops (doc 22.9a) */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <Scene variant={variant} />
    </Canvas>
  );
}
