"use client";

/**
 * Render de markdown para las respuestas de Claude (FEEDBACK Chule: el chat
 * mostraba el markdown crudo, con `**`, `##`, etc. visibles).
 *
 * - `react-markdown` v10 + `remark-gfm` (tablas, checkboxes, ~tachado~) +
 *   `rehype-highlight` (highlight de código con highlight.js).
 * - NO renderiza HTML crudo (react-markdown lo escapa por default) → seguro
 *   contra inyección desde la respuesta del modelo.
 * - `react-markdown@10` ya no pasa la prop `inline` al componente `code`;
 *   distinguimos inline vs bloque por CSS (`.md-body code` vs
 *   `.md-body pre code`), así que no overrideamos `code`.
 * - Memoizado: en streaming el `content` cambia por cada chunk; los mensajes
 *   ya completos no se re-parsean.
 *
 * Los estilos `.md-body *` viven en `screens.css`.
 */
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Los artifacts (<function_calls>) se separan ANTES en ChatMessages
// (parse-artifacts.ts) y se renderizan como cards; acá llega solo texto.

type MarkdownRendererProps = Readonly<{ content: string }>;

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: MarkdownRendererProps) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Links siempre en pestaña nueva + rel seguro. Sacamos `node`
          // (lo pasa react-markdown) para no spreadearlo al DOM.
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
