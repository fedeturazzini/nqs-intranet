-- ============================================================
-- NQS AI Hub — Migration 0011
-- Habilitar Kling como tool activa con créditos (clon de 3DSky).
--
-- La fila 'kling' YA existe (seed de 0001) pero con is_active=FALSE y
-- uses_credits=FALSE (figuraba como "próximamente" en el hub). Acá la
-- activamos y le prendemos el sistema de créditos (mismo mecanismo genérico
-- que 3DSky: credit_allocations + consume_credit_atomic, keyed por tool_id).
--
-- No se inserta nada nuevo ni se crean tablas. El embed_url queda NULL: la
-- URL del iframe la fija el adapter (igual que 3DSky).
-- ============================================================
UPDATE tools
SET is_active    = TRUE,
    uses_credits = TRUE,
    description  = 'Generación de video AI con dirección de cámara y arte.'
WHERE id = 'kling';
