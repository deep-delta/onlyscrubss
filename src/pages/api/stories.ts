export const prerender = false;

const getEnv = (locals: any) => locals.runtime.env;

export async function GET({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const url = new URL(request.url);
  const raw = await env.KV.get("stories");
  let allStories = raw ? JSON.parse(raw) : [];

  const authHeader = request.headers.get("Authorization");
  const isAdmin = authHeader === `Bearer ${env.ADMIN_PASSWORD}`;

  let visibleStories = isAdmin ? allStories : allStories.filter((s: any) => !s.hidden);
  
  // Sort by Date (Newest first)
  visibleStories.sort((a: any, b: any) => b.createdAt - a.createdAt);

  // Pagination
  const page = parseInt(url.searchParams.get("page") || "1");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam) : 10;
  const start = (page - 1) * limit;
  const slice = visibleStories.slice(start, start + limit);

  const singleId = url.searchParams.get("id");
  if (singleId) {
    const story = allStories.find((s: any) => s.id === singleId);
    if (!story || (story.hidden && !isAdmin)) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(story), { headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ stories: slice }), { headers: { "Content-Type": "application/json" } });
}

export async function POST({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const contentType = request.headers.get("content-type") || "";
  const raw = await env.KV.get("stories");
  let stories = raw ? JSON.parse(raw) : [];

  // JSON Handling (Comments/Admin)
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as any;
    if (!body) return new Response("Invalid JSON", { status: 400 });
    const { action, id, password, commentText, commentAuthor } = body;

    if (action === "comment") {
      const index = stories.findIndex((s: any) => s.id === id);
      if (index === -1) return new Response("Not found", { status: 404 });
      if (!stories[index].comments) stories[index].comments = [];
      stories[index].comments.push({
        id: crypto.randomUUID(), text: commentText, author: commentAuthor || "Anonymous", createdAt: Date.now()
      });
      await env.KV.put("stories", JSON.stringify(stories));
      return new Response("OK");
    }

    if (password !== env.ADMIN_PASSWORD) return new Response("Unauthorized", { status: 401 });
    const index = stories.findIndex((s: any) => s.id === id);
    if (index === -1) return new Response("Not found", { status: 404 });

    if (action === "hide") stories[index].hidden = !stories[index].hidden;
    if (action === "delete") stories.splice(index, 1);
    
    await env.KV.put("stories", JSON.stringify(stories));
    return new Response("OK");
  }

  // Form Handling (Create Story)
  try {
    const form = await request.formData();
    const text = form.get("text")?.toString().trim();
    const title = form.get("title")?.toString().trim();
    // Capture the new Role
    const role = form.get("role")?.toString().trim() || "Anonymous"; 
    const category = form.get("category")?.toString() || "General";
    const file = form.get("file");

    if (!text) return new Response("Text required", { status: 400 });

    let mediaUrl = null;
    let mediaType = null;
    if (file instanceof File && file.size > 0) {
      const filename = `${crypto.randomUUID()}.${file.name.split(".").pop()}`;
      await env.MEDIA_BUCKET.put(filename, file.stream(), { httpMetadata: { contentType: file.type } });
      mediaUrl = `${env.R2_PUBLIC_URL}/${filename}`;
      mediaType = file.type;
    }

    stories.unshift({
      id: crypto.randomUUID(),
      title: title || "Untitled Story",
      role, // Saved here
      text, category, mediaUrl, mediaType,
      createdAt: Date.now(), hidden: false, comments: []
    });

    await env.KV.put("stories", JSON.stringify(stories));
    return new Response("OK");
  } catch (err) { return new Response("Error", { status: 500 }); }
}
