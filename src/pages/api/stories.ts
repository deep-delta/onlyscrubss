export const onRequest = async ({ request, env }) => {
  const method = request.method;

  // Load existing stories
  const raw = await env.STORIES_KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  // GET: return all stories
  if (method === "GET") {
    return new Response(JSON.stringify(stories), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // POST: create story or comment
  if (method === "POST") {
    // Comment submission (JSON)
    if (request.headers.get("content-type")?.includes("application/json")) {
      const { storyId, text } = await request.json();

      const story = stories.find(s => s.id === storyId);
      if (!story) {
        return new Response("Story not found", { status: 404 });
      }

      story.comments = story.comments || [];
      story.comments.push({
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now()
      });

      await env.STORIES_KV.put("stories", JSON.stringify(stories));
      return new Response("OK");
    }

    // Story submission (FormData)
    const form = await request.formData();
    const text = form.get("text")?.toString();
    const file = form.get("file");

    if (!text || !text.trim()) {
      return new Response("Story text is required", { status: 400 });
    }

    let mediaUrl = null;
    let mediaType = null;

    // Handle file upload
    if (file && file instanceof File && file.size > 0) {
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

    const story = {
      id: crypto.randomUUID(),
      text,
      mediaUrl,
      mediaType,
      createdAt: Date.now(),
      comments: []
    };

    stories.push(story);

    await env.STORIES_KV.put("stories", JSON.stringify(stories));

    return new Response("OK");
  }

  // DELETE: admin delete
  if (method === "DELETE") {
    const { id, adminPassword } = await request.json();

    if (adminPassword !== env.ADMIN_PASSWORD) {
      return new Response("Unauthorized", { status: 401 });
    }

    stories = stories.filter(s => s.id !== id);
    await env.STORIES_KV.put("stories", JSON.stringify(stories));

    return new Response("Deleted");
  }

  return new Response("Method not allowed", { status: 405 });
};
