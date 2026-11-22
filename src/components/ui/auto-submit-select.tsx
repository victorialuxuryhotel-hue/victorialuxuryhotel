"use client";

import type { SelectHTMLAttributes } from "react";
import { Select } from "./form";

/** A select that submits its GET form as soon as the choice changes (filters). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
