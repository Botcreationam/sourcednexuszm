import { useState, useEffect } from "react";
import { X, Send, MessageCircle, CheckCircle2, Shield, AlertCircle, ShoppingBag, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { submitCustomerInquiry } from "@/lib/supabase";
import { buildWhatsAppUrl, buildCartInquiryWhatsAppMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import { toast } from "@/components/ui/use-toast";
import { formatKwachaPrice } from "@/lib/utils";

export default function InquiryModal({ open, onClose, items = [] }) {
  const { user, isAuthenticated } = useAuth();
  const { clearCart } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [inquiryType, setInquiryType] = useState("quote_request"); // 'quote_request' | 'preorder'
  const [preferredContact, setPreferredContact] = useState("whatsapp");
  const [specifications, setSpecifications] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [localItems, setLocalItems] = useState([]);

  useEffect(() => {
    setLocalItems(Array.isArray(items) && items.length > 0 ? items : []);
  }, [items]);

  const parsePrice = (priceStr) => {
    if (!priceStr) return 0;
    const num = parseFloat(priceStr.toString().replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);

  // Prefill user details if logged in
  useEffect(() => {
    if (user) {
      const name = user.user_metadata?.full_name || (user.email ? user.email.split("@")[0] : "");
      if (name && !customerName) setCustomerName(name);
      if (user.email && !email) setEmail(user.email);
    }
  }, [user]);

  if (!open) return null;

  const activeItems = Array.isArray(items) && items.length > 0 ? items : [];

  const handleWebSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast({ title: "Name Required", description: "Please enter your full name.", variant: "destructive" });
      return;
    }
    if (!contactNumber.trim() || contactNumber.trim().length < 6) {
      toast({ title: "Valid Contact Required", description: "Please enter your phone or WhatsApp number.", variant: "destructive" });
      return;
    }
    if (localItems.length === 0) {
      toast({ title: "Cart Empty", description: "Please add at least one product to your inquiry.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const inquiryPayload = {
        inquiry_type: inquiryType,
        customer_name: customerName,
        contact_number: contactNumber,
        email: email || user?.email || null,
        items: localItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category || "General",
          price: item.price || "Price on Request",
          image: item.image || (item.images?.[0] ?? null),
          quantity: item.quantity || 1,
          selectedSize: item.selectedSize || null,
          selectedColor: item.selectedColor || null,
          selectedGrade: item.selectedGrade || null,
          specifications: item.specifications || "",
        })),
        total_items: localItems.reduce((acc, i) => acc + (i.quantity || 1), 0),
        estimated_total: localItems.reduce((acc, i) => acc + (parsePrice(i.price) * (i.quantity || 1)), 0),
        preferred_contact: preferredContact,
        specifications,
        additional_instructions: additionalInstructions,
        source: "website",
      };

      const result = await submitCustomerInquiry(inquiryPayload, user);
      setSubmittedData({ ...inquiryPayload, referenceId: result?.id || "SN-" + Date.now().toString(36).toUpperCase() });
      toast({
        title: "Inquiry Sent Successfully",
        description: "Our concierge team has received your request and will contact you shortly with pricing.",
      });
      // Clear cart once order is confirmed
      clearCart();
    } catch (err) {
      console.error("Inquiry submission error:", err);
      toast({
        title: "Submission Error",
        description: err.message || "Could not submit your inquiry online. You can send it directly via WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppSubmit = () => {
    if (!customerName.trim()) {
      toast({ title: "Name Required", description: "Please enter your name for the WhatsApp message.", variant: "destructive" });
      return;
    }
    if (localItems.length === 0) {
      toast({ title: "Cart Empty", description: "Please select products before inquiring.", variant: "destructive" });
      return;
    }

    const message = buildCartInquiryWhatsAppMessage({
      items: localItems,
      customerName,
      contactNumber,
      email,
      inquiryType,
      additionalInstructions,
      specifications,
    });

    // Optionally also record inquiry in background
    try {
      submitCustomerInquiry({
        inquiry_type: inquiryType,
        customer_name: customerName,
        contact_number: contactNumber || "WhatsApp",
        email: email || null,
        items: localItems,
        total_items: localItems.reduce((acc, i) => acc + (i.quantity || 1), 0),
        estimated_total: localItems.reduce((acc, i) => acc + (parsePrice(i.price) * (i.quantity || 1)), 0),
        preferred_contact: preferredContact,
        specifications,
        additional_instructions: additionalInstructions,
        source: "whatsapp",
      }, user).catch(() => {});
    } catch {}

    const url = buildWhatsAppUrl(message);
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const handleClose = () => {
    setSubmittedData(null);
    onClose();
  };

  const handleQuantityChange = (idx, delta) => {
    setLocalItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return { ...item, quantity: Math.max(1, (item.quantity || 1) + delta) };
      }
      return item;
    }));
  };

  const totalEstimatedCost = localItems.reduce((acc, i) => acc + (parsePrice(i.price) * (i.quantity || 1)), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 text-foreground shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <span className="text-[9px] tracking-luxe uppercase text-[#C5A059] font-medium">Concierge Sourcing</span>
            <h2 className="font-display text-2xl tracking-wide mt-0.5">
              {submittedData ? "Inquiry Confirmed" : "Request a Quote"}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-sm hover:bg-zinc-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {submittedData ? (
            /* Success confirmation screen */
            <div className="text-center py-6 space-y-5 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <h3 className="font-display text-2xl text-white">Thank You, {submittedData.customer_name}!</h3>
                <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
                  Your product inquiry has been submitted. Our concierge sourcing team in Lusaka will review the exact items requested and contact you via WhatsApp / phone with full pricing and delivery details.
                </p>
                {submittedData.referenceId && (
                  <p className="text-[11px] tracking-wide-2 uppercase text-zinc-500 mt-3">
                    Reference ID: <span className="font-mono text-zinc-300">{submittedData.referenceId}</span>
                  </p>
                )}
              </div>

              {/* Items summary */}
              <div className="border border-zinc-800/80 bg-zinc-900/30 p-4 text-left space-y-3">
                <p className="text-[10px] tracking-wide-2 uppercase text-zinc-400 font-semibold">Requested Items ({submittedData.items?.length})</p>
                <div className="space-y-2">
                  {submittedData.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-600">NO IMG</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{item.name}</p>
                        <p className="text-[10px] text-zinc-400">
                          Qty: {item.quantity || 1} {item.selectedGrade ? `• Grade: ${item.selectedGrade.name}` : ""} {item.selectedSize ? `• Size: ${item.selectedSize}` : ""} {item.selectedColor ? `• Color: ${item.selectedColor}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instant WhatsApp followup option */}
              <div className="pt-2">
                <p className="text-xs text-zinc-400 mb-3">Want an instant response? You can also message us directly on WhatsApp:</p>
                <button
                  type="button"
                  onClick={() => {
                    const msg = buildCartInquiryWhatsAppMessage(submittedData);
                    window.open(buildWhatsAppUrl(msg), "_blank", "noopener,noreferrer");
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-[#1f7a4c] hover:bg-[#165c39] text-white text-[11px] tracking-wide-2 uppercase py-3 px-6 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" /> Message Concierge on WhatsApp
                </button>
              </div>

              <div className="pt-3">
                <button
                  onClick={handleClose}
                  className="text-xs tracking-wide-2 uppercase text-zinc-400 hover:text-white underline"
                >
                  Return to Store
                </button>
              </div>
            </div>
          ) : (
            /* Inquiry Form */
            <form onSubmit={handleWebSubmit} className="space-y-5">
              {/* Selected Items Strip */}
              <div className="border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] tracking-wide-2 uppercase text-zinc-400 font-medium">
                    Products in Inquiry ({localItems.length})
                  </span>
                  <span className="text-[9px] tracking-luxe uppercase text-[#C5A059]">Estimated Total: {totalEstimatedCost > 0 ? formatKwachaPrice(totalEstimatedCost) : "Price on Request"}</span>
                </div>

                <div className="divide-y divide-zinc-850 max-h-40 overflow-y-auto pr-1">
                  {localItems.map((item, idx) => (
                    <div key={item.itemKey || idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3">
                      <div className="w-12 h-12 bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-600">NO IMG</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate font-medium">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-zinc-400">
                          <div className="flex items-center border border-zinc-700 bg-zinc-800">
                            <button type="button" onClick={() => handleQuantityChange(idx, -1)} className="px-2 py-0.5 hover:bg-zinc-700 text-white">-</button>
                            <span className="px-2 font-mono">{item.quantity || 1}</span>
                            <button type="button" onClick={() => handleQuantityChange(idx, 1)} className="px-2 py-0.5 hover:bg-zinc-700 text-white">+</button>
                          </div>
                          {item.selectedGrade && <span className="bg-zinc-800 px-1.5 py-0.2 rounded-none">Grade: {item.selectedGrade.name}</span>}
                          {item.selectedSize && <span className="bg-zinc-800 px-1.5 py-0.2 rounded-none">Size: {item.selectedSize}</span>}
                          {item.selectedColor && <span className="bg-zinc-800 px-1.5 py-0.2 rounded-none">Color: {item.selectedColor}</span>}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-[#C5A059] flex-shrink-0 font-medium">
                        {formatKwachaPrice(parsePrice(item.price) * (item.quantity || 1))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Inquiry Type Radio */}
              <div>
                <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-2">Request Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2 p-3 border cursor-pointer transition-colors text-xs uppercase tracking-wide-2 ${
                      inquiryType === "quote_request"
                        ? "border-[#C5A059] bg-[#C5A059]/10 text-white"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="inquiryType"
                      value="quote_request"
                      checked={inquiryType === "quote_request"}
                      onChange={() => setInquiryType("quote_request")}
                      className="accent-[#C5A059]"
                    />
                    <span>Product Inquiry / Quote</span>
                  </label>
                  <label
                    className={`flex items-center gap-2 p-3 border cursor-pointer transition-colors text-xs uppercase tracking-wide-2 ${
                      inquiryType === "preorder"
                        ? "border-[#C5A059] bg-[#C5A059]/10 text-white"
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="inquiryType"
                      value="preorder"
                      checked={inquiryType === "preorder"}
                      onChange={() => setInquiryType("preorder")}
                      className="accent-[#C5A059]"
                    />
                    <span>Custom Pre-Order</span>
                  </label>
                </div>
              </div>

              {/* Customer Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                    Your Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Chileshe Mulenga"
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#C5A059] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                    Phone / WhatsApp Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="e.g. 097... or +260..."
                    className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#C5A059] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                  Email Address <span className="text-zinc-500">(Optional for receipt & tracking)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#C5A059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                  Preferred Contact Method
                </label>
                <select
                  value={preferredContact}
                  onChange={(e) => setPreferredContact(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-xs text-white focus:border-[#C5A059] outline-none appearance-none"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone Call</option>
                </select>
              </div>

              {/* Specifications & Notes */}
              <div>
                <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                  Specific Sizes, Colours or Specifications
                </label>
                <input
                  type="text"
                  value={specifications}
                  onChange={(e) => setSpecifications(e.target.value)}
                  placeholder="e.g. Size 42 European, Gold hardware, Black leather"
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-[#C5A059] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-wide-2 uppercase text-zinc-400 mb-1.5">
                  Additional Instructions / Delivery Area
                </label>
                <textarea
                  rows={2}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="e.g. Delivery needed in Woodlands Lusaka by Friday, or gift packaging requested."
                  className="w-full bg-zinc-900 border border-zinc-800 p-3 text-xs text-white placeholder-zinc-500 focus:border-[#C5A059] outline-none resize-none"
                />
              </div>

              {/* Dual Action Buttons */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Submit Online */}
                  <button
                    type="submit"
                    disabled={submitting || localItems.length === 0}
                    className="w-full bg-[#C5A059] hover:bg-[#b08e4d] disabled:opacity-50 text-black py-3.5 px-4 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submitting ? "Sending Inquiry..." : "Send Inquiry"}
                  </button>

                  {/* Option 2: WhatsApp Direct */}
                  <button
                    type="button"
                    onClick={handleWhatsAppSubmit}
                    disabled={submitting || localItems.length === 0}
                    className="w-full bg-[#1f7a4c] hover:bg-[#165c39] disabled:opacity-50 text-white py-3.5 px-4 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Send via WhatsApp
                  </button>
                </div>

                <p className="text-[10px] text-center text-zinc-500 flex items-center justify-center gap-1.5 pt-1">
                  <Shield className="w-3 h-3 text-[#C5A059]" />
                  Exact product images and references are preserved. No automated charge or payment card required.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
