import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

interface Props { data: any[]; dataKey: string; color: string; }

export default function LiveChart({ data, dataKey, color }: Props) {
  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`cg-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              fontSize: '10px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
            itemStyle={{ color: 'var(--color-foreground)', fontWeight: 500 }}
            cursor={{ stroke: 'var(--color-border)' }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fillOpacity={1}
            fill={`url(#cg-${dataKey})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
