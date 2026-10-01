import React from "react";
import { Link } from "react-router-dom";

export default function AuthLayout({ icon: Icon, logo = "/logo.png", title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logo ? (
            <Link
              to="/"
              className="inline-block group mb-4 transition-transform hover:scale-105 active:scale-95"
              title="Return to Sourced Nexus Storefront"
            >
              <div className="relative w-20 h-20 mx-auto rounded-full bg-[#f6f4ee] border-2 border-[#C5A059]/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex items-center justify-center overflow-hidden p-0">
                <img
                  src={typeof logo === "string" ? logo : "/logo.png"}
                  alt="Sourced Nexus"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            </Link>
          ) : Icon ? (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4 shadow-sm">
              <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-display">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <div className="text-center text-sm text-muted-foreground mt-6">{footer}</div>
        )}
      </div>
    </div>
  );
}

