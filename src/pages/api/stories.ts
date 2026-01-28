export const prerender = false;

const getEnv = (locals: any) => {
  return locals.runtime.env;
};

// Helper: Securely check if user is admin
const checkAdmin = (request: Request, env: any) => {
  const authHeader = request.headers.get("Authorization");
  return authHeader === `Bearer ${env.ADMIN_PASSWORD}`;
};

export async function GET({ request, locals }: { request: Request, locals: any }) {
  const env = getEnv(locals);
  const url = new URL(request.url);

  const raw = await env.KV.get("stories");
  let allStories = raw ? JSON.parse(raw) : [];
  const isAdmin = checkAdmin(request, env);

  // 1. Fetch Single Story (Detailed View)
  const singleId = url.searchParams.get("id");
  if (singleId) {
    const story = allStories.find((s: any) => s.id === singleId);
    if (!story || (story.hidden && !isAdmin)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(JSON.stringify(story), { headers: { "Content-Type": "application/json" } });
  }

  // 2. Fetch Feed (Pagination)
  const visibleStories = isAdmin ? allStories : allStories.filter((s: any) => !s.hidden);
  
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

  /* --- JSON ACTIONS (Admin & Comments) --- */
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null) as any;
    if (!body) return new Response("Invalid JSON", { status: 400 });

    const { action, id, password, commentText, commentAuthor } = body;

    // A. COMMENT ACTION (Public)
    if (action === "comment") {
      const index = stories.findIndex((s: any) => s.id === id);
      if (index === -1) return new Response("Story not found", { status: 404 });

      const newComment = {
        id: crypto.randomUUID(),
        text: commentText,
        author: commentAuthor || "Anonymous",
        createdAt: Date.now(),
        isAdmin: false // In future you can make this true if password matches
      };

      // Ensure comments array exists
      if (!stories[index].comments) stories[index].comments = [];
      stories[index].comments.push(newComment);
      
      await env.KV.put("stories", JSON.stringify(stories));
      return new Response(JSON.stringify(newComment));
    }

    // B. ADMIN ACTIONS (Hide/Delete)
    if (!password || password !== env.ADMIN_PASSWORD) {
      return new Response("Unauthorized", { status: 401 });
    }

    const index = stories.findIndex((s: any) => s.id === id);
    if (index === -1) return new Response("Not found", { status: 404 });

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
  }

  /* --- FORM DATA (Create Story) --- */
  try {
    const form = await request.formData();
    const text = form.get("text")?.toString().trim();
    const nameInput = form.get("name")?.toString().trim();
    const category = form.get("category")?.toString() || "General"; // New Field
    const file = form.get("file");

    if (!text) return new Response("Text required", { status: 400 });

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
      name: nameInput || "Anonymous",
      text,
      category,
      mediaUrl,
      mediaType,
      createdAt: Date.now(),
      hidden: false,
      comments: []
    });

    await env.KV.put("stories", JSON.stringify(stories));
    return new Response("OK");

  } catch (err) {
    return new Response("Error", { status: 500 });
  }
}
