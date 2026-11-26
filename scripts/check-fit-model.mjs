// Run: node scripts/check-fit-model.mjs
// Proves the bug the old 2D mannequin had is gone: for every garment, every measurement field
// and every customization option it collects changes the 3D geometry.
import assert from 'node:assert/strict'
import {
  GARMENTS,
  MEASUREMENT_LIMITS,
  customizationFieldsFor,
  measurementFieldsFor,
} from '../src/components/mimis/constants.ts'
import { buildFit } from '../src/components/mimis/fitModel.ts'

const TYPICAL = {
  height: 64,
  bust: 34,
  chest: 36,
  waist: 28,
  hips: 37,
  shoulder: 15,
  armhole: 16,
  sleeveLength: 10,
  blouseLength: 22,
  fullLength: 40,
  shoulderToFloor: 52,
  thigh: 21,
  frontRise: 10,
  inseam: 28,
  outseam: 38,
  skirtLength: 22,
}
const OPTIONS = {
  sleeveStyle: ['Sleeveless', 'Short sleeve', 'Long sleeve', 'Puff sleeve', 'Bell sleeve'],
  necklineStyle: [
    'Round neck',
    'V-neck',
    'Square neck',
    'Sweetheart neckline',
    'Boat neck',
    'Off-shoulder',
  ],
  backStyle: ['Regular back', 'Open back', 'Backless', 'Low back', 'Keyhole back'],
  fitStyle: ['Fitted', 'Regular fit', 'Loose fit', 'Oversized'],
  garmentSilhouette: ['Straight', 'A-line', 'Ball gown', 'Mermaid', 'Wrap'],
}
const DEFAULTS = {
  sleeveStyle: 'Short sleeve',
  necklineStyle: 'Round neck',
  backStyle: 'Regular back',
  fitStyle: 'Regular fit',
  garmentSilhouette: 'A-line',
}

const r3 = (n) => Math.round(n * 1000) / 1000
const signature = (fit) =>
  JSON.stringify(
    fit.pieces.map((p) => [
      p.key,
      p.frame,
      p.profile.map((r) => [r3(r.y), r3(r.rx), r3(r.rz)]),
      [0, 0.3, 1.57, 2.8, Math.PI].map((t) => [r3(p.bottom(t)), r3(p.top(t))]),
    ]),
  )

let checked = 0
for (const [category, types] of Object.entries(GARMENTS)) {
  for (const garmentType of types) {
    const applicable = customizationFieldsFor(category, garmentType)
    const options = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => applicable[key]))
    const fields = measurementFieldsFor(category, garmentType, options.sleeveStyle)
    const values = Object.fromEntries(fields.map((f) => [f, TYPICAL[f]]))
    const fit = (vals, opts = options) =>
      buildFit({ category, garmentType, values: vals, options: opts })
    const baseSig = signature(fit(values))

    for (const field of fields) {
      const bumped = Math.min(values[field] + 3, MEASUREMENT_LIMITS[field].max)
      assert.ok(
        signature(fit({ ...values, [field]: bumped })) !== baseSig,
        `${garmentType}: changing ${field} does not change the 3D shape`,
      )
      checked++
    }
    for (const [key, choices] of Object.entries(OPTIONS)) {
      if (!applicable[key]) continue
      for (const choice of choices) {
        if (choice === options[key]) continue
        assert.ok(
          signature(fit(values, { ...options, [key]: choice })) !== baseSig,
          `${garmentType}: ${key} "${choice}" looks the same as "${options[key]}"`,
        )
        checked++
      }
    }
  }
}

// The exact complaint: a shorter length must give a hem that is exactly that much higher.
const skirtHem = (skirtLength) =>
  buildFit({
    category: 'Bottoms',
    garmentType: 'Skirt',
    values: { waist: 28, hips: 37, skirtLength },
    options: {},
  })
    .pieces.find((p) => p.key === 'skirt')
    .bottom(0)
assert.ok(
  Math.abs(skirtHem(18) - skirtHem(28) - 10) < 1e-9,
  'skirt hem moves 1:1 with skirt length',
)

const sleeveEnd = (sleeveLength) =>
  buildFit({
    category: 'Tops',
    garmentType: 'Blouse',
    values: { sleeveLength },
    options: { sleeveStyle: 'Long sleeve' },
  })
    .pieces.find((p) => p.key === 'sleeve-1')
    .bottom(0)
assert.equal(sleeveEnd(5), -5, 'sleeve ends exactly sleeveLength below the shoulder')
assert.equal(sleeveEnd(12), -12)

console.log(
  `ok: ${checked} field/option changes all move the 3D garment; hem and sleeve lengths are 1:1`,
)
