type BrevoRecipient = {
  email: string;
  name?: string | null;
};

type SendBrevoEmailInput = {
  to: BrevoRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
};

type BrevoSendResponse = {
  messageId?: string;
};

const BREVO_TIMEOUT_MS = 10_000;
const BREVO_RESPONSE_MAX_BYTES = 8_192;

async function readBoundedJson(response: Response): Promise<BrevoSendResponse> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("Brevo returned an invalid response type");
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > BREVO_RESPONSE_MAX_BYTES) throw new Error("Brevo response exceeded the size limit");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Brevo returned an empty response");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > BREVO_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Brevo response exceeded the size limit");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as BrevoSendResponse;
  } catch {
    throw new Error("Brevo returned invalid JSON");
  }
}

function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "GSHS.app";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo API settings are not configured.");
  }

  return { apiKey, senderEmail, senderName };
}

export function hasBrevoConfiguration() {
  return Boolean(process.env.BREVO_API_KEY?.trim() && process.env.BREVO_SENDER_EMAIL?.trim());
}

export async function sendBrevoEmail(input: SendBrevoEmailInput) {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName,
      },
      to: [
        {
          email: input.to.email,
          name: input.to.name || undefined,
        },
      ],
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent,
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!response.ok) {
    if (response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) await readBoundedJson(response);
    throw new Error(`Brevo send failed (${response.status})`);
  }

  const payload = await readBoundedJson(response);
  return {
    messageId: payload.messageId ?? null,
  };
}
