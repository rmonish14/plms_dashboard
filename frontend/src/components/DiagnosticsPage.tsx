import { Server, Database, Activity, Wifi, ServerCrash, Clock, ShieldAlert, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export default function DiagnosticsPage() {
  const [logs, setLogs] = useState<string[]>([
    '[INFO]  MQTT broker initialized on port 1883',
    '[INFO]  MongoDB connection established successfully',
    '[INFO]  WebSocket server listening on port 5000',
    '[WARN]  beta-002 latency spike detected (482 ms)',
    '[INFO]  JWT token rotated for session: admin@10.0.0.1',
    '[DEBUG] Connection pool size: 12 / 20',
  ]);

  useEffect(() => {
    const msgs = [
      '[INFO]  Heartbeat received from alpha-001',
      '[DEBUG] Garbage collection: freed 14.2 MB',
      '[INFO]  Telemetry batch written to MongoDB',
      '[WARN]  Throughput degraded in Zone B pipeline',
      '[INFO]  Alert rule evaluated: PM2.5 threshold OK',
    ];
    const interval = setInterval(() => {
      const ts = new Date().toISOString().slice(11, 19);
      setLogs(prev => [`${ts}  ${msgs[Math.floor(Math.random() * msgs.length)]}`, ...prev].slice(0, 20));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const services = [
    { label: 'Core API',       status: 'Operational', icon: Server,   color: 'text-primary'    },
    { label: 'MQTT Broker',    status: 'Connected',   icon: Wifi,     color: 'text-blue-500'   },
    { label: 'Database',       status: 'Healthy',     icon: Database, color: 'text-primary'    },
    { label: 'WebSocket Hub',  status: 'Active',      icon: Activity, color: 'text-purple-500' },
  ];

  const nodes = [
    { id: 'alpha-001', firmware: 'v2.1.0', ping: '12 ms',  seen: '0s ago',  state: 'online'    },
    { id: 'beta-002',  firmware: 'v2.1.0', ping: '145 ms', seen: '2s ago',  state: 'degraded'  },
    { id: 'gamma-003', firmware: 'v1.9.4', ping: '—',      seen: '4m ago',  state: 'offline'   },
    { id: 'delta-004', firmware: 'v2.1.0', ping: '24 ms',  seen: '1s ago',  state: 'online'    },
  ];

  const stateColor = (s: string) =>
    s === 'online' ? 'text-primary' : s === 'offline' ? 'text-destructive' : 'text-yellow-500 dark:text-yellow-400';
  const stateDot = (s: string) =>
    s === 'online' ? 'bg-primary' : s === 'offline' ? 'bg-destructive' : 'bg-yellow-500';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">

        {/* Page title */}
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <ServerCrash className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold text-foreground">System Diagnostics</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Infrastructure health and real-time event logs</p>
          </div>
        </div>

        {/* Service health cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((svc) => (
            <div key={svc.label} className="glass-card rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <svc.icon className={cn('w-4 h-4', svc.color)} />
                <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                  {svc.status}
                </span>
              </div>
              <p className="text-xs font-medium text-foreground">{svc.label}</p>
            </div>
          ))}
        </div>

        {/* Node table + Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ height: 420 }}>

          {/* Node table */}
          <div className="lg:col-span-2 glass-card rounded-xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="text-xs font-semibold text-foreground">Node Connectivity</h3>
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/40">
                    <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground">Asset ID</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-muted-foreground">Firmware</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-muted-foreground">Latency</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-muted-foreground">Status</th>
                    <th className="text-right px-5 py-3 text-[10px] font-semibold text-muted-foreground">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {nodes.map(n => (
                    <tr key={n.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-foreground flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', stateDot(n.state))} />
                        {n.id}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-muted-foreground">{n.firmware}</td>
                      <td className={cn('px-4 py-3.5 font-mono font-medium', n.ping === '—' ? 'text-destructive' : 'text-foreground')}>{n.ping}</td>
                      <td className={cn('px-4 py-3.5 font-medium capitalize', stateColor(n.state))}>{n.state}</td>
                      <td className="px-5 py-3.5 text-right text-muted-foreground flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />{n.seen}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Logs panel */}
          <div className="glass-card rounded-xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2 shrink-0">
              <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">System Logs</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-secondary/20 space-y-1.5 font-mono text-[10px]">
              {logs.map((log, i) => (
                <p key={i} className={cn(
                  'leading-relaxed border-b border-border/40 pb-1.5',
                  log.includes('[WARN]') ? 'text-yellow-600 dark:text-yellow-400' :
                  log.includes('[DEBUG]') ? 'text-muted-foreground' : 'text-foreground/80'
                )}>
                  {log}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
