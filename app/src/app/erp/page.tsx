"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  COST_CENTERS,
  EXPERT_INVOICES,
  NEWHIRE_INVOICES,
  type Approval,
  type CostCenter,
  type Invoice,
} from "@/lib/erp-data";
import { postToParent, type ErpState, type ParentMessage } from "@/lib/erp-bridge";

function toState(inv: Invoice): ErpState {
  return {
    invoice: inv.id,
    amount: inv.amount,
    supplier: inv.supplier,
    cost_center: inv.costCenter,
    asset_number: inv.assetNumber,
    approval: inv.approval,
    status: inv.status,
    note: inv.note,
  };
}

const eur = (n: number) => n.toLocaleString("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function ErpInner() {
  const params = useSearchParams();
  const mode = params.get("mode") === "newhire" ? "newhire" : "expert";
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    (mode === "newhire" ? NEWHIRE_INVOICES : EXPERT_INVOICES).map((i) => ({ ...i })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mask, setMask] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pendingSave = useRef<ErpState | null>(null);

  const selected = useMemo(() => invoices.find((i) => i.id === selectedId) ?? null, [invoices, selectedId]);

  // Activity signals for the pause gate
  useEffect(() => {
    // The parent samples activity every 500 ms; posting more often than that is wasted.
    let lastPost = 0;
    const act = (kind: "key" | "mouse" | "scroll") => () => {
      const t = Date.now();
      if (kind !== "key" && t - lastPost < 250) return;
      lastPost = t;
      postToParent({ type: "erp:activity", kind });
    };
    const key = act("key");
    const mouse = act("mouse");
    const scroll = act("scroll");
    window.addEventListener("keydown", key);
    window.addEventListener("mousemove", mouse);
    window.addEventListener("mousedown", mouse);
    window.addEventListener("scroll", scroll, true);
    postToParent({ type: "erp:ready" });
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousemove", mouse);
      window.removeEventListener("mousedown", mouse);
      window.removeEventListener("scroll", scroll, true);
    };
  }, []);

  // Messages from the panel
  useEffect(() => {
    const onMsg = (e: MessageEvent<ParentMessage>) => {
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "privacy:mask") setMask(m.on);
      if (m.type === "tutor:block-save") {
        setBlocked(m.reason);
        pendingSave.current = null;
      }
      if (m.type === "tutor:allow-save") {
        setBlocked(null);
        if (pendingSave.current) commitSave(pendingSave.current.invoice);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [invoices]);

  function update(id: string, patch: Partial<Invoice>, ev?: { field: string; from: string; to: string }) {
    setInvoices((list) => {
      const next = list.map((i) => (i.id === id ? { ...i, ...patch } : i));
      const inv = next.find((i) => i.id === id)!;
      if (ev) {
        postToParent({
          type: "erp:event",
          kind: "change",
          summary: `${inv.id}: ${ev.field} changed from "${ev.from}" to "${ev.to}"`,
          invoice: inv.id,
          field: ev.field,
          from: ev.from,
          to: ev.to,
          state: toState(inv),
        });
      }
      return next;
    });
  }

  function open(id: string) {
    setSelectedId(id);
    setBlocked(null);
    const inv = invoices.find((i) => i.id === id)!;
    postToParent({
      type: "erp:event",
      kind: "open",
      summary: `${inv.id} opened: ${inv.supplier}, ${eur(inv.amount)}, ${inv.description}`,
      invoice: inv.id,
      state: toState(inv),
    });
  }

  function commitSave(id: string) {
    setInvoices((list) => {
      if (list.find((i) => i.id === id)?.status === "approved") return list;
      const next = list.map((i) =>
        i.id === id ? { ...i, status: "approved" as const, history: [...i.history, `Approved and saved ${new Date().toISOString().slice(0, 16)}`] } : i,
      );
      const inv = next.find((i) => i.id === id)!;
      postToParent({
        type: "erp:event",
        kind: "save",
        summary: `${inv.id} approved and saved: cost center ${inv.costCenter}, asset ${inv.assetNumber || "none"}, approval ${inv.approval}`,
        invoice: inv.id,
        state: toState(inv),
      });
      return next;
    });
    setToast("Saved");
    setTimeout(() => setToast(null), 1500);
  }

  function save() {
    if (!selected) return;
    const st = toState(selected);
    if (mode === "newhire") {
      // Give the tutor a moment to step in before the save lands.
      pendingSave.current = st;
      postToParent({ type: "erp:save-attempt", state: st });
      setToast("Saving…");
      setTimeout(() => {
        if (pendingSave.current && pendingSave.current.invoice === st.invoice && !blocked) {
          pendingSave.current = null;
          commitSave(st.invoice);
        }
      }, 2500);
      return;
    }
    commitSave(selected.id);
  }

  function hold() {
    if (!selected) return;
    const inv = { ...selected, status: "held" as const, history: [...selected.history, "Put on hold"] };
    setInvoices((list) => list.map((i) => (i.id === inv.id ? inv : i)));
    postToParent({
      type: "erp:event",
      kind: "hold",
      summary: `${inv.id} put on hold${inv.note ? `: "${inv.note}"` : ""}`,
      invoice: inv.id,
      state: toState(inv),
    });
  }

  const pii = (s: string) => (mask ? <span className="rounded bg-zinc-300 text-transparent select-none">{s}</span> : s);

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-zinc-900 font-sans text-[13px]">
      <header className="flex items-center gap-4 bg-[#1f2a44] px-4 py-2 text-white">
        <span className="font-semibold tracking-wide">ERPlite · Accounts Payable</span>
        <span className="text-white/60">Invoice workbench</span>
        <span className="ml-auto text-white/60">
          {mode === "newhire" ? "User: Lena K. (AP trainee)" : "User: Sabine R. (AP lead)"} · Period 12/2026 · Close in 2 days
        </span>
      </header>
      <div className="grid grid-cols-[320px_1fr] gap-3 p-3">
        <aside className="rounded border border-zinc-300 bg-white">
          <div className="border-b border-zinc-200 px-3 py-2 font-medium">Open invoices ({invoices.filter((i) => i.status === "open").length})</div>
          <ul>
            {invoices.map((inv) => (
              <li key={inv.id}>
                <button
                  onClick={() => open(inv.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-3 py-2 text-left hover:bg-blue-50 ${selectedId === inv.id ? "bg-blue-100" : ""}`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-mono font-medium">{inv.id}</span>
                    <span className="font-medium">{eur(inv.amount)}</span>
                  </div>
                  <div className="flex w-full items-center justify-between text-zinc-600">
                    <span>{inv.supplier}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        inv.status === "open" ? "bg-amber-100 text-amber-800" : inv.status === "held" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="rounded border border-zinc-300 bg-white">
          {!selected ? (
            <div className="p-10 text-center text-zinc-500">Select an invoice to code and approve it.</div>
          ) : (
            <div className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold">
                    {selected.id} · {selected.supplier} <span className="ml-1 rounded bg-zinc-100 px-1.5 text-[11px] text-zinc-600">{selected.country}</span>
                  </h1>
                  <div className="text-zinc-600">{selected.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold">{eur(selected.amount)}</div>
                  <div className="text-zinc-500">
                    Invoice date {selected.date} · due {selected.dueDate}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <section className="rounded border border-zinc-200">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-medium">Supplier</div>
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1 px-3 py-2">
                    <dt className="text-zinc-500">Contact</dt>
                    <dd>{pii(selected.contact)}</dd>
                    <dt className="text-zinc-500">IBAN</dt>
                    <dd className="font-mono">{pii(selected.iban)}</dd>
                    <dt className="text-zinc-500">History</dt>
                    <dd>
                      {selected.history.map((h, i) => (
                        <div key={i}>{h}</div>
                      ))}
                    </dd>
                  </dl>
                </section>

                <section className="rounded border border-zinc-200">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-medium">Lines</div>
                  <table className="w-full">
                    <tbody>
                      {selected.lines.map((l, i) => (
                        <tr key={i} className="border-b border-zinc-100">
                          <td className="px-3 py-1.5">{l.text}</td>
                          <td className="px-3 py-1.5 text-right">{eur(l.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              <section className="mt-4 rounded border border-zinc-200">
                <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 font-medium">Coding and approval</div>
                <div className="grid grid-cols-3 gap-4 px-3 py-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-zinc-500">Cost center</span>
                    <select
                      data-field="cost_center"
                      className="rounded border border-zinc-300 px-2 py-1.5"
                      value={selected.costCenter}
                      disabled={selected.status !== "open"}
                      onChange={(e) => update(selected.id, { costCenter: e.target.value as CostCenter }, { field: "cost center", from: selected.costCenter, to: e.target.value })}
                    >
                      {Object.entries(COST_CENTERS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-zinc-500">Asset number</span>
                    <input
                      data-field="asset_number"
                      className="rounded border border-zinc-300 px-2 py-1.5 font-mono"
                      placeholder="e.g. AN-2026-0187"
                      value={selected.assetNumber}
                      disabled={selected.status !== "open"}
                      onChange={(e) => update(selected.id, { assetNumber: e.target.value })}
                      onBlur={(e) => {
                        if (e.target.value) postToParent({ type: "erp:event", kind: "change", summary: `${selected.id}: asset number set to ${e.target.value}`, invoice: selected.id, field: "asset number", from: "", to: e.target.value, state: toState({ ...selected, assetNumber: e.target.value }) });
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-zinc-500">Approval</span>
                    <select
                      data-field="approval"
                      className="rounded border border-zinc-300 px-2 py-1.5"
                      value={selected.approval}
                      disabled={selected.status !== "open"}
                      onChange={(e) => update(selected.id, { approval: e.target.value as Approval }, { field: "approval", from: selected.approval, to: e.target.value })}
                    >
                      <option value="standard">Standard (AP lead)</option>
                      <option value="second">Second approval (controller)</option>
                    </select>
                  </label>
                  <label className="col-span-3 flex flex-col gap-1">
                    <span className="text-zinc-500">Note</span>
                    <input
                      data-field="note"
                      className="rounded border border-zinc-300 px-2 py-1.5"
                      placeholder="Internal note"
                      value={selected.note}
                      disabled={selected.status !== "open"}
                      onChange={(e) => update(selected.id, { note: e.target.value })}
                    />
                  </label>
                </div>
                {blocked && (
                  <div className="mx-3 mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                    <span className="font-medium">Tutor paused this save.</span> {blocked}
                  </div>
                )}
                <div className="flex items-center gap-2 border-t border-zinc-200 px-3 py-2">
                  <button
                    data-action="save"
                    onClick={save}
                    disabled={selected.status !== "open"}
                    className="rounded bg-[#1f6feb] px-3 py-1.5 font-medium text-white disabled:opacity-40"
                  >
                    Approve &amp; save
                  </button>
                  <button data-action="hold" onClick={hold} disabled={selected.status !== "open"} className="rounded border border-zinc-300 px-3 py-1.5 disabled:opacity-40">
                    Hold
                  </button>
                  {toast && <span className="ml-2 text-emerald-700">{toast}</span>}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ErpPage() {
  return (
    <Suspense>
      <ErpInner />
    </Suspense>
  );
}
