interface GaugeProps {
  value: number; min: number; max: number;
  label: string; unit: string;
  colorClass: string; size?: number;
}

export default function GaugeWidget({ value, min, max, label, unit, colorClass, size = 100 }: GaugeProps) {
  const r   = (size - 14) / 2;
  const circ = r * 2 * Math.PI;
  const pct  = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const offset = circ - pct * circ;

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90 w-full h-full drop-shadow-sm">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="transparent"
            strokeWidth="7"
            className="stroke-secondary"
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="transparent"
            strokeWidth="7"
            strokeLinecap="round"
            className={colorClass}
            style={{
              strokeDasharray: circ,
              strokeDashoffset: offset,
              transition: 'stroke-dashoffset 0.8s ease',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-semibold text-foreground tabular-nums font-mono leading-none">{value}</span>
          <span className="text-[9px] text-muted-foreground mt-0.5">{unit}</span>
        </div>
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </div>
  );
}
