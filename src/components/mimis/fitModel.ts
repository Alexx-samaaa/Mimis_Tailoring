// Fit math for the 3D measurement mannequin. Pure: no React, no three.js and no imports, so
// `node scripts/check-fit-model.mjs` can run it directly.
//
// Units: 1 = 1 inch. y is up from the floor and the mannequin faces +z.
// Every body part and garment is a "tube": a stack of ellipses (profile) cut between
// bottom(theta) and top(theta), where theta = 0 is centre front and theta = PI is centre back.
// Measurements set the rings and the cut lines directly, so every input moves the geometry.

export type Vec3 = [number, number, number]
export type Ring = { y: number; rx: number; rz: number }
export type Frame = { at: Vec3; tiltZ: number }
export type Role = 'skin' | 'cloth' | 'sheer' | 'shirt' | 'trim'

export type Piece = {
  key: string
  role: Role
  profile: Ring[]
  bottom: (theta: number) => number
  top: (theta: number) => number
  frame?: Frame
  fields?: string[]
}

export type Dim =
  | { kind: 'line'; from: Vec3; to: Vec3; frame?: Frame }
  | { kind: 'ring'; ring: Ring; frame?: Frame }

export type Base = 'top' | 'dress' | 'skirt' | 'pants' | 'jacket' | 'vest' | 'jumpsuit' | 'uniform'

export type FitInput = {
  category: string
  garmentType: string
  values: Record<string, number | undefined>
  options: Record<string, string | undefined>
}

export type Fit = {
  base: Base
  height: number
  standRadius: number
  pieces: Piece[]
  dims: Record<string, Dim>
  used: Record<string, number>
  notes: string[]
}

const TAU = Math.PI * 2
const ANGLES = Array.from({ length: 48 }, (_, i) => (i / 48) * TAU)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)
const flat = (y: number) => () => y
// 1 at a = 0, easing to 0 at a = width.
const bump = (a: number, width: number) => (a >= width ? 0 : Math.cos((a / width) * (Math.PI / 2)))
const frontAngle = (theta: number) => Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)))
const grow = (r: Ring, d: number): Ring => ({ y: r.y, rx: r.rx + d, rz: r.rz + d })

// Extra garment circumference over the body, in inches, per fit style.
const FIT_EASE: Record<string, number> = {
  Fitted: 1,
  'Regular fit': 2,
  'Loose fit': 4,
  Oversized: 8,
}

/** Ellipse with the given circumference; depth = front-to-back radius / side radius. */
export function ellipse(circumference: number, depth: number, y: number): Ring {
  const rx = circumference / (TAU * Math.sqrt((1 + depth * depth) / 2))
  return { y, rx, rz: rx * depth }
}

/** Profile radius at height y (profile sorted by y), eased between rings. */
export function sample(profile: Ring[], y: number): Ring {
  if (y <= profile[0].y) return { ...profile[0], y }
  for (let i = 1; i < profile.length; i++) {
    const b = profile[i]
    if (y <= b.y) {
      const a = profile[i - 1]
      const t = smooth((y - a.y) / (b.y - a.y || 1))
      return { y, rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t) }
    }
  }
  return { ...profile[profile.length - 1], y }
}

function trace(y0: number, y1: number, at: (y: number) => { rx: number; rz: number }, step = 0.5) {
  const n = Math.max(2, Math.ceil((y1 - y0) / step))
  return Array.from({ length: n + 1 }, (_, i): Ring => {
    const y = lerp(y0, y1, i / n)
    const r = at(y)
    return { y, rx: r.rx, rz: r.rz }
  })
}

function ball(key: string, role: Role, at: Vec3, r: number): Piece {
  const profile = trace(
    -r,
    r,
    (y) => {
      const k = Math.sqrt(Math.max(0, 1 - (y / r) ** 2))
      return { rx: r * k, rz: r * k }
    },
    r / 6,
  )
  return { key, role, profile, bottom: flat(-r), top: flat(r), frame: { at, tiltZ: 0 } }
}

export function baseOf(category: string, garmentType: string): Base {
  if (category === 'Tops') return 'top'
  if (category === 'Dresses and Gowns') return 'dress'
  if (category === 'Bottoms') return garmentType === 'Skirt' ? 'skirt' : 'pants'
  if (category === 'Formal Wear') {
    if (garmentType === 'Vest') return 'vest'
    return garmentType === 'Formal trousers' ? 'pants' : 'jacket'
  }
  return garmentType === 'Jumpsuit' || garmentType === 'Romper' ? 'jumpsuit' : 'uniform'
}

export function buildFit({ category, garmentType, values: v, options: o }: FitInput): Fit {
  const notes: string[] = []
  const base = baseOf(category, garmentType)

  // ---- Body landmarks: height and shoulder-to-floor place them, everything below scales. ----
  const height = v.height ?? (v.shoulderToFloor !== undefined ? v.shoulderToFloor / 0.818 : 64)
  let shoulderY = v.shoulderToFloor ?? 0.818 * height
  if (shoulderY < 0.74 * height || shoulderY > 0.88 * height) {
    shoulderY = clamp(shoulderY, 0.74 * height, 0.88 * height)
    notes.push(
      'Shoulder to floor does not match the height, so the preview uses the nearest realistic shoulder height.',
    )
  }
  const s = shoulderY / 0.818
  const bustY = 0.72 * s
  const waistY = 0.615 * s
  const hipY = 0.52 * s
  const crotchY = 0.47 * s
  const kneeY = 0.285 * s
  const ankleY = 0.045 * s
  const neckY = shoulderY + 0.9
  const chinY = shoulderY + (height - shoulderY) * 0.3

  // ---- Body circumferences. Missing ones are derived so the body stays proportional. ----
  const bust = v.bust ?? v.chest ?? 34
  const waist = v.waist ?? bust - 6
  const hips = v.hips ?? bust + 2
  const shoulder = v.shoulder ?? 15
  const thigh = v.thigh ?? hips * 0.58
  const armhole = v.armhole ?? bust * 0.47
  const half = shoulder / 2

  const bustR = ellipse(bust, 0.74, bustY)
  const waistR = ellipse(waist, 0.74, waistY)
  const hipR = ellipse(hips, 0.72, hipY)
  const torso: Ring[] = [
    { y: crotchY - 1.2, rx: hipR.rx * 0.7, rz: hipR.rz * 0.7 },
    hipR,
    waistR,
    bustR,
    { y: shoulderY - 3, rx: Math.max(bustR.rx * 0.98, half * 0.84), rz: bustR.rz * 0.9 },
    { y: shoulderY - 0.9, rx: half * 0.97, rz: bustR.rz * 0.68 },
    { y: shoulderY + 0.2, rx: half * 0.62, rz: bustR.rz * 0.55 },
    { y: neckY, rx: 2.2, rz: 2.1 },
    { y: chinY + 1, rx: 2, rz: 1.95 },
  ].sort((a, b) => a.y - b.y)

  const ease = FIT_EASE[o.fitStyle ?? 'Regular fit'] ?? 2
  const gap = 0.18 + ease / TAU // radial clearance of cloth over the body

  const thighR = thigh / (TAU * 0.97)
  const legX = Math.max(hipR.rx - thighR * 0.95, thighR * 0.8)
  const leg: Ring[] = [
    { y: 0, rx: 0.1, rz: 0.1 },
    { y: 0.15, rx: 1.4, rz: 2.2 },
    { y: 1.2, rx: 1.15, rz: 1.5 },
    { y: ankleY + 0.6, rx: thighR * 0.33, rz: thighR * 0.33 },
    { y: kneeY - 5, rx: thighR * 0.55, rz: thighR * 0.58 },
    { y: kneeY, rx: thighR * 0.5, rz: thighR * 0.52 },
    { y: crotchY - 1.5, rx: thighR, rz: thighR },
    { y: crotchY + 3.5, rx: thighR * 1.02, rz: thighR * 1.05 },
  ].sort((a, b) => a.y - b.y)

  // Arms hang in a slight A-pose, tilted just enough to clear the hips and the garment.
  const armLen = 0.36 * s
  const armR = Math.max(1.3, bust / 19)
  const jointX = half - 1.1
  const jointY = shoulderY - 1.5
  const tilt = clamp(Math.atan2(hipR.rx + gap + 2.4 - jointX, jointY - hipY), 0.1, 0.6)
  const armFrame = (side: number): Frame => ({ at: [side * jointX, jointY, 0], tiltZ: side * tilt })
  const arm: Ring[] = [
    { y: -armLen - 4.2, rx: 0.05, rz: 0.05 },
    { y: -armLen - 3.2, rx: armR * 0.28, rz: armR * 0.42 },
    { y: -armLen - 1.3, rx: armR * 0.3, rz: armR * 0.55 },
    { y: -armLen, rx: armR * 0.45, rz: armR * 0.42 },
    { y: -armLen * 0.45, rx: armR * 0.72, rz: armR * 0.7 },
    { y: -2, rx: armR, rz: armR * 0.95 },
    { y: 0.6, rx: armR * 1.05, rz: armR },
    { y: 1.6, rx: armR * 0.6, rz: armR * 0.6 },
  ]

  const headB = (height - chinY + 0.8) / 2
  const headCy = height - headB
  const head = trace(
    headCy - headB,
    height,
    (y) => {
      const k = Math.sqrt(Math.max(0, 1 - ((y - headCy) / headB) ** 2))
      return { rx: 0.047 * height * k, rz: 0.056 * height * k }
    },
    headB / 10,
  )

  const pieces: Piece[] = [
    {
      key: 'body-torso',
      role: 'skin',
      profile: torso,
      bottom: flat(torso[0].y),
      top: flat(chinY + 1),
    },
    {
      key: 'body-head',
      role: 'skin',
      profile: head,
      bottom: flat(headCy - headB),
      top: flat(height),
    },
    ...[1, -1].map((side): Piece => ({
      key: `body-arm-${side}`,
      role: 'skin',
      profile: arm,
      bottom: flat(arm[0].y),
      top: flat(1.6),
      frame: armFrame(side),
    })),
    ...[1, -1].map((side): Piece => ({
      key: `body-leg-${side}`,
      role: 'skin',
      profile: leg,
      bottom: flat(0),
      top: flat(crotchY + 3.5),
      frame: { at: [side * legX, 0, 0], tiltZ: 0 },
    })),
  ]
  const add = (...more: Piece[]) => pieces.push(...more)

  // ---- Cloth helpers ----
  const bodyAt = (y: number) => sample(torso, y)
  const legAt = (y: number) => sample(leg, y)
  // Cloth follows the body above the hips and hangs straight below them, always clearing the legs.
  const clothAt = (y: number, extra = 0): Ring => {
    const r = y >= hipY ? bodyAt(y) : { ...hipR, y }
    const l = y < crotchY + 3 ? legAt(y) : { rx: 0, rz: 0 }
    return {
      y,
      rx: Math.max(r.rx, legX + l.rx) + gap + extra,
      rz: Math.max(r.rz, l.rz) + gap + extra,
    }
  }

  const garment = (
    key: string,
    role: Role,
    bottom: (t: number) => number,
    top: (t: number) => number,
    shape: (y: number) => Ring,
    fields: string[],
  ): Piece => {
    const lo = Math.min(...ANGLES.map(bottom)) - 0.2
    const hi = Math.max(...ANGLES.map(top)) + 0.2
    return { key, role, bottom, top, fields, profile: trace(lo, hi, shape) }
  }

  const floorHem = (y: number, what: string) => {
    if (y >= 0.6) return y
    notes.push(`${what} runs past the floor, so the preview stops the hem at the floor.`)
    return 0.6
  }

  // Average every length that implies the hem, so each one moves it.
  const hemFrom = (
    estimates: (number | undefined)[],
    fallback: number,
    what: string,
    max: number,
  ) => {
    const known = estimates.filter((e): e is number => e !== undefined)
    const spread = known.length > 1 ? Math.max(...known) - Math.min(...known) : 0
    if (spread > 1.5)
      notes.push(
        `${what} disagree by ${spread.toFixed(1)} in, so the preview hem splits the difference.`,
      )
    let hem = known.length ? known.reduce((a, b) => a + b) / known.length : fallback
    if (hem > max) {
      hem = max
      notes.push(
        `${what} is too short to show below the crotch, so the preview shows the shortest leg.`,
      )
    }
    return floorHem(hem, what)
  }

  const neckTop = (neckline: string, back: string, minY: number, vTo = bustY + 1) => {
    const top0 =
      neckline === 'Off-shoulder'
        ? shoulderY - 3
        : neckline === 'Sweetheart neckline'
          ? shoulderY - 2.2
          : neckline === 'Boat neck'
            ? neckY - 1.1
            : neckY - 0.2
    const front = (a: number) => {
      switch (neckline) {
        case 'V-neck':
          return (top0 - vTo) * Math.max(0, 1 - a / 0.7)
        case 'Square neck':
          return 4 * (a < 0.5 ? 1 : bump(a - 0.5, 0.15))
        case 'Sweetheart neckline':
          return a < 0.8 ? 1.6 * (1 - Math.sin((a / 0.8) * Math.PI)) : 1.6
        case 'Boat neck':
          return 0.4 * bump(a, 1.2)
        case 'Off-shoulder':
          return 0.6 * bump(a, 1.2)
        default:
          return 2 * bump(a, 1)
      }
    }
    const rear = (b: number) => {
      switch (back) {
        case 'Open back':
          return Math.max(0, top0 - bustY - 1.5) * bump(b, 1.15)
        case 'Low back':
          return Math.max(0, top0 - bustY + 2.5) * bump(b, 0.85)
        case 'Backless':
          return Math.max(0, top0 - waistY - 1.2) * bump(b, 1.25)
        case 'Keyhole back':
          return b < 0.32 ? 6 * Math.sqrt(1 - (b / 0.32) ** 2) : 0
        default:
          return 0.6 * bump(b, 1)
      }
    }
    return (theta: number) => {
      const a = frontAngle(theta)
      return Math.max(minY, top0 - Math.max(front(a), rear(Math.PI - a)))
    }
  }

  // Armhole circumference sets the sleeve opening; sleeves hang in the arm's own frame.
  const holeR = Math.max(armhole / TAU, armR * 1.05)
  const armholeBands = (g: number) =>
    [1, -1].map((side): Piece => ({
      key: `armhole-${side}`,
      role: 'trim',
      frame: armFrame(side),
      fields: ['armhole'],
      profile: [
        { y: -1, rx: holeR + g, rz: (holeR + g) * 0.95 },
        { y: 0.6, rx: holeR + g, rz: (holeR + g) * 0.95 },
      ],
      bottom: flat(-0.9),
      top: flat(0.5),
    }))
  const used: Record<string, number> = {}
  const sleeves = (
    style: string,
    length: number | undefined,
    fallback: number,
    g: number,
    role: Role,
    capLow: boolean,
  ) => {
    if (style === 'Sleeveless') return armholeBands(g)
    let len =
      length ??
      (style === 'Long sleeve'
        ? armLen + 0.3
        : style === 'Puff sleeve'
          ? 5.5
          : style === 'Bell sleeve'
            ? armLen * 0.85
            : fallback)
    if (len > armLen + 1.5) {
      len = armLen + 1.5
      notes.push(
        'Sleeve length is longer than the arm, so the preview stops it just past the wrist.',
      )
    }
    if (length !== undefined && style === 'Long sleeve' && length < armLen * 0.6)
      notes.push('Sleeve length is short for a long sleeve; the preview follows the measurement.')
    if (length !== undefined && style === 'Short sleeve' && length > armLen * 0.6)
      notes.push('Sleeve length is long for a short sleeve; the preview follows the measurement.')
    const capTop = capLow ? -2.6 : 1.4
    len = Math.max(len, 1 - capTop)
    used.sleeveLength = len
    const profile = trace(-len - 0.1, capTop + 0.1, (y) => {
      const a = sample(arm, y)
      const u = clamp(-y / len, 0, 1)
      let r = lerp(holeR, a.rx, clamp(-y / 7, 0, 1)) + g
      if (y > 0) r *= 1 - 0.3 * smooth(Math.min(1, y / 1.6))
      if (style === 'Puff sleeve') r += 1.7 * Math.sin(Math.PI * u)
      if (style === 'Bell sleeve') r += 3 * u * u
      if (style === 'Short sleeve') r += 0.5 * u * u // short sleeves open slightly at the hem
      return { rx: Math.max(r, a.rx + g), rz: Math.max(r * 0.95, a.rz + g) }
    })
    return [1, -1].flatMap((side): Piece[] => {
      const sleeve: Piece = {
        key: `sleeve-${side}`,
        role,
        profile,
        bottom: flat(-len),
        top: flat(capTop),
        frame: armFrame(side),
        fields: ['sleeveLength', 'armhole'],
      }
      if (style !== 'Long sleeve') return [sleeve]
      // Long sleeves finish in a cuff, so the style still shows when the length is typed in.
      const cuff: Piece = {
        key: `cuff-${side}`,
        role: 'trim',
        profile: trace(-len - 0.1, -len + 1.7, (y) => grow(sample(profile, y), 0.08)),
        bottom: flat(-len),
        top: flat(-len + 1.6),
        frame: armFrame(side),
        fields: ['sleeveLength'],
      }
      return [sleeve, cuff]
    })
  }

  const skirtShape =
    (silhouette: string, hemY: number) =>
    (y: number): Ring => {
      if (silhouette === 'Ball gown' && y < waistY) {
        const drop = Math.max(1, waistY - hemY)
        const flare =
          (3 + 0.4 * drop) * Math.sin(Math.min(1, (waistY - y) / (0.6 * drop)) * (Math.PI / 2))
        const w = clothAt(waistY)
        const c = clothAt(y)
        return { y, rx: Math.max(c.rx, w.rx + flare), rz: Math.max(c.rz, w.rz + flare) }
      }
      if (y >= hipY) return clothAt(y)
      const d = hipY - y
      if (silhouette === 'Mermaid') {
        const k = clamp(d / (hipY - kneeY), 0, 1)
        const c = clothAt(y)
        const l = legAt(y)
        const r = {
          y,
          rx: Math.max(c.rx * (1 - 0.14 * k), legX + l.rx + gap),
          rz: Math.max(c.rz * (1 - 0.1 * k), l.rz + gap),
        }
        return y < kneeY ? grow(r, 0.8 * (kneeY - y)) : r
      }
      const flare = silhouette === 'A-line' ? 0.2 : silhouette === 'Wrap' ? 0.14 : 0.03
      return grow(clothAt(y), flare * d)
    }

  const wrapTie = () => {
    const w = clothAt(waistY, 0.15)
    return [
      {
        key: 'wrap-tie',
        role: 'trim' as const,
        profile: trace(waistY - 0.8, waistY + 0.8, (y) => clothAt(y, 0.15)),
        bottom: flat(waistY - 0.7),
        top: flat(waistY + 0.7),
      },
      ball('wrap-knot', 'trim', [w.rx * 0.74, waistY, w.rz * 0.74], 1),
    ]
  }

  const collar = (): Piece => ({
    key: 'collar',
    role: 'trim',
    profile: trace(neckY - 0.6, neckY + 1.6, (y) => grow(bodyAt(Math.min(y, neckY)), 0.45)),
    bottom: flat(neckY - 0.5),
    top: (t) => neckY + 1.4 - 0.9 * bump(frontAngle(t), 0.5),
  })

  const shirtUnder = (hem: number): Piece[] => [
    {
      key: 'shirt',
      role: 'shirt',
      profile: trace(hem - 0.2, neckY + 0.4, (y) => grow(bodyAt(y), 0.15)),
      bottom: flat(hem),
      top: flat(neckY + 0.3),
    },
    collar(),
  ]

  const buttons = (ys: number[], outside: number) =>
    ys.map((y, i) => ball(`button-${i}`, 'trim', [0, y, clothAt(y).rz + outside + 0.1], 0.32))

  const pants = (
    waistbandY: number,
    hemY: number,
    knee: number,
    hemScale: number,
    fields: string[],
  ) => {
    const legTop = crotchY + 2.5
    const span = Math.max(1, crotchY - hemY)
    const legShape = (y: number) => {
      const body = legAt(y)
      const t = clamp((crotchY - y) / span, 0, 1)
      const want =
        thighR * (t < 0.55 ? lerp(1, knee, t / 0.55) : lerp(knee, hemScale, (t - 0.55) / 0.45)) +
        gap
      return { rx: Math.max(body.rx + gap, want), rz: Math.max(body.rz + gap, want) }
    }
    return [
      {
        key: 'pants-seat',
        role: 'cloth' as const,
        fields,
        profile: trace(crotchY - 0.8, waistbandY + 0.2, (y) => clothAt(y)),
        bottom: flat(crotchY - 0.6),
        top: flat(waistbandY),
      },
      {
        key: 'pants-waistband',
        role: 'trim' as const,
        fields: ['waist', 'frontRise'],
        profile: trace(waistbandY - 1.1, waistbandY + 0.1, (y) => clothAt(y, 0.12)),
        bottom: flat(waistbandY - 1),
        top: flat(waistbandY),
      },
      ...[1, -1].map((side): Piece => ({
        key: `pants-leg-${side}`,
        role: 'cloth',
        fields,
        frame: { at: [side * legX, 0, 0], tiltZ: 0 },
        profile: trace(hemY - 0.2, legTop + 0.2, legShape),
        bottom: flat(hemY),
        top: flat(legTop),
      })),
    ]
  }

  // ---- Garments. Each branch reads every field that garment collects. ----
  const sleeveStyle = o.sleeveStyle ?? 'Short sleeve'
  const neckline = o.necklineStyle ?? 'Round neck'
  const back = o.backStyle ?? 'Regular back'
  const silhouette = o.garmentSilhouette ?? 'A-line'
  const capLow = neckline === 'Off-shoulder' || neckline === 'Sweetheart neckline'
  const lengths: Record<string, [number, number, number]> = {} // field -> [fromY, toY, x]
  const sideLengths: Record<string, [number, number]> = {}
  let waistbandY = waistY

  if (base === 'top') {
    const hem = floorHem(
      v.blouseLength !== undefined ? shoulderY - v.blouseLength : hipY - 2,
      'Blouse length',
    )
    add(
      garment(
        'top',
        'cloth',
        flat(hem),
        neckTop(neckline, back, hem + 1.5),
        (y) => (y >= hipY ? clothAt(y) : grow(clothAt(y), 0.04 * (hipY - y))),
        ['blouseLength'],
      ),
      ...sleeves(sleeveStyle, v.sleeveLength, 8, gap + 0.05, 'cloth', capLow),
    )
    lengths.blouseLength = [shoulderY, hem, half * 0.45]
  }

  if (base === 'dress') {
    const long = garmentType === 'Evening gown' || garmentType === 'Wedding dress'
    const hem = floorHem(
      v.fullLength !== undefined ? shoulderY - v.fullLength : long ? 0.6 : kneeY - 1,
      'Full length',
    )
    const tiltAmt = silhouette === 'Wrap' ? 2.2 : 0
    add(
      garment(
        'dress',
        'cloth',
        (t) => Math.max(0.5, hem + tiltAmt * Math.sin(t)),
        neckTop(neckline, back, waistY),
        skirtShape(silhouette, hem),
        ['fullLength'],
      ),
      ...sleeves(sleeveStyle, v.sleeveLength, 8, gap + 0.05, 'cloth', capLow),
    )
    if (silhouette === 'Wrap') add(...wrapTie())
    lengths.fullLength = [shoulderY, hem, half * 0.45]
  }

  if (base === 'skirt') {
    const hem = floorHem(waistY - (v.skirtLength ?? 24), 'Skirt length')
    const tiltAmt = silhouette === 'Wrap' ? 2 : 0
    add(
      garment(
        'skirt',
        'cloth',
        (t) => Math.max(0.5, hem + tiltAmt * Math.sin(t)),
        flat(waistY + 0.6),
        skirtShape(silhouette, hem),
        ['skirtLength'],
      ),
      {
        key: 'skirt-waistband',
        role: 'trim',
        fields: ['waist'],
        profile: trace(waistY - 0.6, waistY + 0.8, (y) => clothAt(y, 0.1)),
        bottom: flat(waistY - 0.5),
        top: flat(waistY + 0.7),
      },
    )
    if (silhouette === 'Wrap') add(...wrapTie())
    lengths.skirtLength = [waistY, hem, 0]
  }

  if (base === 'pants') {
    let wb = crotchY + (v.frontRise !== undefined ? v.frontRise * 0.9 : waistY - crotchY)
    if (wb < crotchY + 3 || wb > bustY - 1) {
      wb = clamp(wb, crotchY + 3, bustY - 1)
      notes.push(
        'Front rise does not fit this body, so the preview uses the nearest realistic rise.',
      )
    }
    waistbandY = wb
    const short = garmentType === 'Shorts'
    const hem = hemFrom(
      [
        v.outseam !== undefined ? wb - v.outseam : undefined,
        v.inseam !== undefined ? crotchY - v.inseam : undefined,
      ],
      short ? crotchY - 5 : ankleY + 0.4,
      'Outseam and inseam',
      crotchY - 1.5,
    )
    add(...pants(wb, hem, short ? 1 : 0.78, short ? 1.02 : 0.68, ['thigh', 'inseam', 'outseam']))
    lengths.frontRise = [crotchY, wb, 0]
    lengths.inseam = [crotchY, hem, 0]
    sideLengths.outseam = [wb, hem]
    used.frontRise = (wb - crotchY) / 0.9
    used.inseam = crotchY - hem
    used.outseam = wb - hem
  }

  if (base === 'jacket') {
    const barong = garmentType === 'Barong'
    const layer = 0.35
    const hem = barong ? crotchY - 2.5 : crotchY - 1
    if (!barong) add(...shirtUnder(waistY - 4))
    add(
      garment(
        'jacket',
        barong ? 'sheer' : 'cloth',
        flat(hem),
        barong
          ? neckTop('Round neck', 'Regular back', hem + 2)
          : neckTop('V-neck', 'Regular back', hem + 2, waistY + 1.5),
        (y) => grow(y >= hipY ? clothAt(y) : grow(clothAt(y), 0.05 * (hipY - y)), layer),
        [],
      ),
      ...sleeves(
        sleeveStyle,
        v.sleeveLength,
        8,
        gap + layer + 0.05,
        barong ? 'sheer' : 'cloth',
        false,
      ),
    )
    if (barong) {
      add(
        collar(),
        ...buttons(
          [0, 1, 2, 3].map((k) => neckY - 1.8 - 2.4 * k),
          layer,
        ),
      )
    } else {
      add(...buttons([waistY + 1, waistY - 2], layer))
    }
    if (garmentType === 'Suit') add(...pants(waistY, ankleY + 0.4, 0.78, 0.68, []))
  }

  if (base === 'vest') {
    const layer = 0.25
    const hem = waistY - 3
    add(
      ...shirtUnder(waistY - 4),
      garment(
        'vest',
        'cloth',
        (t) => hem - 1.4 * Math.max(0, Math.cos(t)) ** 2,
        neckTop('V-neck', 'Regular back', hem + 2, waistY + 2.5),
        (y) => clothAt(y, layer),
        [],
      ),
      ...armholeBands(gap + layer),
      ...buttons([waistY + 1.5, waistY - 0.5, waistY - 2.5], layer),
    )
  }

  if (base === 'uniform') {
    const hem = floorHem(
      v.fullLength !== undefined ? shoulderY - v.fullLength : hipY - 3,
      'Full length',
    )
    add(
      garment(
        'uniform',
        'cloth',
        flat(hem),
        neckTop('Round neck', 'Regular back', hem + 1.5),
        (y) => (y >= hipY ? clothAt(y) : grow(clothAt(y), 0.03 * (hipY - y))),
        ['fullLength'],
      ),
      collar(),
      ...sleeves('Short sleeve', undefined, 8, gap + 0.05, 'cloth', false),
    )
    const ys: number[] = []
    for (let y = neckY - 2.4; y > Math.max(hem + 1.5, waistY - 8); y -= 2.6) ys.push(y)
    add(...buttons(ys, 0))
    lengths.fullLength = [shoulderY, hem, half * 0.45]
  }

  if (base === 'jumpsuit') {
    const romper = garmentType === 'Romper'
    const hem = hemFrom(
      [
        v.fullLength !== undefined ? shoulderY - v.fullLength : undefined,
        v.outseam !== undefined ? waistY - v.outseam : undefined,
      ],
      romper ? crotchY - 3.5 : ankleY + 0.4,
      'Full length and outseam',
      crotchY - 1.5,
    )
    const legShapes: Record<string, [number, number]> = {
      Straight: [0.85, 0.8],
      'A-line': [0.95, 1.15],
      'Ball gown': [1.3, 1.7],
      Mermaid: [0.7, 1.15],
      Wrap: [0.85, 0.8],
    }
    const [knee, hemScale] = romper ? [1, 1.02] : (legShapes[silhouette] ?? [0.85, 0.8])
    const wrap = silhouette === 'Wrap' && !romper
    add(
      garment(
        'jumpsuit-top',
        'cloth',
        flat(waistY - 1),
        neckTop(wrap ? 'V-neck' : 'Round neck', 'Regular back', waistY),
        (y) => clothAt(y),
        [],
      ),
      ...pants(waistY, hem, knee, hemScale, ['fullLength', 'outseam']),
    )
    if (wrap) add(...wrapTie())
    lengths.fullLength = [shoulderY, hem, half * 0.45]
    sideLengths.outseam = [waistY, hem]
    used.fullLength = shoulderY - hem
    used.outseam = waistY - hem
  }

  // ---- Dimension markers, placed just outside whatever the mannequin is wearing. ----
  const outer = (y: number): Ring => {
    let best = clothAt(y)
    for (const p of pieces) {
      if (p.role === 'skin' || p.frame) continue
      if (y < p.profile[0].y || y > p.profile[p.profile.length - 1].y) continue
      const r = sample(p.profile, y)
      best = { y, rx: Math.max(best.rx, r.rx), rz: Math.max(best.rz, r.rz) }
    }
    return best
  }
  const spanMax = (y0: number, y1: number, key: 'rx' | 'rz') =>
    Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => outer(lerp(y0, y1, t))[key]))
  const sideX = -(Math.max(half, spanMax(0.6, shoulderY, 'rx')) + 4)
  const ringAt = (y: number): Dim => ({ kind: 'ring', ring: grow(outer(y), 0.3) })

  const dims: Record<string, Dim> = {
    height: { kind: 'line', from: [sideX, 0, 0], to: [sideX, height, 0] },
    shoulderToFloor: { kind: 'line', from: [sideX, 0, 0], to: [sideX, shoulderY, 0] },
    bust: ringAt(bustY),
    chest: ringAt(bustY),
    waist: ringAt(base === 'pants' ? waistbandY - 0.5 : waistY),
    hips: ringAt(hipY),
    thigh: {
      kind: 'ring',
      ring: { y: crotchY - 1.5, rx: thighR + gap + 0.5, rz: thighR + gap + 0.5 },
      frame: { at: [legX, 0, 0], tiltZ: 0 },
    },
    armhole: {
      kind: 'ring',
      ring: { y: 0, rx: holeR + gap + 0.5, rz: (holeR + gap + 0.5) * 0.95 },
      frame: armFrame(1),
    },
    shoulder: {
      kind: 'line',
      from: [-half, shoulderY - 0.4, bustR.rz * 0.7 + gap + 0.8],
      to: [half, shoulderY - 0.4, bustR.rz * 0.7 + gap + 0.8],
    },
  }
  if (used.sleeveLength !== undefined) {
    const x = holeR + gap + 1.2
    dims.sleeveLength = {
      kind: 'line',
      from: [x, 0.6, 0],
      to: [x, -used.sleeveLength, 0],
      frame: armFrame(1),
    }
  }
  for (const [field, [y0, y1, x]] of Object.entries(lengths)) {
    const z = spanMax(Math.min(y0, y1), Math.max(y0, y1), 'rz') + 1.2
    dims[field] = { kind: 'line', from: [x, y0, z], to: [x, y1, z] }
    used[field] ??= Math.abs(y0 - y1)
  }
  for (const [field, [y0, y1]] of Object.entries(sideLengths)) {
    const x = spanMax(y1, y0, 'rx') + 1.5
    dims[field] = { kind: 'line', from: [x, y0, 0], to: [x, y1, 0] }
  }

  Object.assign(used, {
    height,
    shoulderToFloor: shoulderY,
    bust,
    chest: bust,
    waist,
    hips,
    shoulder,
    thigh,
    armhole,
  })

  return {
    base,
    height,
    standRadius: Math.max(legX + thighR + 4, 9),
    pieces,
    dims,
    used,
    notes: [...new Set(notes)],
  }
}
