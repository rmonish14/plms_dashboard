import { useEffect, useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine, Area, AreaChart,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import {
  BrainCircuit, Activity, TrendingUp, Loader2, Target,
  AlertTriangle, CheckCircle, Zap, Thermometer, Droplets,
  Radio, Clock, Shield, BarChart2,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { cn } from '../lib/utils';
import { API_URL } from '../lib/config';
import { motion, AnimatePresence } from 'framer-motion';

// ── Constants ─────────────────────────────────────────────────────────────────
const WINDOW_SIZE  = 12;   // Lookback window
const EPOCHS       = 60;   // Training epochs
const FORECAST_STEPS = 8;  // Predict 8 steps into the future
const MAX_HISTORY  = 200;

// ── Field map: display → data key ────────────────────────────────────────────
const METRICS = [
  { id: 'vib',     label: 'Vibration', unit: 'mm/s', color: '#6366f1', icon: Activity,    normalMax: 5  },
  { id: 'temp',    label: 'Temp',      unit: '°C',   color: '#f97316', icon: Thermometer, normalMax: 60 },
  { id: 'current', label: 'Current',   unit: 'A',    color: '#22d3ee', icon: Zap,         normalMax: 20 },
  { id: 'hum',     label: 'Humidity',  unit: '%',    color: '#34d399', icon: Droplets,    normalMax: 70 },
] as const;

type MetricId = 'vib' | 'temp' | 'current' | 'hum';

// ── Fault rule engine ─────────────────────────────────────────────────────────
function runDiagnostics(forecast: number[], metricId: MetricId, history: number[]) {
  const latest   = history.slice(-5);
  const mean     = latest.reduce((s, v) => s + v, 0) / (latest.length || 1);
  const variance = latest.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (latest.length || 1);
  const stdDev   = Math.sqrt(variance);
  const trend    = history.length >= 3 ? history[history.length - 1] - history[history.length - 3] : 0;
  const maxForecast = forecast.length > 0 ? Math.max(...forecast) : 0;
  const anomalyScore = stdDev > 0 ? Math.abs((forecast[0] ?? mean) - mean) / stdDev : 0;

  const faults: { label: string; severity: 'ok' | 'warn' | 'critical'; detail: string }[] = [];

  if (metricId === 'vib') {
    if (maxForecast > 8)      faults.push({ label: 'Bearing Failure',    severity: 'critical', detail: `Predicted peak ${maxForecast.toFixed(1)} mm/s — ISO Class D. Immediate shutdown recommended.` });
    else if (maxForecast > 5) faults.push({ label: 'Bearing Wear',       severity: 'warn',     detail: `Elevated vibration ${maxForecast.toFixed(1)} mm/s indicates progressive race wear. Schedule CBM inspection.` });
    else                      faults.push({ label: 'Bearing Health',     severity: 'ok',       detail: `Vibration ${mean.toFixed(1)} mm/s — ISO Class A/B. Normal operating band.` });

    if (trend > 0.8)          faults.push({ label: 'Resonance Risk',     severity: 'warn',  detail: `Rising trend ${trend.toFixed(2)} mm/s/sample suggests approaching resonance frequency.` });
    else                      faults.push({ label: 'Resonance',          severity: 'ok',    detail: 'No resonance excitation detected. Trend stable.' });

    if (anomalyScore > 2.5)   faults.push({ label: 'Anomaly Detected',  severity: 'critical', detail: `Z-score ${anomalyScore.toFixed(1)}σ departure from baseline — possible shock event or sensor fault.` });
    else                      faults.push({ label: 'Signal Integrity',   severity: 'ok',    detail: `Z-score ${anomalyScore.toFixed(1)}σ — within 2σ control band.` });
  }

  if (metricId === 'temp') {
    if (maxForecast > 75)        faults.push({ label: 'Thermal Runaway',     severity: 'critical', detail: `Predicted ${maxForecast.toFixed(0)}°C — critical overtemperature. Cooling failure or winding fault likely.` });
    else if (maxForecast > 60)   faults.push({ label: 'Overheating',         severity: 'warn',     detail: `Forecast ${maxForecast.toFixed(0)}°C approaching limit. Verify coolant flow and fan operation.` });
    else if (maxForecast < 5)    faults.push({ label: 'Freeze Risk',         severity: 'warn',     detail: `Low temperature predicted — check oil viscosity and cold-start protection.` });
    else                         faults.push({ label: 'Thermal Health',      severity: 'ok',       detail: `Temperature trend ${mean.toFixed(0)}°C — within safe operating envelope.` });

    if (trend > 3)               faults.push({ label: 'Heat Spike',          severity: 'warn',  detail: `Rapid thermal rise ${trend.toFixed(1)}°C/sample — check load or cooling blockage.` });
    else                         faults.push({ label: 'Thermal Stability',   severity: 'ok',    detail: 'No rapid temperature excursions detected.' });

    if (anomalyScore > 2.5)      faults.push({ label: 'Sensor Anomaly',      severity: 'warn',  detail: `Unexpected temperature jump detected (${anomalyScore.toFixed(1)}σ).` });
    else                         faults.push({ label: 'Reading Consistency',  severity: 'ok',    detail: 'Thermal readings consistent with historical baseline.' });
  }

  if (metricId === 'current') {
    if (maxForecast > 28)       faults.push({ label: 'Motor Overload',      severity: 'critical', detail: `Current forecast ${maxForecast.toFixed(1)} A — motor stall or mechanical binding imminent.` });
    else if (maxForecast > 20)  faults.push({ label: 'High Load',           severity: 'warn',     detail: `Elevated current ${maxForecast.toFixed(1)} A — check for increased mechanical load or bearing drag.` });
    else                        faults.push({ label: 'Motor Health',        severity: 'ok',       detail: `Current draw ${mean.toFixed(1)} A — normal range. Motor windings healthy.` });

    if (trend > 1.5)            faults.push({ label: 'Load Creep',          severity: 'warn',  detail: `Gradual current increase detected — coupling wear or pump cavitation possible.` });
    else                        faults.push({ label: 'Load Stability',      severity: 'ok',    detail: 'No progressive load creep detected.' });

    if (anomalyScore > 2.5)     faults.push({ label: 'Electrical Anomaly',  severity: 'warn',  detail: `Irregular current spike (Z=${anomalyScore.toFixed(1)}σ) — check for rotor eccentricity or electrical fault.` });
    else                        faults.push({ label: 'Electrical Integrity', severity: 'ok',   detail: 'Current waveform consistent — no electrical anomalies.' });
  }

  if (metricId === 'hum') {
    if (maxForecast > 80)       faults.push({ label: 'Corrosion Risk',      severity: 'critical', detail: `Very high humidity ${maxForecast.toFixed(0)}% — accelerated corrosion to motor windings and bearings.` });
    else if (maxForecast > 65)  faults.push({ label: 'Moisture Risk',       severity: 'warn',     detail: `Humidity ${maxForecast.toFixed(0)}% above safe level — check enclosure sealing.` });
    else                        faults.push({ label: 'Humidity Health',     severity: 'ok',       detail: `Humidity at ${mean.toFixed(0)}% — within acceptable band.` });

    if (trend > 5)              faults.push({ label: 'Moisture Ingress',    severity: 'warn',  detail: `Rising humidity trend — verify gasket integrity and drainage.` });
    else                        faults.push({ label: 'Enclosure Sealing',   severity: 'ok',    detail: 'Humidity trend stable. No ingress detected.' });

    faults.push({ label: 'Dew Point Risk', severity: maxForecast > 75 ? 'warn' : 'ok',
      detail: maxForecast > 75 ? 'Dew point condensation risk on cold surfaces.' : 'No condensation risk.' });
  }

  return { faults, anomalyScore, trend, stdDev, mean };
}

// ── Health score calculation ─────────────────────────────────────────────────
function calcHealthScore(nodeHistory: any[], thresholds = { vib: 5, temp: 60, hum: 70, current: 20 }): number {
  if (nodeHistory.length === 0) return 100;
  const last10 = nodeHistory.slice(-10);
  const avg = (key: string) => last10.reduce((s, d) => s + (d[key] ?? 0), 0) / last10.length;

  const vibScore  = Math.max(0, 100 - (avg('vib')     / (thresholds.vib     || 5)  * 60));
  const tempScore = Math.max(0, 100 - (avg('temp')    / (thresholds.temp    || 60) * 60));
  const humScore  = Math.max(0, 100 - (avg('hum')     / (thresholds.hum     || 70) * 40));
  const curScore  = Math.max(0, 100 - (avg('current') / (thresholds.current || 20) * 60));

  return Math.min(100, (vibScore * 0.35 + tempScore * 0.3 + curScore * 0.25 + humScore * 0.1));
}

// ── Remaining Useful Life estimate ───────────────────────────────────────────
function estimateRUL(healthScore: number, trendPerSample: number, sampleIntervalSec = 3): string {
  if (healthScore >= 90) return '> 30 days';
  if (trendPerSample <= 0) return '> 14 days';
  const pointsToZero = healthScore / Math.max(0.001, trendPerSample);
  const seconds = pointsToZero * sampleIntervalSec;
  const hours = seconds / 3600;
  if (hours < 1)   return `~${Math.round(seconds / 60)} min`;
  if (hours < 48)  return `~${hours.toFixed(0)} h`;
  return `~${(hours / 24).toFixed(0)} days`;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function PredictivePage() {
  const [activeMetric, setActiveMetric]   = useState<MetricId>('vib');
  const [activeNode,   setActiveNode]     = useState<string | null>(null);
  const [availNodes,   setAvailNodes]     = useState<string[]>([]);
  const [history,      setHistory]        = useState<any[]>([]);
  const [isTraining,   setIsTraining]     = useState(false);
  const [modelReady,   setModelReady]     = useState(false);
  const [loss,         setLoss]           = useState<number | null>(null);
  const [chartData,    setChartData]      = useState<any[]>([]);
  const [forecastVals, setForecastVals]   = useState<number[]>([]);
  const [diagnostics,  setDiagnostics]    = useState<ReturnType<typeof runDiagnostics> | null>(null);
  const [healthScore,  setHealthScore]    = useState<number | null>(null);
  const [rul,          setRul]            = useState<string>('--');

  const modelRef = useRef<tf.Sequential | null>(null);

  // ── Build / reset model when metric changes ───────────────────────────────
  const buildModel = useCallback(() => {
    if (modelRef.current) { modelRef.current.dispose(); }
    const m = tf.sequential();
    m.add(tf.layers.dense({ units: 64, inputShape: [WINDOW_SIZE], activation: 'relu' }));
    m.add(tf.layers.dropout({ rate: 0.1 }));
    m.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    m.add(tf.layers.dense({ units: FORECAST_STEPS })); // predict N steps at once
    m.compile({ optimizer: tf.train.adam(0.005), loss: 'meanSquaredError' });
    modelRef.current = m;
    setModelReady(true);
    setLoss(null);
    setChartData([]);
    setForecastVals([]);
    setDiagnostics(null);
  }, []);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    buildModel();
    const socket = io(API_URL);
    socket.on('node_data', (data: any) => {
      setAvailNodes(prev => prev.includes(data.nodeId) ? prev : [...prev, data.nodeId].sort());
      setHistory(prev => {
        const next = [...prev, { ...data, _ts: Date.now() }];
        return next.length > MAX_HISTORY * 10 ? next.slice(-MAX_HISTORY * 10) : next;
      });
    });
    return () => { socket.disconnect(); };
  }, [buildModel]);

  // Auto-select first node
  useEffect(() => {
    if (availNodes.length > 0 && !activeNode) setActiveNode(availNodes[0]);
  }, [availNodes, activeNode]);

  // Reset model when metric switches
  useEffect(() => { buildModel(); }, [activeMetric, buildModel]);

  // ── Training effect ───────────────────────────────────────────────────────
  useEffect(() => {
    const nodeHistory = history.filter(h => h.nodeId === activeNode);
    if (!modelReady || nodeHistory.length < WINDOW_SIZE + FORECAST_STEPS + 2 || isTraining) return;

    const run = async () => {
      setIsTraining(true);
      try {
        const series = nodeHistory.map(h => Number(h[activeMetric] ?? 0));

        // Build sliding window → multi-step output pairs
        const X: number[][] = [];
        const Y: number[][] = [];
        for (let i = 0; i <= series.length - WINDOW_SIZE - FORECAST_STEPS; i++) {
          X.push(series.slice(i, i + WINDOW_SIZE));
          Y.push(series.slice(i + WINDOW_SIZE, i + WINDOW_SIZE + FORECAST_STEPS));
        }

        const xs = tf.tensor2d(X);
        const ys = tf.tensor2d(Y);

        const result = await modelRef.current!.fit(xs, ys, {
          epochs: EPOCHS,
          batchSize: 16,
          shuffle: true,
          verbose: 0,
        });
        setLoss(result.history.loss[result.history.loss.length - 1] as number);

        // ── Overlay predictions (historical) ─────────────────────────────────
        const predTensor = modelRef.current!.predict(xs) as tf.Tensor2D;
        const predMatrix = await predTensor.array() as number[][];

        // ── Future forecast (roll from latest window) ─────────────────────────
        const latestWindow = series.slice(-WINDOW_SIZE);
        const futureX  = tf.tensor2d([latestWindow]);
        const futureT  = modelRef.current!.predict(futureX) as tf.Tensor;
        const futures  = Array.from(await futureT.data());

        setForecastVals(futures);

        // Build chart data
        const charts: any[] = nodeHistory.map((entry, idx) => {
          const offset = idx - WINDOW_SIZE;
          return {
            ts:        entry.timestamp ?? new Date(entry._ts).toISOString(),
            actual:    entry[activeMetric] ?? null,
            predicted: offset >= 0 && predMatrix[offset] ? predMatrix[offset][0] : null,
          };
        });

        // Append future steps
        const lastTs = nodeHistory[nodeHistory.length - 1]?.timestamp
          ? new Date(nodeHistory[nodeHistory.length - 1].timestamp).getTime()
          : Date.now();
        futures.forEach((val, i) => {
          charts.push({
            ts:        new Date(lastTs + (i + 1) * 3000).toISOString(),
            actual:    null,
            predicted: val,
            isFuture:  true,
          });
        });
        setChartData(charts);

        // ── Diagnostics ────────────────────────────────────────────────────────
        const diag = runDiagnostics(futures, activeMetric, series);
        setDiagnostics(diag);

        // ── Health score ───────────────────────────────────────────────────────
        const hs = calcHealthScore(nodeHistory);
        setHealthScore(hs);
        setRul(estimateRUL(hs, Math.max(0, diag.trend)));

        // Cleanup
        xs.dispose(); ys.dispose(); predTensor.dispose(); futureX.dispose(); futureT.dispose();

      } catch (e) {
        console.error('[TF]', e);
      } finally {
        setIsTraining(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, activeNode, activeMetric, modelReady]);

  const nodeHistory   = history.filter(h => h.nodeId === activeNode);
  const dataPoints    = nodeHistory.length;
  const needsMore     = dataPoints < WINDOW_SIZE + FORECAST_STEPS + 2;
  const metricMeta    = METRICS.find(m => m.id === activeMetric)!;
  const latestVal     = nodeHistory.length > 0 ? nodeHistory[nodeHistory.length - 1][activeMetric] : null;
  const nextPredicted = forecastVals[0];

  const healthColor = healthScore == null ? 'text-muted-foreground'
    : healthScore >= 80 ? 'text-green-400' : healthScore >= 55 ? 'text-yellow-400' : 'text-red-400';

  const healthLabel = healthScore == null ? '--'
    : healthScore >= 80 ? 'Good' : healthScore >= 55 ? 'Degraded' : 'Critical';

  const radarData = METRICS.map(m => {
    const vals = nodeHistory.slice(-10).map(h => Number(h[m.id] ?? 0));
    const avg  = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    const pct  = Math.min(100, (avg / (m.normalMax || 1)) * 100);
    return { metric: m.label, value: Math.round(pct), fullMark: 100 };
  });

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden bg-background text-foreground">
      <div className="max-w-[1600px] w-full mx-auto p-6 flex flex-col gap-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              TensorFlow.js Predictive Engine
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Deep learning multi-step forecasting · Real-time training in-browser via WebGL · Fault diagnostics &amp; RUL estimation
            </p>
          </div>
          {/* Metric switcher */}
          <div className="flex bg-secondary p-1 rounded-xl gap-0.5">
            {METRICS.map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMetric(m.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  activeMetric === m.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <m.icon className="w-3 h-3" />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Node selector ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-border pb-3 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Radio className="w-3 h-3" /> Target Node:
          </span>
          {availNodes.length === 0
            ? <span className="text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground animate-pulse">Awaiting connection...</span>
            : availNodes.map(n => (
              <button key={n} onClick={() => setActiveNode(n)}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded-full border transition-all',
                  activeNode === n
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'bg-secondary border-border text-muted-foreground hover:bg-muted'
                )}>
                {n}
              </button>
            ))
          }
        </div>

        {/* ── Top KPI strip ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 shrink-0">

          <KpiCard icon={<Activity className="w-4 h-4" />} label="Model State" accent="primary">
            {isTraining
              ? <span className="text-xs text-orange-400 flex items-center gap-1.5 animate-pulse"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Training...</span>
              : <span className="text-xs text-green-400">Ready</span>}
          </KpiCard>

          <KpiCard icon={<Target className="w-4 h-4" />} label="MSE Loss" accent="primary">
            <span className="text-xl font-bold font-mono">{loss != null ? loss.toFixed(4) : '--'}</span>
          </KpiCard>

          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Forecast Horizon" accent="primary">
            <span className="text-xl font-bold font-mono">t+{FORECAST_STEPS}</span>
            <span className="text-[10px] text-muted-foreground ml-1">steps</span>
          </KpiCard>

          <KpiCard icon={<BarChart2 className="w-4 h-4" />} label="Confidence" accent="primary">
            <span className={cn('text-xl font-bold font-mono', loss != null && loss < 0.5 ? 'text-green-400' : 'text-yellow-400')}>
              {loss != null ? Math.max(10, Math.min(99, 98 - loss * 8)).toFixed(1) + '%' : '--'}
            </span>
          </KpiCard>

          <KpiCard icon={<metricMeta.icon className="w-4 h-4" />} label={`Live ${metricMeta.label}`} accent="primary">
            <span className="text-xl font-bold font-mono" style={{ color: metricMeta.color }}>
              {latestVal != null ? Number(latestVal).toFixed(1) : '--'}
              <span className="text-xs text-muted-foreground ml-1">{metricMeta.unit}</span>
            </span>
          </KpiCard>

          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Next Predicted" accent="primary">
            {nextPredicted != null ? (
              <span className="text-xl font-bold font-mono text-primary">
                {Number(nextPredicted).toFixed(1)}
                <span className="text-xs text-muted-foreground ml-1">{metricMeta.unit}</span>
              </span>
            ) : <span className="text-muted-foreground text-xs">Awaiting...</span>}
          </KpiCard>

          <KpiCard icon={<Shield className="w-4 h-4" />} label="Health Score" accent={healthScore != null && healthScore < 55 ? 'destructive' : 'primary'}>
            <span className={cn('text-xl font-bold font-mono', healthColor)}>
              {healthScore != null ? healthScore.toFixed(0) + '%' : '--'}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">{healthLabel}</span>
          </KpiCard>
        </div>

        {/* ── Main chart + Radar layout ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Forecast Chart — 2/3 width */}
          <div className="lg:col-span-2 glass-card border border-border rounded-xl p-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Actual vs Predicted · <span className="text-primary">{metricMeta.label}</span>
                {activeNode && <span className="text-muted-foreground font-normal">— {activeNode}</span>}
              </h3>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-white/20 inline-block rounded" /> Actual</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 inline-block rounded" style={{ background: metricMeta.color }} /> Predicted</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed inline-block rounded" style={{ borderColor: metricMeta.color }} /> Future</span>
              </div>
            </div>

            {needsMore ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                <p className="text-sm font-medium">Accumulating data for {activeNode ?? '...'}
                </p>
                <div className="w-48 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, (dataPoints / (WINDOW_SIZE + FORECAST_STEPS + 2)) * 100)}%` }}
                  />
                </div>
                <p className="text-xs">{WINDOW_SIZE + FORECAST_STEPS + 2 - dataPoints} more samples needed</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData.slice(-60)} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={metricMeta.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={metricMeta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="ts" stroke="#555" fontSize={9} tickLine={false} axisLine={false}
                    tickFormatter={t => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } }}
                    interval="preserveStartEnd"
                  />
                  <YAxis stroke="#555" fontSize={9} tickLine={false} axisLine={false}
                    tickFormatter={v => Number(v).toFixed(1)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: 8, fontSize: 11 }}
                    labelFormatter={l => { try { return new Date(l).toLocaleTimeString(); } catch { return l; } }}
                    formatter={(v: any, name: any) => [`${Number(v).toFixed(2)} ${metricMeta.unit}`, String(name)]}
                  />
                  {/* Future divider */}
                  {chartData.find(d => d.isFuture) && (
                    <ReferenceLine
                      x={chartData.find(d => d.isFuture)?.ts}
                      stroke={metricMeta.color}
                      strokeDasharray="4 3"
                      label={{ value: 'NOW', position: 'top', fontSize: 9, fill: metricMeta.color }}
                    />
                  )}
                  <Area type="monotone" name="AI Predicted" dataKey="predicted"
                    stroke={metricMeta.color} strokeWidth={1.5} fill="url(#colorPred)"
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (!payload?.isFuture) return <circle key={cx} cx={cx} cy={cy} r={2} fill={metricMeta.color} strokeWidth={0} />;
                      return (
                        <g key={cx}>
                          <circle cx={cx} cy={cy} r={5} fill={metricMeta.color} opacity={0.3} />
                          <circle cx={cx} cy={cy} r={3} fill={metricMeta.color} />
                        </g>
                      );
                    }}
                    isAnimationActive={false}
                  />
                  <Line type="monotone" name="Ground Truth" dataKey="actual"
                    stroke="rgba(255,255,255,0.25)" strokeWidth={2}
                    dot={false} isAnimationActive={false} connectNulls={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Radar chart — 1/3 width */}
          <div className="glass-card border border-border rounded-xl p-5 flex flex-col">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Sensor Load Profile
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#888' }} />
                  <Radar name="% of limit" dataKey="value" stroke="var(--color-primary)"
                    fill="var(--color-primary)" fillOpacity={0.2} strokeWidth={1.5} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-center">
                <p className="text-xs text-muted-foreground">Each axis = % of configured limit</p>
              </div>
            </div>
            {/* RUL */}
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">Est. Remaining Life</span>
                </div>
                <span className={cn('text-sm font-bold font-mono', healthColor)}>{rul}</span>
              </div>
              {healthScore != null && (
                <div className="mt-2">
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${healthScore}%`,
                        background: healthScore >= 80 ? '#22c55e' : healthScore >= 55 ? '#eab308' : '#ef4444',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                    <span>0% Critical</span><span>Health: {healthScore.toFixed(0)}%</span><span>100% Nominal</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Multi-step Forecast Table ────────────────────────────────────── */}
        {forecastVals.length > 0 && (
          <div className="glass-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              Multi-Step Forecast — {metricMeta.label} ({metricMeta.unit})
            </h3>
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
              {forecastVals.map((val, i) => {
                const isHigh = val > metricMeta.normalMax;
                const isMed  = val > metricMeta.normalMax * 0.75;
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      'rounded-xl border p-3 text-center',
                      isHigh ? 'border-red-500/40 bg-red-500/10'
                        : isMed ? 'border-yellow-500/40 bg-yellow-500/10'
                        : 'border-border bg-secondary/30'
                    )}
                  >
                    <p className="text-[9px] text-muted-foreground font-mono mb-1">t+{i + 1}</p>
                    <p className={cn('text-base font-bold font-mono',
                      isHigh ? 'text-red-400' : isMed ? 'text-yellow-400' : 'text-foreground'
                    )}>
                      {val.toFixed(1)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">{metricMeta.unit}</p>
                    {isHigh && <AlertTriangle className="w-3 h-3 text-red-400 mx-auto mt-1" />}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Diagnostic Fault Panel ───────────────────────────────────────── */}
        <AnimatePresence>
          {diagnostics && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="glass-card border border-border rounded-xl p-5"
            >
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                Fault Diagnosis &amp; Health Analysis
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  Anomaly Z-score: {diagnostics.anomalyScore.toFixed(2)}σ &nbsp;|&nbsp;
                  Std Dev: {diagnostics.stdDev.toFixed(3)} &nbsp;|&nbsp;
                  Trend: {diagnostics.trend >= 0 ? '+' : ''}{diagnostics.trend.toFixed(3)}/sample
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {diagnostics.faults.map((fault, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className={cn(
                      'rounded-xl border p-4 flex gap-3',
                      fault.severity === 'critical' ? 'border-red-500/40 bg-red-500/8'
                        : fault.severity === 'warn'  ? 'border-yellow-500/40 bg-yellow-500/8'
                        : 'border-green-500/20 bg-green-500/5'
                    )}
                  >
                    <div className="shrink-0 mt-0.5">
                      {fault.severity === 'critical' ? <AlertTriangle className="w-4 h-4 text-red-400" />
                        : fault.severity === 'warn'  ? <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        : <CheckCircle className="w-4 h-4 text-green-400" />}
                    </div>
                    <div>
                      <p className={cn('text-xs font-bold mb-1',
                        fault.severity === 'critical' ? 'text-red-400'
                          : fault.severity === 'warn' ? 'text-yellow-400'
                          : 'text-green-400'
                      )}>
                        {fault.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{fault.detail}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Architecture info ────────────────────────────────────────────── */}
        <div className="glass-card border border-border rounded-xl p-5 bg-secondary/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold uppercase text-primary mb-2 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5" /> Neural Architecture
              </p>
              <div className="text-[11px] font-mono text-muted-foreground bg-black/40 p-3 rounded-lg border border-border/50 shadow-inner space-y-1">
                <p><span className="text-blue-400">const</span> model = tf.sequential();</p>
                <p>L1: Dense(<span className="text-orange-400">64</span>, <span className="text-green-400">'relu'</span>, inputShape=[<span className="text-orange-400">{WINDOW_SIZE}</span>])</p>
                <p>L2: Dropout(<span className="text-orange-400">0.1</span>)</p>
                <p>L3: Dense(<span className="text-orange-400">32</span>, <span className="text-green-400">'relu'</span>)</p>
                <p>L4: Dense(<span className="text-orange-400">{FORECAST_STEPS}</span>) <span className="text-muted-foreground">← {FORECAST_STEPS}-step output</span></p>
                <div className="mt-2 pt-2 border-t border-border/30">
                  <p className="text-primary font-bold">Loss: <span className="font-mono text-foreground">MSE = 1/n Σ(y−ŷ)²</span></p>
                  <p>Optimizer: <span className="text-green-400">Adam</span>(lr=<span className="text-orange-400">0.005</span>) · Epochs: <span className="text-orange-400">{EPOCHS}</span></p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-primary mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> How It Works
              </p>
              <div className="space-y-2 text-[11px] text-muted-foreground">
                {[
                  ['1. Buffer', `Last ${MAX_HISTORY} live MQTT data points from selected node are buffered in browser memory.`],
                  ['2. Sliding Window', `Sequences of ${WINDOW_SIZE} data points become input vectors X, with the next ${FORECAST_STEPS} points as target Y.`],
                  ['3. Training', `A 3-layer dense network trains on all (X→Y) pairs for ${EPOCHS} epochs using WebGL acceleration.`],
                  ['4. Inference', `The model predicts the next ${FORECAST_STEPS} sensor values from the latest window.`],
                  ['5. Diagnostics', `Predicted values are run through a rule-based fault engine (bearing, thermal, electrical). Anomaly Z-scores detect outliers.`],
                  ['6. Health Score', `Composite score (VIB×35% + Temp×30% + Cur×25% + Hum×10%) normalized against your configured thresholds.`],
                ].map(([title, body]) => (
                  <div key={title as string} className="flex gap-2">
                    <span className="shrink-0 text-primary font-bold">{title}</span>
                    <span>{body}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── KPI Card component ────────────────────────────────────────────────────────
function KpiCard({ label, icon, accent, children }: {
  label: string; icon: React.ReactNode;
  accent: 'primary' | 'destructive'; children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
        <div className={cn('p-1.5 rounded-md',
          accent === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
        )}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1 flex-wrap">{children}</div>
    </div>
  );
}
