"use client";

import { useAuth } from "../lib/use-auth";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  async function logToken() {
    if (user) {
      const token = await user.getIdToken();
      console.log(token);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Vitto Loan Service</h1>
      {user ? (
        <>
          <p>Signed in as {user.email}</p>
          <button onClick={logToken}>Log ID token to console</button>
        </>
      ) : (
        <a href="/login">Sign in</a>
      )}
    </div>
  );
}