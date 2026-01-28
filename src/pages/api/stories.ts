export const prerender = false;

// Helper to get environment variables in Astro
const getEnv = (locals: any) => {
  return locals.runtime.env;
};

export async function GET({ locals }: { locals: any }) {
  const env = getEnv(locals);
  
  // 1. Fetch stories from KV
  const raw = await env.KV.get("stories");
  const stories = raw ? JSON.parse(raw) : [];

  // 2. Return them as JSON
  return new Response(JSON.stringify(stories), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const contentType = request.headers.get("content-type") || "";
  
  // Re-fetch stories to modify them
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

      // Upload to R2
      await env.MEDIA_BUCKET.put(filename, file.stream(), {
        httpMetadata: { contentType: file.type }
      });

      mediaUrl = `${env.R2_PUBLIC_URL}/${filename}`;
      mediaType = file.type;
    }

    // Add new story to top of list
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
