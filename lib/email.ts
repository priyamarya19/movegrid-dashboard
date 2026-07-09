import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

type Attachment = { filename: string; content: Buffer; contentType: string };
type SendArgs = { to: string | string[]; subject: string; text: string; html?: string; attachments?: Attachment[] };

/**
 * Sends an email via AWS SES. Requires MAIL_FROM (a verified SES sender) in env.
 * Note: while the SES account is in sandbox, recipient addresses must also be verified.
 */
export async function sendEmail({ to, subject, text, html, attachments }: SendArgs) {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM is not configured");
  const recipients = Array.isArray(to) ? to : [to];

  if (attachments?.length) {
    await ses.send(new SendRawEmailCommand({ RawMessage: { Data: buildRawMime({ from, to: recipients, subject, text, html, attachments }) } }));
    return;
  }

  await ses.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: recipients },
      Message: {
        Subject: { Data: subject },
        Body: html ? { Html: { Data: html }, Text: { Data: text } } : { Text: { Data: text } },
      },
    })
  );
}

// Minimal multipart/mixed MIME builder — just enough to attach a file to an SES raw send.
function buildRawMime({ from, to, subject, text, html, attachments }: {
  from: string; to: string[]; subject: string; text: string; html?: string; attachments: Attachment[];
}): Uint8Array {
  const boundary = `mg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const altBoundary = `mg-alt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
    "",
  ];
  if (html) {
    lines.push(`--${altBoundary}`, "Content-Type: text/html; charset=UTF-8", "", html, "");
  }
  lines.push(`--${altBoundary}--`, "");

  for (const a of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.content.toString("base64"),
      ""
    );
  }
  lines.push(`--${boundary}--`, "");
  return new TextEncoder().encode(lines.join("\r\n"));
}
