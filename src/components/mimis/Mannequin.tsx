'use client'

import { Line, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'
import {
  MEASUREMENT_LIMITS,
  customizationFieldsFor,
  fieldLabel,
  measurementFieldsFor,
} from './constants'
import { type Dim, type Piece, type Role, type Vec3, buildFit, sample } from './fitModel'

type MannequinState = {
  category: string
  garmentType: string
  measurements: Record<string, string | number>
  customizations: Record<string, string | string[]>
}

const COLORS: Record<Role | 'accent', string> = {
  skin: '#efe5da',
  cloth: '#7f6a5b',
  sheer: '#d8c8ad',
  shirt: '#f7f3ee',
  trim: '#5d4738',
  accent: '#d9822b',
}
const COLUMNS = 48

// Turns a fitModel tube into a mesh: one vertex column per angle, rows between bottom and top.
function tubeGeometry(piece: Piece) {
  const angles = Array.from({ length: COLUMNS }, (_, i) => (i / COLUMNS) * Math.PI * 2)
  const span = Math.max(...angles.map((t) => piece.top(t) - piece.bottom(t)))
  const rows = Math.min(220, Math.max(6, Math.ceil(span / 0.5)))
  const positions: number[] = []
  for (const t of angles) {
    const lo = piece.bottom(t)
    const hi = piece.top(t)
    for (let j = 0; j <= rows; j++) {
      const y = lo + ((hi - lo) * j) / rows
      const r = sample(piece.profile, y)
      positions.push(r.rx * Math.sin(t), y, r.rz * Math.cos(t))
    }
  }
  const index: number[] = []
  for (let i = 0; i < COLUMNS; i++) {
    const next = (i + 1) % COLUMNS
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j
      const b = next * (rows + 1) + j
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return geometry
}

function PieceMesh({ piece, lit }: { piece: Piece; lit: boolean }) {
  const geometry = useMemo(() => tubeGeometry(piece), [piece])
  useEffect(() => () => geometry.dispose(), [geometry])
  const sheer = piece.role === 'sheer'
  const mesh = (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={COLORS[piece.role]}
        emissive={COLORS.accent}
        emissiveIntensity={lit ? 0.28 : 0}
        side={DoubleSide}
        roughness={0.85}
        transparent={sheer}
        opacity={sheer ? 0.82 : 1}
      />
    </mesh>
  )
  if (!piece.frame) return mesh
  return (
    <group position={piece.frame.at} rotation={[0, 0, piece.frame.tiltZ]}>
      {mesh}
    </group>
  )
}

function DimMarker({ dim }: { dim: Dim }) {
  const points: Vec3[] =
    dim.kind === 'line'
      ? [dim.from, dim.to]
      : Array.from({ length: 65 }, (_, i) => {
          const t = (i / 64) * Math.PI * 2
          return [dim.ring.rx * Math.sin(t), dim.ring.y, dim.ring.rz * Math.cos(t)]
        })
  const marker = (
    <Line points={points} color={COLORS.accent} lineWidth={3} depthTest={false} renderOrder={10} />
  )
  if (!dim.frame) return marker
  return (
    <group position={dim.frame.at} rotation={[0, 0, dim.frame.tiltZ]}>
      {marker}
    </group>
  )
}

const canUseWebGL = () => {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function Mannequin({
  state,
  activeField = null,
}: {
  state: MannequinState
  activeField?: string | null
}) {
  const [webgl] = useState(canUseWebGL)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)

  const { fit, entered } = useMemo(() => {
    const options = Object.fromEntries(
      Object.entries(customizationFieldsFor(state.category, state.garmentType))
        .filter(([, applies]) => applies)
        .map(([key]) => [key, String(state.customizations[key] ?? '') || undefined]),
    )
    // Only the fields this garment collects, clamped to the form's limits so the preview never breaks.
    const values: Record<string, number> = {}
    for (const key of measurementFieldsFor(
      state.category,
      state.garmentType,
      options.sleeveStyle,
    )) {
      const raw = state.measurements[key]
      const number = Number(raw)
      const limit = MEASUREMENT_LIMITS[key]
      if (raw === '' || raw === undefined || !Number.isFinite(number) || !limit) continue
      values[key] = Math.min(limit.max, Math.max(limit.min, number))
    }
    return {
      fit: buildFit({ category: state.category, garmentType: state.garmentType, values, options }),
      entered: values,
    }
    // Keyed on content: the parent rebuilds `state` on every render, geometry should only follow edits.
  }, [
    state.category,
    state.garmentType,
    JSON.stringify(state.measurements),
    JSON.stringify(state.customizations),
  ])

  const height = fit.height
  const view = (side: 'front' | 'side' | 'back') => {
    const orbit = controls.current
    if (!orbit) return
    const distance = height * 2.15
    const [x, z] =
      side === 'front' ? [0, distance] : side === 'side' ? [distance, 0] : [0, -distance]
    orbit.object.position.set(x, height * 0.55, z)
    orbit.target.set(0, height * 0.5, 0)
    orbit.update()
  }

  const dim = activeField ? fit.dims[activeField] : undefined
  const dimLabel = activeField
    ? `${fieldLabel(activeField)} · ${
        entered[activeField] !== undefined
          ? `${entered[activeField]} in`
          : `${(fit.used[activeField] ?? 0).toFixed(1)} in (not entered)`
      }`
    : ''

  return (
    <div className="rounded-[22px] border border-[#dfd2c5] bg-[#fcf8f3] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[#e9ddd2] px-3 py-1 text-[10px] font-bold tracking-[.14em] text-[#6f4e3a]">
          3D FIT STUDIO
        </span>
        <span className="text-xs text-[#806f63]">
          {state.garmentType || 'Custom garment'} · {height.toFixed(0)}&quot; tall
          {entered.height === undefined ? ' (default)' : ''}
        </span>
      </div>
      <div className="relative h-[460px] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#f6efe7] to-[#e8dccf]">
        {webgl ? (
          <Canvas
            camera={{ position: [0, height * 0.55, height * 2.15], fov: 30, near: 1, far: 2000 }}
            dpr={[1, 2]}
            frameloop="demand"
          >
            <hemisphereLight args={['#fffaf3', '#a8927f', 1.2]} />
            <directionalLight position={[30, 90, 60]} intensity={1.6} />
            <directionalLight position={[-40, 50, -50]} intensity={0.55} />
            {fit.pieces.map((piece) => (
              <PieceMesh
                key={piece.key}
                piece={piece}
                lit={Boolean(activeField && piece.fields?.includes(activeField))}
              />
            ))}
            <mesh position={[0, -0.35, 0]}>
              <cylinderGeometry args={[fit.standRadius, fit.standRadius + 0.6, 0.7, 48]} />
              <meshStandardMaterial color="#5c3d28" roughness={0.6} />
            </mesh>
            {dim && <DimMarker dim={dim} />}
            <OrbitControls
              ref={controls}
              target={[0, height * 0.5, 0]}
              enablePan={false}
              minDistance={height * 0.6}
              maxDistance={height * 3.5}
              maxPolarAngle={Math.PI * 0.55}
            />
          </Canvas>
        ) : (
          <p className="grid h-full place-items-center px-6 text-center text-sm text-[#806f63]">
            3D preview is not supported on this device. Measurements still save normally.
          </p>
        )}
        {webgl && dim && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#2e1d12]/85 px-3 py-1 text-xs font-semibold text-white shadow">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#d9822b]" />
            {dimLabel}
          </span>
        )}
        {webgl && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {(['front', 'side', 'back'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => view(side)}
                className="rounded-full border border-[#d8c8b8] bg-white/90 px-3 py-1 text-xs font-semibold capitalize text-[#5f4a3d] shadow-sm hover:bg-white"
              >
                {side}
              </button>
            ))}
          </div>
        )}
      </div>
      {fit.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[#a4432f]">
          {fit.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-center text-[11px] leading-4 text-[#8b786c]">
        Drag to rotate, scroll or pinch to zoom. Click a measurement to see it on the mannequin.
        Measurements remain the source of truth for cutting and fitting.
      </p>
    </div>
  )
}
