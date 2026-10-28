/** The internal apps in this repo. The launcher shows the ones the current user has a role in. */
export const APPS = [
  { id: "kyc", name: "KYC Review Queue", href: "/kyc", description: "Review flagged identity checks: claim, approve, reject or request info." },
  { id: "refunds", name: "Refunds", href: "/refunds", description: "Approve or reject customer refund requests; finance marks approved refunds as paid." },
  { id: "flags", name: "Feature flags", href: "/flags", description: "Create flags and switch them on or off in staging and production." },
] as const;
