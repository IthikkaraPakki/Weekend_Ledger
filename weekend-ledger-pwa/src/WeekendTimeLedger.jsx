import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Play,
  Square,
  Plus,
  Trash2,
  Bell,
  BellOff,
  RotateCcw,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Moon,
} from "lucide-react";

const STORAGE_KEY = "weekend-time-ledger-v3";

const COLORS = {
  ink: "#12161A",
  surface: "#1B2126",
  surfaceRaised: "#212932",
  hairline: "#2B333B",
  amber: "#E3A23D",
  amberDim: "#8A6A34",
  rust: "#D9634E",
  slate: "#39434C",
  textPrimary: "#F1EEE7",
  textMuted: "#8B93A0",
  textFaint: "#5C6570",
};

const PALETTE = ["#E3A23D", "#4FA6A6", "#9C7FE0", "#5B9BD5", "#D9634E", "#7FBF6A", "#D6C24A", "#E087B0"];

function uid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function fmtHM(min) {
  const sign = min < 0 ? "-" : "";
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = Math.round(a % 60);
  return `${sign}${h}h ${m}m`;
}
function shortDate(bucketId) {
  const d = new Date(bucketId + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// Saturday=6, Sunday=0. Returns the Saturday-date bucket id, or null on weekdays.
function getWeekendBucketId(ts) {
  const d = new Date(ts);
  const day = d.getDay();
  if (day === 6) return dateStr(d);
  if (day === 0) {
    const sat = new Date(d);
    sat.setDate(d.getDate() - 1);
    return dateStr(sat);
  }
  return null;
}
function getUpcomingBucketId(ts) {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = (6 - day + 7) % 7 || 7;
  const next = new Date(d);
  next.setDate(d.getDate() + diff);
  return dateStr(next);
}
// Weekend window: Saturday 00:00 -> Monday 00:00 (48h), local time.
function bucketBounds(bucketId) {
  const start = new Date(bucketId + "T00:00:00").getTime();
  return { start, end: start + 2 * 24 * 3600 * 1000 };
}
// Which calendar month(s) a weekend belongs to. Normally one month at
// fraction 1; if Sat/Sun straddle a month boundary, split 50/50.
function getBucketShares(bucketId) {
  const sat = new Date(bucketId + "T00:00:00");
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  if (sat.getFullYear() === sun.getFullYear() && sat.getMonth() === sun.getMonth()) {
    return [{ year: sat.getFullYear(), month: sat.getMonth(), fraction: 1 }];
  }
  return [
    { year: sat.getFullYear(), month: sat.getMonth(), fraction: 0.5 },
    { year: sun.getFullYear(), month: sun.getMonth(), fraction: 0.5 },
  ];
}

export default function WeekendTimeLedger() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]); // {id, name, allowFridayStart}
  const [weekends, setWeekends] = useState({}); // { bucketId: { quotas:{catId:min}, sessions:[], notified:[] } }
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState("weekend");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [banners, setBanners] = useState([]);
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [editingQuotas, setEditingQuotas] = useState(false);
  const [quotaDraft, setQuotaDraft] = useState({});
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [yearCursor, setYearCursor] = useState(() => new Date().getFullYear());
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const categoriesRef = useRef(categories);
  const weekendsRef = useRef(weekends);
  categoriesRef.current = categories;
  weekendsRef.current = weekends;

  const colorFor = (catId) => {
    const idx = categories.findIndex((c) => c.id === catId);
    return PALETTE[idx % PALETTE.length] || COLORS.amber;
  };

  // ---- Load (seeding Sleep on very first run) ----
  useEffect(() => {
    (async () => {
      let data = null;
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) data = JSON.parse(res.value);
      } catch (e) {
        /* nothing stored yet */
      }
      let cats = data?.categories || [];
      let wknds = data?.weekends || {};
      let seeded = data?.seeded || false;
      if (!seeded) {
        if (!cats.some((c) => c.name === "Sleep")) {
          cats = [{ id: uid(), name: "Sleep", allowFridayStart: true }, ...cats];
        }
        seeded = true;
        try {
          await window.storage.set(STORAGE_KEY, JSON.stringify({ categories: cats, weekends: wknds, seeded }), false);
        } catch (e) {}
      }
      setCategories(cats);
      setWeekends(wknds);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const persist = useCallback(async (next) => {
    const payload = {
      categories: next.categories ?? categoriesRef.current,
      weekends: next.weekends ?? weekendsRef.current,
      seeded: true,
    };
    if (next.categories) setCategories(next.categories);
    if (next.weekends) setWeekends(next.weekends);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(payload), false);
    } catch (e) {
      console.error("save failed", e);
    }
  }, []);

  // ---- Ensure current/upcoming weekend bucket exists, carrying forward quotas ----
  useEffect(() => {
    if (loading) return;
    const bucket = getWeekendBucketId(now) || getUpcomingBucketId(now);
    if (bucket && !weekendsRef.current[bucket]) {
      const keys = Object.keys(weekendsRef.current).sort();
      let prevQuotas = {};
      for (let i = keys.length - 1; i >= 0; i--) {
        if (keys[i] < bucket && weekendsRef.current[keys[i]].quotas) {
          prevQuotas = { ...weekendsRef.current[keys[i]].quotas };
          break;
        }
      }
      persist({ weekends: { ...weekendsRef.current, [bucket]: { quotas: prevQuotas, sessions: [], notified: [] } } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, loading]);

  // ---- Auto-close any session still open past its weekend's midnight cutoff ----
  useEffect(() => {
    if (loading) return;
    let changed = false;
    const next = { ...weekendsRef.current };
    Object.keys(next).forEach((b) => {
      const { end } = bucketBounds(b);
      if (now >= end) {
        const rec = next[b];
        const idx = rec.sessions.findIndex((s) => s.end === null);
        if (idx !== -1) {
          const sessions = rec.sessions.slice();
          sessions[idx] = { ...sessions[idx], end };
          next[b] = { ...rec, sessions };
          changed = true;
        }
      }
    });
    if (changed) persist({ weekends: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, loading]);

  const isWeekendDay = getWeekendBucketId(now) !== null;
  const todayIsFriday = new Date(now).getDay() === 5;
  const activeBucket = getWeekendBucketId(now) || getUpcomingBucketId(now);
  const activeRecord = weekends[activeBucket] || { quotas: {}, sessions: [], notified: [] };

  function canStartCategory(cat) {
    return isWeekendDay || (todayIsFriday && cat.allowFridayStart);
  }

  // Counted time is clamped to the weekend's Sat-00:00 -> Mon-00:00 window,
  // so time before midnight (e.g. a Friday-evening Sleep start) never counts.
  function usedMinForBucket(bucket, catId, atTime) {
    const rec = weekends[bucket];
    if (!rec) return 0;
    const { start, end } = bucketBounds(bucket);
    return (
      rec.sessions
        .filter((s) => s.categoryId === catId)
        .reduce((acc, s) => {
          const sEnd = s.end ?? atTime;
          const cs = Math.max(s.start, start);
          const ce = Math.min(sEnd, end);
          return acc + Math.max(0, ce - cs);
        }, 0) / 60000
    );
  }

  function triggerNotification(name) {
    setBanners((b) => [...b, { id: uid(), text: `${name} — quota complete` }]);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Quota complete", { body: `${name} has reached its weekend quota.` });
      }
    } catch (e) {}
  }

  useEffect(() => {
    if (loading) return;
    const rec = weekends[activeBucket];
    if (!rec) return;
    const newly = [];
    categories.forEach((c) => {
      const used = usedMinForBucket(activeBucket, c.id, now);
      const quota = rec.quotas[c.id] || 0;
      if (quota > 0 && used >= quota && !(rec.notified || []).includes(c.id)) {
        newly.push(c.id);
        triggerNotification(c.name);
      }
    });
    if (newly.length) {
      persist({ weekends: { ...weekends, [activeBucket]: { ...rec, notified: [...(rec.notified || []), ...newly] } } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, loading]);

  function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => setNotifPerm(p));
  }

  function startCategory(cat) {
    if (!canStartCategory(cat)) return;
    const t = Date.now();
    const rec = weekends[activeBucket] || { quotas: {}, sessions: [], notified: [] };
    const updatedSessions = rec.sessions.map((s) => (s.end === null ? { ...s, end: t } : s));
    updatedSessions.push({ id: uid(), categoryId: cat.id, start: t, end: null });
    persist({ weekends: { ...weekends, [activeBucket]: { ...rec, sessions: updatedSessions } } });
  }
  function stopActive() {
    const rec = weekends[activeBucket];
    if (!rec) return;
    const t = Date.now();
    const updatedSessions = rec.sessions.map((s) => (s.end === null ? { ...s, end: t } : s));
    persist({ weekends: { ...weekends, [activeBucket]: { ...rec, sessions: updatedSessions } } });
  }
  function addCategory() {
    if (!newName.trim()) return;
    const cat = { id: uid(), name: newName.trim(), allowFridayStart: false };
    persist({ categories: [...categories, cat] });
    setNewName("");
    setShowAddForm(false);
  }
  function deleteCategory(id) {
    const nextWeekends = {};
    Object.entries(weekends).forEach(([b, rec]) => {
      const q = { ...rec.quotas };
      delete q[id];
      nextWeekends[b] = {
        ...rec,
        quotas: q,
        sessions: rec.sessions.filter((s) => s.categoryId !== id),
        notified: (rec.notified || []).filter((x) => x !== id),
      };
    });
    persist({ categories: categories.filter((c) => c.id !== id), weekends: nextWeekends });
  }
  function openQuotaEditor() {
    const draft = {};
    categories.forEach((c) => {
      draft[c.id] = activeRecord.quotas[c.id] ? activeRecord.quotas[c.id] / 60 : "";
    });
    setQuotaDraft(draft);
    setEditingQuotas(true);
  }
  function saveQuotas() {
    const quotas = {};
    categories.forEach((c) => {
      const h = parseFloat(quotaDraft[c.id]);
      quotas[c.id] = isNaN(h) || h <= 0 ? 0 : h * 60;
    });
    persist({ weekends: { ...weekends, [activeBucket]: { ...activeRecord, quotas } } });
    setEditingQuotas(false);
  }
  function resetActiveWeekend() {
    persist({ weekends: { ...weekends, [activeBucket]: { ...activeRecord, sessions: [], notified: [] } } });
  }

  // ---- Derived: active weekend ----
  const activeSession = activeRecord.sessions.find((s) => s.end === null);
  const { start: activeBucketStart, end: activeBucketEnd } = bucketBounds(activeBucket);
  const armed = !!activeSession && now < activeBucketStart;
  const elapsedMs = activeSession
    ? Math.max(0, Math.min(now, activeBucketEnd) - Math.max(activeSession.start, activeBucketStart))
    : 0;
  const totalUsedMin = categories.reduce((acc, c) => acc + usedMinForBucket(activeBucket, c.id, now), 0);
  const totalQuotaMin = categories.reduce((acc, c) => acc + (activeRecord.quotas[c.id] || 0), 0);
  const chartDataWeekend = categories.map((c) => {
    const used = usedMinForBucket(activeBucket, c.id, now);
    const quota = activeRecord.quotas[c.id] || 0;
    return {
      name: c.name,
      Used: +(Math.min(used, quota) / 60).toFixed(2),
      Remaining: +(Math.max(quota - used, 0) / 60).toFixed(2),
      Over: +(Math.max(used - quota, 0) / 60).toFixed(2),
    };
  });

  // ---- Derived: month view (share-aware for split weekends) ----
  const weekendsInMonth = useMemo(() => {
    return Object.keys(weekends)
      .map((b) => {
        const match = getBucketShares(b).find((s) => s.year === monthCursor.year && s.month === monthCursor.month);
        return match ? { bucket: b, fraction: match.fraction } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [weekends, monthCursor]);

  const monthTrendData = weekendsInMonth.map(({ bucket: b, fraction }) => {
    const row = { label: shortDate(b) + (fraction < 1 ? " ·split" : "") };
    categories.forEach((c) => {
      row[c.name] = +((usedMinForBucket(b, c.id, now) * fraction) / 60).toFixed(2);
    });
    return row;
  });

  // ---- Derived: year view (share-aware) ----
  function sharesForMonth(year, month) {
    return Object.keys(weekends)
      .map((b) => {
        const match = getBucketShares(b).find((s) => s.year === year && s.month === month);
        return match ? { bucket: b, fraction: match.fraction } : null;
      })
      .filter(Boolean);
  }
  const monthsInYear = Array.from({ length: 12 }, (_, i) => i);
  const yearTrendData = monthsInYear.map((m) => {
    const label = new Date(yearCursor, m, 1).toLocaleDateString(undefined, { month: "short" });
    const shares = sharesForMonth(yearCursor, m);
    const row = { label };
    categories.forEach((c) => {
      const total = shares.reduce((acc, { bucket, fraction }) => acc + usedMinForBucket(bucket, c.id, now) * fraction, 0);
      row[c.name] = +(total / 60).toFixed(2);
    });
    return row;
  });
  const yearBudgetData = monthsInYear.map((m) => {
    const label = new Date(yearCursor, m, 1).toLocaleDateString(undefined, { month: "short" });
    const shares = sharesForMonth(yearCursor, m);
    let used = 0;
    let quota = 0;
    shares.forEach(({ bucket, fraction }) => {
      categories.forEach((c) => {
        used += usedMinForBucket(bucket, c.id, now) * fraction;
        quota += (weekends[bucket].quotas[c.id] || 0) * fraction;
      });
    });
    return {
      label,
      Used: +(Math.min(used, quota) / 60).toFixed(2),
      Remaining: +(Math.max(quota - used, 0) / 60).toFixed(2),
      Over: +(Math.max(used - quota, 0) / 60).toFixed(2),
    };
  });

  // ---- Derived: calendar view (per-day clamped, so overnight sessions split correctly) ----
  const calGrid = useMemo(() => {
    const first = new Date(calCursor.year, calCursor.month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(calCursor.year, calCursor.month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calCursor.year, calCursor.month, d));
    return cells;
  }, [calCursor]);

  function dayUsedMinutes(d) {
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000;
    const bucket = getWeekendBucketId(dayStart + 12 * 3600 * 1000);
    if (!bucket || !weekends[bucket]) return 0;
    return (
      weekends[bucket].sessions.reduce((acc, s) => {
        const sEnd = s.end ?? now;
        const cs = Math.max(s.start, dayStart);
        const ce = Math.min(sEnd, dayEnd);
        return acc + Math.max(0, ce - cs);
      }, 0) / 60000
    );
  }
  function heatColor(min) {
    const h = min / 60;
    if (h <= 0) return COLORS.slate;
    if (h < 2) return "#5A4423";
    if (h < 4) return "#8A6A34";
    if (h < 8) return "#BF8A38";
    return COLORS.amber;
  }

  const selectedBucket = selectedDate ? getWeekendBucketId(new Date(selectedDate + "T12:00:00").getTime()) : null;
  const selectedRecord = selectedBucket ? weekends[selectedBucket] : null;

  if (loading) {
    return (
      <div style={{ background: COLORS.ink, color: COLORS.textMuted, minHeight: 400 }} className="flex items-center justify-center rounded-lg p-8 font-sans text-sm">
        Loading ledger…
      </div>
    );
  }

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} className="wtl-btn rounded-md px-3 py-1.5 text-xs font-medium"
      style={{ background: tab === key ? COLORS.amber : COLORS.surfaceRaised, color: tab === key ? COLORS.ink : COLORS.textMuted, border: `1px solid ${tab === key ? COLORS.amber : COLORS.hairline}` }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: COLORS.ink, color: COLORS.textPrimary, fontFamily: "'Inter', sans-serif" }} className="w-full rounded-xl p-4 sm:p-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
        .wtl-mono { font-family: 'JetBrains Mono', monospace; }
        .wtl-display { font-family: 'Space Grotesk', sans-serif; }
        .wtl-pulse { animation: wtl-pulse-anim 1.8s ease-in-out infinite; }
        @keyframes wtl-pulse-anim { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .wtl-btn { transition: transform 0.12s ease, background 0.12s ease; }
        .wtl-btn:active { transform: scale(0.97); }
        .wtl-input:focus, .wtl-btn:focus-visible { outline: 2px solid ${COLORS.amber}; outline-offset: 2px; }
        .wtl-cal-cell { transition: transform 0.1s ease; }
        .wtl-cal-cell:hover { transform: scale(1.06); }
        @media (prefers-reduced-motion: reduce) { .wtl-pulse { animation: none; } }
      `}</style>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="wtl-display text-xs tracking-widest uppercase mb-1" style={{ color: COLORS.textFaint, letterSpacing: "0.14em" }}>Weekend Ledger</div>
          <div className="wtl-display text-2xl font-semibold">Time Account</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {notifPerm !== "granted" && notifPerm !== "unsupported" && (
            <button onClick={requestNotifPermission} className="wtl-btn flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium" style={{ background: COLORS.surfaceRaised, color: COLORS.textMuted, border: `1px solid ${COLORS.hairline}` }}>
              <Bell size={13} /> Enable alerts
            </button>
          )}
          {notifPerm === "unsupported" && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.textFaint }}><BellOff size={13} /> In-app alerts only</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-5">
        {tabBtn("weekend", "This Weekend")}
        {tabBtn("month", "Month")}
        {tabBtn("year", "Year")}
        {tabBtn("calendar", "Calendar")}
      </div>

      {banners.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {banners.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm" style={{ background: "rgba(217,99,78,0.14)", border: `1px solid ${COLORS.rust}`, color: COLORS.textPrimary }}>
              <span className="flex items-center gap-2"><Bell size={14} style={{ color: COLORS.rust }} />{b.text}</span>
              <button onClick={() => setBanners((prev) => prev.filter((x) => x.id !== b.id))}><X size={14} style={{ color: COLORS.textMuted }} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === "weekend" && (
        <>
          <div className="rounded-lg p-4 mb-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
            <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
              <span className="text-xs" style={{ color: COLORS.textFaint }}>
                {isWeekendDay ? "Active weekend" : "Planning ahead — upcoming weekend"}: {" "}
                <span className="wtl-mono" style={{ color: COLORS.textMuted }}>
                  {shortDate(activeBucket)} – {new Date(activeBucketEnd - 1).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </span>
              <span className="wtl-mono text-sm" style={{ color: COLORS.textMuted }}>
                {fmtHM(totalUsedMin)} <span style={{ color: COLORS.textFaint }}>/ {fmtHM(totalQuotaMin)}</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: COLORS.slate }}>
              <div style={{ width: `${totalQuotaMin ? Math.min(100, (totalUsedMin / totalQuotaMin) * 100) : 0}%`, background: `linear-gradient(90deg, ${COLORS.amberDim}, ${COLORS.amber})`, height: "100%", transition: "width 0.4s ease" }} />
            </div>
            {!isWeekendDay && (
              <div className="text-xs mt-2" style={{ color: COLORS.textFaint }}>
                {todayIsFriday ? "Sleep can be armed tonight — it'll only start counting at midnight. Other timers unlock Saturday." : "Timers only run Saturday & Sunday — set quotas now so they're ready."}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {!showAddForm ? (
              <button onClick={() => setShowAddForm(true)} className="wtl-btn flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium" style={{ background: COLORS.surfaceRaised, color: COLORS.amber, border: `1px solid ${COLORS.hairline}` }}>
                <Plus size={14} /> New category
              </button>
            ) : (
              <div className="rounded-lg p-3 flex flex-wrap items-end gap-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name" className="wtl-input rounded-md px-3 py-2 text-sm" style={{ background: COLORS.ink, color: COLORS.textPrimary, border: `1px solid ${COLORS.hairline}` }} />
                <button onClick={addCategory} className="wtl-btn rounded-md px-3 py-2 text-sm font-medium" style={{ background: COLORS.amber, color: COLORS.ink }}>Add</button>
                <button onClick={() => { setShowAddForm(false); setNewName(""); }} className="rounded-md px-3 py-2 text-sm" style={{ color: COLORS.textMuted }}>Cancel</button>
              </div>
            )}
            <button onClick={openQuotaEditor} className="wtl-btn flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium" style={{ background: COLORS.surfaceRaised, color: COLORS.textMuted, border: `1px solid ${COLORS.hairline}` }}>
              <Settings2 size={14} /> Set this weekend's quotas
            </button>
            <button onClick={resetActiveWeekend} className="wtl-btn flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium" style={{ background: COLORS.surfaceRaised, color: COLORS.textMuted, border: `1px solid ${COLORS.hairline}` }}>
              <RotateCcw size={13} /> Reset this weekend
            </button>
          </div>

          {editingQuotas && (
            <div className="rounded-lg p-4 mb-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
              <div className="wtl-display text-sm font-semibold mb-3">Quotas for {shortDate(activeBucket)} weekend</div>
              <div className="flex flex-col gap-2 mb-3">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{ color: COLORS.textMuted }}>{c.name}</span>
                    <div className="flex items-center gap-1.5">
                      <input value={quotaDraft[c.id] ?? ""} onChange={(e) => setQuotaDraft((d) => ({ ...d, [c.id]: e.target.value }))} inputMode="decimal" placeholder="0" className="wtl-input rounded-md px-2 py-1.5 text-sm w-20 text-right" style={{ background: COLORS.ink, color: COLORS.textPrimary, border: `1px solid ${COLORS.hairline}` }} />
                      <span className="text-xs" style={{ color: COLORS.textFaint }}>hrs</span>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && <div className="text-xs" style={{ color: COLORS.textFaint }}>Add a category first.</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={saveQuotas} className="wtl-btn rounded-md px-3 py-2 text-sm font-medium" style={{ background: COLORS.amber, color: COLORS.ink }}>Save quotas</button>
                <button onClick={() => setEditingQuotas(false)} className="rounded-md px-3 py-2 text-sm" style={{ color: COLORS.textMuted }}>Cancel</button>
              </div>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="rounded-lg p-8 text-center text-sm mb-6" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.hairline}`, color: COLORS.textFaint }}>
              No categories yet. Add one above to start the clock.
            </div>
          ) : (
            <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {categories.map((c) => {
                const used = usedMinForBucket(activeBucket, c.id, now);
                const quota = activeRecord.quotas[c.id] || 0;
                const isActive = activeSession && activeSession.categoryId === c.id;
                const over = quota > 0 && used > quota;
                const startBlocked = !canStartCategory(c);
                return (
                  <div key={c.id} className="rounded-lg p-4 flex flex-col gap-3" style={{ background: COLORS.surface, border: `1px solid ${isActive ? COLORS.amber : COLORS.hairline}` }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="wtl-display text-sm font-semibold flex items-center gap-1.5">
                          {isActive && <span className="wtl-pulse inline-block rounded-full" style={{ width: 7, height: 7, background: over ? COLORS.rust : COLORS.amber }} />}
                          {c.allowFridayStart && <Moon size={12} style={{ color: COLORS.textFaint }} />}
                          {c.name}
                        </div>
                        <div className="wtl-mono text-xs mt-1" style={{ color: over ? COLORS.rust : COLORS.textMuted }}>
                          {fmtHM(used)} <span style={{ color: COLORS.textFaint }}>/ {quota ? fmtHM(quota) : "no quota"}</span>
                          {over && <span> · over {fmtHM(used - quota)}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteCategory(c.id)} className="opacity-60 hover:opacity-100"><Trash2 size={13} style={{ color: COLORS.textFaint }} /></button>
                    </div>
                    {isActive && (
                      <div>
                        <div className="wtl-mono flex items-center gap-1.5 text-lg" style={{ color: COLORS.amber }}>
                          <Clock size={14} />{fmtHMS(elapsedMs)}
                        </div>
                        {armed && isActive && (
                          <div className="text-xs mt-0.5" style={{ color: COLORS.textFaint }}>Armed — counts from midnight</div>
                        )}
                      </div>
                    )}
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: COLORS.slate }}>
                      <div style={{ width: `${quota ? Math.min(100, (used / quota) * 100) : 0}%`, background: over ? COLORS.rust : COLORS.amber, height: "100%" }} />
                    </div>
                    {isActive ? (
                      <button onClick={stopActive} className="wtl-btn flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium" style={{ background: COLORS.rust, color: COLORS.ink }}>
                        <Square size={13} fill={COLORS.ink} /> Stop
                      </button>
                    ) : (
                      <button onClick={() => startCategory(c)} disabled={startBlocked} className="wtl-btn flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium" style={{ background: COLORS.surfaceRaised, color: startBlocked ? COLORS.textFaint : COLORS.amber, border: `1px solid ${COLORS.hairline}`, opacity: startBlocked ? 0.6 : 1 }}>
                        <Play size={13} fill={startBlocked ? COLORS.textFaint : COLORS.amber} /> Start
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {categories.length > 0 && <QuotaBarChart title="Quota Ledger" data={chartDataWeekend} height={Math.max(140, categories.length * 56 + 40)} />}
        </>
      )}

      {tab === "month" && (
        <>
          <MonthNav label={new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            onPrev={() => setMonthCursor((mc) => (mc.month === 0 ? { year: mc.year - 1, month: 11 } : { year: mc.year, month: mc.month - 1 }))}
            onNext={() => setMonthCursor((mc) => (mc.month === 11 ? { year: mc.year + 1, month: 0 } : { year: mc.year, month: mc.month + 1 }))} />
          {weekendsInMonth.length === 0 || categories.length === 0 ? (
            <div className="rounded-lg p-6 text-center text-sm mt-4" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.hairline}`, color: COLORS.textFaint }}>No tracked weekends this month yet.</div>
          ) : (
            <>
              <div className="rounded-lg p-4 mt-4 mb-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
                <div className="wtl-display text-sm font-semibold mb-3">Usage trend by weekend</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthTrendData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.hairline} />
                    <XAxis dataKey="label" tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} />
                    <YAxis tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} unit="h" />
                    <Tooltip contentStyle={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.hairline}`, borderRadius: 6 }} labelStyle={{ color: COLORS.textPrimary }} formatter={(v) => `${v}h`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
                    {categories.map((c) => <Line key={c.id} type="monotone" dataKey={c.name} stroke={colorFor(c.id)} strokeWidth={2} dot={{ r: 3 }} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3">
                {weekendsInMonth.map(({ bucket: b, fraction }) => {
                  const data = categories.map((c) => {
                    const used = usedMinForBucket(b, c.id, now) * fraction;
                    const quota = (weekends[b].quotas[c.id] || 0) * fraction;
                    return { name: c.name, Used: +(Math.min(used, quota) / 60).toFixed(2), Remaining: +(Math.max(quota - used, 0) / 60).toFixed(2), Over: +(Math.max(used - quota, 0) / 60).toFixed(2) };
                  });
                  return <QuotaBarChart key={b} title={`Weekend of ${shortDate(b)}${fraction < 1 ? " · split across months" : ""}`} data={data} height={Math.max(110, categories.length * 42 + 40)} compact />;
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === "year" && (
        <>
          <MonthNav label={String(yearCursor)} onPrev={() => setYearCursor((y) => y - 1)} onNext={() => setYearCursor((y) => y + 1)} />
          {categories.length === 0 ? (
            <div className="rounded-lg p-6 text-center text-sm mt-4" style={{ background: COLORS.surface, border: `1px dashed ${COLORS.hairline}`, color: COLORS.textFaint }}>Add a category to see yearly trends.</div>
          ) : (
            <>
              <div className="rounded-lg p-4 mt-4 mb-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
                <div className="wtl-display text-sm font-semibold mb-3">Monthly usage trend</div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={yearTrendData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.hairline} />
                    <XAxis dataKey="label" tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} />
                    <YAxis tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} unit="h" />
                    <Tooltip contentStyle={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.hairline}`, borderRadius: 6 }} labelStyle={{ color: COLORS.textPrimary }} formatter={(v) => `${v}h`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textMuted }} />
                    {categories.map((c) => <Line key={c.id} type="monotone" dataKey={c.name} stroke={colorFor(c.id)} strokeWidth={2} dot={{ r: 2 }} />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <QuotaBarChart title="Monthly budget (all categories combined)" data={yearBudgetData} height={280} xKey="label" />
            </>
          )}
        </>
      )}

      {tab === "calendar" && (
        <>
          <MonthNav label={new Date(calCursor.year, calCursor.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            onPrev={() => { setCalCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })); setSelectedDate(null); }}
            onNext={() => { setCalCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })); setSelectedDate(null); }} />
          <div className="rounded-lg p-4 mt-4 mb-5" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5 text-center text-xs" style={{ color: COLORS.textFaint }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calGrid.map((d, i) => {
                if (!d) return <div key={i} />;
                const isWeekendDate = d.getDay() === 0 || d.getDay() === 6;
                const ds = dateStr(d);
                const usedMin = isWeekendDate ? dayUsedMinutes(d) : 0;
                const isSelected = selectedDate === ds;
                return (
                  <button key={i} disabled={!isWeekendDate} onClick={() => setSelectedDate(ds)} className="wtl-cal-cell rounded-md flex flex-col items-center justify-center text-xs py-2"
                    style={{ background: isWeekendDate ? heatColor(usedMin) : "transparent", color: isWeekendDate ? (usedMin >= 240 ? COLORS.ink : COLORS.textPrimary) : COLORS.textFaint, border: isSelected ? `1.5px solid ${COLORS.textPrimary}` : "1px solid transparent", cursor: isWeekendDate ? "pointer" : "default", opacity: isWeekendDate ? 1 : 0.35 }}>
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-xs mt-3" style={{ color: COLORS.textFaint }}>
              <span>Less</span>
              {[0, 90, 180, 300, 600].map((m, i) => <span key={i} className="inline-block rounded-sm" style={{ width: 12, height: 12, background: heatColor(m) }} />)}
              <span>More</span>
            </div>
          </div>

          {selectedDate && selectedBucket && (
            <div className="rounded-lg p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="wtl-display text-sm font-semibold">
                  Weekend of {shortDate(selectedBucket)} — {selectedDate} logged {fmtHM(dayUsedMinutes(new Date(selectedDate + "T12:00:00")))}
                </div>
                <button onClick={() => setSelectedDate(null)}><X size={14} style={{ color: COLORS.textMuted }} /></button>
              </div>
              {selectedRecord && categories.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {categories.map((c) => {
                    const used = usedMinForBucket(selectedBucket, c.id, now);
                    const quota = selectedRecord.quotas[c.id] || 0;
                    const over = quota > 0 && used > quota;
                    return (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span style={{ color: COLORS.textMuted }}>{c.name}</span>
                        <span className="wtl-mono" style={{ color: over ? COLORS.rust : COLORS.textMuted }}>{fmtHM(used)} / {quota ? fmtHM(quota) : "no quota"}</span>
                      </div>
                    );
                  })}
                  <div className="text-xs mt-1" style={{ color: COLORS.textFaint }}>Totals shown are for the whole weekend (Sat + Sun combined).</div>
                </div>
              ) : (
                <div className="text-xs" style={{ color: COLORS.textFaint }}>No data logged for this weekend.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MonthNav({ label, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.hairline}` }}>
      <button onClick={onPrev} className="wtl-btn p-1"><ChevronLeft size={16} style={{ color: COLORS.textMuted }} /></button>
      <span className="wtl-display text-sm font-medium">{label}</span>
      <button onClick={onNext} className="wtl-btn p-1"><ChevronRight size={16} style={{ color: COLORS.textMuted }} /></button>
    </div>
  );
}

function QuotaBarChart({ title, data, height, compact, xKey }) {
  return (
    <div className="rounded-lg p-4 mb-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.hairline}` }}>
      <div className="wtl-display text-sm font-semibold mb-1">{title}</div>
      {!compact && (
        <div className="flex items-center gap-4 text-xs mb-3" style={{ color: COLORS.textFaint }}>
          <span className="flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: COLORS.amber }} /> Used</span>
          <span className="flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: COLORS.slate }} /> Remaining</span>
          <span className="flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: COLORS.rust }} /> Over</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={xKey ? "horizontal" : "vertical"} margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.hairline} horizontal={!!xKey} vertical={!xKey} />
          {xKey ? (
            <>
              <XAxis dataKey={xKey} tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} unit="h" />
            </>
          ) : (
            <>
              <XAxis type="number" tick={{ fill: COLORS.textFaint, fontSize: 11 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} unit="h" />
              <YAxis type="category" dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 12 }} axisLine={{ stroke: COLORS.hairline }} tickLine={false} width={80} />
            </>
          )}
          <Tooltip contentStyle={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.hairline}`, borderRadius: 6 }} labelStyle={{ color: COLORS.textPrimary }} itemStyle={{ color: COLORS.textMuted }} formatter={(v) => `${v}h`} />
          <Bar dataKey="Used" stackId="a" fill={COLORS.amber} />
          <Bar dataKey="Remaining" stackId="a" fill={COLORS.slate} />
          <Bar dataKey="Over" stackId="a" fill={COLORS.rust} radius={xKey ? [0, 0, 0, 0] : [0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
