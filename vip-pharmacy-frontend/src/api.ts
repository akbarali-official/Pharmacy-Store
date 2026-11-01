const BASE: string = (import.meta as any).env.VITE_API_URL || 'http://localhost:4000/api/v1';
export const getToken = () => localStorage.getItem('vip_token');
export const setToken = (t: string | null) => (t ? localStorage.setItem('vip_token', t) : localStorage.removeItem('vip_token'));

export async function api(path: string, opt: { method?: string; body?: any } = {}): Promise<any> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opt.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
    });
  } catch {
    throw new Error('Server se rabta nahi ho raha. Backend chal raha hai?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/auth/')) {
    setToken(null);
    location.href = '/staff';
  }
  if (!res.ok) throw new Error(data.error || 'Request nakam ho gayi');
  return data;
}

export async function download(path: string, filename: string) {
  const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) throw new Error('Download nakam');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const qs = (o: Record<string, any>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null) as any).toString();
