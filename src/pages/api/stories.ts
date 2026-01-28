export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async (context) => {
  const { request, cookies, locals } = context;
  const env = locals.runtime.env;

  const formData = await request.formData();
  const text = formData.get("text")?.toString();

  if (!text) {
    return new Response("Missing text", { status: 400 });
  }

  let sessionId = cookies.get("anon_id")?.value;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    cookies.set("anon_id", sessionId, {
      path: "/",
      sameSite: "lax",
    });
  }

  const story = {
    id: crypto.randomUUID(),
    ownerId: sessionId,
    text,
    createdAt: Date.now(),
  };

  const existing =
    JSON.parse((await env.KV.get("stories")) || "[]");

  existing.push(story);

  await env.KV.put("stories", JSON.stringify(existing));

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

  const filtered = stories.filter((story: any) => {
    if (adminPassword === ADMIN_PASSWORD) return story.id !== id;
    return !(story.id === id && story.ownerId === sessionId);
  });

  await env.KV.put("stories", JSON.stringify(filtered));

  return new Response("Deleted");
};
