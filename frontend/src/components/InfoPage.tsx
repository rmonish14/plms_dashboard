import { Cpu, Terminal, Shield, Network, FileDown, Code, ExternalLink, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

export default function InfoPage() {
  const registry = [
    { id: 'alpha-001', mcu: 'ESP32-WROOM-32',   mac: '00:1B:44:11:3A:B7', protocol: 'MQTT/TLS',  firmware: 'v2.1.0', sensors: 'BME680, PMS5003',  status: 'stable'     },
    { id: 'beta-002',  mcu: 'ESP8266-12E',       mac: '00:1B:44:88:9C:F1', protocol: 'MQTT/TCP',  firmware: 'v2.0.4', sensors: 'DHT22, MH-Z19',    status: 'stable'     },
    { id: 'gamma-003', mcu: 'Nordic nRF9160',    mac: '00:1B:44:EE:22:98', protocol: 'CoAP/UDP',  firmware: 'v3.0.1', sensors: 'SCD30, SPS30',     status: 'beta'       },
    { id: 'delta-004', mcu: 'Raspberry Pi Zero', mac: 'B8:27:EB:4A:9C:3T', protocol: 'HTTP/REST', firmware: 'v1.9.9', sensors: 'Mock Aggregate',   status: 'deprecated' },
  ];

  const statusColor = (s: string) =>
    s === 'stable'     ? 'text-primary bg-primary/10 border-primary/20' :
    s === 'beta'       ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/20' :
    'text-muted-foreground bg-secondary border-border';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <HardDrive className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold text-foreground">System Matrix</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Field controller specifications and hardware registry</p>
          </div>
        </div>

        {/* Architecture + links */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Edge Compute Architecture</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              The AQMS platform uses a decentralized hardware topology. Field nodes handle data sampling and baseline calculations only.
              Complex AI validation, threshold checking, and data retention occur at the central API tier.
              Nodes maintain volatile RAM-based queues to handle short disconnections without data loss.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Network, label: 'Primary Transport', value: 'MQTT (Port 1883)', color: 'text-primary' },
                { icon: Shield,  label: 'Authentication',    value: 'JWT + TLS 1.3',   color: 'text-blue-500' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="bg-secondary/40 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
                  <Icon className={cn('w-4 h-4 shrink-0', color)} />
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-xl p-5">
            <h3 className="text-xs font-semibold text-foreground mb-4 pb-3 border-b border-border">Resources</h3>
            <ul className="space-y-3">
              {[
                { icon: Code,        label: 'Node.js Backend Repository'   },
                { icon: Terminal,    label: 'ESP32 C++ Firmware Source'    },
                { icon: FileDown,    label: 'Export Telemetry (.CSV)'      },
                { icon: ExternalLink,label: 'REST API Documentation'       },
              ].map(({ icon: Icon, label }) => (
                <li key={label}>
                  <a href="#" className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Registry table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Authorized Hardware Registry</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  {['Asset Tag', 'Microcontroller', 'MAC Address', 'Protocol', 'Firmware', 'Sensors', 'Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {registry.map(r => (
                  <tr key={r.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-semibold text-foreground">{r.id}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{r.mcu}</td>
                    <td className="px-5 py-3.5 font-mono text-muted-foreground text-[10px]">{r.mac}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">{r.protocol}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-muted-foreground">{r.firmware}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{r.sensors}</td>
                    <td className="px-5 py-3.5">
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize', statusColor(r.status))}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
