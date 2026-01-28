export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ isAdmin: false }),
      { status: 400 }
    );
  }

  const password = body?.password;

  if (!password || !env.ADMIN_PASSWORD) {
    return new Response(
      JSON.stringify({ isAdmin: false }),
      { status: 200 }
    );
  }

  const isAdmin = password === env.ADMIN_PASSWORD;

  return new Response(
    JSON.stringify({ isAdmin }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
