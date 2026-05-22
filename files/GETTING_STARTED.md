# GETTING_STARTED — Tu guía paso a paso

> Esto es el "manual de instrucciones" del kit. Te dice literalmente qué hacer, en qué orden, dónde clickear, qué archivo abrir.

---

## 🎯 Visión general en 30 segundos

Vas a desarrollar el proyecto NQS AI Hub durante ~4 semanas (MVP) y después módulos según se vendan. Tu setup va a ser:

1. **Cursor abierto** en una carpeta nueva (el proyecto).
2. **Carpeta del kit** abierta en otra ventana (esta carpeta) para consultar.
3. Vas haciendo una sesión por día (2-3hs cada una).

Cada sesión tiene un prompt que copiás a Cursor. Cursor genera código. Vos validás. Sigue al día siguiente.

Listo. Ahora el paso a paso real.

---

## 📂 PASO 0 — Preparar el entorno (1 día antes de arrancar)

### 0.1 Descomprimir el kit

1. Descargá el ZIP `NQS_AI_Hub_Kit.zip`.
2. Descomprimilo en algún lugar fácil de encontrar, ej. `~/Documents/nqs-kit/`.
3. **Dejá esta carpeta a mano todo el tiempo.** La vas a consultar cada día.

### 0.2 Instalar herramientas necesarias

Si no las tenés:

- **Node.js 20+**: descargá de [nodejs.org](https://nodejs.org/) (LTS).
- **Cursor**: descargá de [cursor.com](https://cursor.com/).
- **Git**: ya viene en macOS y la mayoría de Linux. En Windows, descargá de [git-scm.com](https://git-scm.com/).
- **Cuenta de GitHub**: para el repo del proyecto.

Verificá que todo funcione:

```bash
node --version    # debe decir v20.x.x o superior
git --version
```

### 0.3 Crear el repo del proyecto

1. En GitHub, creá un repo nuevo: `nqs-ai-hub` (privado).
2. En tu compu, cloná el repo en algún lugar:
   ```bash
   cd ~/Documents/
   git clone git@github.com:tu-usuario/nqs-ai-hub.git
   cd nqs-ai-hub
   ```

3. **Esta es la carpeta de trabajo del proyecto.** No la confundas con la del kit.
   - Kit (consulta): `~/Documents/nqs-kit/`
   - Proyecto (donde codeás): `~/Documents/nqs-ai-hub/`

### 0.4 Abrir Cursor en el proyecto

1. Abrí Cursor.
2. File → Open Folder → seleccioná `~/Documents/nqs-ai-hub/`.
3. Cursor te va a mostrar la carpeta vacía. Está bien.

### 0.5 Leer los 3 documentos base (1 hora)

Abrí en cualquier visor de markdown (Cursor mismo lo abre, o un editor de texto):

1. `~/Documents/nqs-kit/docs/00-project-context.md` (15 min)
2. `~/Documents/nqs-kit/docs/01-architecture.md` (20 min)
3. `~/Documents/nqs-kit/docs/04-client-dependencies.md` (20 min)

**No los leas en diagonal**. Es la única vez que vas a leerlos completos. Después solo vas a volver a buscar cosas puntuales.

### 0.6 Coordinar con NQS

Abrí `~/Documents/nqs-kit/docs/05-client-comms-template.md` → buscá la sección **"1. ANTES DE ARRANCAR (kick-off)"** → copiá el email, ajustalo y mandalo a Tomás.

Esperá las respuestas (cuentas creadas, credenciales por canal seguro).

**No avances al PASO 1 hasta tener todo lo que pide el email.**

---

## 🚀 PASO 1 — Primera sesión de desarrollo (día 1)

> Asumimos que NQS ya te pasó: Supabase URL + keys, Anthropic API key, acceso a Vercel.

### 1.1 Abrí el prompt 01

En tu visor de markdown, abrí:
```
~/Documents/nqs-kit/prompts/mvp/01-setup.md
```

Leé el bloque **"⚠️ ANTES DE EMPEZAR — PEDIRLE AL CLIENTE"** y verificá que tenés TODO el checklist resuelto.

Si falta algo → mandale recordatorio a Tomás y esperá. No arranques.

### 1.2 Copiar el prompt a Cursor

1. En el archivo `01-setup.md`, buscá el bloque de código que dice "PROMPT (copy-paste a Cursor/Claude Code)".
2. Copiá TODO el contenido entre los triples backticks (`````````).
3. En Cursor: abrí el chat (Cmd+L o Ctrl+L).
4. Asegurate de tener Claude Sonnet 4.6 (o el más nuevo disponible) seleccionado como modelo.
5. Pegá el prompt en el chat.

### 1.3 Adjuntar los archivos referenciados

El prompt menciona archivos del kit que la IA tiene que ver. En Cursor:

1. Antes de enviar el prompt, mirá qué archivos referencia (al principio del prompt dice "CONTEXTO COMPLETO" o similar).
2. Para cada archivo mencionado:
   - Si está en el kit (ej. `kit/docs/00-project-context.md`), copialo a tu proyecto en una carpeta `_kit-reference/` o adjuntalo al chat con el botón "@".
   - En Cursor podés escribir `@` y buscar el archivo si está en el proyecto.

**Shortcut útil**: copiá toda la carpeta `kit/docs/` y `kit/reference/` a una subcarpeta `_kit/` dentro de tu proyecto. Así Cursor las indexa y podés referenciarlas con `@`.

```bash
cd ~/Documents/nqs-ai-hub
mkdir _kit
cp -r ~/Documents/nqs-kit/docs _kit/
cp -r ~/Documents/nqs-kit/reference _kit/
cp -r ~/Documents/nqs-kit/assets/client-design _kit/design
```

Después agregá `_kit/` al `.gitignore` cuando lo crees, así no se sube al repo.

### 1.4 Enviar el prompt y dejarlo trabajar

1. Mandá el prompt.
2. Cursor va a empezar a generar código y ejecutar comandos.
3. **A veces te va a pedir permiso** para correr un comando (`npm install ...`). Aceptá si tiene sentido.
4. Si algo se ve raro, pausalo (botón Stop) y leé bien qué está haciendo.

**Tiempo esperado**: 30-60 minutos de IA trabajando + tu supervisión.

### 1.5 Validar lo que hizo

Al final del prompt 01 hay una sección "VALIDACIÓN POST-SESIÓN". Repasala punto por punto:

- [ ] `npm run dev` levanta sin errores
- [ ] La home renderiza el logo NQS animado
- [ ] El marquee se desplaza correctamente
- [ ] etc.

Si algo falla → pedile a la IA que lo arregle. No avances.

### 1.6 Pedir el progress.md

Al final del prompt original ya pide que la IA genere `progress-01.md`. Asegurate de que existe:

```
nqs-ai-hub/
├── progress-01.md    ← este archivo
├── src/
├── package.json
└── ...
```

**Abrí `progress-01.md` y leelo.** Vas a usarlo mañana.

### 1.7 Commitear

```bash
git add .
git commit -m "feat: setup inicial Next.js + Tailwind + Supabase"
git push
```

### 1.8 Tachar la tarea

Abrí `~/Documents/nqs-kit/docs/03-checklist.md` y poné ✅ en "Sesión 01 — Setup".

**Día 1 terminado.** Hasta mañana.

---

## 📅 PASO 2 — Día 2 en adelante (rutina)

A partir de la sesión 02, la rutina es siempre la misma. Te paso el patrón:

### 2.1 Empezar la sesión

1. Abrí Cursor en `~/Documents/nqs-ai-hub/`.
2. Abrí el prompt del día, ej. `~/Documents/nqs-kit/prompts/mvp/02-database.md`.
3. **Revisá el bloque "⚠️ ANTES DE EMPEZAR"** del prompt. Si falta algo del cliente → pedilo y esperá.
4. Si todo está OK, abrí el chat en Cursor (Cmd+L).

### 2.2 Pasar el contexto a la IA

En el chat de Cursor, antes del prompt, escribí algo así:

```
Vamos con la sesión 02. Acá está el progress de la sesión anterior:

@progress-01.md

Y el prompt de esta sesión:

[pegar contenido del prompt]
```

**El `@progress-01.md` es clave.** Es lo que le da continuidad a la IA entre sesiones.

### 2.3 Ejecutar, validar, commitear

Igual que en PASO 1.5, 1.6, 1.7. Siempre:

1. Validás contra el checklist del prompt.
2. La IA genera el `progress-XX.md` correspondiente.
3. Commit + push.
4. Tachás del checklist maestro.

---

## 🗺️ MAPA DE QUÉ HAY EN CADA CARPETA

Para que sepas siempre dónde ir a buscar algo:

```
nqs-kit/
│
├── README.md                       → Resumen general del kit
├── INDEX.md                        → Mapa rápido con links a todo
├── GETTING_STARTED.md              → ⭐ ESTE archivo (paso a paso)
│
├── docs/                           → 📚 Documentación para LEER
│   ├── 00-project-context.md       → Qué construimos y por qué
│   ├── 01-architecture.md          → Cómo está armado para escalar
│   ├── 02-conventions.md           → Reglas de código que la IA tiene que seguir
│   ├── 03-checklist.md             → ⭐ Tu checklist maestro de tareas
│   ├── 04-client-dependencies.md   → Qué pedirle a NQS y cuándo
│   ├── 05-client-comms-template.md → Mails listos para mandarle a Tomás
│   └── progress-template.md        → Cómo deben verse los progress.md
│
├── prompts/                        → 🚀 Los PROMPTS que copiás a Cursor
│   ├── mvp/                        → Los 12 del MVP (sesiones 01-12)
│   │   ├── 01-setup.md             → Día 1
│   │   ├── 02-database.md          → Día 2
│   │   ├── ...
│   │   └── 12-deploy.md            → Día 12 (entrega)
│   │
│   ├── module-horarios/            → Para usar DESPUÉS del MVP
│   ├── module-aprobaciones/        → DESPUÉS
│   ├── module-panel-admin/         → DESPUÉS
│   ├── module-tools/               → DESPUÉS (uno por tool)
│   ├── module-seguridad/           → DESPUÉS (delicado, ver doc 04)
│   └── module-contenido/           → DESPUÉS
│
├── reference/                      → 🔧 Código LISTO PARA USAR
│   ├── db-schema.sql               → Schema SQL completo
│   ├── tool-adapter-pattern.ts     → Pattern de adapters
│   ├── middleware-permissions.ts   → Middleware listo
│   └── api-routes.md               → Mapa de endpoints
│
└── assets/
    └── client-design/              → 🎨 Diseño del cliente
        ├── screens.jsx             → Pantallas (referencia visual)
        ├── components.jsx          → Componentes (NqsLogo, etc.)
        ├── styles.css              → ⭐ Lo copiás al proyecto
        ├── screens.css             → ⭐ Lo copiás al proyecto
        ├── tutorials/              → 6 tutoriales del módulo contenido
        └── ...
```

---

## 🎯 RESUMEN DE TU ROL EN CADA SESIÓN

Vos NO codeás casi nada. Tu rol es:

1. **Antes**: revisar bloques "ANTES DE EMPEZAR", verificar que el cliente entregó lo que tenía que entregar.
2. **Durante**: copiar el prompt a Cursor, supervisar, dar permisos de comandos, leer si algo se ve raro.
3. **Validar**: probar manualmente que funciona lo que pide el checklist del prompt.
4. **Cerrar**: pedir el progress.md, commitear, tachar del checklist.

**Tiempo real tuyo por sesión**: 2-3 horas (la mayoría es esperar que la IA trabaje + validar).

---

## ⚠️ CUÁNDO PARAR Y NO AVANZAR

Pausá inmediatamente si:

- **Falta algo del cliente** que el bloque "ANTES DE EMPEZAR" pide.
- **Las validaciones de la sesión no pasan** (ej. el login no funciona, los créditos se descuentan mal).
- **El progress.md anterior tiene "TODOs críticos sin resolver"**.
- **Algo se rompió en producción** (si ya deployaste).

En cualquier caso, **no avances con algo roto**. Resolver antes.

---

## 🆘 SI TE TRABÁS

### Caso 1: La IA hace algo raro o no entiende el prompt

1. Stop al generation.
2. Abrí un chat nuevo (Cmd+N en Cursor).
3. Pegá:
   - El `progress-XX.md` de la sesión anterior.
   - El prompt actual.
   - Lo que la IA hizo mal o el error que tirás.
4. Pedile que retome.

### Caso 2: Un comando falla (ej. `npm install` rompe)

1. Copiá el error exacto.
2. Pegáselo a la IA: "Falló este comando: [error]. ¿Cómo lo resolvemos?".
3. Si la IA no resuelve en 2 intentos, abrí Claude.ai en otra ventana y preguntale a Claude estándar.

### Caso 3: No sabés qué prompt sigue

Abrí `docs/03-checklist.md` y buscá la próxima tarea sin tachar. El nombre del archivo está al lado.

### Caso 4: El cliente no responde

Mandale recordatorio sutil. Si ya pasaron 48hs sin respuesta sobre algo crítico:

- **No avances el desarrollo**.
- Dejá el commit a mitad (en una branch local).
- Hacé otra cosa hasta que responda.

### Caso 5: Necesitás re-empezar una sesión

A veces conviene tirar todo lo de la sesión y rehacer:

```bash
git stash         # guarda cambios temporalmente
git checkout main # volvés al estado anterior
```

Y reintentás con el prompt + ajustes que aprendiste del intento fallido.

---

## 📊 CALENDARIO SUGERIDO MVP (4 semanas)

| Día | Sesión | Lo que hacés |
|-----|--------|--------------|
| Lun 1 | 01 — Setup | Crear proyecto Next.js + dependencias |
| Mar 1 | 02 — Database | Schema completo + seeds |
| Mié 1 | 03 — Auth | Login + sesiones |
| Jue 1 | 04 — Layout | Topbar + marquee + toast |
| Vie 1 | (libre) | Repaso, ajustes |
| Lun 2 | 05 — Hub | Vista del hub completa |
| Mar 2 | 06 — Claude adapter | Backend Claude |
| Mié 2 | 07 — Claude view | UI del chat |
| Jue 2 | 08 — 3DSky adapter | Backend créditos |
| Vie 2 | (libre) | Repaso |
| Lun 3 | 09 — 3DSky view | UI con iframe |
| Mar 3 | 10 — Admin base | ABM users + prompt padre |
| Mié 3 | 11 — Admin créditos | Panel créditos + logs |
| Jue 3 | (libre) | Reunión con Tomás sobre costos |
| Vie 3 | (libre) | Ajustes finales |
| Lun 4 | 12 — Deploy | Tests + deploy + docs |
| Mar 4 | — | Capacitación a Tomás |
| Mié 4 | — | Soporte y ajustes |

Total: **20 días con holgura**, ~3 semanas si querés ir más fuerte, 4-5 semanas si vas tranquilo o tenés interrupciones.

---

## ✅ CHECKLIST DEL DÍA 0 (antes de arrancar)

- [ ] Kit descomprimido en `~/Documents/nqs-kit/`
- [ ] Node.js 20+ instalado
- [ ] Cursor instalado
- [ ] Git configurado
- [ ] Cuenta GitHub
- [ ] Repo `nqs-ai-hub` creado
- [ ] Carpeta `~/Documents/nqs-ai-hub/` con el repo clonado
- [ ] Leíste `docs/00-project-context.md`
- [ ] Leíste `docs/01-architecture.md`
- [ ] Leíste `docs/04-client-dependencies.md`
- [ ] Le mandaste el kick-off email a Tomás
- [ ] Tomás te confirmó: Supabase listo, Anthropic listo, Vercel listo, canal seguro acordado

Cuando todos estos están ✅, **arrancás con PASO 1**.

---

## 🎬 ÚLTIMO CONSEJO

No trates de adelantar. El kit está armado para que vayas paso a paso. Si vas más rápido te vas a comer errores que después cuestan más resolver.

Y si la IA te dice "ya está, terminé", no le creas. Validá vos contra el checklist del prompt. Es la única manera de no entregar algo roto.

Suerte. Avisame cuando arranques.
