import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Top-level error boundary.
 *
 * Ensures a rendering crash in any component can never leave visitors on a
 * blank screen: the site degrades to a professional error panel with a Reload
 * action instead. Errors are logged to the console (and any attached logging)
 * for debugging.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Keep technical detail available for debugging; never rendered raw to users.
    console.error("Application error:", error, errorInfo?.componentStack);
  }

  handleReload = () => {
    // Full reload clears the broken render state completely.
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5">
        <div className="max-w-md w-full text-center py-16">
          <div className="mx-auto w-14 h-14 rounded-full border border-border flex items-center justify-center mb-6">
            <AlertTriangle className="w-6 h-6 text-[#C5A059]" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl tracking-wide uppercase mb-3">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            We hit an unexpected problem while loading this page. Your data is
            safe — reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Reload Page
          </button>
        </div>
      </div>
    );
  }
}
