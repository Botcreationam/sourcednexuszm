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