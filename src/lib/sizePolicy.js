// Browser entry for the size policy. The rules live in ONE shared file used by
// the server too (lib/size-policy.mjs), so the page and the server can never
// disagree about which products need size verification.
export * from "../../lib/size-policy.mjs";
