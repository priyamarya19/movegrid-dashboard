import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

type SendArgs = { to: string | string[]; subject: string; text: string; html?: string };

/**
 * Sends an email via AWS SES. Requires MAIL_FROM (a verified SES sender) in env.
 * Note: while the SES account is in sandbox, recipient addresses must also be verified.
 */
export async function sendEmail({ to, subject, text, html }: SendArgs) {
  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM is not configured");

  await ses.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
      Message: {
        Subject: { Data: subject },
        Body: html ? { Html: { Data: html }, Text: { Data: text } } : { Text: { Data: text } },
      },
    })
  );
}
