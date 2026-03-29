import { Terminal, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SystemAlert {
  id: string;
  timestamp: string;
  nodeId: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

interface AlertFeedProps { alerts: SystemAlert[] }

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-destructive',               bg: 'bg-destructive/8 border-destructive/20' },
  warning:  { icon: AlertCircle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/20' },
  info:     { icon: Info,        color: 'text-blue-500',                    bg: 'bg-blue-500/8 border-blue-500/20'     },
};

export default function AlertFeed({ alerts }: AlertFeedProps) {
  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Event Log</span>
        </div>
        {alerts.length > 0 && (
          <span className="bg-destructive/15 text-destructive border border-destructive/20 text-[10px] font-semibold px-2 py-0.5 rounded-full tabular-nums">
            {alerts.length}
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 opacity-20" />
            <span className="text-xs font-medium">No active alerts</span>
          </div>
        ) : alerts.map(alert => {
          const cfg = severityConfig[alert.severity];
          const Icon = cfg.icon;
          return (
            <div key={alert.id} className={cn("p-3 rounded-lg border text-xs", cfg.bg)}>
              <div className="flex items-start gap-2">
                <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-semibold text-foreground font-mono text-[10px] truncate">{alert.nodeId}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{alert.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
