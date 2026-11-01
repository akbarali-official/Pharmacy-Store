import { createContext, useContext } from 'react';
export type Ctx = { user: any; settings: any; logout: () => void; refreshSettings: () => void };
export const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);
export const can = (user: any, roles: string[]) => !!user && roles.includes(user.role);
