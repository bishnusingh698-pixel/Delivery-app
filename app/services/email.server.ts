/**
 * Brevo transactional email (free tier). Only ever used for the merchant's own
 * daily digest; Pickday never emails shoppers.
 */
import { BRAND } from "../config/brand";

export function emailConfigured() {
  return !!process.env.BREVO_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(to: string[], subject: string, html: string, text: string): Promise<boolean> {
  if (!emailConfigured() || !to.length) return false;
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: BRAND.name, email: process.env.EMAIL_FROM },
      to: to.slice(0, 3).map((email) => ({ email })),
      subject,
      htmlContent: html,
      textContent: text,
      tags: ["digest"],
    }),
  });
  if (!res.ok) console.error("[email] Brevo", res.status, (await res.text()).slice(0, 300));
  return res.ok;
}
