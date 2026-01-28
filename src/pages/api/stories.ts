import type { APIRoute } from "astro";

const ADMIN_PASSWORD = import.meta.env.ADMIN_PASSWORD;

export const POST: APIRoute = async ({ request, cookies }) => {
  const formData = await request.formData();
  const text = formData.get("text")?.toString();
  const file = formData.get("file") as File | null;

  if (!text || !file) {
    return new Response("Missing data", { status: 400 });
  }

  let sessionId = cookies.get("anon_id")?.value;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    cookies.set("anon_id", sessionId, { path: "/" });
  }

  const story = {
    id: crypto.randomUUID(),
    ownerId: sessionId,
    text,
    createdAt: Date.now(),
  };

  const stories = JSON.parse(
    (await request.env.KV.get("stories")) || "[]"
  );

  stories.push(story);
  await request.env.KV.put("stories", JSON.stringify(stories));

  return new Response(JSON.stringify(story), { status: 200 });
};

export const GET: APIRoute = async ({ request }) => {
  const stories = await request.env.KV.get("stories");
  return new Response(stories || "[]", {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const { id, adminPassword } = await request.json();

  const stories = JSON.parse(
    (await request.env.KV.get("stories")) || "[]"
  );

  const sessionId = cookies.get("anon_id")?.value;

  const filtered = stories.filter((story: any) => {
    if (adminPassword === ADMIN_PASSWORD) return story.id !== id;
    return !(story.id === id && story.ownerId === sessionId);
  });

  await request.env.KV.put("stories", JSON.stringify(filtered));

  return new Response("Deleted", { status: 200 });
};
