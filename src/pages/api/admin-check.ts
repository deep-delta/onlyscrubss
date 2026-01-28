export const prerender = false;

export async function POST({ request, locals }: { request: Request, locals: any }) {
  // Access environment variables
  const env = locals.runtime.env;
  
  try {
    const body = await request.json() as any;
    const { password } = body;

    // Compare the password sent by the user with the one in your settings
    const isAdmin = (password === env.ADMIN_PASSWORD);

    return new Response(JSON.stringify({ isAdmin }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ isAdmin: false }), { status: 400 });
  }
}
