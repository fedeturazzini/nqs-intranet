/**
 * Catálogo de tutoriales (S18) — replicado del diseño del cliente
 * (screens.jsx · TUTORIALS).
 *
 * Los HTML viven en `public/tutorials/`. El iframe los sirve estáticos.
 */
export type Tutorial = {
  id: string;
  name: string;
  /** Ruta al HTML estático (servido desde /public). */
  file: string;
  lead: string;
  tools: string[];
  duration: string;
  updated: string;
  color: string;
  glyph: string;
  /** Thumbnail opcional (cuando se carguen los assets de imágenes). */
  image?: string;
};

export const TUTORIALS: Tutorial[] = [
  {
    id: "weavy",
    name: "Weavy end-to-end",
    file: "/tutorials/how-weavy.html",
    lead: "Anatomía de un grafo: del moodboard al render final.",
    tools: ["Weavy"],
    duration: "22 min",
    updated: "hace 2 días",
    color: "#9B7EFF",
    glyph: "◇",
    image: "/tutorials/img/weavy.jpg",
  },
  {
    id: "reframes",
    name: "Reframes",
    file: "/tutorials/how-reframes.html",
    lead: "Reencuadrar y extender material existente sin perder la toma.",
    tools: ["Runway", "Weavy"],
    duration: "11 min",
    updated: "hace 5 días",
    color: "#FF6B9D",
    glyph: "⊞",
    image: "/tutorials/img/reframes.jpg",
  },
  {
    id: "in-motion",
    name: "In Motion",
    file: "/tutorials/how-in-motion.html",
    lead: "Imagen a video — cómo dirigir movimiento sin que se sienta AI.",
    tools: ["Kling", "Runway", "Highsfield"],
    duration: "14 min",
    updated: "hace 6 días",
    color: "#5BC0EB",
    glyph: "▷",
    image: "/tutorials/img/in-motion.jpg",
  },
  {
    id: "ground-up",
    name: "Ground Up",
    file: "/tutorials/how-ground-up.html",
    lead: "Crear un proyecto desde cero — del brief al primer corte.",
    tools: ["Claude", "Weavy", "Kling"],
    duration: "12 min",
    updated: "hace 3 días",
    color: "#D97757",
    glyph: "▤",
    image: "/tutorials/img/ground-up.jpg",
  },
  {
    id: "mock-up",
    name: "Mock Up",
    file: "/tutorials/how-mock-up.html",
    lead: "Mocks de producto y packaging fotorrealistas.",
    tools: ["Weavy", "Claude"],
    duration: "9 min",
    updated: "hace 12 días",
    color: "#9B7EFF",
    glyph: "▣",
    image: "/tutorials/img/mock-up.jpg",
  },
  {
    id: "maquette",
    name: "Maquette",
    file: "/tutorials/how-maquette.html",
    lead: "Mockups arquitectónicos: del 3D base al render hi-fi.",
    tools: ["3DSky", "Weavy", "Runway"],
    duration: "18 min",
    updated: "hace 9 días",
    color: "#4FD1C5",
    glyph: "◈",
    image: "/tutorials/img/maquette.jpg",
  },
];

export function getTutorial(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
