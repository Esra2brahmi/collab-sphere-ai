import { NextRequest } from 'next/server';

// Robust Hugging Face TTS proxy with fallbacks
// POST { text: string, model?: string }
// Returns raw audio (audio/*) for the provided text.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = body?.text ?? '';
    const preferredModel: string | undefined = body?.model;
    const provider: string | undefined = body?.provider; // optional override: 'elevenlabs' | 'huggingface'
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1) Try ElevenLabs first if configured or explicitly requested
    const EL_KEY = process.env.ELEVENLABS_API_KEY;
    const EL_VOICE = (body?.voice as string | undefined) || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    const useElevenLabs = (provider === 'elevenlabs') || (!!EL_KEY && provider !== 'huggingface');

    if (useElevenLabs) {
      try {
        if (!EL_KEY) throw new Error('ELEVENLABS_API_KEY not set');
        // ElevenLabs TTS REST API
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(EL_VOICE)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'xi-api-key': EL_KEY,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        if (res.ok) {
          const ct = res.headers.get('content-type') || 'audio/mpeg';
          if (!ct.startsWith('audio/')) {
            // treat as failure and fall through
          } else {
            const buf = Buffer.from(await res.arrayBuffer());
            return new Response(buf, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' } });
          }
        }
        // If explicit provider was ElevenLabs and it failed, return error directly
        if (provider === 'elevenlabs') {
          const errTxt = await res.text().catch(() => '');
          return new Response(JSON.stringify({ error: 'ElevenLabs TTS failed', status: res.status, details: errTxt }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // else fall through to Hugging Face
      } catch (e: any) {
        if (provider === 'elevenlabs') {
          return new Response(JSON.stringify({ error: 'ElevenLabs error', details: e?.message || String(e) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 2) Hugging Face fallback
    const HF_KEY = process.env.HUGGING_FACE_API_KEY || process.env.HUGGINGFACE_API_KEY;
    if (!HF_KEY && provider === 'huggingface') {
      return new Response(JSON.stringify({ error: 'HUGGING_FACE_API_KEY / HUGGINGFACE_API_KEY not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Try models in order: user-provided -> espnet VITS (fast) -> coqui XTTS -> suno bark-small
    const models = [
      preferredModel,
      'facebook/mms-tts-eng',
      'espnet/kan-bayashi_ljspeech_vits',
      'coqui/XTTS-v2',
      'suno/bark-small',
    ].filter(Boolean) as string[];

    // Helper to call HF with minimal retries for 503 (model loading)
    const callModel = async (model: string) => {
      const attempt = async () => {
        const res = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
          method: 'POST',
          headers: {
            ...(HF_KEY ? { Authorization: `Bearer ${HF_KEY}` } : {}),
            'Content-Type': 'application/json',
            Accept: 'audio/wav',
            'X-Wait-For-Model': 'true',
          },
          body: JSON.stringify({ inputs: text }),
        });
        return res;
      };
      // up to 2 quick retries on 503
      let res = await attempt();
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 1200));
        res = await attempt();
      }
      return res;
    };

    let lastErr: { model: string; status: number; body?: string } | null = null;
    for (const model of models) {
      const res = await callModel(model);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (res.status === 401) {
          // Attempt unauthenticated call for public models
          try {
            const resNoAuth = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'audio/wav',
                'X-Wait-For-Model': 'true',
              },
              body: JSON.stringify({ inputs: text }),
            });
            const ctNa = resNoAuth.headers.get('content-type') || '';
            if (resNoAuth.ok && ctNa.startsWith('audio/')) {
              const audioArrayBuffer = await resNoAuth.arrayBuffer();
              return new Response(Buffer.from(audioArrayBuffer), {
                status: 200,
                headers: { 'Content-Type': ctNa, 'Cache-Control': 'no-store' },
              });
            }
            const body = await res.text().catch(() => '');
            return new Response(JSON.stringify({
              error: 'Hugging Face authentication failed (401). Check your HUGGINGFACE_API_KEY.',
              model,
              details: body,
            }), { status: 401, headers: { 'Content-Type': 'application/json' } });
          } catch {}
        }
        // try next model after logging
        try {
          const errTxt = await res.text();
          lastErr = { model, status: res.status, body: errTxt };
          console.error('[HF-TTS] model failed:', model, res.status, errTxt);
        } catch {}
        continue;
      }
      // Some HF responses return JSON when model is loading or error
      if (ct.includes('application/json')) {
        const json = await res.json().catch(() => ({}));
        console.warn('[HF-TTS] JSON (non-audio) response from model:', model, json);
        // If it's a valid JSON error/loading, continue to next
        if (json?.error || json?.estimated_time || json?.message) continue;
        // not audio and not clear error — skip
        continue;
      }
      if (!ct.startsWith('audio/')) {
        // Not audio content
        continue;
      }
      const audioArrayBuffer = await res.arrayBuffer();
      return new Response(Buffer.from(audioArrayBuffer), {
        status: 200,
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(JSON.stringify({ error: 'All TTS models failed or returned non-audio', lastErr }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Unexpected error', details: e?.message ?? String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
