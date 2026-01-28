export const prerender = false;

import type { APIRoute } from "astro";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
];

export const POST: APIRoute = async (context) => {
  const { request, cookies, locals } = context;
  const env = locals.runtime.env;

  const formData = await request.formData();
  const text = formData.get("text")?.toString();
  const file = formData.get("file") as File | null;

  if (!text) {
    return new Response("Missing text", { status: 400 });
  }

  if (file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response("Unsupported file type", { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response("File too large", { status: 400 });
    }
  }

  let sessionId = cookies.get("anon_id")?.value;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    cookies.set("anon_id", sessionId, {
      path: "/",
      sameSite: "lax",
    });
  }

  let mediaUrl = null;
  let mediaType = null;

  if (file) {
    const ext = file.name.split(".").pop();
    const key = `${crypto.randomUUID()}.${ext}`;

    await env.MEDIA_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    mediaUrl = `${env.MEDIA_BUCKET.publicUrl}/${key}`;
    mediaType = file.type;
  }

  const story = {
    id: crypto.randomUUID(),
    ownerId: sessionId,
    text,
    mediaUrl,
    mediaType,
    createdAt: Date.now(),
  };

  const stories =
    JSON.parse((await env.KV.get("stories")) || "[]");

  stories.push(story);

  await env.KV.put("stories", JSON.stringify(stories));

  return new Response(JSON.stringify(story), {
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const stories = await env.KV.get("stories");

  return new Response(stories || "[]", {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async (context) => {
  const { request, cookies, locals } = context;
  const env = locals.runtime.env;

  const { id, adminPassword } = await request.json();
  const ADMIN_PASSWORD = env.ADMIN_PASSWORD;

  const stories =
    JSON.parse((await env.KV.get("stories")) || "[]");

  const sessionId = cookies.get("anon_id")?.value;

  const remaining = [];

  for (const story of stories) {
    if (story.id === id) {
      if (
        adminPassword === ADMIN_PASSWORD ||
        story.ownerId === sessionId
      ) {
        if (story.mediaUrl) {
          const key = story.mediaUrl.split("/").pop();
          await env.MEDIA_BUCKET.delete(key);
        }
        continue;
      }
    }
    remaining.push(story);
  }

  await env.KV.put("stories", JSON.stringify(remaining));

  return new Response("Deleted");
};
