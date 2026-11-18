'use client'

type MannequinState = {
  category: string
  garmentType: string
  measurements: Record<string, string | number>
  customizations: Record<string, string | string[]>
}

export function Mannequin({ state }: { state: MannequinState }) {
  const m = state.measurements || {}
  const cust = state.customizations || {}
  const value = (key: string, fallback: number) => Number(m[key]) || fallback
  const option = (key: string, fallback: string) =>
    typeof cust[key] === 'string' ? (cust[key] as string) : fallback

  const bust = value('bust', 34)
  const waist = value('waist', 28)
  const hips = value('hips', 36)
  const shoulder = value('shoulder', 15)
  const sleeveStyle = option('sleeveStyle', 'Short sleeve')
  const necklineStyle = option('necklineStyle', 'Round neck')
  const backStyle = option('backStyle', 'Regular back')
  const fitStyle = option('fitStyle', 'Regular fit')
  const silhouette = option('garmentSilhouette', 'A-line')
  const sleeveLength = value(
    'sleeveLength',
    sleeveStyle === 'Long sleeve' ? 22 : sleeveStyle === 'Sleeveless' ? 0 : 8,
  )
  const fitFactor =
    fitStyle === 'Fitted'
      ? 0.92
      : fitStyle === 'Loose fit'
        ? 1.1
        : fitStyle === 'Oversized'
          ? 1.25
          : 1
  const shoulderWidth = Math.min(Math.max(shoulder * 5.5 * fitFactor, 50), 140)
  const bustRx = Math.min(Math.max(bust * 1.15 * fitFactor, 25), 72)
  const waistRx = Math.min(Math.max(waist * 1.15 * fitFactor, 20), 62)
  const hipsRx = Math.min(Math.max(hips * 1.15 * fitFactor, 25), 75)
  const sleeveVisual = Math.min(Math.max(sleeveLength * 4.5, 15), 160)
  const garment = state.garmentType.toLowerCase()
  const isBlazerOrSuit = garment.includes('blazer') || garment === 'suit'
  const isBarong = garment.includes('barong')
  const isVest = garment.includes('vest')
  const isFormalTop = isBlazerOrSuit || isBarong || isVest
  const isBottom = state.category === 'Bottoms'
  const isPants =
    garment.includes('pant') ||
    garment.includes('trouser') ||
    garment.includes('jean') ||
    garment.includes('short')
  const isDress =
    state.category === 'Dresses and Gowns' ||
    garment.includes('dress') ||
    garment.includes('gown') ||
    garment.includes('jumpsuit')

  const neckline = () => {
    if (necklineStyle.includes('V-neck'))
      return (
        <path d="M 140 70 L 160 106 L 180 70 Z" fill="#f7efe7" stroke="#49382d" strokeWidth="1.5" />
      )
    if (necklineStyle === 'Square neck')
      return (
        <path
          d="M 142 70 L 142 98 L 178 98 L 178 70 Z"
          fill="#f7efe7"
          stroke="#49382d"
          strokeWidth="1.5"
        />
      )
    if (necklineStyle === 'Sweetheart neckline')
      return (
        <path
          d="M 140 70 Q 150 95 160 85 Q 170 95 180 70 Z"
          fill="#f7efe7"
          stroke="#49382d"
          strokeWidth="1.5"
        />
      )
    if (necklineStyle === 'Off-shoulder')
      return (
        <path
          d="M 120 82 Q 160 95 200 82 L 200 70 L 120 70 Z"
          fill="#f7efe7"
          stroke="#49382d"
          strokeWidth="1.5"
        />
      )
    if (['Boat neck', 'Scoop neck'].includes(necklineStyle))
      return (
        <ellipse
          cx="160"
          cy="74"
          rx="26"
          ry="14"
          fill="#f7efe7"
          stroke="#49382d"
          strokeWidth="1.5"
        />
      )
    return null
  }

  const sleeves = () => {
    if (sleeveStyle === 'Sleeveless' || isVest) return null
    const visualLength = isBarong || isBlazerOrSuit ? Math.max(sleeveVisual, 120) : sleeveVisual
    if (sleeveStyle === 'Puff sleeve')
      return (
        <g>
          <circle cx={160 - shoulderWidth / 2 - 6} cy="82" r="14" fill="#79563f" stroke="#2e1d12" />
          <circle cx={160 + shoulderWidth / 2 + 6} cy="82" r="14" fill="#79563f" stroke="#2e1d12" />
        </g>
      )
    return (
      <g>
        <path
          d={`M ${160 - shoulderWidth / 2 - 4} 70 L ${160 - shoulderWidth / 2 - visualLength * 0.4} ${70 + visualLength} L ${160 - shoulderWidth / 2 - visualLength * 0.4 + 14} ${85 + visualLength} L ${160 - shoulderWidth / 2 - 4} 100 Z`}
          fill="#79563f"
          stroke="#2e1d12"
          strokeWidth="1.5"
        />
        <path
          d={`M ${160 + shoulderWidth / 2 + 4} 70 L ${160 + shoulderWidth / 2 + visualLength * 0.4} ${70 + visualLength} L ${160 + shoulderWidth / 2 + visualLength * 0.4 - 14} ${85 + visualLength} L ${160 + shoulderWidth / 2 + 4} 100 Z`}
          fill="#79563f"
          stroke="#2e1d12"
          strokeWidth="1.5"
        />
      </g>
    )
  }

  return (
    <div className="rounded-[22px] border border-[#dfd2c5] bg-[#fcf8f3] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-[#e9ddd2] px-3 py-1 text-[10px] font-bold tracking-[.14em] text-[#6f4e3a]">
          REAL-TIME FIT STUDIO
        </span>
        <span className="text-xs text-[#806f63]">
          {state.garmentType || 'Custom garment'} · {waist}&quot; waist
        </span>
      </div>
      <svg
        aria-label="Mimi's interactive garment mannequin"
        className="mx-auto h-[430px] w-full max-w-[330px]"
        viewBox="0 0 320 440"
      >
        <rect x="156" y="20" width="8" height="400" fill="#927d6e" rx="4" />
        <path d="M 120 415 Q 160 395 200 415 L 190 425 Q 160 408 130 425 Z" fill="#5c3d28" />
        <path
          d={`M ${160 - shoulderWidth / 2} 70 Q 160 80 ${160 + shoulderWidth / 2} 70 Q ${160 + bustRx} 110 ${160 + waistRx} 160 Q ${160 + hipsRx} 210 ${160 + hipsRx - 10} 260 L ${160 - (hipsRx - 10)} 260 Q ${160 - hipsRx} 210 ${160 - waistRx} 160 Q ${160 - bustRx} 110 ${160 - shoulderWidth / 2} 70 Z`}
          fill="#eadfd5"
          stroke="#b18b6c"
          strokeWidth="2"
        />
        <rect x="148" y="42" width="24" height="28" fill="#d0bfb0" rx="4" />
        <ellipse cx="160" cy="42" rx="14" ry="6" fill="#8b654b" />
        {!isBottom && (
          <g>
            <path
              d={`M ${160 - shoulderWidth / 2 - 4} 70 Q 160 86 ${160 + shoulderWidth / 2 + 4} 70 L ${160 + shoulderWidth / 2 + 4} 110 Q ${160 + bustRx + 4} 130 ${160 + waistRx + 4} 160 L ${160 - waistRx - 4} 160 Q ${160 - bustRx - 4} 130 ${160 - shoulderWidth / 2 - 4} 110 Z`}
              fill="#79563f"
              stroke="#2e1d12"
              strokeWidth="2"
            />
            {sleeves()}
            {neckline()}
            {isBlazerOrSuit && (
              <g>
                <path
                  d="M 128 72 L 151 126 L 160 96 L 145 70 Z"
                  fill="#5e402f"
                  stroke="#2e1d12"
                  strokeWidth="1.5"
                />
                <path
                  d="M 192 72 L 169 126 L 160 96 L 175 70 Z"
                  fill="#5e402f"
                  stroke="#2e1d12"
                  strokeWidth="1.5"
                />
                <path d="M 160 96 L 160 160" stroke="#2e1d12" strokeWidth="2" />
                <circle cx="154" cy="129" r="2.8" fill="#d2b48c" />
                <circle cx="154" cy="143" r="2.8" fill="#d2b48c" />
                <path d="M 177 130 L 187 130" stroke="#d2b48c" strokeWidth="2" />
              </g>
            )}
            {isBarong && (
              <g>
                <path
                  d={`M ${160 - waistRx - 4} 145 L ${160 + waistRx + 4} 145 L ${160 + waistRx + 8} 205 Q 160 214 ${160 - waistRx - 8} 205 Z`}
                  fill="#b78c66"
                  fillOpacity=".55"
                  stroke="#5f402d"
                  strokeWidth="1.5"
                />
                <path d="M 160 72 L 160 190" stroke="#e5c6a5" strokeWidth="2" />
                <path
                  d="M 143 92 Q 160 110 177 92 M 140 116 Q 160 134 180 116 M 139 143 Q 160 158 181 143"
                  fill="none"
                  stroke="#e8c9a7"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
                <circle cx="160" cy="83" r="2" fill="#f3dcc3" />
                <circle cx="160" cy="94" r="2" fill="#f3dcc3" />
              </g>
            )}
            {isVest && (
              <g>
                <path
                  d="M 129 72 L 151 121 L 160 102 L 169 121 L 191 72 L 184 160 L 136 160 Z"
                  fill="#634331"
                  stroke="#2e1d12"
                  strokeWidth="1.5"
                />
                <path d="M 160 102 L 160 160" stroke="#2e1d12" strokeWidth="1.5" />
                {[122, 136, 150].map((cy) => (
                  <circle key={cy} cx="155" cy={cy} r="2.5" fill="#d2b48c" />
                ))}
              </g>
            )}
            {['Open back', 'Backless', 'Low back'].includes(backStyle) && (
              <path
                d="M 142 85 Q 160 145 178 85 Z"
                fill="#f7efe7"
                stroke="#b18b6c"
                strokeDasharray="4 4"
              />
            )}
          </g>
        )}
        {(isBottom || isDress) &&
          (isPants ? (
            <path
              d={`M ${160 - waistRx} 158 L ${160 + waistRx} 158 Q ${160 + hipsRx + 8} 210 ${160 + hipsRx / 2} 390 L 164 390 L 160 210 L 156 390 L ${160 - hipsRx / 2} 390 Q ${160 - hipsRx - 8} 210 ${160 - waistRx} 158 Z`}
              fill="#79563f"
              stroke="#2e1d12"
              strokeWidth="2"
            />
          ) : (
            <path
              d={`M ${160 - waistRx - 2} 158 L ${160 + waistRx + 2} 158 Q ${160 + (silhouette === 'Ball gown' ? hipsRx + 45 : hipsRx + 12)} 230 ${160 + (silhouette === 'Ball gown' ? hipsRx + 60 : hipsRx + 28)} ${isDress ? 390 : 320} L ${160 - (silhouette === 'Ball gown' ? hipsRx + 60 : hipsRx + 28)} ${isDress ? 390 : 320} Q ${160 - hipsRx - 12} 230 ${160 - waistRx - 2} 158 Z`}
              fill="#79563f"
              stroke="#2e1d12"
              strokeWidth="2"
            />
          ))}
      </svg>
      <p className="mt-1 text-center text-[11px] leading-4 text-[#8b786c]">
        {isFormalTop
          ? `${state.garmentType} construction preview. Measurements remain the source of truth for cutting and fitting.`
          : 'Visual guide only. Measurements remain the source of truth for cutting and fitting.'}
      </p>
    </div>
  )
}
