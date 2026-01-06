import { cookies } from "next/headers";

export async function POST() {
    const cookieStore = await cookies();

    // Clear the session cookie set by your server action signIn()
    cookieStore.set("session", "", {
        maxAge: 0,
        path: "/",
    });

    return Response.json({ success: true });
}
