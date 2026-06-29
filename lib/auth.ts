import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getAdminEmails } from "./env";

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly"
];

async function refreshGoogleAccessToken(token: any) {
  if (!token.refreshToken) return { ...token, error: "RefreshAccessTokenError" };

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken
      })
    });
    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in ?? 0),
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const requiredGoogleScopes = googleScopes;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: googleScopes.join(" "),
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (account?.refresh_token) token.refreshToken = account.refresh_token;
      if (account?.expires_at) token.expiresAt = account.expires_at;

      if (token.expiresAt && Date.now() < Number(token.expiresAt) * 1000 - 60_000) return token;
      if (token.refreshToken) return refreshGoogleAccessToken(token);
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      session.tokenExpiresAt = token.expiresAt as number | undefined;
      const email = session.user?.email?.toLowerCase() ?? "";
      session.user.isAdmin = getAdminEmails().includes(email);
      return session;
    }
  }
};

export const handler = NextAuth(authOptions);
