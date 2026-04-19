import { useState, useEffect, useCallback } from 'react';
import {
  Database, HardDrive, LayoutGrid, TableProperties,
  Loader2, Trash2, ShieldAlert, AlertTriangle, CheckCircle2,
  RefreshCw, Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { API_URL } from '../lib/config';

// ── Types ─────────────────────────────────────────────────────────────────────

type TableOverview = { name: string; rowCount: number };
type DBOverview   = { database: string; size: string; tables: TableOverview[] };
type TableData    = { table: string; columns: { name: string; type: string }[]; rows: any[] };

// Only these three tables exist in the PLMS production schema
const ESSENTIAL_TABLES = ['plms_critical_events', 'plms_system_config', 'users'] as const;
type EssentialTable = typeof ESSENTIAL_TABLES[number];

const TABLE_META: Record<EssentialTable, { label: string; icon: React.ReactNode; description: string; canClear: boolean }> = {
  plms_critical_events: {
    label: 'Critical Events',
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    description: 'Sensor breaches logged when thresholds are exceeded',
    canClear: true,
  },
  plms_system_config: {
    label: 'System Config',
    icon: <Lock className="w-3.5 h-3.5" />,
    description: 'Global thresholds & alert settings (read-only)',
    canClear: false,
  },
  users: {
    label: 'Users',
    icon: <Database className="w-3.5 h-3.5" />,
    description: 'Registered dashboard operators (passwords masked)',
    canClear: false,
  },
};

// ── Fallback mock data when backend is unreachable ────────────────────────────

function getMockOverview(): DBOverview {
  return {
    database: 'plms_production',
    size: '4.2 MB',
    tables: [
      { name: 'plms_critical_events', rowCount: 0 },
      { name: 'plms_system_config',   rowCount: 1 },
      { name: 'users',                rowCount: 2 },
    ],
  };
}

function getMockTableData(table: string): TableData {
  if (table === 'plms_critical_events') {
    return {
      table,
      columns: [
        { name: 'id', type: 'integer' },
        { name: 'device_id', type: 'character varying' },
        { name: 'vib', type: 'double precision' },
        { name: 'current', type: 'double precision' },
        { name: 'temperature', type: 'double precision' },
        { name: 'humidity', type: 'double precision' },
        { name: 'status', type: 'character varying' },
        { name: 'created_at', type: 'timestamp without time zone' },
      ],
      rows: [],
    };
  }
  if (table === 'plms_system_config') {
    return {
      table,
      columns: [
        { name: 'key', type: 'character varying' },
        { name: 'value', type: 'jsonb' },
        { name: 'updated_at', type: 'timestamp without time zone' },
      ],
      rows: [
        { key: 'plms_system_settings', value: { thresholds: { vib: 5, current: 20, temp: 60, hum: 50 }, alertEmail: '' }, updated_at: new Date().toISOString() },
      ],
    };
  }
  return {
    table,
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'username', type: 'character varying' },
      { name: 'password', type: 'text' },
      { name: 'role', type: 'character varying' },
      { name: 'created_at', type: 'timestamp without time zone' },
    ],
    rows: [
      { id: 1, username: 'admin', password: '••••••••••••••••', role: 'admin', created_at: new Date().toISOString() },
    ],
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DatabasePage() {
  const [overview,      setOverview]      = useState<DBOverview | null>(null);
  const [activeTable,   setActiveTable]   = useState<string>('plms_critical_events');
  const [tableData,     setTableData]     = useState<TableData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [tableLoading,  setTableLoading]  = useState(false);
  const [isMocked,      setIsMocked]      = useState(false);

  // Clear modal state
  const [clearPending,  setClearPending]  = useState(false);
  const [clearWorking,  setClearWorking]  = useState(false);
  const [clearResult,   setClearResult]   = useState<{ success: boolean; msg: string } | null>(null);

  // ── Fetch overview ──────────────────────────────────────────────────────────
  const fetchOverview = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/database/overview`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => { setOverview(data); setIsMocked(false); })
      .catch(() => { setOverview(getMockOverview()); setIsMocked(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // ── Fetch table data ────────────────────────────────────────────────────────
  const fetchTable = useCallback((name: string) => {
    setTableLoading(true);
    fetch(`${API_URL}/api/database/table/${name}`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setTableData(data))
      .catch(() => setTableData(getMockTableData(name)))
      .finally(() => setTableLoading(false));
  }, []);

  useEffect(() => { fetchTable(activeTable); }, [activeTable, fetchTable]);

  // ── Clear table ─────────────────────────────────────────────────────────────
  const handleClear = async () => {
    setClearWorking(true);
    try {
      const res = await fetch(`${API_URL}/api/database/table/${activeTable}/clear`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setClearResult({ success: true, msg: data.message });
        fetchOverview();
        fetchTable(activeTable);
      } else {
        setClearResult({ success: false, msg: data.error || 'Delete failed' });
      }
    } catch {
      setClearResult({ success: false, msg: 'Backend unreachable — cannot clear table' });
    } finally {
      setClearWorking(false);
      setClearPending(false);
    }
  };

  // ── Format cell values ──────────────────────────────────────────────────────
  const formatCell = (col: { name: string; type: string }, rawVal: any) => {
    if (rawVal === null || rawVal === undefined)
      return <span className="text-muted-foreground/40 italic">null</span>;
    if (typeof rawVal === 'boolean')
      return rawVal
        ? <span className="text-emerald-400 font-bold">true</span>
        : <span className="text-rose-400 font-bold">false</span>;
    if (typeof rawVal === 'object')
      return <span className="text-amber-400/80">{JSON.stringify(rawVal)}</span>;
    if (col.type.includes('timestamp')) {
      try { return new Date(rawVal).toLocaleString(); } catch { return String(rawVal); }
    }
    return String(rawVal);
  };

  const meta = TABLE_META[activeTable as EssentialTable];

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Connecting to database…</p>
        </div>
      </div>
    );
  }

  if (!overview) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground">

      {/* ── Top header strip ── */}
      <div className="shrink-0 px-8 py-5 border-b border-border bg-card/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
              PostgreSQL Explorer
              {isMocked && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  OFFLINE · MOCK DATA
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className={cn("w-1.5 h-1.5 rounded-full", isMocked ? "bg-amber-400" : "bg-emerald-500 animate-pulse")} />
              {isMocked ? 'Disconnected' : <>Connected to <b className="text-foreground ml-1">{overview.database}</b></>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="glass-card px-4 py-2 rounded-lg border border-border flex items-center gap-2 min-w-[130px]">
            <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Storage</p>
              <p className="text-sm font-bold font-mono">{overview.size}</p>
            </div>
          </div>
          <div className="glass-card px-4 py-2 rounded-lg border border-border flex items-center gap-2 min-w-[130px]">
            <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Tables</p>
              <p className="text-sm font-bold font-mono">{overview.tables.length} essential</p>
            </div>
          </div>
          {/* Refresh */}
          <button
            onClick={fetchOverview}
            className="w-9 h-9 rounded-lg border border-border bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ── */}
        <div className="w-60 shrink-0 border-r border-border bg-card/20 flex flex-col overflow-y-auto p-3 gap-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2">
            Essential Tables
          </p>

          {overview.tables.map(table => {
            const m = TABLE_META[table.name as EssentialTable];
            const isActive = activeTable === table.name;
            return (
              <button
                key={table.name}
                onClick={() => { setActiveTable(table.name); setClearResult(null); }}
                className={cn(
                  "flex flex-col text-left px-3 py-2.5 rounded-lg transition-all w-full relative overflow-hidden",
                  isActive
                    ? "bg-primary/10 border border-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
                )}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-l-lg" />}
                <div className="flex items-center gap-2">
                  {m?.icon}
                  <span className="text-[13px] font-semibold truncate">{m?.label ?? table.name}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] font-mono opacity-60">{table.rowCount.toLocaleString()} rows</span>
                  {!m?.canClear && (
                    <Lock className="w-2.5 h-2.5 opacity-40" />
                  )}
                </div>
              </button>
            );
          })}

          {/* Schema info box */}
          <div className="mt-auto pt-4">
            <div className="rounded-lg border border-border/60 bg-card/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground/70 mb-1">PLMS Schema v2</p>
              Only essential tables are stored. Legacy PLMS tables have been removed.
            </div>
          </div>
        </div>

        {/* ── Main Data View ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background relative">

          {tableLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          )}

          {/* Table header bar */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-bold font-mono text-foreground">
                public.<span className="text-primary">{activeTable}</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {meta?.description ?? 'Showing latest 100 entries'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Clear result toast */}
              {clearResult && (
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border",
                  clearResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                )}>
                  {clearResult.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {clearResult.msg}
                </div>
              )}

              {/* Refresh table */}
              <button
                onClick={() => fetchTable(activeTable)}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>

              {/* Clear button — only for plms_critical_events */}
              {meta?.canClear && (
                <button
                  onClick={() => { setClearPending(true); setClearResult(null); }}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 hover:bg-rose-500/20 flex items-center gap-1.5 transition-all font-medium"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Table
                </button>
              )}
            </div>
          </div>

          {/* Data grid */}
          <div className="flex-1 overflow-auto p-6">
            {!tableData || tableData.rows.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-border rounded-xl gap-3">
                <TableProperties className="w-8 h-8 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">Table is empty</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {activeTable === 'plms_critical_events'
                      ? 'No threshold breaches recorded yet'
                      : 'No rows found'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-secondary/80 text-muted-foreground text-[11px] uppercase sticky top-0 z-10 shadow-sm">
                    <tr>
                      {tableData.columns.map((col, i) => (
                        <th
                          key={col.name}
                          className={cn(
                            "px-4 py-3 font-semibold whitespace-nowrap border-b border-border/80",
                            i > 0 && "border-l border-border/30"
                          )}
                        >
                          {col.name}
                          <span className="opacity-40 text-[9px] lowercase ml-1">{col.type}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 bg-card/20">
                    {tableData.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-secondary/30 transition-colors">
                        {tableData.columns.map((col, ci) => (
                          <td
                            key={col.name}
                            className={cn(
                              "px-4 py-2 font-mono whitespace-nowrap",
                              ci > 0 && "border-l border-border/20"
                            )}
                          >
                            {formatCell(col, row[col.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Clear Confirmation Modal ── */}
      {clearPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card rounded-2xl border border-rose-500/30 bg-card p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Clear Table?</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  This will permanently delete <b>all rows</b> in{' '}
                  <code className="text-rose-400 bg-rose-500/10 px-1 rounded">{activeTable}</code>.
                  This action <b>cannot be undone</b>.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                disabled={clearWorking}
                onClick={() => setClearPending(false)}
                className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              >
                Cancel
              </button>
              <button
                disabled={clearWorking}
                onClick={handleClear}
                className="flex-1 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {clearWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {clearWorking ? 'Clearing…' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
