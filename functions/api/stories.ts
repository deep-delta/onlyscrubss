export async function onRequest(context) {
  const { request, env } = context;

  const raw = await env.KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  // GET /api/stories
  if (request.method === "GET") {
    return new Response(JSON.stringify(stories), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  // POST /api/stories
  if (request.method === "POST") {
    const form = await request.formData();

    const text = form.get("text")?.toString().trim();
    const nameInput = form.get("name")?.toString().trim();
    const file = form.get("file");

    if (!text) {
      return new Response("Story text required", { status: 400 });
    }

    const name =
      nameInput && nameInput.length > 0
        ? nameInput
        : "Anonymous";

    let mediaUrl = null;
    let mediaType = null;

    if (file instanceof File && file.size > 0) {
      const ext = file.name.split(".").pop();
      const filename = `${crypto.randomUUID()}.${ext}`;

      await env.MEDIA_BUCKET.put(filename, file.stream(), {
        httpMetadata: {
          contentType: file.type
        }
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
      comments: []
    });

    await env.KV.put("stories", JSON.stringify(stories));

    return new Response("OK");
  }
  // ADMIN: Hide / Unhide story
  if (request.method === "POST" && new URL(request.url).pathname.endsWith("/hide")) {
    const body = await request.json().catch(() => null);
    const { id, password } = body || {};

    if (!password || password !== env.ADMIN_PASSWORD) {
      return new Response("Unauthorized", { status: 401 });
    }

    const index = stories.findIndex((s) => s.id === id);
    if (index === -1) {
      return new Response("Story not found", { status: 404 });
    }

    stories[index].hidden = !stories[index].hidden;

    await env.KV.put("stories", JSON.stringify(stories));

    return new Response(
      JSON.stringify({ hidden: stories[index].hidden }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response("Method not allowed", { status: 405 });
}
