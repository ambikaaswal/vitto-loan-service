import { NextResponse } from "next/server";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INTERNAL: 500,
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(code: ErrorCode, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code] }
  );
}


//   Wraps a route handler with auth verification and consistent error handling
 
export async function withAuth(
  request: Request,
  handler: (uid: string) => Promise<Response>
): Promise<Response> {
  const { verifyAuthToken } = await import("./firebase-admin");
  try {
    const uid = await verifyAuthToken(request.headers.get("authorization"));
    return await handler(uid);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      return fail("UNAUTHENTICATED", "Missing or invalid authentication token");
    }
    console.error(err);
    return fail("INTERNAL", "Something went wrong");
  }
}