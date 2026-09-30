import React from "react";

export default function BrandedLoader({ fullScreen = true, text = "Loading..." }) {
  const content = (
    <div className="flex flex-col items-center justify-center text-center select-none px-6">
      {/* Luxury Animated Logo Frame */}
      <div className="relative flex items-center justify-center w-24 h-24 mb-6">
        {/* Outer ambient glow */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#E5C378]/20 via-[#C5A059]/10 to-transparent blur-xl animate-pulse" />
        
        {/* Spinning gold orbit ring */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#E5C378] border-r-[#C5A059]/50 animate-spin [animation-duration:1.8s]" />
        
        {/* Inner subtle counter-spinning ring */}
        <div className="absolute inset-2 rounded-full border border-dashed border-[#E5C378]/30 animate-spin [animation-duration:6s] [animation-direction:reverse]" />

        {/* Central Logo Emblem - Strictly Round */}
        <div className="relative w-20 h-20 rounded-full bg-[#f6f4ee] border-2 border-[#C5A059]/60 shadow-[0_4px_24px_rgba(0,0,0,0.12)] flex items-center justify-center overflow-hidden p-0 backdrop-blur-md">
          {/* Shimmer light effect */}
          <div className="absolute inset-0 z-10 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite] pointer-events-none" />
          
          <img
            src="/logo.png"
            alt="Sourced Nexus"
            className="w-full h-full object-cover rounded-full"
          />
        </div>
      </div>

      {/* Brand Typography */}
      <div className="space-y-1">
        <h2 className="font-display text-2xl md:text-3xl tracking-[0.25em] text-foreground uppercase font-medium">
          SOURCED NEXUS
        </h2>
        <p className="text-[10px] md:text-[11px] tracking-[0.35em] text-foreground/50 uppercase">
          LUSAKA • ZAMBIA
        </p>
      </div>

      {/* Progress Line */}
      <div className="w-36 h-[2px] bg-zinc-800 rounded-full overflow-hidden mt-6 relative">
        <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-transparent via-[#E5C378] to-transparent w-20 animate-[loadingLine_1.6s_ease-in-out_infinite]" />
      </div>

      {/* Contextual Sub-text */}
      {text && (
        <p className="text-[11px] tracking-wide-2 text-foreground/60 uppercase mt-4 animate-pulse">
          {text}
        </p>
      )}

      {/* Inlined custom keyframes style to guarantee animations work everywhere */}
      <style>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes loadingLine {
          0% {
            left: -50%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl transition-opacity duration-300">
        {content}
      </div>
    );
  }

  return (
    <div className="py-20 flex items-center justify-center w-full">
      {content}
    </div>
  );
}
