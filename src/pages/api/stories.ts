// GET /api/stories
export const onRequestGet = async ({ env }) => {
  const raw = await env.STORIES_KV.get("stories");
  const stories = raw ? JSON.parse(raw) : [];

  return new Response(JSON.stringify(stories), {
    headers: { "Content-Type": "application/json" }
  });
};

// POST /api/stories
export const onRequestPost = async ({ request, env }) => {
  // JSON = comment
  if (request.headers.get("content-type")?.includes("application/json")) {
    const { storyId, text } = await request.json();

    const raw = await env.STORIES_KV.get("stories");
    const stories = raw ? JSON.parse(raw) : [];

    const story = stories.find(s => s.id === storyId);
    if (!story) return new Response("Story not found", { status: 404 });

    story.comments ||= [];
    story.comments.push({
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now()
    });

    await env.STORIES_KV.put("stories", JSON.stringify(stories));
    return new Response("OK");
  }

  // FormData = new story
  const form = await request.formData();
  const text = form.get("text")?.toString();
  const file = form.get("file");

  if (!text || !text.trim()) {
    return new Response("Story text is required", { status: 400 });
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

// DELETE /api/stories
export const onRequestDelete = async ({ request, env }) => {
  const { id, adminPassword } = await request.json();

  if (adminPassword !== env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  const raw = await env.STORIES_KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  stories = stories.filter(s => s.id !== id);
  await env.STORIES_KV.put("stories", JSON.stringify(stories));

  return new Response("Deleted");
};
