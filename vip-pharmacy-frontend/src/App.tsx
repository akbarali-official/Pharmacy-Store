import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import { AuthCtx, can } from './auth';
import { Toasts } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Medicines from './pages/Medicines';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Orders from './pages/Orders';
import Admin from './pages/Admin';
import Shop from './pages/Shop';

const ALL = ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY', 'ACCOUNTANT'];
const SELL = ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER'];
const STOCK = ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY'];
const BUY = ['OWNER', 'MANAGER', 'INVENTORY', 'ACCOUNTANT'];
const MONEY = ['OWNER', 'MANAGER', 'ACCOUNTANT'];

const NAV: [string, string, string[]][] = [
  ['/staff', 'Dashboard', ALL],
  ['/staff/pos', 'POS / Billing', SELL],
  ['/staff/sales', 'Sales & Returns', [...SELL, 'ACCOUNTANT']],
  ['/staff/medicines', 'Medicines', ALL],
  ['/staff/inventory', 'Inventory', ALL],
  ['/staff/purchases', 'Suppliers & Purchases', BUY],
  ['/staff/customers', 'Customers', [...SELL, 'ACCOUNTANT']],
  ['/staff/orders', 'Online Orders', SELL],
  ['/staff/finance', 'Cash & Expenses', [...SELL, 'ACCOUNTANT']],
  ['/staff/reports', 'Reports', MONEY],
  ['/staff/admin', 'Staff & Settings', ['OWNER', 'MANAGER']],
];

function Staff() {
  const [user, setUser] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});
  const [ready, setReady] = useState(false);

  const refreshSettings = () => api('/settings').then(setSettings).catch(() => {});
  const boot = async () => {
    if (!getToken()) return setReady(true);
    try { setUser(await api('/auth/me')); await refreshSettings(); } catch { setToken(null); }
    setReady(true);
  };
  useEffect(() => { boot(); }, []);

  if (!ready) return <p className="muted" style={{ padding: 20 }}>Load ho raha hai…</p>;
  if (!user) return <Login onLogin={async (t: string, u: any) => { setToken(t); setUser(u); await refreshSettings(); }} />;

  const logout = () => { setToken(null); setUser(null); };
  const guard = (roles: string[], el: JSX.Element) => (can(user, roles) ? el : <p className="err">Aap ko is page ki ijazat nahi.</p>);

  return (
    <AuthCtx.Provider value={{ user, settings, logout, refreshSettings }}>
      <div className="layout">
        <nav className="side" aria-label="Main menu">
          <div className="brand">{settings.storeName || 'VIP Pharmacy POS'}</div>
          {NAV.filter(([, , roles]) => can(user, roles)).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/staff'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
          ))}
          <div style={{ marginTop: 'auto', padding: '.6rem' }}>
            <div style={{ fontSize: '.85rem' }}>{user.name}<br /><span style={{ opacity: .7 }}>{user.role}</span></div>
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={logout}>Logout</button>
          </div>
        </nav>
        <main className="main">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="pos" element={guard(SELL, <POS />)} />
            <Route path="sales" element={guard([...SELL, 'ACCOUNTANT'], <Sales />)} />
            <Route path="medicines" element={<Medicines />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="purchases" element={guard(BUY, <Purchases />)} />
            <Route path="customers" element={guard([...SELL, 'ACCOUNTANT'], <Customers />)} />
            <Route path="orders" element={guard(SELL, <Orders />)} />
            <Route path="finance" element={guard([...SELL, 'ACCOUNTANT'], <Finance />)} />
            <Route path="reports" element={guard(MONEY, <Reports />)} />
            <Route path="admin" element={guard(['OWNER', 'MANAGER'], <Admin />)} />
            <Route path="*" element={<Navigate to="/staff" />} />
          </Routes>
        </main>
      </div>
    </AuthCtx.Provider>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/staff/*" element={<Staff />} />
        <Route path="/*" element={<Shop />} />
      </Routes>
      <Toasts />
    </>
  );
}
