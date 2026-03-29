import { useState } from 'react';
import { MapPin, Power, Activity, Share2, Send, X, Loader2 } from 'lucide-react';
import LiveChart from './LiveChart';
import GaugeWidget from './GaugeWidget';
import { cn } from '../lib/utils';

interface NodeCardProps {
  data: any;
  status: any;
  history: any[];
}

export default function NodeCard({ data, status, history }: NodeCardProps) {
  const [relayActive, setRelayActive] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const isOffline = status?.status === 'offline';
  const lastSeen  = data.timestamp
    ? Math.floor((Date.now() - new Date(data.timestamp).getTime()) / 1000)
    : 0;

  const aqi = data.aqi ?? 0;

  const aqiMeta = aqi <= 50  ? { label: 'Good',      color: 'text-primary',    bg: 'bg-primary/10',    border: 'border-primary/20'    }
               :  aqi <= 100 ? { label: 'Moderate',   color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' }
               :  aqi <= 150 ? { label: 'Sensitive',  color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
               :               { label: 'Unhealthy',  color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      await fetch('http://localhost:5000/api/email/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: shareEmail.trim() || undefined,
          message: shareMessage,
          nodeData: { id: data.nodeId, aqi, status: status?.status }
        })
      });
      setShareSuccess(true);
      setTimeout(() => { setShowShare(false); setShareSuccess(false); setShareMessage(''); }, 2000);
    } catch (err) {
      console.error('Failed to share', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className={cn(
      "glass-card rounded-xl flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md",
      isOffline && "opacity-60"
    )}>

      {/* ── Card Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          {/* Live pulse indicator */}
          <div className="relative w-2 h-2">
            {!isOffline && (
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
            )}
            <span className={cn(
              "relative block w-2 h-2 rounded-full",
              isOffline ? 'bg-muted-foreground' : 'bg-primary'
            )} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground font-mono">{data.nodeId}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-2.5 h-2.5" />
              Zone A · {isOffline ? 'Offline' : `Updated ${lastSeen}s ago`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AQI Badge */}
          <div className={cn("status-badge", aqiMeta.bg, aqiMeta.border, aqiMeta.color)}>
            AQI {aqi} · {aqiMeta.label}
          </div>
          {/* Share Button */}
          <button 
            onClick={() => setShowShare(true)}
            title="Dispatch Email Report"
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-secondary border border-border text-muted-foreground hover:text-primary transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-4">

        {/* Primary metrics table */}
        <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
          {[
            { label: 'PM 2.5', value: data.pm2_5, unit: 'µg/m³' },
            { label: 'PM 10',  value: data.pm10,  unit: 'µg/m³' },
            { label: 'CO',     value: data.co,    unit: 'ppm'   },
            { label: 'CO₂',    value: data.co2,   unit: 'ppm'   },
          ].map(({ label, value, unit }) => (
            <div key={label} className="bg-card px-4 py-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">{label}</p>
              <p className="text-base font-semibold text-foreground tabular-nums font-mono">
                {value ?? '--'}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Environmental gauges */}
        <div className="flex justify-around py-2">
          <GaugeWidget
            value={data.temperature ?? 0} min={-10} max={50}
            label="Temperature" unit="°C"
            colorClass="stroke-orange-400" size={96}
          />
          <GaugeWidget
            value={data.humidity ?? 0} min={0} max={100}
            label="Humidity" unit="%"
            colorClass="stroke-blue-400" size={96}
          />
        </div>

        {/* Trend sparkline */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> AQI Trend
            </p>
            <span className="text-[10px] text-muted-foreground font-mono">2 min</span>
          </div>
          <LiveChart
            data={history}
            dataKey="aqi"
            color={aqi > 150 ? 'var(--color-destructive)' : 'var(--color-primary)'}
          />
        </div>

        {/* Relay control */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <div>
            <p className="text-xs font-medium text-foreground">Exhaust Fan</p>
            <p className={cn("text-[10px] mt-0.5", relayActive ? 'text-primary' : 'text-muted-foreground')}>
              {relayActive ? 'Running' : 'Standby'}
            </p>
          </div>
          <button
            onClick={() => setRelayActive(v => !v)}
            disabled={isOffline}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
              relayActive
                ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              isOffline && 'opacity-40 cursor-not-allowed'
            )}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Share Modal Overlay ── */}
      {showShare && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card w-full border border-border rounded-xl shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/50">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5"/> Share Node Telemetry</p>
              <button disabled={isSharing} onClick={() => setShowShare(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-4 space-y-3">
              {shareSuccess ? (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                    <Send className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Dispatched Successfully!</p>
                  <p className="text-[10px] text-muted-foreground mt-1">The report is on its way via NodeMailer.</p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Recipient Override</label>
                    <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                      placeholder="Leave blank to use Default Settings Config"
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground block mb-1.5">Custom Message</label>
                    <textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)}
                      placeholder="Add an optional memo for the responder..."
                      rows={2}
                      className="w-full resize-none bg-secondary border border-border rounded-lg px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <button 
                    onClick={handleShare} disabled={isSharing}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {isSharing ? 'Dispatching...' : 'Fire Dispatch Email'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
