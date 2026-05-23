-- ============================================================
-- NQS AI Hub — Schema completo de DB
-- ============================================================
-- Pensado para todo el roadmap, no solo MVP.
-- Las tablas marcadas con [FUTURE] se crean ahora pero el MVP no las usa.
-- ============================================================

-- ============================================================
-- USERS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'employee');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  dept TEXT,
  job_title TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- TOOLS (catálogo de herramientas disponibles)
-- ============================================================

CREATE TYPE tool_category AS ENUM ('text', 'visual', 'video', 'audio', 'assets');

CREATE TABLE tools (
  id TEXT PRIMARY KEY,                    -- 'claude', '3dsky', etc.
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  category tool_category NOT NULL,
  description TEXT,
  color TEXT,                              -- hex color para UI
  glyph TEXT,                              -- símbolo Unicode para UI
  is_active BOOLEAN DEFAULT FALSE,         -- si está habilitado en el hub
  uses_credits BOOLEAN DEFAULT FALSE,      -- si funciona con sistema de créditos
  embed_url TEXT,                          -- URL del proxy (para tools tipo 3DSky)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed inicial (los 7 tools del diseño)
INSERT INTO tools (id, name, vendor, category, description, color, glyph, is_active, uses_credits) VALUES
  ('claude',     'Claude',     'Anthropic',    'text',   'Razonamiento, copywriting y código. Tu asistente para arrancar cualquier proyecto.', '#D97757', '✦', TRUE, FALSE),
  ('weavy',      'Weavy',      'Weavy.ai',     'visual', 'Workflows visuales encadenados sobre Stable Diffusion + ControlNet.',                '#9B7EFF', '◇', FALSE, FALSE),
  ('kling',      'Kling',      'Kuaishou',     'video',  'Generación de video AI con cámara y dirección de arte.',                              '#5BC0EB', '▷', FALSE, FALSE),
  ('runway',     'Runway',     'Runway ML',    'video',  'Edición y motion. Gen-4, frame interpolation, lip-sync.',                              '#7DFF8C', '▶', FALSE, FALSE),
  ('elevenlabs', 'ElevenLabs', 'ElevenLabs',   'audio',  'Síntesis de voz, doblaje y clonación.',                                                '#FFD93D', '◐', FALSE, FALSE),
  ('highsfield', 'Highsfield', 'Higgsfield',   'video',  'Movimientos de cámara cinematográficos sobre AI video.',                               '#FF6B9D', '▣', FALSE, FALSE),
  ('3dsky',      '3DSky',      '3dsky.org',    'assets', 'Modelos 3D para arq y producto. Acceso por créditos asignados.',                      '#4FD1C5', '◈', TRUE, TRUE);

-- ============================================================
-- TOOL ACCESS (qué usuario tiene acceso a qué tool)
-- ============================================================

CREATE TYPE access_status AS ENUM ('active', 'pending', 'locked', 'expired');

CREATE TABLE tool_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  status access_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,                  -- [FUTURE: módulo horarios]
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tool_id)
);

CREATE INDEX idx_tool_access_user ON tool_access(user_id);
CREATE INDEX idx_tool_access_tool ON tool_access(tool_id);

-- ============================================================
-- SYSTEM PROMPTS (el "cerebro" — y futuros cerebros)
-- ============================================================

CREATE TABLE system_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id TEXT NOT NULL REFERENCES tools(id),
  name TEXT NOT NULL,                      -- ej: "Brain principal Claude"
  content_encrypted TEXT NOT NULL,         -- contenido encriptado at-rest
  is_active BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_system_prompts_tool ON system_prompts(tool_id);
CREATE INDEX idx_system_prompts_active ON system_prompts(is_active) WHERE is_active = TRUE;

-- ============================================================
-- CLAUDE CONVERSATIONS Y MESSAGES
-- ============================================================

CREATE TABLE claude_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claude_conv_user ON claude_conversations(user_id);
CREATE INDEX idx_claude_conv_updated ON claude_conversations(updated_at DESC);

CREATE TYPE message_role AS ENUM ('user', 'assistant');

CREATE TABLE claude_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES claude_conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  images JSONB DEFAULT '[]'::jsonb,        -- array de URLs en Storage
  tokens_input INT,
  tokens_output INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claude_msg_conv ON claude_messages(conversation_id);

-- ============================================================
-- CREDIT POOLS (compras del admin para tools tipo 3DSky)
-- ============================================================

CREATE TABLE credit_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id TEXT NOT NULL REFERENCES tools(id),
  total_credits INT NOT NULL,              -- créditos comprados
  cost_usd NUMERIC(10, 2),                 -- costo de la compra
  purchased_by UUID REFERENCES users(id),
  purchase_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_pools_tool ON credit_pools(tool_id);

-- ============================================================
-- CREDIT ALLOCATIONS (asignación de créditos a usuarios)
-- ============================================================

CREATE TABLE credit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id),
  credits_assigned INT NOT NULL DEFAULT 0, -- cuánto se le asignó
  credits_used INT NOT NULL DEFAULT 0,     -- cuánto consumió
  reset_at TIMESTAMPTZ,                    -- reset mensual opcional
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tool_id)
);

CREATE INDEX idx_credit_alloc_user ON credit_allocations(user_id);

-- Vista útil: créditos disponibles por usuario
CREATE VIEW user_credits_view AS
SELECT 
  user_id,
  tool_id,
  credits_assigned,
  credits_used,
  (credits_assigned - credits_used) AS credits_available
FROM credit_allocations;

-- ============================================================
-- CREDIT TRANSACTIONS (historial de movimientos)
-- ============================================================

CREATE TYPE credit_tx_type AS ENUM ('allocation', 'consumption', 'refund', 'adjustment');

CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tool_id TEXT NOT NULL REFERENCES tools(id),
  type credit_tx_type NOT NULL,
  amount INT NOT NULL,                     -- positivo o negativo
  reason TEXT,                              -- ej "Descarga modelo X"
  performed_by UUID REFERENCES users(id), -- admin que asignó / o el mismo user que consumió
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_user ON credit_transactions(user_id);
CREATE INDEX idx_credit_tx_created ON credit_transactions(created_at DESC);

-- ============================================================
-- USAGE LOGS (log polimórfico)
-- ============================================================

CREATE TABLE usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tool_id TEXT REFERENCES tools(id),
  action TEXT NOT NULL,                    -- ej "claude.execute", "3dsky.download"
  metadata JSONB DEFAULT '{}'::jsonb,      -- contexto adicional
  tokens_consumed INT,                     -- para tools de IA
  credits_consumed INT,                    -- para tools con créditos
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_tool ON usage_logs(tool_id);
CREATE INDEX idx_usage_logs_action ON usage_logs(action);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at DESC);

-- ============================================================
-- [FUTURE] ACCESS REQUESTS — módulo aprobaciones
-- ============================================================

CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

CREATE TABLE access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tool_id TEXT NOT NULL REFERENCES tools(id),
  reason TEXT,
  duration_minutes INT,                    -- duración solicitada
  status request_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_access_req_user ON access_requests(user_id);
CREATE INDEX idx_access_req_status ON access_requests(status);

-- ============================================================
-- [FUTURE] TIME WINDOWS — módulo horarios
-- ============================================================

CREATE TABLE time_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = global
  tool_id TEXT REFERENCES tools(id),       -- NULL = todas las tools
  day_of_week INT,                          -- 0=domingo, 6=sábado, NULL=todos
  start_hour INT,                           -- 0-23
  end_hour INT,                             -- 0-23
  timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_windows_user ON time_windows(user_id);

-- ============================================================
-- [FUTURE] SECURITY EVENTS — módulo shield
-- ============================================================

CREATE TYPE security_severity AS ENUM ('low', 'med', 'high');

CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tool_id TEXT REFERENCES tools(id),
  rule_id TEXT NOT NULL,                   -- ej "SP-PROT-01", "IP-LEAK-04"
  severity security_severity NOT NULL,
  excerpt TEXT,                             -- pedazo del prompt sospechoso
  full_content TEXT,
  action_taken TEXT,                        -- "blocked", "logged", "warned"
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sec_events_user ON security_events(user_id);
CREATE INDEX idx_sec_events_severity ON security_events(severity);
CREATE INDEX idx_sec_events_created ON security_events(created_at DESC);

-- ============================================================
-- [FUTURE] SCREENSHOTS — módulo snaps
-- ============================================================

CREATE TYPE snap_verdict AS ENUM ('ok', 'review', 'flag');

CREATE TABLE screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tool_id TEXT REFERENCES tools(id),
  storage_path TEXT NOT NULL,              -- path en Supabase Storage
  verdict snap_verdict DEFAULT 'ok',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snaps_user ON screenshots(user_id);
CREATE INDEX idx_snaps_verdict ON screenshots(verdict);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Habilitamos RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;

-- Policies básicas (en MVP, el backend usa service_role_key que skipea RLS)
-- Estas policies son para defensa en profundidad si alguna vez se queda código mal.

-- Helper SECURITY DEFINER para chequeos de rol.
-- Por qué: una policy que hace `SELECT … FROM users` dispara RLS sobre la
-- misma tabla y entra en recursión infinita ("infinite recursion detected in
-- policy for relation users"). Encapsulando el check en una función SECURITY
-- DEFINER salimos del contexto de la policy y la consulta corre como owner.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- Users: pueden ver su propio registro, admins ven todos
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- Tool access: usuario ve solo lo suyo, admin ve todo
CREATE POLICY tool_access_select ON tool_access
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

-- System prompts: SOLO admins (esto es crítico para proteger el cerebro)
CREATE POLICY system_prompts_admin_only ON system_prompts
  FOR ALL USING (public.is_admin());

-- Claude conversations: usuario ve solo las suyas
CREATE POLICY claude_conv_own ON claude_conversations
  FOR ALL USING (user_id = auth.uid());

-- Más policies se pueden agregar luego.

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_system_prompts_updated BEFORE UPDATE ON system_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_credit_allocations_updated BEFORE UPDATE ON credit_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_claude_conv_updated BEFORE UPDATE ON claude_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED — datos iniciales (idempotente vía ON CONFLICT DO NOTHING)
-- ============================================================

-- ============================================================
-- NQS AI Hub — Seed inicial (datos NO atados a usuarios)
-- ============================================================
-- Los inserts en `tools` ya viven en la migration 0001 (vienen del schema
-- de referencia del cliente), así que acá solo va lo que depende del
-- system_prompt placeholder y el pool de créditos 3DSky.
--
-- Los datos que dependen de usuarios (tool_access, credit_allocations) se
-- siembran desde `scripts/create-users.ts`, que crea los usuarios de auth
-- + el registro en public.users + sus permisos en una sola corrida.
-- ============================================================

-- 1) System prompt placeholder para Claude.
--
-- El contenido va ENCRIPTADO con AES-256-GCM (ver lib/utils/crypto.ts).
-- Acá insertamos un texto SIN encriptar como placeholder visible para que
-- sea fácil verlo en el dashboard durante el desarrollo. Antes de pasar a
-- producción, este registro se va a reemplazar vía el ABM del panel admin
-- (que llama a `updateSystemPrompt`, el cual SÍ encripta).
--
-- Si quisieras dejarlo encriptado de entrada, corré:
--   npx tsx scripts/encrypt-string.ts "tu texto"
-- y reemplazá content_encrypted abajo por el output.
INSERT INTO system_prompts (tool_id, name, content_encrypted, is_active, version)
VALUES (
  'claude',
  'Brain principal Claude (placeholder)',
  'PLAINTEXT::Sos el asistente creativo interno de NQS. Tu rol es ayudar al equipo a optimizar prompts cortos y transformarlos en briefs detallados, claros y accionables. Mantené tono editorial, conciso, en español rioplatense.',
  TRUE,
  1
)
ON CONFLICT DO NOTHING;

-- 2) Credit pool inicial de 3DSky.
--
-- 100 créditos comprados por USD 700 (placeholder hasta que el admin cargue
-- una compra real desde el panel). `purchased_by` queda NULL porque todavía
-- no hay admin sembrado en este punto del flujo — se backfillea desde el
-- script create-users.ts si querés trazabilidad.
INSERT INTO credit_pools (tool_id, total_credits, cost_usd, purchase_note)
VALUES ('3dsky', 100, 700.00, 'Pool inicial seed — compra placeholder.')
ON CONFLICT DO NOTHING;
