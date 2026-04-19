import { AlertCircle, Info, X, Download, CalendarClock, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SystemAlert } from './AlertFeed';
import type { MaintenanceTask } from './MaintenanceModal';

interface NotificationsPanelProps {
  alerts: SystemAlert[];
  maintenance: MaintenanceTask[];
  onClose: () => void;
  onSchedule: (alert: SystemAlert) => void;
  onMarkRead: (ids: string[]) => void;
}

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-destructive',                      bg: 'bg-destructive/8 border-destructive/20'      },
  warning:  { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/20'         },
  info:     { icon: Info,          color: 'text-blue-500',                         bg: 'bg-blue-500/8 border-blue-500/20'             },
};

export default function NotificationsPanel({
  alerts, maintenance, onClose, onSchedule, onMarkRead,
}: NotificationsPanelProps) {

  // ── Download Alert Log as CSV ──────────────────────────────────────────
  const downloadCSV = () => {
    const header = ['ID', 'Timestamp', 'Node ID', 'Severity', 'Message'];
    const rows = alerts.map(a => [
      a.id,
      new Date(a.timestamp).toLocaleString(),
      a.nodeId,
      a.severity,
      `"${a.message.replace(/"/g, '""')}"`,   // escape quotes
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `plms-alert-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasScheduled = (alertId: string) =>
    maintenance.some(m => m.alertId === alertId);

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <aside className="relative w-full max-w-md flex flex-col bg-card border-l border-border shadow-2xl h-full overflow-hidden z-10 animate-in slide-in-from-right-8 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Alert Notifications</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{alerts.length} event{alerts.length !== 1 ? 's' : ''} recorded</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Download CSV */}
            <button
              onClick={downloadCSV}
              disabled={alerts.length === 0}
              title="Download alert log as CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-foreground bg-secondary hover:bg-muted border border-border rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3" />
              Export Log
            </button>
            {alerts.length > 0 && (
              <button
                onClick={() => onMarkRead(alerts.map(a => a.id))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                Clear All
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground opacity-20" />
              <p className="text-xs font-medium text-muted-foreground">No active alerts</p>
            </div>
          ) : alerts.map(alert => {
            const cfg  = severityConfig[alert.severity];
            const Icon = cfg.icon;
            const scheduled = hasScheduled(alert.id);

            return (
              <div key={alert.id} className={cn('p-4 rounded-lg border', cfg.bg)}>
                <div className="flex items-start gap-3">
                  <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', cfg.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-foreground font-mono truncate">{alert.nodeId}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{alert.message}</p>

                    {/* Schedule maintenance button */}
                    {alert.severity !== 'info' && (
                      <button
                        onClick={() => onSchedule(alert)}
                        className={cn(
                          'flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-md border transition-colors',
                          scheduled
                            ? 'text-primary bg-primary/10 border-primary/20'
                            : 'text-muted-foreground bg-secondary hover:text-foreground border-border hover:border-foreground/20'
                        )}
                      >
                        <CalendarClock className="w-3 h-3" />
                        {scheduled ? 'Maintenance Scheduled ✓' : 'Schedule Maintenance'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scheduled maintenance summary */}
        {maintenance.length > 0 && (
          <div className="shrink-0 border-t border-border p-4 bg-secondary/20">
            <p className="text-[10px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <CalendarClock className="w-3 h-3 text-primary" />
              Upcoming Maintenance ({maintenance.length})
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {maintenance.map(m => (
                <div key={m.id} className="flex items-center justify-between text-[10px] py-1.5 border-b border-border/60 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-foreground truncate">{m.nodeId}</span>
                    <span className="text-muted-foreground shrink-0">→ {m.assignee}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 ml-2 tabular-nums">
                    {new Date(m.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
