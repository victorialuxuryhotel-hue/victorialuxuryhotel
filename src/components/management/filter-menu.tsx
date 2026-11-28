"use client";

import { useRef, useState } from "react";
import { Menu, MenuItem, MenuSeparator, menuItemClass } from "@/components/ui/menu";
import { cn } from "@/lib/utils/cn";

/**
 * A filter that takes several choices at once (design D2, the booking status filter): ticking keeps the menu
 * open; the list updates when the menu closes. The choices travel comma-separated in one query param
 * ("status=confirmed,checked_in") so the address can be shared; the server checks each one.
 */
export function FilterMultiMenu({ name, label, values, options }: { name: string; label: string; values: string[]; options: Array<[string, string]> }) {
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string[]>(values);
  const initial = values.join(",");
  const toggle = (v: string) => setChosen((c) => (c.includes(v) ? c.filter((x) => x !== v) : options.map(([o]) => o).filter((o) => o === v || c.includes(o))));
  const apply = (next: string[]) => {
    if (!input.current) return;
    input.current.value = next.join(",");
    if (input.current.value !== initial) input.current.form?.requestSubmit();
  };
  const names = options.filter(([v]) => chosen.includes(v)).map(([, l]) => l);
  const summary = names.length === 0 ? `Any ${label.toLowerCase()}` : names.length === 1 ? names[0]! : `${names[0]} +${names.length - 1}`;
  return (
    <>
      <input ref={input} type="hidden" name={name} defaultValue={initial} />
      <Menu
        label={`${label}: ${names.length ? names.join(", ") : "any"}`}
        onClose={() => apply(chosen)}
        button={
          <>
            <span className="truncate">{summary}</span>
            <span aria-hidden className="text-[#5b6372]">▾</span>
          </>
        }
        buttonClassName="flex h-11 w-full items-center justify-between gap-2.5 rounded-lg border border-[#bdb7a8] bg-white px-3 text-sm text-ink-900 hover:border-ink-900/45 md:h-10 md:w-44"
      >
        {options.map(([v, l]) => {
          const on = chosen.includes(v);
          return (
            <button
              key={v}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => toggle(v)}
              className={cn(menuItemClass, on ? "bg-[#e8eefb] text-navy-800 hover:bg-[#dfe7f9]" : "text-ink-900")}
            >
              <span aria-hidden className={cn("inline-block w-4", on ? "" : "invisible")}>✓</span>
              {l}
            </button>
          );
        })}
        <MenuSeparator />
        <MenuItem onSelect={() => setChosen([])}>Clear</MenuItem>
      </Menu>
    </>
  );
}

/**
 * A list filter as a dropdown (design D2): "Any status ▾" opens the choices with a tick on the chosen one and
 * Clear. Choosing one submits the surrounding search form, so the list updates straight away.
 */
export function FilterMenu({ name, label, value, options }: { name: string; label: string; value?: string; options: Array<[string, string]> }) {
  const input = useRef<HTMLInputElement>(null);
  const current = options.find(([v]) => v === value);
  const choose = (next: string) => {
    if (!input.current) return;
    input.current.value = next;
    input.current.form?.requestSubmit();
  };
  return (
    <>
      <input ref={input} type="hidden" name={name} defaultValue={value ?? ""} />
      <Menu
        label={`${label}: ${current ? current[1] : "any"}`}
        button={
          <>
            <span className="truncate">{current ? current[1] : `Any ${label.toLowerCase()}`}</span>
            <span aria-hidden className="text-[#5b6372]">▾</span>
          </>
        }
        buttonClassName="flex h-11 w-full items-center justify-between gap-2.5 rounded-lg border border-[#bdb7a8] bg-white px-3 text-sm text-ink-900 hover:border-ink-900/45 md:h-10 md:w-40"
      >
        {options.map(([v, l]) => (
          <MenuItem key={v} selected={v === value} onSelect={() => choose(v)}>{l}</MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => choose("")}>Clear</MenuItem>
      </Menu>
    </>
  );
}
