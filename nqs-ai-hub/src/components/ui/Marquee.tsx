type MarqueeProps = {
  items: ReadonlyArray<string>;
};

/**
 * Marquee horizontal infinito (clases `.marquee` / `.marquee-track`
 * definidas en `components.css`). Server Component: solo renderiza markup,
 * la animación es 100% CSS.
 *
 * Duplicamos los items para que el loop sea visualmente continuo
 * cuando `transform: translateX(-50%)` llega al final del primer set.
 */
export function Marquee({ items }: MarqueeProps) {
  const doubled = [...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export default Marquee;
