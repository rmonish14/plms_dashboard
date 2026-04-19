import { useState } from 'react';
import { X, CalendarClock, User, Calendar, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SystemAlert } from './AlertFeed';

export interface MaintenanceTask {
  id: string;
  alertId: string;
  nodeId: string;
  assignee: string;
  scheduledAt: string;   // ISO date string
  priority: 'routine' | 'urgent' | 'critical';
  notes: string;
  createdAt: string;
}

const TECHNICIANS = [
  'Ahmed Hassan',
  'Priya Sharma',
  'Carlos Mendez',
  'Li Wei',
  'Sarah Johnson',
];

interface MaintenanceModalProps {
  alert: SystemAlert;
  existing?: MaintenanceTask;
  onSave: (task: MaintenanceTask) => void;
  onClose: () => void;
}

export default function MaintenanceModal({ alert, existing, onSave, onClose }: MaintenanceModalProps) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16);

  const [assignee,    setAssignee]    = useState(existing?.assignee    ?? TECHNICIANS[0]);
  const [scheduledAt, setScheduledAt] = useState(existing?.scheduledAt ?? tomorrow);
  const [priority,    setPriority]    = useState<MaintenanceTask['priority']>(
    existing?.priority ?? (alert.severity === 'critical' ? 'critical' : 'urgent')
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const handleSave = () => {
    const task: MaintenanceTask = {
      id:          existing?.id ?? `mt-${Date.now()}`,
      alertId:     alert.id,
      nodeId:      alert.nodeId,
      assignee,
      scheduledAt,
      priority,
      notes,
      createdAt:   existing?.createdAt ?? new Date().toISOString(),
    };
    onSave(task);
    onClose();
  };

  const priorityStyles: Record<MaintenanceTask['priority'], string> = {
    routine:  'bg-primary/10 text-primary border-primary/20',
    urgent:   'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    critical: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <CalendarClock className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Schedule Maintenance</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{alert.nodeId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Alert summary */}
        <div className="px-6 py-3 bg-secondary/40 border-b border-border">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">Alert Reason</p>
          <p className="text-xs text-foreground leading-relaxed">{alert.message}</p>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-5">

          {/* Priority */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Priority Level</label>
            <div className="flex gap-2">
              {(['routine', 'urgent', 'critical'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex-1 py-2 text-[10px] font-semibold capitalize rounded-lg border transition-all',
                    priority === p ? priorityStyles[p] : 'bg-secondary text-muted-foreground border-border hover:border-foreground/20'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Assign technician */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2 flex items-center gap-1.5">
              <User className="w-3 h-3" /> Assign Technician
            </label>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
            >
              {TECHNICIANS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Scheduled date/time */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Scheduled Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Notes (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe the required maintenance action..."
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Confirm Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// Utility: download all maintenance tasks as CSV
export function downloadMaintenanceCSV(tasks: MaintenanceTask[]) {
  if (tasks.length === 0) return;
  const header = ['ID', 'Node ID', 'Assignee', 'Priority', 'Scheduled At', 'Notes', 'Created At'];
  const rows = tasks.map(t => [
    t.id, t.nodeId, t.assignee, t.priority,
    new Date(t.scheduledAt).toLocaleString(),
    `"${t.notes.replace(/"/g, '""')}"`,
    new Date(t.createdAt).toLocaleString(),
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `plms-maintenance-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
