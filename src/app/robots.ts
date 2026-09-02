import type { MetadataRoute } from "next";

/**
 * Saved reports live under /r/<id> and are meant to be shared by link, not
 * found by search — they carry whatever document a visitor happened to paste.
 * Everything else is public on purpose.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/r/", "/api/"],
    },
  };
}
