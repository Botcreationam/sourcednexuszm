import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, CloudUpload, X, ArrowRight, ShieldCheck } from "lucide-react";
import { buildWhatsAppUrl, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import { useAuth } from "@/lib/AuthContext";

export default function PhotoChoiceModal({ open, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  if (!open) return null;

  const handleWebSubmit = () => {
    onClose();
    if (!isAuthenticated) {
      navigate("/pre-order?authPrompt=true");
    } else {
      navigate("/pre-order");
    }
  };

  const handleWhatsApp = () => {
    onClose();
    window.open(buildWhatsAppUrl(photoSourcingMessage()), "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-background border border-border p-6 md:p-8 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <p className="text-[10px] tracking-luxe uppercase text-muted-foreground">Sourcing On Request</p>
          <h2 className="font-display text-2xl md:text-3xl mt-1">How Would You Like to Send Your Photo?</h2>
          <p className="mt-2 text-xs text-muted-foreground font-light max-w-sm mx-auto">
            Choose the method that works best for you. Both options connect directly to our Lusaka curation team.
          </p>
        </div>

        <div className="space-y-4">
          {/* OPTION 1: WhatsApp Direct */}
          <div
            onClick={handleWhatsApp}
            className="group relative cursor-pointer border border-border p-5 hover:border-foreground/80 hover:bg-muted/40 transition-all duration-200 flex items-start gap-4"
          >
            <div className="w-12 h-12 rounded-full border border-border bg-background flex items-center justify-center shrink-0 group-hover:bg-[#1f7a4c] group-hover:text-white group-hover:border-[#1f7a4c] transition-colors">
              <MessageSquare className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-medium">Send via WhatsApp</h3>
                <span className="text-[9px] uppercase tracking-wide-2 text-[#1f7a4c] font-semibold bg-[#1f7a4c]/10 px-2 py-0.5 rounded">
                  Fastest
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-light mt-1">
                Chat live with our Lusaka specialist on <strong>{WHATSAPP_DISPLAY}</strong>. Send photos, screenshots, or links directly in chat.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wide-2 text-foreground font-medium group-hover:translate-x-0.5 transition-transform">
                Open WhatsApp Chat <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* OPTION 2: Web Submission to Admin Panel */}
          <div
            onClick={handleWebSubmit}
            className="group relative cursor-pointer border border-border p-5 hover:border-foreground/80 hover:bg-muted/40 transition-all duration-200 flex items-start gap-4"
          >
            <div className="w-12 h-12 rounded-full border border-border bg-background flex items-center justify-center shrink-0 group-hover:bg-foreground group-hover:text-background group-hover:border-foreground transition-colors">
              <CloudUpload className="w-5 h-5" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-medium">Submit on Website</h3>
                <span className="text-[9px] uppercase tracking-wide-2 text-muted-foreground bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Secure
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-light mt-1">
                Upload your picture and specifications into our secure admin portal. Review your order status in your account.
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wide-2 text-foreground font-medium group-hover:translate-x-0.5 transition-transform">
                Submit Online Request <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">
            Delivery across Lusaka & Zambia in 7–14 working days
          </p>
        </div>
      </div>
    </div>
  );
}
