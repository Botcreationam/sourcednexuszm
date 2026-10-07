/**
 * Splits text into words that rise in one after another.
 * Screen readers get the full sentence once (aria-label), not word by word.
 * `lines` is an array of strings; each becomes its own line.
 * `underline` optionally names a phrase (inside one line) that gets a single
 * continuous line drawn beneath it after the words have landed.
 */
export default function AnimatedHeadline({ lines, underline, className = "" }) {
  let n = 0;
  const label = lines.join(" ");

  const words = (text, key) =>
    text.split(" ").filter(Boolean).map((w, wi) => (
      <span key={`${key}-${wi}`}>
        <span className="sn-word" style={{ "--i": n++ }}>{w}</span>{" "}
      </span>
    ));

  return (
    <span className={className} role="text" aria-label={label}>
      {lines.map((line, li) => {
        const at = underline ? line.indexOf(underline) : -1;
        return (
          <span key={li} className="block" aria-hidden="true">
            {at < 0 ? words(line, `l${li}`) : (
              <>
                {words(line.slice(0, at), `a${li}`)}
                <span className="sn-underline">{words(underline, `u${li}`)}</span>
                {words(line.slice(at + underline.length), `b${li}`)}
              </>
            )}
          </span>
        );
      })}
    </span>
  );
}
