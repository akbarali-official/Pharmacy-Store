import { useState } from 'react';
import { api } from '../api';
import { can, useAuth } from '../auth';
import { Field, run, State, Tabs, useLoad, dt, Modal } from '../ui';

export default function Admin() {
  const { user } = useAuth();
  const owner = can(user, ['OWNER']);
  const [tab, setTab] = useState('users');
  return (
    <>
      <h1>Staff & Settings</h1>
      <Tabs value={tab} onChange={setTab} tabs={owner ? [['users', 'Staff'], ['settings', 'Dukaan settings'], ['audit', 'Audit log'], ['pw', 'Mera password']] : [['users', 'Staff'], ['pw', 'Mera password']]} />
      {tab === 'users' && <Users owner={owner} />}
      {tab === 'settings' && owner && <Settings />}
      {tab === 'audit' && owner && <Audit />}
      {tab === 'pw' && <Password />}
    </>
  );
}

function Users({ owner }: { owner: boolean }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api('/users'));
  const [f, setF] = useState<any>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const create = async (e: any) => { e.preventDefault(); if (await run(() => api('/users', { method: 'POST', body: f }), 'Staff add ho gaya')) { setF(null); reload(); } };
  const patch = async (id: number, body: any, msg: string) => { if (await run(() => api('/users/' + id, { method: 'PATCH', body }), msg)) reload(); };
  return (
    <>
      {owner && <button className="btn" onClick={() => setF({ name: '', email: '', password: '', role: 'CASHIER' })}>+ Naya staff</button>}
      <State loading={loading} error={error} />
      {data && <div className="scroll mt"><table className="tbl"><thead><tr><th>Naam</th><th>Email</th><th>Role</th><th>Aakhri login</th><th></th></tr></thead><tbody>
        {data.map((u: any) => <tr key={u.id}><td>{u.name} {!u.active && <span className="tag red">band</span>}</td><td>{u.email}</td><td>{u.role}</td><td>{dt(u.lastLoginAt)}</td>
          <td className="right">{owner && u.id !== user.id && <>
            <button className="btn sm sec" onClick={() => patch(u.id, { active: !u.active }, u.active ? 'Account band' : 'Account chalu')}>{u.active ? 'Band karein' : 'Chalu karein'}</button>{' '}
            <button className="btn sm ghost" onClick={() => { const p = prompt('Naya password (kam az kam 8 characters):'); if (p) patch(u.id, { password: p }, 'Password badal diya'); }}>Reset password</button></>}</td></tr>)}
      </tbody></table></div>}
      {f && <Modal title="Naya staff" onClose={() => setF(null)}><form onSubmit={create}>
        <Field label="Naam"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required /></Field>
        <Field label="Password (kam az kam 8)"><input type="password" minLength={8} value={f.password} onChange={set('password')} required autoComplete="new-password" /></Field>
        <Field label="Role"><select value={f.role} onChange={set('role')}>{['MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY', 'ACCOUNTANT', 'OWNER'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <button className="btn">Add karein</button></form></Modal>}
    </>
  );
}

function Settings() {
  const { refreshSettings } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api('/settings'));
  const [f, setF] = useState<any>(null);
  const cur = f || data;
  const set = (k: string) => (e: any) => setF({ ...cur, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value });
  const text: [string, string][] = [['storeName', 'Dukaan ka naam'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'], ['currency', 'Currency label'], ['timezone', 'Timezone (Asia/Karachi)'], ['receiptHeader', 'Receipt header'], ['receiptFooter', 'Receipt footer / return policy'], ['nearExpiryDays', 'Jald expire alert (din)'], ['returnApprovalLimit', 'Is raqam se zyada refund par manager chahiye'], ['deliveryFee', 'Delivery charges'], ['minOrder', 'Online minimum order'], ['storeNotice', 'Online store notice']];
  return (
    <>
      <State loading={loading} error={error} />
      {cur && (
        <form className="card" style={{ maxWidth: 640 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/settings', { method: 'PUT', body: cur }), 'Settings save ho gayi')) { setF(null); reload(); refreshSettings(); } }}>
          {text.map(([k, l]) => <Field key={k} label={l}><input value={cur[k] ?? ''} onChange={set(k)} /></Field>)}
          <label className="row"><input type="checkbox" checked={cur.storeEnabled === 'true'} onChange={set('storeEnabled')} /> <b>Online store chalu karein</b></label>
          <p className="muted">Pakistan mein online dawai farokht ke liye qanooni licence/ijazat zaroori ho sakti hai. Isay sirf tab chalu karein jab aap ne apni drug authority/wakeel se tasdeeq kar li ho. Prescription (Rx) wali dawaiyan online kabhi nahi dikhti.</p>
          <button className="btn">Save</button>
        </form>
      )}
    </>
  );
}

function Audit() {
  const { data, loading, error } = useLoad(() => api('/audit'));
  return (
    <>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Waqt</th><th>User#</th><th>Action</th><th>Cheez</th><th>Tafseel</th></tr></thead><tbody>
        {data.map((a: any) => <tr key={a.id}><td>{dt(a.createdAt)}</td><td>{a.userId ?? '-'}</td><td>{a.action}</td><td>{a.entity} {a.entityId}</td><td className="muted">{a.meta ? JSON.stringify(a.meta) : ''}</td></tr>)}
      </tbody></table></div>}
    </>
  );
}

function Password() {
  const [o, setO] = useState('');
  const [n, setN] = useState('');
  return (
    <form className="card" style={{ maxWidth: 420 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/auth/change-password', { method: 'POST', body: { oldPassword: o, newPassword: n } }), 'Password badal gaya')) { setO(''); setN(''); } }}>
      <Field label="Purana password"><input type="password" value={o} onChange={(e) => setO(e.target.value)} required autoComplete="current-password" /></Field>
      <Field label="Naya password (kam az kam 8)"><input type="password" minLength={8} value={n} onChange={(e) => setN(e.target.value)} required autoComplete="new-password" /></Field>
      <button className="btn">Badlein</button>
    </form>
  );
}
