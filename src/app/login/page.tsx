"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../../lib/firebase-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const router = useRouter();

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>

      <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">{mode === "signin" ? "Sign in" : "Sign up"}</button>
      </form>

      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        style={{ marginTop: 16, background: "none", border: "none", color: "blue", cursor: "pointer" }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}