import type { APIRoute } from "astro";

// GET /api/stories
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.env;

  const raw = await env.STORIES_KV.get("stories");
  const stories = raw ? JSON.parse(raw) : [];

  return new Response(JSON.stringify(stories), {
    headers: { "Content-Type": "application/json" }
  });
};

// POST /api/stories
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.env;

  const form = await request.formData();
  const text = form.get("text")?.toString();
  const file = form.get("file");

  if (!text || !text.trim()) {
    return new Response("Story text required", { status: 400 });
  }

  let mediaUrl = null;
  let mediaType = null;

  if (file instanceof File && file.size > 0) {
    const ext = file.name.split(".").pop();
    const filename = `${crypto.randomUUID()}.${ext}`;

    await env.MEDIA_BUCKET.put(filename, file.stream(), {
      httpMetadata: { contentType: file.type }
    });

    mediaUrl = `${env.R2_PUBLIC_URL}/${filename}`;
    mediaType = file.type;
  }

  const raw = await env.STORIES_KV.get("stories");
  const stories = raw ? JSON.parse(raw) : [];

  stories.push({
    id: crypto.randomUUID(),
    text,
    mediaUrl,
    mediaType,
    createdAt: Date.now(),
    comments: []
  });

  await env.STORIES_KV.put("stories", JSON.stringify(stories));

  return new Response("OK");
};
