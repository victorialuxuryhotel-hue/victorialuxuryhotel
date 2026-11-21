/**
 * Clerk's sign-in, invitation and account components, styled to match the
 * management app (navy and gold on ivory). Our pages provide the headings,
 * so Clerk's own card header and chrome are hidden.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#0b1f4b",
    colorText: "#1c1f26",
    colorTextSecondary: "#5b6170",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorDanger: "#b42318",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-sans-base), system-ui, sans-serif",
    fontSize: "0.95rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none border-0",
    card: "w-full shadow-none border-0 p-0 bg-transparent",
    header: "hidden",
    footer: "bg-transparent [&>div:first-child]:hidden",
    formButtonPrimary: "h-11 text-sm font-medium normal-case",
    formFieldInput: "h-11",
    socialButtons: "hidden",
    dividerRow: "hidden",
  },
} as const;
