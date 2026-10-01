// The authorized administrator for Sourced Nexus admin panel.
export const ADMIN_EMAIL = "sourcednexus@gmail.com";
export const ADMIN_EMAILS = [
  "sourcednexus@gmail.com",
  "frankmwalu04@gmail.com",
];

export function isAuthorizedAdmin(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((admin) => admin.toLowerCase() === normalized);
}