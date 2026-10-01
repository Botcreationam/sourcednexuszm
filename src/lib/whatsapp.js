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
    ? "✨ *NEW PRE-ORDER REQUEST — SOURCED NEXUS*"
    : "✨ *NEW PRODUCT INQUIRY & QUOTE REQUEST — SOURCED NEXUS*";

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
      item.selectedSize ? `• Selected Size: ${item.selectedSize}` : null,
      item.selectedColor ? `• Selected Color: ${item.selectedColor}` : null,
      item.specifications ? `• Notes/Specs: ${item.specifications}` : null,
      item.image ? `• Exact Product Image Link:\n  ${item.image}` : "• Image: None provided",
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