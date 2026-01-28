export async function onRequest(context) {
  const { request, env } = context;

  const raw = await env.STORIES_KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  // GET /api/stories
  if (request.method === "GET") {
    return new Response(JSON.stringify(stories), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // POST /api/stories
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
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
    }

    return new Response("Unsupported POST", { status: 400 });
  }

  return new Response("Method not allowed", { status: 405 });
}
