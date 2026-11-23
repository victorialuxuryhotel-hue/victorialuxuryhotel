export const clerkAppearance = {
  variables: {
    colorPrimary: "#032684",
    colorText: "#171b24",
    colorTextSecondary: "#4b5260",
    colorBackground: "#fdfcf9",
    colorInputBackground: "transparent",
    colorDanger: "#b91c1c",
    borderRadius: "4px",
    fontFamily: "var(--font-sans-base), Lora, Georgia, serif",
    fontFamilyButtons: "var(--font-sans-base), Lora, Georgia, serif",
    fontSize: "15px",
  },
  elements: {
    rootBox: "w-full!",
    cardBox: "w-full! shadow-none! border-0! rounded-none!",
    card: "w-full! shadow-none! border-0! p-0! bg-transparent!",
    header: "hidden!",
    footer: "bg-transparent! [&>div:first-child]:hidden!",
    socialButtons: "hidden!",
    dividerRow: "hidden!",
    formFieldLabel: "text-[13px]! font-normal! text-ink-700!",
    formFieldInput: "h-11.5! shadow-none! border! border-hairline! bg-transparent!",
    formButtonPrimary:
      "h-12! normal-case! text-base! font-normal! shadow-none! bg-transparent! bg-none! border! border-navy-800! text-navy-800! hover:bg-navy-800/12! after:hidden!",
  },
} as const;
