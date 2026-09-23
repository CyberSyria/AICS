import { cn } from '@/utils/cn'

const SEGMENT_COLORS = [
  'bg-gold',
  'bg-success',
  'bg-warning',
  'bg-gold/70',
  'bg-success/70',
  'bg-warning/70',
]

type Segment = {
  id: string
  label: string
  weight: number
}

export function PhaseWeightBar({
  segments,
  activeId,
  onSelect,
  onChangeWeight,
}: {
  segments: Segment[]
  activeId?: string | null
  onSelect?: (id: string) => void
  onChangeWeight: (id: string, weight: number) => void
}) {
  const active = segments.find((s) => s.id === activeId) || segments[0]
  const sum = segments.reduce((a, s) => a + s.weight, 0)
  const othersSum = active
    ? segments.reduce((a, s) => (s.id === active.id ? a : a + s.weight), 0)
    : 0
  const maxAllowed = Math.max(0, 100 - othersSum)

  return (
    <div className="space-y-3">
      <div className="flex h-8 w-full overflow-hidden rounded-md border border-line bg-panel-2">
        {segments.map((seg, i) => (
          <button
            key={seg.id}
            type="button"
            title={`${seg.label}: ${seg.weight}%`}
            onClick={() => onSelect?.(seg.id)}
            className={cn(
              'relative h-full transition-all',
              seg.weight > 0 ? 'min-w-[2%]' : 'min-w-0',
              SEGMENT_COLORS[i % SEGMENT_COLORS.length],
              active?.id === seg.id ? 'ring-2 ring-inset ring-white/70 opacity-100' : 'opacity-80 hover:opacity-100',
            )}
            style={{ width: `${Math.max(seg.weight, 0)}%`, flexGrow: seg.weight > 0 ? 0 : 0 }}
          >
            {seg.weight >= 8 && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink-green mix-blend-difference">
                {seg.weight}%
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-muted">
        {segments.map((seg, i) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => onSelect?.(seg.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded border px-2 py-1',
              active?.id === seg.id ? 'border-gold text-gold-light' : 'border-line',
            )}
          >
            <span className={cn('h-2 w-2 rounded-sm', SEGMENT_COLORS[i % SEGMENT_COLORS.length])} />
            <span className="max-w-[10rem] truncate">{seg.label}</span>
            <span className="font-medium text-text">{seg.weight}%</span>
          </button>
        ))}
        <span className={cn('ms-auto self-center', sum === 100 ? 'text-muted' : 'text-warning')}>
          Σ {sum}%
        </span>
      </div>

      {active && (
        <div className="rounded border border-line/60 bg-panel px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted">{active.label}</span>
            <span className="font-medium text-gold-light">
              {active.weight}% <span className="text-muted">(max {maxAllowed}%)</span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxAllowed}
            step={1}
            value={Math.min(active.weight, maxAllowed)}
            onChange={(e) => onChangeWeight(active.id, Number(e.target.value))}
            className="w-full accent-[var(--color-gold)]"
            disabled={maxAllowed === 0 && active.weight === 0}
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={maxAllowed}
              value={active.weight}
              onChange={(e) => onChangeWeight(active.id, Number(e.target.value) || 0)}
              className="w-20 rounded border border-line bg-panel-2 px-2 py-1 text-xs"
            />
            <span className="text-[11px] text-muted">/ {maxAllowed}% available</span>
          </div>
        </div>
      )}
    </div>
  )
}
