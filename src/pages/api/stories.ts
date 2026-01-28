export const prerender = false;

const getEnv = (locals: any) => {
  return locals.runtime.env;
};

export async function GET({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const url = new URL(request.url);
  const method = request.method;

  // 1. Fetch all stories from KV
  const raw = await env.KV.get("stories");
  let allStories = raw ? JSON.parse(raw) : [];

  // 2. Check Admin Status (via Header)
  // We expect the frontend to send "Authorization: Bearer <password>" if admin
  const authHeader = request.headers.get("Authorization");
  const isAdmin = authHeader === `Bearer ${env.ADMIN_PASSWORD}`;

  /* --- SCENARIO A: Fetch Single Story --- */
  const singleId = url.searchParams.get("id");
  if (singleId) {
    const story = allStories.find((s: any) => s.id === singleId);
    
    // If story doesn't exist OR is hidden (and user isn't admin)
    if (!story || (story.hidden && !isAdmin)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(JSON.stringify(story), {
      headers: { "Content-Type": "application/json" }
    });
  }

  /* --- SCENARIO B: Fetch Feed (Pagination) --- */
  // Filter hidden stories if not admin
  const visibleStories = isAdmin 
    ? allStories 
    : allStories.filter((s: any) => !s.hidden);

  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 10;
  const start = (page - 1) * limit;
  const end = start + limit;

  const slice = visibleStories.slice(start, end);
  const hasMore = end < visibleStories.length;

  return new Response(JSON.stringify({ stories: slice, hasMore }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const contentType = request.headers.get("content-type") || "";
  
  const raw = await env.KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  /* ---------- ADMIN ACTIONS (JSON) ---------- */
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as any;
    if (!body) return new Response("Invalid JSON", { status: 400 });

    const { action, id, password } = body;

    if (!password || password !== env.ADMIN_PASSWORD) {
      return new Response("Unauthorized", { status: 401 });
    }

    const index = stories.findIndex((s: any) => s.id === id);
    if (index === -1) {
      return new Response("Story not found", { status: 404 });
    }

    if (action === "hide") {
      stories[index].hidden = !stories[index].hidden;
      await env.KV.put("stories", JSON.stringify(stories));
      return new Response(JSON.stringify({ hidden: stories[index].hidden }));
    }

    if (action === "delete") {
      stories.splice(index, 1);
      await env.KV.put("stories", JSON.stringify(stories));
      return new Response("OK");
    }

    return new Response("Unknown action", { status: 400 });
  }

  /* ---------- CREATE STORY (FORMDATA) ---------- */
  try {
    const form = await request.formData();
    const text = form.get("text")?.toString().trim();
    const nameInput = form.get("name")?.toString().trim();
    const file = form.get("file");

    if (!text) {
      return new Response("Story text required", { status: 400 });
    }

    const name = nameInput && nameInput.length > 0 ? nameInput : "Anonymous";
    
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

    stories.unshift({
      id: crypto.randomUUID(),
      name,
      text,
      mediaUrl,
      mediaType,
      createdAt: Date.now(),
      hidden: false,
      comments: []
    });

    await env.KV.put("stories", JSON.stringify(stories));
    return new Response("OK");

  } catch (err) {
    console.error(err);
    return new Response("Server Error", { status: 500 });
  }
}
