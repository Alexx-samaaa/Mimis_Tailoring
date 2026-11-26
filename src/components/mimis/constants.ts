export const NAVIGATION = [
  ['/', 'Dashboard'],
  ['/customers', 'Customers'],
  ['/measurements', 'Measurements'],
  ['/orders', 'Orders'],
  ['/fittings', 'Fitting Schedule'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
] as const

export const ORDER_STATUSES = [
  'Pending',
  'In Progress',
  'For Fitting',
  'For Alteration',
  'Ready for Pickup',
  'Completed',
  'Cancelled',
]

export const GARMENTS: Record<string, string[]> = {
  Tops: ['Blouse', 'T-shirt', 'Polo shirt', 'Formal top', 'Custom-designed top'],
  'Dresses and Gowns': ['Casual dress', 'Evening gown', 'Wedding dress', 'Custom-designed dress'],
  Bottoms: ['Pants', 'Trousers', 'Shorts', 'Skirt', 'Custom-designed bottom'],
  'Formal Wear': ['Blazer', 'Suit', 'Barong', 'Vest', 'Formal trousers'],
  'Other Garments': ['Jumpsuit', 'Romper', 'Uniform', 'Costume', 'Custom garment'],
}

export const MEASUREMENT_LIMITS: Record<string, { min: number; max: number; required?: boolean }> =
  {
    height: { min: 36, max: 90 },
    bust: { min: 18, max: 80, required: true },
    chest: { min: 18, max: 80, required: true },
    waist: { min: 15, max: 75, required: true },
    hips: { min: 20, max: 85, required: true },
    shoulder: { min: 8, max: 30, required: true },
    armhole: { min: 8, max: 40 },
    sleeveLength: { min: 2, max: 45 },
    blouseLength: { min: 8, max: 50 },
    fullLength: { min: 20, max: 90 },
    shoulderToFloor: { min: 25, max: 90 },
    thigh: { min: 10, max: 50 },
    frontRise: { min: 5, max: 30 },
    inseam: { min: 8, max: 50 },
    outseam: { min: 12, max: 60 },
    skirtLength: { min: 8, max: 65 },
  }

const TOP_FIELDS = ['bust', 'shoulder', 'armhole', 'sleeveLength', 'blouseLength', 'waist']
const DRESS_FIELDS = [
  'bust',
  'waist',
  'hips',
  'shoulder',
  'armhole',
  'sleeveLength',
  'fullLength',
  'shoulderToFloor',
]

export function measurementFieldsFor(category: string, garmentType: string, sleeveStyle?: string) {
  let fields: string[]
  if (category === 'Tops') fields = TOP_FIELDS
  else if (category === 'Dresses and Gowns') fields = DRESS_FIELDS
  else if (category === 'Bottoms') {
    fields =
      garmentType === 'Skirt'
        ? ['waist', 'hips', 'skirtLength']
        : ['waist', 'hips', 'thigh', 'frontRise', 'inseam', 'outseam']
  } else if (category === 'Formal Wear') {
    fields =
      garmentType === 'Formal trousers'
        ? ['waist', 'hips', 'thigh', 'frontRise', 'inseam', 'outseam']
        : garmentType === 'Vest'
          ? ['chest', 'shoulder', 'waist', 'hips', 'armhole']
          : ['chest', 'shoulder', 'waist', 'hips', 'armhole', 'sleeveLength']
  } else {
    fields =
      garmentType === 'Jumpsuit' || garmentType === 'Romper'
        ? ['bust', 'shoulder', 'waist', 'hips', 'fullLength', 'outseam']
        : ['bust', 'shoulder', 'waist', 'hips', 'fullLength']
  }

  // Height sizes the 3D mannequin, so every garment collects it.
  fields = ['height', ...fields]
  return sleeveStyle === 'Sleeveless' ? fields.filter((field) => field !== 'sleeveLength') : fields
}

export function customizationFieldsFor(category: string, garmentType: string) {
  const isTopOrDress = category === 'Tops' || category === 'Dresses and Gowns'
  const isJacket = category === 'Formal Wear' && !['Formal trousers', 'Vest'].includes(garmentType)
  return {
    sleeveStyle: isTopOrDress || isJacket,
    necklineStyle: isTopOrDress,
    backStyle: isTopOrDress,
    fitStyle: category !== 'Bottoms' || garmentType !== 'Skirt',
    garmentSilhouette:
      category === 'Dresses and Gowns' || garmentType === 'Skirt' || garmentType === 'Jumpsuit',
  }
}

export const fieldLabel = (value: string) =>
  value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
