import { useState } from 'react';
import GoogleMapReact from 'google-map-react';
import { MapPin, AlertTriangle, Map } from 'lucide-react';
import { cn } from '../lib/utils';

const DEFAULT_CENTER = { lat: 39.5393, lng: -119.4397 }; // Example: Industrial Park region
const DEFAULT_ZOOM = 15;

const NODES = [
  { id: 'alpha-001', lat: 39.5401, lng: -119.4447, status: 'online', aqi: 45, zone: 'Assembly A' },
  { id: 'beta-002', lat: 39.5385, lng: -119.4365, status: 'online', aqi: 62, zone: 'Logistics Hub' },
  { id: 'gamma-003', lat: 39.5420, lng: -119.4380, status: 'warning', aqi: 155, zone: 'Chemical Storage' },
  { id: 'delta-004', lat: 39.5370, lng: -119.4420, status: 'offline', aqi: 0, zone: 'Exterior Vent' },
];

const aqiLabel = (v: number) =>
  v <= 50 ? 'Good' : v <= 100 ? 'Moderate' : v <= 150 ? 'Sensitive' : v <= 200 ? 'Unhealthy' : 'Hazardous';

// Deep dark corporate UI map style removed as requested for standard visibility

const MapMarker = ({ node, activeId, onClick, lat, lng }: any) => {
  const dotColor = (s: string) => s === 'online' ? 'bg-primary' : s === 'offline' ? 'bg-muted-foreground' : 'bg-destructive';

  return (
    <button
      onClick={() => onClick(node)}
      className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10 w-6 h-6 flex items-center justify-center"
    >
      {/* Ping ring */}
      {node.status !== 'offline' && (
        <span className={cn(
          'absolute inset-0 rounded-full opacity-60 animate-ping',
          node.status === 'warning' ? 'bg-destructive' : 'bg-primary'
        )} />
      )}
      {/* Dot */}
      <span className={cn(
        'relative flex w-3 h-3 rounded-full border-2 border-card shadow-md transition-transform group-hover:scale-125',
        dotColor(node.status),
        activeId === node.id && 'ring-2 ring-offset-1 ring-primary ring-offset-background'
      )} />
      {/* Tooltip */}
      <span className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[9px] font-mono font-medium px-2 py-1 rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {node.id}
      </span>
    </button>
  );
};

export default function MapPage() {
  const [active, setActive] = useState(NODES[0]);

  const dotColor = (s: string) =>
    s === 'online' ? 'bg-primary' : s === 'offline' ? 'bg-muted-foreground' : 'bg-destructive';

  const aqiColor = (v: number) =>
    v <= 50 ? 'text-primary' : v <= 100 ? 'text-yellow-600 dark:text-yellow-400' :
      v <= 150 ? 'text-orange-500' : 'text-destructive';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 pb-2 border-b border-border">
          <Map className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold text-foreground">Live Topology</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Geospatial satellite positioning and sensor tracking</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ minHeight: 600 }}>

          {/* Map Container */}
          <div className="lg:col-span-2 rounded-xl relative overflow-hidden border border-border shadow-sm bg-black/20" style={{ height: '600px', width: '100%' }}>

            <GoogleMapReact
              bootstrapURLKeys={{ key: 'AIzaSyBBHfnFcwAl1JiDbog7u0Eu1cQd0omobjg' }} // user provided key
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
            >
              {NODES.map(node => (
                <MapMarker
                  key={node.id}
                  lat={node.lat}
                  lng={node.lng}
                  node={node}
                  activeId={active.id}
                  onClick={setActive}
                />
              ))}
            </GoogleMapReact>

            {/* Float HUD */}
            <div className="absolute top-5 left-5 pointer-events-none z-10">
              <div className="bg-background/80 backdrop-blur-md border border-border px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-foreground tracking-wider uppercase">SAT-LINK ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Inspector */}
          <div className="flex flex-col gap-4">
            <div className="glass-card rounded-xl flex-1 p-5 overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                <div className={cn('w-2 h-2 rounded-full shrink-0', dotColor(active.status))} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground font-mono truncate">{active.id}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{active.zone}</p>
                </div>
                <span className={cn(
                  'ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize shrink-0',
                  active.status === 'online' ? 'bg-primary/10 text-primary border-primary/20' :
                    active.status === 'warning' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                      'bg-secondary text-muted-foreground border-border'
                )}>
                  {active.status}
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Current AQI</p>
                  <p className={cn('text-4xl font-semibold tabular-nums', active.status === 'offline' ? 'text-muted-foreground' : aqiColor(active.aqi))}>
                    {active.status === 'offline' ? '—' : active.aqi}
                  </p>
                  {active.status !== 'offline' && (
                    <p className="text-xs text-muted-foreground mt-1">{aqiLabel(active.aqi)}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
                  <div className="bg-card px-3 py-2.5">
                    <p className="text-[9px] text-muted-foreground font-medium mb-1">GPS Coodinates</p>
                    <p className="text-[10px] font-mono text-foreground leading-tight">
                      Lat: {active.lat.toFixed(4)}<br />Lng: {active.lng.toFixed(4)}
                    </p>
                  </div>
                  <div className="bg-card px-3 py-2.5">
                    <p className="text-[9px] text-muted-foreground font-medium mb-1">Zone Assignment</p>
                    <p className="text-[11px] font-medium text-foreground">{active.zone}</p>
                  </div>
                </div>

                {active.status === 'warning' && (
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                    <AlertTriangle className="w-3.5 h-3.5" /> Trigger Evacuation Alert
                  </button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="glass-card rounded-xl p-4">
              <p className="text-[10px] font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Map Legend</p>
              <ul className="space-y-2">
                {[
                  { dot: 'bg-primary', label: 'Tower Online — nominal' },
                  { dot: 'bg-destructive', label: 'Warning / Critical alert' },
                  { dot: 'bg-muted-foreground', label: 'Offline / Disconnected' },
                ].map(({ dot, label }) => (
                  <li key={label} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="relative flex w-3 h-3 rounded-full border border-card items-center justify-center flex-shrink-0">
                      <span className={cn('absolute inset-0 rounded-full', dot)} />
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
