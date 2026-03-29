import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Minimize2, Maximize2, Trash2, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface DashboardContext {
  nodes: Record<string, any>;
  status: Record<string, any>;
  alerts: any[];
  thresholds: { aqi: number; pm25: number; co: number; co2: number };
}

export interface AIAction {
  type: 'SET_THRESHOLD';
  metric: 'aqi' | 'pm25' | 'co' | 'co2';
  value: number;
}

interface Props {
  context: DashboardContext;
  onAction?: (action: AIAction) => void;
}

// ── Gemini Config ─────────────────────────────────────────────────────────────
const DEFAULT_GEMINI_API_KEY = 'AIzaSyDYPpzPhJkDmRtqQq4rsqAUPNjGK_7Cp7M';

// ── Build system prompt from live dashboard data ──────────────────────────────
function buildSystemPrompt(ctx: DashboardContext): string {
  const outdoors = Object.entries(ctx.nodes).filter(([id]) => !id.startsWith('worker_'));
  const workers = Object.entries(ctx.nodes).filter(([id]) => id.startsWith('worker_'));

  const outdoorSummary = outdoors.map(([id, d]) =>
    `Tower ${id}: AQI=${d.aqi}, PM2.5=${d.pm2_5}µg/m³, CO=${d.co}ppm, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No towers online.';

  const workerSummary = workers.map(([id, d]) =>
    `Worker ${id.split('_').slice(2).join(' ')} (${id}): AQI Exposure=${d.aqi}, PM2.5=${d.pm2_5}µg/m³, CO=${d.co}ppm, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No workers tracked.';

  const alertsSummary = ctx.alerts.slice(0, 5).map(a =>
    `[${a.severity.toUpperCase()}] ${a.nodeId}: ${a.message}`
  ).join('\n') || 'No active alerts';

  return `You are AQMS-AI, a specialized AI assistant embedded inside an Air Quality Monitoring System (AQMS) SCADA dashboard. You have complete, real-time awareness of the system state, including outdoor towers and wearable worker trackers.

## CURRENT SYSTEM STATE
### Outdoor Towers
${outdoorSummary}

### Mining Personnel (Wearables)
${workerSummary}

### Current Alert Threshold Configuration
- AQI Critical Limit: ${ctx.thresholds.aqi}
- PM 2.5 Limit: ${ctx.thresholds.pm25} µg/m³
- CO Hazard Level: ${ctx.thresholds.co} ppm
- CO₂ Warning: ${ctx.thresholds.co2} ppm

### Active Alerts (latest 5)
${alertsSummary}

## YOUR CAPABILITIES
1. **Air Quality Analysis**: Analyze AQI, PM2.5, PM10, CO, CO2, temperature and humidity readings. Identify trends, anomalies, and health risks.
2. **Health Risk Assessment**: Advise on WHO guidelines, EPA standards, and NIOSH occupational limits for each pollutant.
3. **Threshold Management**: Users can ask you to change alert thresholds. When they do, respond with a clear confirmation AND include a special command block at the END of your message.
4. **Maintenance Advice**: Suggest maintenance based on node status and sensor readings.
5. **Compliance Reporting**: Summarize EPA/WHO compliance status.

## THRESHOLD CHANGE COMMANDS
If the user asks to change a threshold (e.g. "set AQI threshold to 120"), include this JSON at the very end of your response:
\`\`\`action
{"type":"SET_THRESHOLD","metric":"aqi","value":120}
\`\`\`
Metrics: "aqi", "pm25", "co", "co2"

## RESPONSE STYLE
- Be concise, data-driven, and professional
- Use real numbers from the live data above
- Flag any readings that exceed WHO/EPA standards
- Use ✅ ⚠️ 🚨 icons to indicate severity
- When data shows hazardous levels, be direct about risks`;
}

// ── Parse action command from AI response ─────────────────────────────────────
function parseAction(text: string): AIAction | null {
  const match = text.match(/```action\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as AIAction;
  } catch {
    return null;
  }
}

// Strip the action block from display text
function stripAction(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, '').trim();
}

// ── Offline / Fallback Intent Engine ─────────────────────────────────────────
function processOfflineIntent(input: string, ctx: DashboardContext): { text: string; action?: AIAction } {
  const lower = input.toLowerCase();
  
  // 1. Threshold changes
  const setMatch = lower.match(/(?:set|change|update).*?([a-z0-9_.]+)\s*(?:threshold|limit|to)?\s*(?:to|=)?\s*(\d+)/i);
  if (setMatch || lower.includes('set')) {
     const metricRaw = (setMatch?.[1] || lower).replace(/[^a-z0-9]/g, '');
     let metric: 'aqi' | 'pm25' | 'co' | 'co2' | null = null;
     if (metricRaw.includes('aqi')) metric = 'aqi';
     if (metricRaw.includes('pm2') || metricRaw.includes('pm')) metric = 'pm25';
     if (metricRaw.includes('co2')) metric = 'co2';
     else if (metricRaw.includes('co')) metric = 'co';
     
     const valMatch = lower.match(/\b(\d+)\b/);
     const value = valMatch ? parseInt(valMatch[1], 10) : null;
     
     if (metric && value !== null) {
        return {
          text: `*(Offline AI Mode)* \n\nI've updated the **${metric.toUpperCase()}** system threshold to **${value}** as requested.\n\n\`\`\`action\n{"type":"SET_THRESHOLD","metric":"${metric}","value":${value}}\n\`\`\``,
          action: { type: 'SET_THRESHOLD', metric, value }
        };
     }
  }

  // 2. Highest AQI / nodes query
  if (lower.includes('highest') || lower.includes('worst') || lower.includes('bad') || lower.includes('dangerous')) {
     let highestNode = '';
     let maxAqi = -1;
     const isWorkerQuery = lower.includes('worker') || lower.includes('person');
     
     for (const [id, data] of Object.entries(ctx.nodes)) {
        if (isWorkerQuery && !id.startsWith('worker_')) continue;
        if (!isWorkerQuery && id.startsWith('worker_')) continue; // Default to tower if not explicitly asking for worker
        
        if (data.aqi > maxAqi) { maxAqi = data.aqi; highestNode = id; }
     }
     if (highestNode) {
       const label = isWorkerQuery ? 'worker' : 'tower';
       const name = isWorkerQuery ? highestNode.split('_').slice(2).join(' ') : highestNode;
       return { text: `*(Offline AI Mode)* \n\nThe ${label} with the highest recorded AQI exposure is currently **${name}** with an AQI of **${maxAqi}**.` };
     }
  }
  
  if (lower.includes('how many') || lower.includes('status')) {
     const workers = Object.keys(ctx.nodes).filter(k => k.startsWith('worker_')).length;
     const towers = Object.keys(ctx.nodes).filter(k => !k.startsWith('worker_')).length;
     const online = Object.values(ctx.status).filter(s => s.status === 'online').length;
     return { text: `*(Offline AI Mode)* \n\nThere are currently **${towers} towers** and **${workers} wearable trackers** communicating with the system. A total of **${online}** devices are actively online generating telemetry.` };
  }

  // 3. Alerts
  if (lower.includes('alert') || lower.includes('warning')) {
     const critical = ctx.alerts.filter(a => a.severity === 'critical').length;
     return { text: `*(Offline AI Mode)* \n\nThe system currently has **${ctx.alerts.length}** total alerts logged, with **${critical}** marked as critical priority.` };
  }

  // 4. Analysis
  if (lower.includes('analyze') || lower.includes('safe') || lower.includes('air quality')) {
    const keys = Object.keys(ctx.nodes);
    const avgAqi = keys.length ? Object.values(ctx.nodes).reduce((s, n) => s + n.aqi, 0) / keys.length : 0;
    const isSafe = avgAqi <= ctx.thresholds.aqi;
    return { text: `*(Offline AI Mode)* \n\nThe fleet's average AQI is **${Math.round(avgAqi)}**. Based on your current warning threshold of ${ctx.thresholds.aqi}, the air quality is considered **${isSafe ? 'Safe / Moderate ✅' : 'Unhealthy 🚨'}**.` };
  }

  // Fallback
  return { text: `*(Offline AI Mode - API Demo Quota Exceeded)* \n\nI am currently operating as an offline rule-bot because the public AI key limits were reached. \n\nI am still wired into the dashboard! Try asking me to:\n- *"Set AQI threshold to 120"*\n- *"Which node has the highest AQI?"*\n- *"Analyze current air quality"*` };
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AIChatBot({ context, onAction }: Props) {
  const [open,     setOpen]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm **AQMS-AI**, your intelligent air quality analyst. I have real-time access to all your sensor data, alerts, and system configuration.\n\nHere's what I can help you with:\n- 📊 **Analyze** current AQI, PM2.5, CO readings for outdoor towers\n- 👷‍♀️ **Track exposure** for mining personnel wearing trackers\n- 🔧 **Adjust** alert thresholds (e.g. *"set AQI threshold to 120"*)\n- 🛠️ **Maintenance** suggestions based on device health\n\nWhat would you like to know?`,
      timestamp: new Date(),
    }
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aqms_gemini_key') || DEFAULT_GEMINI_API_KEY;
    }
    return DEFAULT_GEMINI_API_KEY;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const historyRef     = useRef<{ role: string; parts: { text: string }[] }[]>([]);

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    if (key === DEFAULT_GEMINI_API_KEY || !key) {
      localStorage.removeItem('aqms_gemini_key');
      setApiKey(DEFAULT_GEMINI_API_KEY);
    } else {
      localStorage.setItem('aqms_gemini_key', key);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build conversation history for Gemini
    historyRef.current.push({ role: 'user', parts: [{ text }] });

    try {
      const systemPrompt = buildSystemPrompt(context);

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: historyRef.current,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        // If Quota exceeded, trigger the smart local offline intent engine!
        if (res.status === 429 || err?.error?.code === 429 || err?.error?.message?.includes('Quota') || err?.error?.message?.includes('quota')) {
           const offline = processOfflineIntent(text, context);
           
           if (offline.action && onAction) {
             onAction(offline.action);
           }
           
           const displayText = stripAction(offline.text);
           historyRef.current.push({ role: 'model', parts: [{ text: offline.text }] });
           setMessages(prev => [...prev, {
             id: (Date.now() + 1).toString(),
             role: 'assistant',
             content: displayText,
             timestamp: new Date(),
           }]);
           setLoading(false);
           return;
        }
        throw new Error(err?.error?.message ?? `API error ${res.status}`);
      }

      const data = await res.json();
      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response received.';

      // Parse and execute any embedded action
      const action = parseAction(rawText);
      if (action && onAction) {
        onAction(action);
      }

      const displayText = stripAction(rawText);

      historyRef.current.push({ role: 'model', parts: [{ text: rawText }] });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: displayText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Error: ${err.message}. Please check your network connection.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    historyRef.current = [];
    setMessages([{
      id: 'welcome-refresh',
      role: 'assistant',
      content: 'Chat cleared. How can I help you analyze your AQMS data?',
      timestamp: new Date(),
    }]);
  };

  // Quick prompt chips
  const suggestions = [
    'Analyze current air quality',
    'Which node has the worst AQI?',
    'Is CO2 level safe?',
    'Set AQI threshold to 120',
    'Compliance status report',
  ];

  return (
    <>
      {/* ── Floating Button ────────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center group"
          title="Open AQMS AI Assistant"
        >
          <Bot className="w-6 h-6 text-primary-foreground" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-card" />
        </button>
      )}

      {/* ── Chat Window ────────────────────────────────────────────────────── */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-4",
          expanded ? "w-[680px] h-[80vh]" : "w-[420px] h-[580px]"
        )}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">AQMS AI</p>
                <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Online · Gemini 2.0 Flash
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSettings(!showSettings)} title="Settings" className={cn("p-1.5 rounded-lg hover:bg-secondary transition-colors", showSettings && "bg-secondary")}>
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={clearChat} title="Clear chat" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => setExpanded(e => !e)} title={expanded ? "Minimize" : "Expand"} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                {expanded ? <Minimize2 className="w-3.5 h-3.5 text-muted-foreground" /> : <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="px-4 py-3 bg-secondary/30 border-b border-border text-xs shrink-0">
              <label className="block text-muted-foreground mb-1.5 font-medium">Custom Gemini API Key</label>
              <input 
                type="password" 
                value={apiKey === DEFAULT_GEMINI_API_KEY ? '' : apiKey}
                onChange={e => handleSaveKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">Your key is stored locally in your browser and used to bypass public quota limits.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/10">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2.5", msg.role === 'user' && "flex-row-reverse")}>
                {/* Avatar */}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === 'assistant' ? "bg-primary" : "bg-secondary border border-border"
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-3 h-3 text-primary-foreground" />
                    : <span className="text-[9px] font-bold text-foreground">U</span>
                  }
                </div>

                {/* Bubble */}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed",
                  msg.role === 'assistant'
                    ? "bg-card border border-border text-foreground rounded-tl-sm"
                    : "bg-primary text-primary-foreground rounded-tr-sm"
                )}>
                  <FormattedText text={msg.content} isUser={msg.role === 'user'} />
                  <p className={cn(
                    "text-[9px] mt-1.5 tabular-nums",
                    msg.role === 'assistant' ? "text-muted-foreground" : "text-primary-foreground/60"
                  )}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-primary-foreground" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">Analyzing dashboard data...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion chips (only when 1 message) */}
          {messages.length === 1 && (
            <div className="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 border-t border-border bg-card">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="shrink-0 text-[10px] font-medium px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-card shrink-0">
            <div className="flex gap-2 items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about air quality, set thresholds..."
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5 text-center">
              Powered by Gemini 2.0 Flash · Context: {Object.keys(context.nodes).length} nodes, {context.alerts.length} alerts
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Simple markdown-like formatter ───────────────────────────────────────────
function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bold: **text**
        const formatted = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code class="font-mono bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[10px]">$1</code>');
        return (
          <p key={i}
            className={cn("leading-relaxed text-xs", isUser ? "" : "text-foreground")}
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      })}
    </div>
  );
}
