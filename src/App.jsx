import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, Trash2, PlusCircle, Target, PieChart as PieIcon, BarChart2, AlertTriangle } from "lucide-react";
import Chart from "chart.js/auto";
import * as XLSX from "xlsx"; // експорт към Excel

// ======= Pastel palette (light-only) =======
const pastel = {
  bg: "#fafaf9",
  card: "#ffffff",
  text: "#1f2937",
  subtext: "#6b7280",
  primary: "#a7f3d0",
  primaryText: "#065f46",
  accent: "#bfdbfe",
  accent2: "#fde68a",
  accent3: "#fbcfe8",
  danger: "#fecaca",
};

// ======= Helpers =======
const dateBG = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
};

const dayMonthBG = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
};

const fmt = (n) => (isFinite(n) ? n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00");
const todayYYYYMMDD = () => new Date().toISOString().slice(0, 10);
const ymKey = (dateStr) => dateStr.slice(0, 7);
const monthBG = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const names = ["ян.", "февр.", "март", "апр.", "май", "юни", "юли", "авг.", "септ.", "окт.", "ноем.", "дек."];
  return `${names[(m || 1) - 1]} ${y}`;
};

// ======= Default categories =======
const DEFAULT_CATEGORIES = [
  { key: "home", label: "Жилище" },
  { key: "food", label: "Храна" },
  { key: "transport", label: "Транспорт" },
  { key: "health", label: "Здраве" },
  { key: "utilities", label: "Сметки" },
  { key: "fun", label: "Свободно време" },
  { key: "shopping", label: "Покупки" },
  { key: "other", label: "Други" },
];

export default function BudgetApp() {
  // ======= PWA update banner (ВЪТРЕ В КОМПОНЕНТА) =======
  const [swReg, setSwReg] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const onSwUpdated = (e) => {
      setSwReg(e.detail);     // registration
      setUpdateReady(true);   // покажи банера
    };
    window.addEventListener("swUpdated", onSwUpdated);
    return () => window.removeEventListener("swUpdated", onSwUpdated);
  }, []);
  const applyUpdateNow = () => {
    if (swReg?.waiting) {
      swReg.waiting.postMessage({ type: "SKIP_WAITING" });
      // след това main.jsx слуша controllerchange и прави reload
    }
  };

  // ======= PWA install state =======
  const [installEvent, setInstallEvent] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      setCanInstall(true);
    };
    const onAppInstalled = () => setCanInstall(false);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);
  const handleInstallClick = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice; // { outcome: 'accepted' | 'dismissed' }
    setInstallEvent(null);
    setCanInstall(false);
  };

  // ======= App State =======
  const [entries, setEntries] = useState(() => {
    const raw = localStorage.getItem("budget.entries");
    return raw ? JSON.parse(raw) : [];
  });
  const [month, setMonth] = useState(() => localStorage.getItem("budget.month") || new Date().toISOString().slice(0, 7));
  const [categories, setCategories] = useState(() => {
    const raw = localStorage.getItem("budget.categories");
    return raw ? JSON.parse(raw) : DEFAULT_CATEGORIES;
  });
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem("budget.settings");
    return raw ? JSON.parse(raw) : { limits: {}, model: { fixed: 80, variable: 10, savings: 10 } };
  });

  // New entry form state
  const [form, setForm] = useState({
    date: todayYYYYMMDD(),
    type: "expense",
    group: "fixed",
    category: DEFAULT_CATEGORIES[0].key,
    incomeCategoryText: "",
    description: "",
    amount: "",
  });

  // ======= Persistence =======
  useEffect(() => localStorage.setItem("budget.entries", JSON.stringify(entries)), [entries]);
  useEffect(() => localStorage.setItem("budget.month", month), [month]);
  useEffect(() => localStorage.setItem("budget.categories", JSON.stringify(categories)), [categories]);
  useEffect(() => localStorage.setItem("budget.settings", JSON.stringify(settings)), [settings]);

  // ======= Derived data (for selected month) =======
  const monthEntries = useMemo(
    () =>
      entries
        .filter((e) => ymKey(e.date) === month)
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [entries, month]
  );

  const totals = useMemo(() => {
    const exp = monthEntries.filter((e) => e.type === "expense").reduce((a, b) => a + b.amount, 0);
    const inc = monthEntries.filter((e) => e.type === "income").reduce((a, b) => a + b.amount, 0);
    const fixed = monthEntries.filter((e) => e.type === "expense" && e.group === "fixed").reduce((a, b) => a + b.amount, 0);
    const variable = monthEntries.filter((e) => e.type === "expense" && e.group === "variable").reduce((a, b) => a + b.amount, 0);
    return { exp, inc, net: inc - exp, fixed, variable };
  }, [monthEntries]);

  const byCategory = useMemo(() => {
    const map = new Map();
    categories.forEach((c) => map.set(c.key, 0));
    monthEntries
      .filter((e) => e.type === "expense")
      .forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    return Array.from(map.entries()).map(([key, value]) => ({
      key,
      value,
      label: categories.find((c) => c.key === key)?.label || key,
    }));
  }, [monthEntries, categories]);

  // ======= Budget model =======
  const model = settings.model || { fixed: 80, variable: 10, savings: 10 };
  const modelTotal = (Number(model.fixed) || 0) + (Number(model.variable) || 0) + (Number(model.savings) || 0);
  const modelValid = modelTotal === 100 && [model.fixed, model.variable, model.savings].every((x) => x >= 0);

  const desiredIncome = useMemo(() => {
    const f = Math.max(0.0001, Number(model.fixed || 0) / 100);
    const v = Math.max(0.0001, Number(model.variable || 0) / 100);
    const totalPct = Math.max(0.0001, f + v);
    const need1 = totals.fixed > 0 ? totals.fixed / f : 0;
    const need2 = totals.variable > 0 ? totals.variable / v : 0;
    const need3 = totals.exp > 0 ? totals.exp / totalPct : 0;
    return Math.max(need1, need2, need3);
  }, [totals.fixed, totals.variable, totals.exp, model.fixed, model.variable, model.savings]);

  // ======= Limits status =======
  const limitStatus = useMemo(() => {
    return byCategory.map((c) => {
      const limit = Number(settings.limits?.[c.key] ?? 0) || 0;
      const used = c.value;
      const ratio = limit > 0 ? used / limit : 0;
      let color = pastel.accent;
      if (limit > 0 && ratio >= 0.8 && ratio < 1) color = pastel.accent2;
      if (limit > 0 && ratio >= 1) color = pastel.danger;
      return { ...c, limit, used, ratio, color };
    });
  }, [byCategory, settings.limits]);

  // ======= Charts =======
  const pieRef = useRef(null);
  const barRef = useRef(null);
  const pieInstance = useRef(null);
  const barInstance = useRef(null);

  useEffect(() => {
    // Pie: by category
    const labels = byCategory.map((x) => x.label);
    const data = byCategory.map((x) => x.value);
    if (pieInstance.current) pieInstance.current.destroy();
    pieInstance.current = new Chart(pieRef.current, {
      type: "pie",
      data: {
        labels,
        datasets: [{ data, backgroundColor: [pastel.accent, pastel.accent2, pastel.accent3, pastel.primary, "#e9d5ff", "#bae6fd", "#fde68a", "#fecaca"] }],
      },
      options: { plugins: { legend: { position: "bottom" } } },
    });

    // Bar: per day
    const expenses = monthEntries.filter((e) => e.type === "expense");
    const byDay = new Map();
    expenses.forEach((e) => byDay.set(e.date, (byDay.get(e.date) || 0) + e.amount));
    const labelsRaw = Array.from(byDay.keys()).sort();
    const labelsBar = labelsRaw.map((d) => dayMonthBG(d));
    const dataBar = labelsRaw.map((d) => byDay.get(d));

    if (barInstance.current) barInstance.current.destroy();
    barInstance.current = new Chart(barRef.current, {
      type: "bar",
      data: { labels: labelsBar, datasets: [{ label: "Разходи по дни", data: dataBar }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true } },
      },
    });

    return () => {
      if (pieInstance.current) pieInstance.current.destroy();
      if (barInstance.current) barInstance.current.destroy();
    };
  }, [byCategory, monthEntries]);

  // ======= Handlers =======
  function addEntry() {
    const amountNum = Number(String(form.amount).replace(",", "."));
    if (!form.description || !form.date || !isFinite(amountNum) || amountNum <= 0) return;
    const payload = { id: crypto.randomUUID(), date: form.date, type: form.type, description: form.description, amount: amountNum };
    if (form.type === "expense") {
      Object.assign(payload, { group: form.group, category: form.category });
    } else {
      Object.assign(payload, { category: form.incomeCategoryText?.trim() || "Приход" });
    }
    setEntries((e) => [payload, ...e]);
    setForm((f) => ({ ...f, description: "", amount: "", incomeCategoryText: "" }));
  }

  function deleteEntry(id) {
    setEntries((e) => e.filter((x) => x.id !== id));
  }

  function addCategory(label) {
    const key = label.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) return;
    if (categories.some((c) => c.key === key)) return;
    setCategories((prev) => [...prev, { key, label }]);
  }

  function exportCSV() {
    const rowsSrc = monthEntries;
    const headers = ["Дата", "Тип", "Група", "Категория", "Описание", "Сума (лв.)"];
    const SEP = ";";
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const lines = rowsSrc.map((e) => {
      const tip = e.type === "expense" ? "Разход" : "Приход";
      const group = e.type === "expense" ? (e.group === "fixed" ? "Фиксирани" : "Променливи") : "";
      const category = e.type === "expense" ? (categories.find((c) => c.key === e.category)?.label || e.category) : (e.category || "Приход");
      const amount = (Number(e.amount || 0).toFixed(2)).replace(".", ",");
      return [esc(dateBG(e.date)), esc(tip), esc(group), esc(category), esc(e.description || ""), esc(amount)].join(SEP);
    });

    const csv = "\uFEFF" + [headers.join(SEP)].concat(lines).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXLSX() {
    const rows = monthEntries.map((e) => {
      const tip = e.type === "expense" ? "Разход" : "Приход";
      const group = e.type === "expense" ? (e.group === "fixed" ? "Фиксирани" : "Променливи") : "";
      const category = e.type === "expense" ? (categories.find((c) => c.key === e.category)?.label || e.category) : (e.category || "Приход");
      return { Дата: dateBG(e.date), Тип: tip, Група: group, Категория: category, Описание: e.description || "", "Сума (лв.)": Number(e.amount).toFixed(2) };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Бюджет");
    XLSX.writeFile(wb, `budget_${month}.xlsx`);
  }

  function setLimit(catKey, value) {
    const v = Math.max(0, Number(String(value).replace(",", ".")) || 0);
    setSettings((s) => ({ ...s, limits: { ...(s.limits || {}), [catKey]: v } }));
  }

  function rowBgForCategory(catKey) {
    const lim = Number(settings.limits?.[catKey] || 0);
    if (!lim) return "";
    const used = byCategory.find((c) => c.key === catKey)?.value || 0;
    return used > lim ? "bg-rose-50" : "";
  }

  const monthLabel = monthBG(month);

  // ======= UI =======
  return (
    <div className="min-h-screen app-shell" style={{ background: pastel.bg, color: pastel.text }}>
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: pastel.primaryText }}>Моят Навигатор</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="text-sm">Месец:</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border px-3 py-2" style={{ background: pastel.card }} />
            <button onClick={exportCSV} className="flex items-center gap-2 rounded-xl px-3 py-2 border" style={{ background: pastel.card }}>
              <Download size={18} /> CSV
            </button>
            <button onClick={exportXLSX} className="flex items-center gap-2 rounded-xl px-3 py-2 border" style={{ background: pastel.card }}>
              <Download size={18} /> XLSX
            </button>
            {canInstall && (
              <button onClick={handleInstallClick} className="flex items-center gap-2 rounded-xl px-3 py-2 border" style={{ background: pastel.card }} title="Инсталирай като приложение">
                📲 Инсталирай
              </button>
            )}
          </div>
        </header>

        {updateReady && (
          <div
            className="mb-3 sm:mb-4 rounded-xl border px-3 py-2 flex items-center justify-between"
            style={{ background: "#fff", borderColor: "#e7e5e4" }}
          >
            <span className="text-sm">Има нова версия на приложението.</span>
            <button
              onClick={applyUpdateNow}
              className="rounded-lg px-3 py-1 text-sm font-medium border"
              style={{ background: "#fafaf9" }}
            >
              Обнови
            </button>
          </div>
        )}

        {/* Add Entry Card */}
        <section className="grid grid-cols-1 md-grid-cols-3 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
          <div className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
            <h2 className="font-semibold mb-3 flex items-center gap-2"><PlusCircle size={18}/>Ново движение</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="col-span-2">
                <label className="text-xs">Дата</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded-xl px-3 py-2" />
              </div>
              <div>
                <label className="text-xs">Тип</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full border rounded-xl px-3 py-2">
                  <option value="expense">Разход</option>
                  <option value="income">Приход</option>
                </select>
              </div>
              {form.type === "expense" ? (
                <>
                  <div>
                    <label className="text-xs">Група</label>
                    <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className="w-full border rounded-xl px-3 py-2">
                      <option value="fixed">Фиксирани</option>
                      <option value="variable">Променливи</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs">Категория (разход)</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded-xl px-3 py-2">
                      {categories.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <label className="text-xs">Категория (приход) — свободен текст</label>
                  <input value={form.incomeCategoryText} onChange={(e) => setForm({ ...form, incomeCategoryText: e.target.value })} placeholder="напр. Заплата, Хонорар, Продажба" className="w-full border rounded-xl px-3 py-2" />
                </div>
              )}
              <div className="col-span-2">
                <label className="text-xs">Описание</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="напр. храна, наем, заплата" className="w-full border rounded-xl px-3 py-2" />
              </div>
              <div className="col-span-2">
                <label className="text-xs">Сума (лв.)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2"
                />
              </div>
            </div>
            <button onClick={addEntry} className="w-full rounded-xl px-4 py-2 font-medium" style={{ background: pastel.primary, color: pastel.primaryText }}>Запиши</button>

            <div className="mt-4">
              <details>
                <summary className="text-sm cursor-pointer">Добави своя категория (за разходи)</summary>
                <AddCategory onAdd={(label) => addCategory(label)} />
              </details>
            </div>
          </div>

          {/* Summary Card */}
          <div className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
            <h2 className="font-semibold mb-3 flex items-center gap-2"><PieIcon size={18}/>Обобщение ({monthLabel})</h2>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Приходи" value={`${fmt(totals.inc)} лв.`} chipColor={pastel.accent} />
              <Stat label="Разходи" value={`${fmt(totals.exp)} лв.`} chipColor={pastel.danger} />
              <Stat label="Нетен баланс" value={`${fmt(totals.net)} лв.`} chipColor={totals.net >= 0 ? pastel.primary : pastel.danger} />
              <div className="rounded-xl p-3 border" style={{ background: pastel.bg }}>
                <div className="text-xs" style={{ color: pastel.subtext }}>Фиксирани / Променливи</div>
                <div className="text-sm font-medium">{fmt(totals.fixed)} лв. / {fmt(totals.variable)} лв.</div>
              </div>
              <div className="col-span-2">
                <canvas ref={pieRef} height={180} />
              </div>
            </div>
          </div>

          {/* Budget Model */}
          <div className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
            <h2 className="font-semibold mb-3 flex items-center gap-2"><Target size={18}/>Модел за бюджет</h2>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <div>
                <label className="text-xs">Фиксирани %</label>
                <input type="number" min={0} max={100} value={model.fixed} onChange={(e) => setSettings((s) => ({ ...s, model: { ...(s.model || {}), fixed: Number(e.target.value) } }))} className="w-full border rounded-xl px-3 py-2" />
              </div>
              <div>
                <label className="text-xs">Променливи %</label>
                <input type="number" min={0} max={100} value={model.variable} onChange={(e) => setSettings((s) => ({ ...s, model: { ...(s.model || {}), variable: Number(e.target.value) } }))} className="w-full border rounded-xl px-3 py-2" />
              </div>
              <div>
                <label className="text-xs">Спестявания %</label>
                <input type="number" min={0} max={100} value={model.savings} onChange={(e) => setSettings((s) => ({ ...s, model: { ...(s.model || {}), savings: Number(e.target.value) } }))} className="w-full border rounded-xl px-3 py-2" />
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: pastel.subtext }}>Сборът трябва да е 100%. Пример: 80/10/10.</p>
            <div className="mt-2">
              <p className="text-sm" style={{ color: pastel.subtext }}>Желан доход (за {monthLabel}) според модела:</p>
              <p className="text-xl font-semibold" style={{ color: pastel.primaryText }}>
                {modelValid && isFinite(desiredIncome) ? `${fmt(desiredIncome)} лв.` : "— (коригирай процентите)"}
              </p>
              <p className="text-xs mt-1" style={{ color: pastel.subtext }}>
                Изчислява се така, че фиксираните, променливите и общите разходи да паснат в съответните проценти.
              </p>
            </div>

            <div className="mt-4">
              <details>
                <summary className="text-sm font-medium flex items-center gap-2"><AlertTriangle size={16}/> Лимити по категории</summary>
                <div className="mt-2 grid grid-cols-1 gap-2 max-h-48 overflow-auto pr-1">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{c.label}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          placeholder="0"
                          value={settings.limits?.[c.key] ?? ""}
                          onChange={(e) => setLimit(c.key, e.target.value)}
                          className="w-24 sm:w-28 border rounded-xl px-2 py-1"
                        />
                        <span className="text-xs" style={{ color: pastel.subtext }}>лв.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </section>

        {/* Two-up row: Limits status + Bar chart */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
          <div className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
            <h2 className="font-semibold mb-3">Състояние на лимитите ({monthLabel})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {limitStatus.map((s) => (
                <div key={s.key} className="rounded-lg p-2 border text-xs leading-tight" style={{ background: s.color }}>
                  <div className="font-medium truncate">{s.label}</div>
                  <div className="mt-0.5 opacity-90" style={{ color: pastel.primaryText }}>
                    {fmt(s.used)} / {s.limit ? fmt(s.limit) : "—"} лв. {s.limit ? `(${Math.min(999, Math.round(s.ratio * 100))}%)` : ""}
                  </div>
                </div>
              ))}
              {limitStatus.length === 0 && <p className="text-xs" style={{ color: pastel.subtext }}>Няма категории с разходи.</p>}
            </div>
            <p className="text-[10px] sm:text-xs mt-2" style={{ color: pastel.subtext }}>
              Под 80% — синьо; 80–100% — жълто; над 100% — розово.
            </p>
          </div>

          <div className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
            <h2 className="text-sm sm:text-base font-semibold mb-3 flex items-center gap-2"><BarChart2 size={18}/>Разпределение по дни</h2>
            <div className="relative h-48 sm:h-56 md:h-64">
              <canvas ref={barRef} className="absolute inset-0 w-full h-full" />
            </div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl shadow-sm border p-4" style={{ background: pastel.card }}>
          <h2 className="font-semibold mb-3">Движения ({monthLabel})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4">Тип</th>
                  <th className="py-2 pr-4">Група</th>
                  <th className="py-2 pr-4">Категория</th>
                  <th className="py-2 pr-4">Описание</th>
                  <th className="py-2 pr-4">Сума</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monthEntries.map((e) => (
                  <tr key={e.id} className={`border-b last:border-0 ${rowBgForCategory(e.category)}`}>
                    <td className="py-2 pr-4">{dateBG(e.date)}</td>
                    <td className="py-2 pr-4">{e.type === "expense" ? "Разход" : "Приход"}</td>
                    <td className="py-2 pr-4">{e.type === "expense" ? (e.group === "fixed" ? "Фиксирани" : "Променливи") : "—"}</td>
                    <td className="py-2 pr-4">{categories.find((c) => c.key === e.category)?.label || e.category}</td>
                    <td className="py-2 pr-4">{e.description}</td>
                    <td className="py-2 pr-4">{fmt(e.amount)} лв.</td>
                    <td className="py-2 pr-4 text-right">
                      <button onClick={() => deleteEntry(e.id)} title="Изтрий" className="rounded-lg px-2 py-1 border" style={{ background: "#fff" }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {monthEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center" style={{ color: pastel.subtext }}>Няма записи за този месец.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="text-center text-xs mt-6" style={{ color: pastel.subtext }}>
          Данните се пазят локално в твоя браузър. Изтрий кеша/локалните данни, ако искаш да започнеш начисто.
        </footer>
      </div>
    </div>
  );
}

// ======= Small UI bits =======
function Stat({ label, value, chipColor }) {
  return (
    <div className="rounded-xl p-3 border" style={{ background: pastel.bg }}>
      <div className="text-xs" style={{ color: pastel.subtext }}>{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full" style={{ background: chipColor }}>&nbsp;</span>
    </div>
  );
}

function AddCategory({ onAdd }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2 mt-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Име на категория" className="flex-1 border rounded-xl px-3 py-2" />
      <button onClick={() => { onAdd(val); setVal(""); }} className="rounded-xl px-3 py-2 border" style={{ background: pastel.accent }}>
        Добави
      </button>
    </div>
  );
}
