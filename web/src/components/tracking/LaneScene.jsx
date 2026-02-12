import { useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/**
 * 3D side-view rider lane (doc 10.5, 22.5). Orthographic camera, low-poly
 * primitives (placeholder for /models/rider-scooter.glb). Position comes only
 * from stage and progress; damping makes the 5 s steps glide.
 */
const C = { orange: '#FF7A00', sun: '#FFC300', red: '#E23744', dark: '#111827', grey: '#9CA3AF', light: '#F3F4F6' };

function targetX(stage, progress) {
  const t = ['ON_THE_WAY', 'PICKED_UP'].includes(stage) ? progress : ['ARRIVED', 'DELIVERED'].includes(stage) ? 1 : 0;
  return -4 + 8 * t;
}

function Wheel({ x, spinRef }) {
  return (
    <group position={[x, 0.22, 0]}>
      <mesh ref={spinRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.18, 0.07, 8, 20]} />
        <meshStandardMaterial color="#1F2937" roughness={0.8} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} />
        <meshStandardMaterial color={C.grey} />
      </mesh>
    </group>
  );
}

function Scooter({ stage, progress }) {
  const group = useRef();
  const w1 = useRef();
  const w2 = useRef();
  const box = useRef();
  const prev = useRef(null);
  useFrame((_, dt) => {
    const g = group.current;
    const tx = targetX(stage, progress);
    if (prev.current === null) g.position.x = tx;
    const before = g.position.x;
    g.position.x = THREE.MathUtils.damp(g.position.x, tx, 2.5, dt);
    prev.current = tx;
    const v = (g.position.x - before) / Math.max(dt, 1e-3);
    const spin = stage === 'ON_THE_WAY' ? Math.max(Math.abs(v), 0.6) : Math.abs(v);
    if (w1.current) w1.current.rotation.y -= spin * dt * 5;
    if (w2.current) w2.current.rotation.y -= spin * dt * 5;
    g.position.y = stage === 'ON_THE_WAY' ? Math.sin(performance.now() / 90) * 0.012 : 0;
    if (box.current) box.current.visible = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(stage);
  });
  return (
    <group ref={group}>
      <Wheel x={-0.45} spinRef={w1} />
      <Wheel x={0.45} spinRef={w2} />
      <RoundedBox args={[1.0, 0.22, 0.3]} radius={0.08} position={[-0.05, 0.42, 0]}>
        <meshStandardMaterial color={C.orange} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0.48, 0.66, 0]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[0.07, 0.5, 0.07]} />
        <meshStandardMaterial color={C.orange} />
      </mesh>
      <mesh position={[0.56, 0.9, 0]}>
        <boxGeometry args={[0.06, 0.06, 0.4]} />
        <meshStandardMaterial color={C.dark} />
      </mesh>
      {/* rider */}
      <mesh position={[0.0, 0.85, 0]} rotation={[0, 0, -0.2]}>
        <capsuleGeometry args={[0.13, 0.32, 4, 10]} />
        <meshStandardMaterial color={C.sun} />
      </mesh>
      <mesh position={[0.08, 1.22, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color={C.red} roughness={0.25} />
      </mesh>
      <mesh position={[0.22, 0.95, 0]} rotation={[0, 0, -1.1]}>
        <capsuleGeometry args={[0.04, 0.3, 4, 8]} />
        <meshStandardMaterial color={C.sun} />
      </mesh>
      {/* delivery box */}
      <group ref={box} position={[-0.48, 0.74, 0]}>
        <RoundedBox args={[0.38, 0.34, 0.36]} radius={0.04}>
          <meshStandardMaterial color={C.red} roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, 0, 0.185]}>
          <planeGeometry args={[0.36, 0.08]} />
          <meshStandardMaterial color={C.sun} />
        </mesh>
      </group>
    </group>
  );
}

function Road({ moving }) {
  const dashes = useRef();
  useFrame((_, dt) => {
    if (!moving || !dashes.current) return;
    dashes.current.position.x = (dashes.current.position.x - dt * 1.6) % 1;
  });
  return (
    <group>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[14, 0.1, 1.4]} />
        <meshStandardMaterial color="#0B1220" />
      </mesh>
      <group ref={dashes} position={[0, 0.005, 0.4]}>
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[-8 + i, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.45, 0.05]} />
            <meshBasicMaterial color={C.sun} transparent opacity={0.55} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Shop() {
  return (
    <group position={[-5.1, 0, -0.3]}>
      <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.1, 0.9, 0.6]} /><meshStandardMaterial color={C.orange} /></mesh>
      <mesh position={[0, 1.0, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.85, 0.85, 0.62]} /><meshStandardMaterial color={C.red} /></mesh>
      <mesh position={[0, 0.35, 0.31]}><planeGeometry args={[0.35, 0.55]} /><meshStandardMaterial color="#FFF6E6" /></mesh>
    </group>
  );
}

function House({ stage }) {
  const bell = useRef();
  useFrame(() => {
    if (bell.current) bell.current.rotation.z = stage === 'ARRIVED' ? Math.sin(performance.now() / 80) * 0.4 : 0;
  });
  return (
    <group position={[5.1, 0, -0.3]}>
      <mesh position={[0, 0.45, 0]}><boxGeometry args={[1.0, 0.9, 0.6]} /><meshStandardMaterial color={C.light} /></mesh>
      <mesh position={[0, 1.0, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.78, 0.78, 0.62]} /><meshStandardMaterial color={C.grey} /></mesh>
      <mesh position={[0, 0.3, 0.31]}><planeGeometry args={[0.28, 0.5]} /><meshStandardMaterial color={C.orange} /></mesh>
      <mesh ref={bell} position={[0.35, 0.7, 0.32]}><sphereGeometry args={[0.08, 12, 12]} /><meshStandardMaterial color={C.sun} emissive={stage === 'ARRIVED' ? C.sun : '#000'} emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

/** Fit road, shop and house into any strip height: from the 76 px fixed lane to the tracking page. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.height / 1.75, size.width / 12.4);
    camera.position.set(0, 0.68, 10);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export default function LaneScene({ stage, progress, active = true }) {
  return (
    <Canvas orthographic dpr={[1, 1.5]} frameloop={active ? 'always' : 'never'} camera={{ position: [0, 0.68, 10], zoom: 40 }} gl={{ antialias: true, alpha: false }} aria-hidden="true">
      <FitCamera />
      <color attach="background" args={[C.dark]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 6]} intensity={1.4} />
      <Road moving={stage === 'ON_THE_WAY'} />
      <Shop />
      <House stage={stage} />
      <Scooter stage={stage} progress={progress} />
    </Canvas>
  );
}
