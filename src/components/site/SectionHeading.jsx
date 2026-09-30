import ScrollReveal from "./ScrollReveal";

export default function SectionHeading({ eyebrow, title, subtitle, align = "center", light = false }) {
  const alignment = align === "left" ? "items-start text-left" : "items-center text-center";
  return (
    <ScrollReveal className={`flex flex-col ${alignment} gap-3`}>
      {eyebrow && (
        <span className={`text-[11px] tracking-luxe uppercase ${light ? "text-cream/70" : "text-muted-foreground"}`}>
          {eyebrow}
        </span>
      )}
      <h2 className={`font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] ${light ? "text-cream" : "text-foreground"}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`max-w-xl text-sm md:text-base font-light ${light ? "text-cream/70" : "text-muted-foreground"}`}>
          {subtitle}
        </p>
      )}
    </ScrollReveal>
  );
}