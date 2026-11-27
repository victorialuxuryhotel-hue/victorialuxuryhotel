"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StaffRole } from "@/domain/status";

const StaffRoleContext = createContext<StaffRole | undefined>(undefined);

/** The signed-in staff member's role, for client components that word things for it (screen help). */
export function StaffRoleProvider({ role, children }: { role: StaffRole; children: ReactNode }) {
  return <StaffRoleContext.Provider value={role}>{children}</StaffRoleContext.Provider>;
}

export const useStaffRole = () => useContext(StaffRoleContext);
