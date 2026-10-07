export const WHATSAPP_NUMBER = "260573575734";
export const WHATSAPP_DISPLAY = "0573575734";
export const WHATSAPP_TEL = "+260573575734";

export function buildWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function productInquiryMessage(productName) {
  return `Hello Sourced Nexus, I am interested in ${productName}. Please send me more information.`;
}

export function photoSourcingMessage() {
  return "Hello Sourced Nexus, I saw an outfit I love and would like you to source it for me. I'll send the photo now.";
}

export function generalInquiryMessage() {
  return "Hello Sourced Nexus, I'd like to make an enquiry.";
}

export function buildCartInquiryWhatsAppMessage({
  items = [],
  customerName = "",
  contactNumber = "",
  email = "",
  inquiryType = "quote_request",
  additionalInstructions = "",
  specifications = "",
} = {}) {
  const isPreorder = inquiryType === "preorder";
  const header = isPreorder
    ? "*NEW PRE-ORDER REQUEST | SOURCED NEXUS*"
    : "*NEW PRODUCT INQUIRY & QUOTE REQUEST | SOURCED NEXUS*";

  const customerSection = [
    "*Customer Details:*",
    `• Name: ${customerName || "Customer"}`,
    `• Contact: ${contactNumber || "N/A"}`,
    email ? `• Email: ${email}` : null,
    `• Request Type: ${isPreorder ? "Pre-order" : "Product Inquiry / Price on Request"}`,
  ].filter(Boolean).join("\n");

  const itemsSection = items.map((item, idx) => {
    const parts = [
      `*Item ${idx + 1}: ${item.name}*`,
      `• Product ID: ${item.id || "N/A"}`,
      `• Quantity: ${item.quantity || 1}`,
      item.category ? `• Category: ${item.category}` : null,
      item.selectedGrade ? `• Selected Grade: ${item.selectedGrade.name} (Price: ${item.selectedGrade.price})` : null,
      item.selectedSize ? `• Selected Size: ${item.selectedSize}` : null,
      item.selectedColor ? `• Selected Color: ${item.selectedColor}` : null,
      item.specifications ? `• Notes/Specs: ${item.specifications}` : null,
      item.image ? `• Exact Product Image Link:\n  ${item.image}` : "• Image: None provided",
      `• Estimated Total: ${item.price ? (parseFloat(item.price.replace(/[^0-9.]/g, '')) * (item.quantity || 1)).toLocaleString() + " (based on selected price)" : "Price on Request"}`
    ].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");

  const notesSection = [
    specifications ? `*General Specifications:*\n${specifications}` : null,
    additionalInstructions ? `*Customer Instructions / Delivery Area:*\n${additionalInstructions}` : null,
  ].filter(Boolean).join("\n\n");

  const footer = "Please review this request and provide pricing, delivery timelines, and availability.";

  return [header, customerSection, "*Selected Products:*", itemsSection, notesSection, footer]
    .filter(Boolean)
    .join("\n\n");
}

export function preorderNotificationMessage(data) {
  const lines = [
    "Hello Sourced Nexus, I just submitted a pre-order request:",
    `Name: ${data.customer_name}`,
    data.category && `Category: ${data.category}`,
    data.size && `Size: ${data.size}`,
    data.color && `Color / Preference: ${data.color}`,
    data.phone && `Phone: ${data.phone}`,
    data.whatsapp && `WhatsApp: ${data.whatsapp}`,
    data.message && `Message: ${data.message}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Message a customer sends AFTER a confirmed payment so the team can track the
 * product. Built only from the server-confirmed order (never the live cart).
 */
export function paidOrderWhatsAppMessage({
  orderNumber = "",
  reference = "",
  total = null,
  items = [],
  customerName = "",
} = {}) {
  const money = (n) =>
    `K${Number(n || 0).toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const sizeDetail = (x) => {
    const std = x.sizingStandard ?? x.sizing_standard;
    const ver = x.sizeVerified ?? x.size_verified;
    return x.size ? [`Size: ${x.size}`, std && `Sizing standard: ${std}`, ver && "Size verification: Confirmed"].filter(Boolean) : [];
  };
  const lines = items.flatMap((i, idx) => {
    const unit = i.unitPrice ?? i.unit_price;
    const lineTotal = i.lineTotal ?? i.line_total;
    const isBundle = i.isBundle ?? i.is_bundle;
    const opts = isBundle ? "" : [i.grade, i.color].filter(Boolean).join(", ");
    const head = `${idx + 1}. ${isBundle ? "[BUNDLE] " : ""}${i.name}${opts ? ` (${opts})` : ""}\n   ${i.quantity} x ${money(unit)} = ${money(lineTotal)}`;
    const extra = isBundle
      ? ["   Includes:", ...(i.components || []).map((c) => `   - ${c.quantity} x ${c.name}${sizeDetail(c).length ? ` (${sizeDetail(c).join(" | ")})` : ""}`)]
      : sizeDetail(i).map((l) => `   ${l}`);
    return [[head, ...extra].join("\n")];
  });
  return [
    "*PAID ORDER | SOURCED NEXUS*",
    "Hello Sourced Nexus, I have completed my payment. Please track my order.",
    customerName ? `Name: ${customerName}` : null,
    `Order: #${orderNumber || "N/A"}`,
    reference ? `Payment reference: ${reference}` : null,
    "",
    "*Products:*",
    ...lines,
    "",
    total != null ? `*Total paid: ${money(total)}*` : null,
  ].filter((l) => l !== null).join("\n");
}
