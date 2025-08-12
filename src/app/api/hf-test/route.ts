import { NextResponse } from "next/server";

export const runtime = "nodejs";

const hfApiKey = process.env.HUGGINGFACE_API_KEY;
const hfModel = "distilbert-base-uncased-finetuned-sst-2-english";

export async function GET(req: Request) {
  if (!hfApiKey) {
    return NextResponse.json(
      { ok: false, error: "HUGGINGFACE_API_KEY not set" },
      { status: 500 }
    );
  }

  const input = "This is great!";
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "infer";

  // Metadata check: verify the model exists/reachable without requiring inference
  if (mode === "meta") {
    try {
      const metaRes = await fetch(`https://huggingface.co/api/models/${hfModel}`, {
        headers: { Accept: "application/json" },
      });
      const metaText = await metaRes.text();
      return NextResponse.json({ ok: metaRes.ok, status: metaRes.status, meta: safeParse(metaText) ?? metaText });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
    }
  }

  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfApiKey}`,
        "Content-Type": "application/json",
        "X-Wait-For-Model": "true",
      },
      body: JSON.stringify({ inputs: input }),
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        hint: res.status === 404 ? "Model path may be incorrect or endpoint unreachable. Try GET /api/hf-test?mode=meta" : res.status === 401 ? "Invalid HUGGINGFACE_API_KEY" : res.status === 503 ? "Model warming up; try again or keep X-Wait-For-Model: true" : undefined,
        model: hfModel,
        key_prefix: `hf_${hfApiKey.slice(3, 8)}...`,
        body: text,
      }, { status: 500 });
    }

    let data: any;
    try { data = JSON.parse(text); } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON from HF", body: text },
        { status: 500 }
      );
    }

    const arr = Array.isArray(data) ? data : [];
    const first = Array.isArray(arr[0]) ? arr[0] : arr;
    const pos = first?.find?.((x: any) => x.label === "POSITIVE");
    const neg = first?.find?.((x: any) => x.label === "NEGATIVE");

    const label = (pos?.score ?? 0) >= (neg?.score ?? 0) ? "POSITIVE" : "NEGATIVE";
    const score = label === "POSITIVE" ? (pos?.score ?? 0.5) : 1 - (neg?.score ?? 0.5);

    return NextResponse.json({
      ok: true,
      model: hfModel,
      input,
      label,
      score,
      raw: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

function safeParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
