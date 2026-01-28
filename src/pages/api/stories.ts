export const prerender = false;

export async function GET({ env }) {
  const stories = await env.STORIES.get("stories", "json");
  return new Response(JSON.stringify(stories || []));
}

export async function POST({ request, env, url }) {
  const isComment = url.searchParams.get("comment");

  // ---------- COMMENTS ----------
  if (isComment) {
    const { storyId, text } = await request.json();

    if (!storyId || !text) {
      return new Response("Missing comment data", { status: 400 });
    }

    const stories = (await env.STORIES.get("stories", "json")) || [];
    const story = stories.find((s) => s.id === storyId);

    if (!story) {
      return new Response("Story not found", { status: 404 });
    }

    story.comments.push({
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
    });

    await env.STORIES.put("stories", JSON.stringify(stories));
    return new Response(JSON.stringify(story));
  }

  // ---------- STORIES ----------
  const formData = await request.formData();
  const text = formData.get("text");
  const file = formData.get("file");

  if (!text) {
    return new Response("Story text is required", { status: 400 });
  }

  let mediaUrl = null;
  let mediaType = null;

  if (file && file.size > 0) {
    const key = `${crypto.randomUUID()}-${file.name}`;
    await env.MEDIA_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    mediaUrl = `${env.R2_PUBLIC_URL}/${key}`;
    mediaType = file.type;
  }

  const stories = (await env.STORIES.get("stories", "json")) || [];

  stories.push({
    id: crypto.randomUUID(),
    text,
    mediaUrl,
    mediaType,
    createdAt: Date.now(),
    comments: [],
  });

  await env.STORIES.put("stories", JSON.stringify(stories));

  return new Response("OK");
}

export async function DELETE({ request, env }) {
  const { id, adminPassword } = await request.json();

  if (adminPassword !== env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let stories = (await env.STORIES.get("stories", "json")) || [];
  const story = stories.find((s) => s.id === id);

  if (!story) {
    return new Response("Not found", { status: 404 });
  }

  // Delete media from R2
  if (story.mediaUrl) {
    const key = story.mediaUrl.split("/").pop();
    await env.MEDIA_BUCKET.delete(key);
  }

  stories = stories.filter((s) => s.id !== id);
  await env.STORIES.put("stories", JSON.stringify(stories));

  return new Response("Deleted");
}
