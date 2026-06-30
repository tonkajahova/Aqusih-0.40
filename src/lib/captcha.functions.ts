import { createServerFn } from "@tanstack/react-start";

// Public, client-safe exposure of the hCaptcha site key.
// Site keys are public by design; this just avoids requiring a VITE_ env.
export const getCaptchaSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  return { siteKey: process.env.HCAPTCHA_SITE_KEY ?? "" };
});
