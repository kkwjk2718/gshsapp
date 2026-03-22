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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo send failed (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as BrevoSendResponse;
  return {
    messageId: payload.messageId ?? null,
  };
}
