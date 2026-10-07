import { useEffect, useRef, useState } from "react";

/**
 * A thin line behind the three "How it works" icon tiles that draws itself
 * left to right when the section scrolls into view. Desktop only; hidden on
 * mobile where the steps stack vertically.
 */
export default function StepConnector() {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "-120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="hidden md:block absolute left-[16.6%] right-[16.6%] top-7 h-px"
    >
      <div className={`sn-connector h-px w-full bg-border ${on ? "is-in" : ""}`} />
    </div>
  );
}
