import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { Spinner, Alert, Modal, Field, inr } from "../components/ui";

export default function Members() {
  const [tab, setTab] = useState("units");
  const [units, setUnits] = useState(null);
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(null);
  const [edit, setEdit] = useState(null);

  function refresh() {
    api.get("/units").then((r) => setUnits(r.data.units)).catch((e) => setError(errMsg(e)));
    api.get("/members").then((r) => setMembers(r.data.members)).catch((e) => setError(errMsg(e)));
  }
  useEffect(refresh, []);

  if (error) return <Alert msg={error} />;
  if (!units || !members) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Members & Units</h1>
          <p className="text-sm text-slate-500">{units.length} units · {members.length} members</p>
        </div>
        <button className="btn-primary" onClick={() => { setEdit(null); setShowModal(tab === "units" ? "unit" : "member"); }}>
          Add {tab === "units" ? "Unit" : "Member"}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-200 rounded-lg p-1 w-fit">
        {["units", "members"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? "bg-white shadow" : "text-slate-500"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "units" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Floor</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Maintenance</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4">Occupants</th>
                <th className="py-2 pr-4">Members</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{u.unitNo}</td>
                  <td className="py-3 pr-4 text-slate-500">Floor {u.floor}</td>
                  <td className="py-3 pr-4 text-slate-500">{u.bhk || "1BHK"}</td>
                  <td className="py-3 pr-4">
                    {u.amountOverride ? (
                      <span className="text-emerald-600 font-medium">{inr(u.amountOverride)} <span className="text-[10px] text-slate-400 font-normal">(custom)</span></span>
                    ) : (
                      <span className="text-slate-500">Auto ({u.bhk === "2BHK" ? "1729" : "1200"})</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">{u.ownerName}</td>
                  <td className="py-3 pr-4 text-slate-500">{u.occupants}</td>
                  <td className="py-3 pr-4">
                    {u.members.length === 0 && <span className="text-xs text-slate-400">No app user</span>}
                    {u.members.map((m) => (
                      <span key={m.id} className="badge bg-brand-50 text-brand-700 mr-1">
                        {m.name} {m.isOwner ? "(owner)" : ""}
                      </span>
                    ))}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button className="text-brand-600 text-xs font-medium hover:underline" onClick={() => { setEdit(u); setShowModal("unit"); }}>Edit</button>
                      <button className="text-red-600 text-xs font-medium hover:underline" onClick={() => removeUnit(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Unit</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{m.name}</td>
                  <td className="py-3 pr-4">{m.phone}</td>
                  <td className="py-3 pr-4 text-slate-500">{m.email || "—"}</td>
                  <td className="py-3 pr-4">{m.unit ? `Unit ${m.unit.unitNo}` : "—"}</td>
                  <td className="py-3">{m.isOwner ? <span className="badge bg-emerald-100 text-emerald-700">Owner</span> : <span className="badge bg-slate-100 text-slate-600">Member</span>}</td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button className="text-brand-600 text-xs font-medium hover:underline" onClick={() => { setEdit(m); setShowModal("member"); }}>Edit</button>
                      <button className="text-red-600 text-xs font-medium hover:underline" onClick={() => removeMember(m)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal === "unit" && <UnitForm unit={edit} onClose={() => { setShowModal(null); setEdit(null); }} onDone={() => { setShowModal(null); setEdit(null); refresh(); }} />}
      {showModal === "member" && <MemberForm member={edit} units={units} onClose={() => { setShowModal(null); setEdit(null); }} onDone={() => { setShowModal(null); setEdit(null); refresh(); }} />}
    </div>
  );

  async function removeUnit(u) {
    if (!confirm(`Delete Unit ${u.unitNo} and all its bills? This cannot be undone.`)) return;
    try {
      await api.delete(`/units/${u.id}`);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function removeMember(m) {
    if (!confirm(`Delete member ${m.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/members/${m.id}`);
      refresh();
    } catch (e) {
      setError(errMsg(e));
    }
  }
}

function UnitForm({ unit, onClose, onDone }) {
  const [form, setForm] = useState(
    unit
      ? { unitNo: unit.unitNo, floor: String(unit.floor), bhk: unit.bhk || "1BHK", amountOverride: unit.amountOverride || "", ownerName: unit.ownerName, occupants: String(unit.occupants) }
      : { unitNo: "", floor: "1", bhk: "1BHK", amountOverride: "", ownerName: "", occupants: "1" }
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      floor: Number(form.floor),
      occupants: Number(form.occupants),
      amountOverride: form.amountOverride ? Number(form.amountOverride) : null,
    };
    try {
      if (unit) await api.put(`/units/${unit.id}`, payload);
      else await api.post("/units", payload);
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={unit ? `Edit Unit ${unit.unitNo}` : "Add Unit"}>
      <form onSubmit={submit}>
        <Alert msg={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit No"><input className="input" value={form.unitNo} onChange={set("unitNo")} placeholder="101" required /></Field>
          <Field label="Floor"><input className="input" type="number" value={form.floor} onChange={set("floor")} required /></Field>
          <Field label="Type">
            <select className="input" value={form.bhk} onChange={set("bhk")}>
              {["1BHK", "2BHK", "3BHK"].map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Maintenance (Rs.)">
            <input className="input" type="number" min="0" step="0.01" value={form.amountOverride} onChange={set("amountOverride")} placeholder="auto from type" />
          </Field>
          <Field label="Occupants"><input className="input" type="number" value={form.occupants} onChange={set("occupants")} /></Field>
        </div>
        <Field label="Owner Name"><input className="input" value={form.ownerName} onChange={set("ownerName")} required /></Field>
        <p className="text-xs text-slate-400 mb-3">
          Leave Maintenance blank to use the automatic amount (1 BHK = Rs.1200, 2 BHK = Rs.1729).
          Changes update all unpaid bills for this unit immediately.
        </p>
        <button className="btn-primary w-full mt-2" disabled={busy}>{busy ? "Saving..." : unit ? "Save Changes" : "Add Unit"}</button>
      </form>
    </Modal>
  );
}

function MemberForm({ member, units, onClose, onDone }) {
  const [form, setForm] = useState(
    member
      ? { name: member.name, phone: member.phone, email: member.email || "", password: "", unitId: member.unitId || units[0]?.id || "", isOwner: !!member.isOwner }
      : { name: "", phone: "", email: "", password: "", unitId: units[0]?.id || "", isOwner: true }
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { ...form, unitId: Number(form.unitId) };
    try {
      if (member) await api.put(`/members/${member.id}`, payload);
      else await api.post("/members", payload);
      onDone();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={member ? `Edit Member - ${member.name}` : "Add Member"}>
      <form onSubmit={submit}>
        <Alert msg={error} />
        <Field label="Full Name"><input className="input" value={form.name} onChange={set("name")} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={set("phone")} required /></Field>
          <Field label="Unit"><select className="input" value={form.unitId} onChange={set("unitId")}>{units.map((u) => <option key={u.id} value={u.id}>{u.unitNo}</option>)}</select></Field>
        </div>
        <Field label="Email (optional)"><input className="input" type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label={member ? "New Password (blank = keep current)" : "Login Password (min 6 chars)"}>
          <input className="input" type="text" value={form.password} onChange={set("password")} required={!member} />
        </Field>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={form.isOwner} onChange={(e) => setForm({ ...form, isOwner: e.target.checked })} />
          Is flat owner
        </label>
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving..." : member ? "Save Changes" : "Add Member"}</button>
      </form>
    </Modal>
  );
}
