import { useEffect, useRef, useState } from "react";

/**
 * Lightweight scroll-reveal wrapper.
 *
 * Replaces a framer-motion implementation (~110KB in the bundle) with a
 * small IntersectionObserver + CSS transition that preserves the same
 * fade-up-on-scroll behaviour. This keeps the site usable on slow mobile
 * connections, which previously had to download the animation library
 * before any storefront content could appear.
 */
export default function ScrollReveal({ children, delay = 0, y = 28, className, once = true }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      // Very old browsers: just show the content, no animation.
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) io.disconnect();
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      // Matches the previous framer-motion viewport margin.
      { rootMargin: "-80px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [once]);

  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : `translateY(${y}px)`,
        transition: `opacity 0.8s ${easing} ${delay}s, transform 0.8s ${easing} ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
