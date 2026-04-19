import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Minimize2, Maximize2, Trash2, Settings, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
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
  thresholds: { vib: number; temp: number; hum: number; current: number };
}

export interface AIAction {
  type: 'SET_THRESHOLD';
  metric: 'vib' | 'temp' | 'hum' | 'current';
  value: number;
}

interface Props {
  context: DashboardContext;
  onAction?: (action: AIAction) => void;
}

// ── OpenRouter API Config ─────────────────────────────────────────────────────
const DEFAULT_API_KEY = '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';
const AI_MODEL       = 'meta-llama/llama-3.3-70b-instruct:free';
const AI_MODEL_LABEL = 'Llama 3.3 70B';

// ── Build system prompt from live dashboard data ──────────────────────────────
function buildSystemPrompt(ctx: DashboardContext): string {
  const outdoors = Object.entries(ctx.nodes).filter(([id]) => !id.startsWith('worker_'));
  const workers  = Object.entries(ctx.nodes).filter(([id]) => id.startsWith('worker_'));

  const outdoorSummary = outdoors.map(([id, d]) =>
    `• Machine ${id}: VIB=${d.vib ?? '--'}mm/s, Current=${d.current ?? '--'}A, Temp=${d.temp ?? '--'}°C, Hum=${d.hum ?? '--'}%, Relay=${d.relay ?? 'UNKNOWN'}, Mode=${d.mode ?? 'UNKNOWN'}, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No machines currently online.';

  const workerSummary = workers.map(([id, d]) =>
    `• Spare ${id}: VIB=${d.vib ?? '--'}mm/s, Temp=${d.temp ?? '--'}°C, Status=${ctx.status[id]?.status ?? 'unknown'}`
  ).join('\n') || 'No spares tracked.';

  const alertsSummary = ctx.alerts.slice(0, 5).map(a =>
    `[${a.severity.toUpperCase()}] ${a.nodeId}: ${a.message}`
  ).join('\n') || 'No active alerts.';

  const onlineCount  = Object.values(ctx.status).filter(s => s.status !== 'offline').length;
  const offlineCount = Object.values(ctx.status).filter(s => s.status === 'offline').length;
  const critAlerts   = ctx.alerts.filter(a => a.severity === 'critical').length;

  return `You are PLMS-AI, a specialized AI assistant embedded inside a Predictive Life Monitoring System (PLMS) industrial IoT dashboard. You have real-time awareness of the machine park state and can answer any question about the dashboard, sensors, nodes, thresholds, controls, and system architecture.

## LIVE SYSTEM STATE (updated every 3 seconds)
- Online nodes: ${onlineCount} | Offline nodes: ${offlineCount}
- Total critical alerts: ${critAlerts}

### Deployed Machines (Outdoor Nodes)
${outdoorSummary}

### Spares / Worker Nodes
${workerSummary}

### Alert Threshold Configuration
- Vibration Critical Limit: ${ctx.thresholds.vib} mm/s
- Temperature Limit: ${ctx.thresholds.temp} °C
- Current Limit: ${ctx.thresholds.current} A
- Humidity Limit: ${ctx.thresholds.hum} %

### Active Alerts (latest 5)
${alertsSummary}

## YOUR CAPABILITIES
1. **Machine Health Analysis**: Analyze vibration, current, temperature, humidity, and distance readings. Identify trends and risks.
2. **Health Risk Assessment**: Advise on ISO 10816 vibration standards and general machine safety limits.
3. **Threshold Management**: When users ask to change a threshold, respond with confirmation AND an action block.
4. **Control & Mode Explanation**: Explain relay control, AUTO vs MANUAL mode, and how temperature thresholds trigger auto relay ON/OFF.
5. **Maintenance Advice**: Suggest preventive maintenance based on sensor readings and historical alerts.
6. **Architecture & Dashboard Questions**: Answer questions about how the system works — MQTT, ESP32, STM32, sensors, the dashboard itself.
7. **Quick Analysis**: On demand, give a concise 1-paragraph health status summary of the whole fleet.

## THRESHOLD CHANGE COMMANDS
If the user asks to change a threshold value, include this JSON at the very end of your response (after all explaining text):
\`\`\`action
{"type":"SET_THRESHOLD","metric":"vib","value":12}
\`\`\`
Metrics: "vib", "temp", "hum", "current". Extract the exact number the user specified.

## RESPONSE STYLE
- Be concise, data-driven, and professional. Max 5 sentences unless a detailed report is requested.
- Use real numbers from the live data above.
- Flag readings that exceed normal working standards with ⚠️ or 🚨.
- Use ✅ for safe levels, ⚠️ for moderate warnings, 🚨 for critical.
- When you don't have data for a sensor (shows '--'), say the node may be offline or data is unavailable.
- Never make up sensor values — only use the data provided.`;
}

// ── Intelligent local fallback (used only when API is unreachable) ─────────────
function buildLocalResponse(text: string, ctx: DashboardContext): string {
  const q = text.toLowerCase();
  const nodes = Object.entries(ctx.nodes);
  const outdoors = nodes.filter(([id]) => !id.startsWith('worker_'));

  // Fleet summary
  if (q.includes('summary') || q.includes('status') || q.includes('overall') || q.includes('fleet') || q.includes('all node') || q.includes('how is')) {
    const online  = Object.values(ctx.status).filter(s => s.status !== 'offline').length;
    const total   = Math.max(online, nodes.length);
    const maxVib  = Math.max(...outdoors.map(([,d]) => d.vib ?? 0));
    const avgTemp = outdoors.length > 0 ? (outdoors.reduce((s,[,d]) => s + (d.temp ?? 0), 0) / outdoors.length).toFixed(1) : '--';
    const crits   = ctx.alerts.filter(a => a.severity === 'critical').length;
    const vibStatus = maxVib > ctx.thresholds.vib ? `🚨 **CRITICAL** — highest vibration ${maxVib} mm/s exceeds ${ctx.thresholds.vib} mm/s limit!` : maxVib > ctx.thresholds.vib * 0.7 ? `⚠️ vibration at ${maxVib} mm/s — approaching limit` : `✅ vibration normal at ${maxVib} mm/s`;
    return `**PLMS Fleet Summary**\n\n- Nodes: **${online}/${total} online**\n- Max Vibration: ${vibStatus}\n- Avg Temperature: **${avgTemp} °C** (limit: ${ctx.thresholds.temp} °C)\n- Active Critical Alerts: **${crits}**\n\n${crits > 0 ? '🚨 Immediate attention required on flagged nodes.' : '✅ Overall system health is within normal operating parameters.'}`;
  }

  // Vibration
  if (q.includes('vib') || q.includes('vibration') || q.includes('worst')) {
    if (outdoors.length === 0) return `No machine nodes are currently online. Cannot retrieve vibration data.`;
    const sorted = [...outdoors].sort(([,a],[,b]) => (b.vib ?? 0) - (a.vib ?? 0));
    const [worstId, worstData] = sorted[0];
    const v = worstData.vib ?? 0;
    const icon = v > ctx.thresholds.vib ? '🚨' : v > ctx.thresholds.vib * 0.7 ? '⚠️' : '✅';
    return `${icon} The highest vibration node is **${worstId}** at **${v} mm/s** (threshold: ${ctx.thresholds.vib} mm/s).\n\n${v > ctx.thresholds.vib ? 'This exceeds the configured critical limit — immediate inspection recommended. Check bearings, shaft alignment, and mounting bolts.' : v > ctx.thresholds.vib * 0.7 ? 'This is approaching the critical limit. Schedule a proactive maintenance check.' : 'Vibration levels are within safe operating range across all nodes.'}`;
  }

  // Temperature
  if (q.includes('temp') || q.includes('temperature') || q.includes('heat') || q.includes('hot') || q.includes('overheat')) {
    if (outdoors.length === 0) return `No machine nodes online. Cannot retrieve temperature data.`;
    const maxTNode = outdoors.reduce((max, cur) => (cur[1].temp ?? 0) > (max[1].temp ?? 0) ? cur : max);
    const [hotId, hotData] = maxTNode;
    const t = hotData.temp ?? 0;
    const icon = t > ctx.thresholds.temp ? '🚨' : t > ctx.thresholds.temp * 0.8 ? '⚠️' : '✅';
    return `${icon} Hottest node: **${hotId}** at **${t} °C** (configured limit: ${ctx.thresholds.temp} °C).\n\n${t > ctx.thresholds.temp ? '🚨 Temperature exceeds limit — relay auto-shutoff should have triggered if AUTO mode is active. Check cooling, fan operation, and heat dissipation.' : t > ctx.thresholds.temp * 0.8 ? '⚠️ Temperature is elevated. Monitor closely and verify adequate ventilation.' : '✅ All temperature readings are within safe operating range.'}`;
  }

  // Current / electricity
  if (q.includes('current') || q.includes('amp') || q.includes('power') || q.includes('electricity') || q.includes('load')) {
    if (outdoors.length === 0) return `No machine nodes online. Cannot retrieve current data.`;
    const maxCNode = outdoors.reduce((max, cur) => (cur[1].current ?? 0) > (max[1].current ?? 0) ? cur : max);
    const [cId, cData] = maxCNode;
    const c = cData.current ?? 0;
    const icon = c > ctx.thresholds.current ? '🚨' : c > ctx.thresholds.current * 0.8 ? '⚠️' : '✅';
    return `${icon} Highest current draw: **${cId}** at **${c} A** (configured limit: ${ctx.thresholds.current} A).\n\n${c > ctx.thresholds.current ? '🚨 Current exceeds safe limit — possible overload or motor fault. Inspect motor windings, check for mechanical binding, and verify load.' : c > ctx.thresholds.current * 0.8 ? '⚠️ Running near current limit. Reduce load or check for pending motor faults.' : '✅ Current levels are within safe operating range.'}`;
  }

  // Humidity
  if (q.includes('hum') || q.includes('humidity') || q.includes('moisture')) {
    if (outdoors.length === 0) return `No machine nodes online. Cannot retrieve humidity data.`;
    const maxHNode = outdoors.reduce((max, cur) => (cur[1].hum ?? 0) > (max[1].hum ?? 0) ? cur : max);
    const [hId, hData] = maxHNode;
    const h = hData.hum ?? 0;
    const icon = h > ctx.thresholds.hum ? '⚠️' : '✅';
    return `${icon} Highest humidity: **${hId}** at **${h}%** (threshold: ${ctx.thresholds.hum}%).\n\n${h > ctx.thresholds.hum ? '⚠️ Humidity above configured limit — risk of condensation on electronics and motor windings. Ensure enclosure sealing and dehumidification.' : '✅ Humidity within acceptable range across all monitored nodes.'}`;
  }

  // Relay / control
  if (q.includes('relay') || q.includes('fan') || q.includes('exhaust') || q.includes('turn on') || q.includes('turn off') || q.includes('control')) {
    const relayInfo = outdoors.map(([id, d]) => `• **${id}**: Relay ${d.relay ?? 'UNKNOWN'}, Mode: ${d.mode ?? 'UNKNOWN'}`).join('\n') || 'No relay data available.';
    return `**Relay Control Status**\n\n${relayInfo}\n\n• **MANUAL mode**: You control the relay ON/OFF directly from the dashboard node card buttons.\n• **AUTO mode**: The relay automatically turns ON when temperature exceeds **${ctx.thresholds.temp} °C**, and turns OFF when it cools below that threshold. You can change this trigger temperature in the Settings → Alert Thresholds page.`;
  }

  // AUTO mode
  if (q.includes('auto') || q.includes('automatic') || q.includes('mode')) {
    return `**AUTO vs MANUAL Mode**\n\n• **MANUAL**: You manually click "Turn ON / Turn OFF" on each node card to control the relay.\n• **AUTO**: The relay is driven by the temperature sensor. When temp exceeds **${ctx.thresholds.temp} °C**, the relay automatically turns ON (e.g. exhaust fan). When temp drops below the threshold, it turns OFF.\n\nYou can toggle between modes using the ⚡ AUTO / 🖱 MANUAL button on each node card. The temperature trigger threshold can be changed in **Settings → Alert Thresholds → Temp Hazard Level**.`;
  }

  // Threshold / config
  if (q.includes('threshold') || q.includes('limit') || q.includes('config') || q.includes('setting')) {
    return `**Current Alert Thresholds**\n\n- 🔵 Vibration: **${ctx.thresholds.vib} mm/s**\n- 🟠 Temperature: **${ctx.thresholds.temp} °C** *(also used as AUTO relay trigger)*\n- ⚡ Current: **${ctx.thresholds.current} A**\n- 💧 Humidity: **${ctx.thresholds.hum} %**\n\nTo change thresholds, go to **Settings → Alert Thresholds** and use the sliders (PIN protected). You can also ask me: *"Set VIB threshold to 10"* and I'll update it automatically.`;
  }

  // Alerts
  if (q.includes('alert') || q.includes('alarm') || q.includes('warn') || q.includes('critical') || q.includes('problem') || q.includes('issue')) {
    const crits = ctx.alerts.filter(a => a.severity === 'critical');
    const warns = ctx.alerts.filter(a => a.severity === 'warning');
    if (ctx.alerts.length === 0) return `✅ No active alerts in the system. All monitored nodes are operating within configured thresholds.`;
    return `🚨 **${crits.length} critical** and ⚠️ **${warns.length} warning** alerts active.\n\n${ctx.alerts.slice(0, 3).map(a => `• **[${a.severity.toUpperCase()}]** ${a.nodeId}: ${a.message}`).join('\n')}\n\n${ctx.alerts.length > 3 ? `...and ${ctx.alerts.length - 3} more. Check the Alerts panel for full details.` : ''}`;
  }

  // Node count / online
  if (q.includes('online') || q.includes('offline') || q.includes('node') || q.includes('how many') || q.includes('connected')) {
    const online  = Object.values(ctx.status).filter(s => s.status !== 'offline').length;
    const offline = Object.values(ctx.status).filter(s => s.status === 'offline').length;
    return `📡 **Node Status**: **${online} online**, **${offline} offline** (${nodes.length} total tracked).\n\n${outdoors.map(([id]) => `• ${id}: ${ctx.status[id]?.status ?? 'unknown'}`).join('\n') || 'No node data.'}`;
  }

  // Distance / VL6180X
  if (q.includes('dist') || q.includes('distance') || q.includes('sensor') || q.includes('vl6180') || q.includes('proximity')) {
    const withDist = outdoors.filter(([,d]) => d.dist !== undefined);
    if (withDist.length === 0) return `No distance sensor (VL6180X) data is currently available. The sensor may not be connected or the data has not been received yet.`;
    return `**Distance Readings (VL6180X)**\n\n${withDist.map(([id,d]) => `• **${id}**: ${d.dist} mm`).join('\n')}`;
  }

  // Maintenance
  if (q.includes('maintenance') || q.includes('service') || q.includes('repair') || q.includes('inspect') || q.includes('bearing')) {
    const highVibNodes = outdoors.filter(([,d]) => (d.vib ?? 0) > ctx.thresholds.vib * 0.7);
    const highTempNodes = outdoors.filter(([,d]) => (d.temp ?? 0) > ctx.thresholds.temp * 0.8);
    return `**Maintenance Recommendations**\n\n${highVibNodes.length > 0 ? `⚠️ **Vibration check needed**: ${highVibNodes.map(([id,d]) => `${id} (${d.vib} mm/s)`).join(', ')} — inspect bearings, shaft alignment, and coupling.\n` : '✅ Vibration: No urgent maintenance needed.\n'}${highTempNodes.length > 0 ? `⚠️ **Thermal inspection needed**: ${highTempNodes.map(([id,d]) => `${id} (${d.temp}°C)`).join(', ')} — check coolant, fans, and ventilation.\n` : '✅ Temperature: No thermal issues detected.\n'}\n*Based on ISO 10816 standards and your configured alarm thresholds.*`;
  }

  // "What can you do" / help
  if (q.includes('help') || q.includes('what can you') || q.includes('capability') || q.includes('feature') || q.includes('do you')) {
    return `I'm **PLMS-AI**, your intelligent machine health assistant. Here's what I can do:\n\n- 📊 **Analyze** vibration, temperature, current, humidity data\n- 🚨 **Explain** active alerts and their root causes\n- ⚡ **Relay control** — explain AUTO vs MANUAL mode\n- 🔧 **Maintenance** recommendations based on sensor data\n- ⚙️ **Threshold updates** — e.g. *"Set temp threshold to 45"*\n- 📡 **Node status** — which machines are online/offline\n- 🏗️ **System architecture** — MQTT, ESP32, STM32 questions\n\nJust ask me anything about your dashboard!`;
  }

  // Compliance / report
  if (q.includes('compliance') || q.includes('report') || q.includes('iso') || q.includes('standard')) {
    const maxVib = Math.max(...outdoors.map(([,d]) => d.vib ?? 0));
    const isoStatus = maxVib <= 2.8 ? '✅ Class A — New machine (excellent)' : maxVib <= 7.1 ? '✅ Class B — Good, typical new production' : maxVib <= 18 ? '⚠️ Class C — Satisfactory for long-term operation (caution)' : '🚨 Class D — Unsatisfactory — risk of damage';
    return `**ISO 10816 Vibration Compliance Report**\n\nMax fleet vibration: **${maxVib} mm/s**\nISO Rating: ${isoStatus}\n\nConfigured alarm threshold: **${ctx.thresholds.vib} mm/s**\nActive critical alerts: **${ctx.alerts.filter(a => a.severity === 'critical').length}**\n\n*ISO 10816-3 defines vibration thresholds for industrial machines above 15 kW.*`;
  }

  // Architecture / system / how it works
  if (q.includes('architecture') || q.includes('mqtt') || q.includes('esp32') || q.includes('esp') || q.includes('stm32') || q.includes('how does') || q.includes('system work') || q.includes('backend') || q.includes('frontend')) {
    return `**PLMS System Architecture**\n\n1. **STM32** microcontroller reads sensors (DHT11, ADXL345, VL6180X, HC-SR04)\n2. **ESP32/ESP8266** receives sensor data via UART and publishes it to **HiveMQ MQTT broker** on topic \`plms/{nodeId}/data\`\n3. **Node.js backend** subscribes to MQTT, processes data, stores it in **PostgreSQL**, and pushes real-time updates to the frontend via **Socket.io**\n4. **React frontend** (this dashboard) receives live data, displays it on node cards, and can send relay commands back through the same pipeline\n5. Relay commands flow: Dashboard → Socket.io → Backend → MQTT → ESP32 → STM32 relay pin`;
  }

  // Generic catch-all
  const nodeCount = nodes.length;
  const online = Object.values(ctx.status).filter(s => s.status !== 'offline').length;
  return `I'm monitoring **${nodeCount} nodes** (${online} online) with **${ctx.alerts.length} active alerts**. Your thresholds are set to VIB: ${ctx.thresholds.vib} mm/s, Temp: ${ctx.thresholds.temp}°C, Current: ${ctx.thresholds.current}A.\n\nCould you be more specific? I can help with: vibration analysis, temperature readings, relay control, AUTO mode, maintenance advice, threshold changes, or system architecture questions.`;
}

// ── Parse action command from AI response ─────────────────────────────────────
function parseAction(text: string): AIAction | null {
  const match = text.match(/```action\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    // Extract numeric value from user message if present
    return parsed as AIAction;
  } catch {
    return null;
  }
}

// Strip the action block from display text
function stripAction(text: string): string {
  return text.replace(/```action[\s\S]*?```/g, '').trim();
}

// ── Try to extract SET_THRESHOLD intent from user message ────────────────────
function extractThresholdAction(text: string): AIAction | null {
  const lower = text.toLowerCase();
  if (!lower.includes('set') || !lower.includes('threshold')) return null;
  const metricMap: Record<string, AIAction['metric']> = {
    'vib': 'vib', 'vibration': 'vib',
    'temp': 'temp', 'temperature': 'temp',
    'hum': 'hum', 'humidity': 'hum',
    'current': 'current', 'amp': 'current',
  };
  let metric: AIAction['metric'] | null = null;
  for (const [key, val] of Object.entries(metricMap)) {
    if (lower.includes(key)) { metric = val; break; }
  }
  const numMatch = text.match(/(\d+(\.\d+)?)/);
  if (metric && numMatch) {
    return { type: 'SET_THRESHOLD', metric, value: parseFloat(numMatch[1]) };
  }
  return null;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AIChatBot({ context, onAction }: Props) {
  const [open,      setOpen]      = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I'm **PLMS-AI**, your intelligent machine health analyst. I have real-time access to all your sensor data, alerts, and system configuration.\n\nHere's what I can help you with:\n- 📊 **Analyze** vibration, temperature, current, and humidity readings\n- 🚨 **Explain** active alerts and recommend fixes\n- ⚡ **Relay & AUTO mode** — how temperature-based control works\n- ⚙️ **Adjust thresholds** (e.g. *"set temp threshold to 45"*)\n- 🛠️ **Maintenance** advice based on ISO 10816 standards\n\nWhat would you like to know?`,
      timestamp: new Date(),
    }
  ]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [isOnline,  setIsOnline]  = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey,    setApiKey]    = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('plms_ai_key') || DEFAULT_API_KEY;
    }
    return DEFAULT_API_KEY;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const historyRef     = useRef<{ role: string; content: string }[]>([]);

  const handleSaveKey = (key: string) => {
    const val = key.trim() || DEFAULT_API_KEY;
    setApiKey(val);
    if (!key.trim()) {
      localStorage.removeItem('plms_ai_key');
    } else {
      localStorage.setItem('plms_ai_key', key.trim());
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
    historyRef.current.push({ role: 'user', content: text });

    let aiMsgId: string | null = null;

    // ── Immediate local threshold detection (no API needed) ─────────────────
    const immediateAction = extractThresholdAction(text);

    try {
      if (!apiKey) throw new Error("API key missing. Paste your OpenRouter API key in Settings above.");

      const systemPrompt = buildSystemPrompt(context);
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...historyRef.current
      ].filter(m => m && typeof m.content === 'string' && m.content.trim().length > 0);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "PLMS Dashboard",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: messagesPayload,
          stream: true,
          max_tokens: 512,
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = "Failed to reach AI service";
        try { errMsg = JSON.parse(errText).error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }

      setIsOnline(true);
      aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId!, role: 'assistant', content: '', timestamp: new Date() }]);
      setLoading(false);

      let fullResponse = "";
      const reader  = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim().startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const data = JSON.parse(line.trim().slice(6));
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  fullResponse += chunk;
                  setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullResponse } : m));
                }
              } catch { /* ignore incomplete SSE chunks */ }
            }
          }
        }
      }

      // Process actions from AI response
      const action = parseAction(fullResponse) ?? immediateAction;
      if (action && onAction) onAction(action);

      const displayText = stripAction(fullResponse);
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: displayText } : m));
      historyRef.current.push({ role: 'assistant', content: fullResponse });

    } catch (err: any) {
      historyRef.current.pop();
      setIsOnline(false);

      // Apply immediate action even if API fails (e.g. "set threshold to X")
      if (immediateAction && onAction) onAction(immediateAction);

      // Intelligent local fallback
      const localReply = buildLocalResponse(text, context);
      const offlinePrefix = `*(AI running in offline mode — using local analysis)*\n\n`;

      aiMsgId = aiMsgId ?? (Date.now() + 1).toString();

      // Animate the local response with a typing feel
      setMessages(prev => {
        const existing = prev.find(m => m.id === aiMsgId);
        if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, content: '' } : m);
        return [...prev, { id: aiMsgId!, role: 'assistant', content: '', timestamp: new Date() }];
      });
      setLoading(false);

      const fullLocal = offlinePrefix + localReply +
        (immediateAction ? `\n\n*Threshold updated: **${immediateAction.metric}** → **${immediateAction.value}***` : '');

      for (let i = 0; i <= fullLocal.length; i += 4) {
        await new Promise(r => setTimeout(r, 12));
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullLocal.slice(0, i) } : m));
      }
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullLocal } : m));
      historyRef.current.push({ role: 'assistant', content: fullLocal });
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    historyRef.current = [];
    setMessages([{
      id: 'welcome-refresh',
      role: 'assistant',
      content: 'Chat cleared. Ask me anything about your machine health data, thresholds, relay control, or system status!',
      timestamp: new Date(),
    }]);
  };

  const suggestions = [
    'Fleet health summary',
    'Worst vibration node?',
    'Temperature status?',
    'How does AUTO mode work?',
    'Active alerts?',
    'Maintenance advice',
  ];

  return (
    <>
      {/* ── Floating Button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center"
          title="Open PLMS AI Assistant"
        >
          <Bot className="w-6 h-6 text-primary-foreground" />
          <span className={cn(
            "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-card",
            isOnline ? "bg-green-500" : "bg-yellow-500"
          )} />
        </button>
      )}

      {/* ── Chat Window ── */}
      {open && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col bg-card border border-border outline outline-offset-0 outline-primary/10 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-4",
          expanded ? "w-[620px] h-[80vh]" : "w-[370px] h-[540px]"
        )}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-none">PLMS AI</p>
                <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                  {isOnline
                    ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Online · {AI_MODEL_LABEL}</>
                    : <><WifiOff className="w-2.5 h-2.5 text-yellow-500" /> Offline mode · Local Analysis</>
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setShowSettings(!showSettings)} title="API Settings" className={cn("p-2 rounded-xl hover:bg-secondary transition-colors", showSettings && "bg-secondary")}>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={clearChat} title="Clear chat" className="p-2 rounded-xl hover:bg-secondary transition-colors">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => setExpanded(e => !e)} title={expanded ? "Minimize" : "Expand"} className="p-2 rounded-xl hover:bg-secondary transition-colors">
                {expanded ? <Minimize2 className="w-4 h-4 text-muted-foreground" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
              </button>
              <div className="w-[1px] h-4 bg-border mx-1" />
              <button onClick={() => setOpen(false)} title="Close" className="flex items-center gap-1.5 px-3 py-1.5 ml-1 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors group">
                <span className="text-xs font-semibold opacity-0 group-hover:opacity-100 hidden sm:block transition-opacity">Close</span>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="px-4 py-3 bg-secondary/30 border-b border-border text-xs shrink-0">
              <label className="block text-muted-foreground mb-1.5 font-medium">OpenRouter API Key</label>
              <input
                type="text"
                value={apiKey === DEFAULT_API_KEY ? '' : apiKey}
                onChange={e => handleSaveKey(e.target.value)}
                placeholder="sk-or-v1... (leave blank to use built-in key)"
                className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:border-primary font-mono text-[10px]"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Get a free key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-primary underline">openrouter.ai/keys</a> · Model: {AI_MODEL}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                {isOnline ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-yellow-500" />}
                <span className="text-[10px] text-muted-foreground">{isOnline ? 'Connected to OpenRouter API' : 'Using local analysis mode'}</span>
              </div>
            </div>
          )}

          {/* Offline notice bar */}
          {!isOnline && (
            <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2 shrink-0">
              <WifiOff className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <p className="text-[10px] text-yellow-700 dark:text-yellow-300">AI API unreachable — using local smart analysis. Full answers still available.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-secondary/10">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-2.5", msg.role === 'user' && "flex-row-reverse")}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === 'assistant' ? "bg-primary" : "bg-secondary border border-border"
                )}>
                  {msg.role === 'assistant'
                    ? <Bot className="w-3 h-3 text-primary-foreground" />
                    : <span className="text-[9px] font-bold text-foreground">U</span>
                  }
                </div>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-5 py-3.5 text-[13px] leading-relaxed shadow-sm",
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
                  onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
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
                placeholder="Ask about sensors, thresholds, alerts, relay..."
                className="flex-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
              {isOnline ? `${AI_MODEL_LABEL} · ` : 'Local mode · '}
              {Object.keys(context.nodes).length} nodes · {context.alerts.length} alerts in context
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Markdown-like formatter ────────────────────────────────────────────────────
function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const formatted = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
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
