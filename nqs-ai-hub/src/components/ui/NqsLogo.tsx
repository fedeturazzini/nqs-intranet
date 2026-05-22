import type { CSSProperties } from "react";

type NqsLogoVariant = "icon" | "wide";

type NqsLogoProps = {
  size?: number;
  variant?: NqsLogoVariant;
  alt?: string;
};

const LOGO_SRC = "/assets/nqs-logo.gif";

/**
 * Logo NQS oficial (gif animado).
 * - `variant="icon"`  → contenedor 1.9× ancho (topbar / nav).
 * - `variant="wide"`  → ancho automático respetando aspect ratio (login hero).
 *
 * El gif viene blanco sobre transparente; los filtros en `components.css`
 * lo invierten automáticamente en `[data-theme="light"]`.
 */
export function NqsLogo({
  size = 28,
  variant = "icon",
  alt = "NQS",
}: NqsLogoProps) {
  const imgStyle: CSSProperties = {
    height: size,
    width: "auto",
    display: "block",
  };

  if (variant === "wide") {
    const wrapperStyle: CSSProperties = {
      display: "inline-block",
      height: size,
    };
    return (
      <span
        className="nqs-logo nqs-logo-wide"
        aria-label={alt}
        style={wrapperStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt={alt} style={imgStyle} />
      </span>
    );
  }

  const wrapperStyle: CSSProperties = {
    width: size * 1.9,
    height: size,
    display: "inline-block",
    overflow: "visible",
  };
  return (
    <span className="nqs-logo" aria-label={alt} style={wrapperStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOGO_SRC} alt={alt} style={imgStyle} />
    </span>
  );
}

export default NqsLogo;
