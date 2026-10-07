import { useEffect } from "react";

/**
 * Thin progress bar at the very top that fills as the page is scrolled.
 * Writes a single CSS variable, so scrolling causes no React re-renders.
 */
export default function ScrollProgress() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = root.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      root.style.setProperty("--sn-progress", p.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.style.removeProperty("--sn-progress");
    };
  }, []);
  return <div className="sn-progress" aria-hidden="true" />;
}
