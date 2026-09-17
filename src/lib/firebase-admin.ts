import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getFirebaseAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export async function verifyAuthToken(authHeader: string | null): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("UNAUTHENTICATED");
  }

  const token = authHeader.slice("Bearer ".length);
  const app = getFirebaseAdminApp();

  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new Error("UNAUTHENTICATED");
  }
}