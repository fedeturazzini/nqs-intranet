# Módulo Tools — ElevenLabs

## Objetivo

Integrar ElevenLabs (síntesis de voz, doblaje, clonación) al stack.

**Duración**: 2.5 horas

---

## CONTEXTO ESPECÍFICO

- ElevenLabs tiene API muy bien documentada: https://elevenlabs.io/docs/api-reference
- SDK oficial: `elevenlabs` npm package.
- Pricing por caracteres de texto convertido (no async, sync).
- Múltiples voces disponibles + posibilidad de clonar voces propias.

---

## PROMPT

```
Integramos ElevenLabs al NQS AI Hub.

Pre-requisitos: leé `prompts/module-tools/_template.md`.

OBJETIVO:
Wrapper de TTS y dubbing.

PASOS:

1. Setup:
   - `npm install elevenlabs`.
   - API key (NQS la provee).

2. Adapter `src/lib/adapters/elevenlabs.ts`:
   - id: 'elevenlabs', category: 'audio', usesCredits: true.
   - `execute(userId, params)`:
     - params: { mode: 'tts' | 'dub', text, voiceId, modelId, audioSettings? }.
     - Para TTS: text → audio buffer.
     - Para dub: subir audio source + target language → audio result.
   - `getVoices(userId)`: lista voces disponibles del workspace NQS.
   - `consumeCredit`: descuenta créditos según caracteres procesados.

3. Vista `src/components/screens/ElevenLabsView.tsx`:
   - Tabs: Text-to-Speech | Dubbing | Voice Library.
   - TTS:
     - Textarea para el texto (con counter de caracteres).
     - Selector de voz (con preview).
     - Sliders: stability, similarity, style.
     - Botón "generar".
     - Player de audio del resultado.
     - Lista lateral: generaciones recientes.
   - Dubbing:
     - Upload de audio/video.
     - Selector de idioma target.
     - Vista previa antes de procesar.
   - Voice Library:
     - Lista de voces (workspace + globales).
     - Botón "agregar voz custom" (solo admins).

4. Storage:
   - Guardar audios generados en Supabase Storage.
   - Historial accesible para el user.

5. Tabla nueva opcional:
   ```sql
   CREATE TABLE audio_generations (
     id UUID PRIMARY KEY,
     user_id UUID REFERENCES users(id),
     mode TEXT,
     params JSONB,
     storage_path TEXT,
     character_count INT,
     credits_consumed INT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

6. Endpoints:
   - `POST /api/tools/elevenlabs/tts`: genera audio.
   - `POST /api/tools/elevenlabs/dub`: dub audio (puede ser async).
   - `GET /api/tools/elevenlabs/voices`: lista de voces.
   - `GET /api/tools/elevenlabs/history`.

7. Test manual:
   - TTS: texto → audio se reproduce.
   - Dub: video corto → audio doblado.
   - Verificar consumo de créditos.

8. Commit.

AL FINAL:
`progress-elevenlabs.md`.
```

---

## VALIDACIÓN

- [ ] TTS genera audio en vivo
- [ ] Voices se listan correctamente
- [ ] Dubbing funciona
- [ ] Caracteres se cuentan y descuentan créditos
