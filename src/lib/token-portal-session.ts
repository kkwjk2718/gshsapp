import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const TOKEN_PORTAL_SESSION_COOKIE = "gshs_token_portal_session";
export const TOKEN_PORTAL_CLIENT_COOKIE = "gshs_token_portal_client";
export const TOKEN_PORTAL_COOLDOWN_COOKIE = "gshs_token_portal_cooldown";
export const TOKEN_PORTAL_SESSION_TTL_SECONDS = 60 * 30;
export const TOKEN_PORTAL_COOLDOWN_SECONDS = 60;

type PortalSessionPayload = {
  expiresAt: number;
  sessionVersion: number;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getPortalSessionSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET is required for token portal sessions.");
  }

  return secret;
}

function createSignature(payload: string) {
  return createHmac("sha256", getPortalSessionSecret()).update(payload).digest("base64url");
}

function signPortalSessionPayload(payload: PortalSessionPayload) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyPortalSessionPayload(serializedValue: string) {
  const [encodedPayload, signature] = serializedValue.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as PortalSessionPayload;
    if (!payload.expiresAt || !payload.sessionVersion) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getPortalClientKey() {
  const cookieStore = await cookies();
  const existingKey = cookieStore.get(TOKEN_PORTAL_CLIENT_COOKIE)?.value;
  if (existingKey) {
    return existingKey;
  }

  const clientKey = randomUUID();
  cookieStore.set(TOKEN_PORTAL_CLIENT_COOKIE, clientKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/signup/request",
    maxAge: 60 * 60 * 24 * 30,
  });

  return clientKey;
}

export async function setPortalCooldownCookie() {
  const cookieStore = await cookies();
  cookieStore.set(
    TOKEN_PORTAL_COOLDOWN_COOKIE,
    String(Date.now() + TOKEN_PORTAL_COOLDOWN_SECONDS * 1000),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/signup/request",
      maxAge: TOKEN_PORTAL_COOLDOWN_SECONDS,
    },
  );
}

export async function getPortalCooldownRemainingSeconds() {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(TOKEN_PORTAL_COOLDOWN_COOKIE)?.value;
  if (!rawValue) {
    return 0;
  }

  const expiresAt = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(expiresAt)) {
    return 0;
  }

  const remainingMs = expiresAt - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

export async function setPortalSessionCookie(sessionVersion: number) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + TOKEN_PORTAL_SESSION_TTL_SECONDS * 1000;
  const serializedValue = signPortalSessionPayload({
    expiresAt,
    sessionVersion,
  });

  cookieStore.set(TOKEN_PORTAL_SESSION_COOKIE, serializedValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/signup/request",
    maxAge: TOKEN_PORTAL_SESSION_TTL_SECONDS,
  });
}

export async function clearPortalSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/signup/request",
    maxAge: 0,
  });
}

export async function hasValidPortalSession(expectedVersion: number) {
  const cookieStore = await cookies();
  const serializedValue = cookieStore.get(TOKEN_PORTAL_SESSION_COOKIE)?.value;
  if (!serializedValue) {
    return false;
  }

  const payload = verifyPortalSessionPayload(serializedValue);
  if (!payload) {
    return false;
  }

  if (payload.expiresAt <= Date.now()) {
    return false;
  }

  return payload.sessionVersion === expectedVersion;
}
