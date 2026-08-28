import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { AUTH_COOKIE_NAME, requireAuth, signAuthToken } from "../middleware/auth.js";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 3600 * 1000,
};

// ---------- Google OAuth login ----------

authRouter.get("/google", (req, res) => {
  if (!env.googleClientId) {
    return res.status(500).send("Google OAuth is not configured (missing GOOGLE_CLIENT_ID).");
  }
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

authRouter.get("/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    return res.redirect(`${env.frontendUrl}/login?error=missing_code`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
      throw new Error(`Google userinfo fetch failed: ${await profileRes.text()}`);
    }
    const profile = (await profileRes.json()) as {
      sub: string;
      email: string;
      name: string;
      picture?: string;
    };

    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      update: { email: profile.email, name: profile.name, avatar: profile.picture },
      create: {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name,
        avatar: profile.picture,
      },
    });

    const token = signAuthToken({ sub: user.id, email: user.email, name: user.name });
    res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    res.redirect(`${env.frontendUrl}/login?error=oauth_failed`);
  }
});

// ---------- Slack OAuth (rate-limit notifications) ----------

authRouter.get("/slack", requireAuth, (req, res) => {
  if (!env.slackClientId) {
    return res.status(500).send("Slack OAuth is not configured (missing SLACK_CLIENT_ID).");
  }
  const params = new URLSearchParams({
    client_id: env.slackClientId,
    scope: "incoming-webhook",
    redirect_uri: env.slackRedirectUri,
    state: req.user!.id,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

authRouter.get("/slack/callback", requireAuth, async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    return res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }

  try {
    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.slackClientId,
        client_secret: env.slackClientSecret,
        code,
        redirect_uri: env.slackRedirectUri,
      }),
    });
    const json = (await tokenRes.json()) as {
      ok: boolean;
      error?: string;
      incoming_webhook?: { url: string; channel: string };
      team?: { id: string; name: string };
    };

    if (!json.ok || !json.incoming_webhook) {
      throw new Error(json.error ?? "Slack did not return an incoming webhook");
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        slackTeamId: json.team?.id,
        slackTeamName: json.team?.name,
        slackWebhookUrl: json.incoming_webhook.url,
        slackChannel: json.incoming_webhook.channel,
      },
    });

    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    console.error("Slack OAuth callback failed:", err);
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }
});

authRouter.post("/slack/disconnect", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { slackTeamId: null, slackTeamName: null, slackWebhookUrl: null, slackChannel: null },
  });
  res.json({ ok: true });
});

// ---------- Session ----------

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    slackConnected: !!user.slackWebhookUrl,
    slackTeamName: user.slackTeamName,
  });
});

authRouter.post("/logout", (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
  res.json({ ok: true });
});
