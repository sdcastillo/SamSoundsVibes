(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.MissionControl = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ACCOUNTS = [
    { id: "x", name: "X @SamCast65215624", mode: "composer", checked: true, limit: 280, url: textUrl("https://x.com/intent/post?text=") },
    { id: "bluesky", name: "Bluesky @supersam7.bsky.social", mode: "composer", checked: true, limit: 300, url: textUrl("https://bsky.app/intent/compose?text=") },
    { id: "facebook", name: "Facebook SamSoundsVibes", mode: "link", checked: true, url: linkUrl("https://www.facebook.com/sharer/sharer.php?u=") },
    { id: "facebook-business", name: "Facebook Predictive Analyst", mode: "link", checked: false, url: linkUrl("https://www.facebook.com/sharer/sharer.php?u=") },
    { id: "linkedin", name: "LinkedIn samdcastillo", mode: "link", checked: true, url: linkUrl("https://www.linkedin.com/sharing/share-offsite/?url=") },
    { id: "instagram", name: "Instagram _sam_d_c_", mode: "open", checked: true, url: fixed("https://www.instagram.com/") },
    { id: "instagram-business", name: "Instagram futuroinsight", mode: "open", checked: false, url: fixed("https://www.instagram.com/futuroinsight/") },
    { id: "youtube", name: "YouTube @predictiveanalyst", mode: "open", checked: true, url: fixed("https://studio.youtube.com/") },
    { id: "youtube-music", name: "YouTube @GUILDSOUNDVIBES", mode: "open", checked: false, url: fixed("https://studio.youtube.com/") },
    { id: "substack", name: "Substack @predictiveanalyst", mode: "open", checked: true, url: fixed("https://substack.com/@predictiveanalyst") },
    { id: "soundcloud", name: "SoundCloud lonestarriot", mode: "open", checked: false, url: fixed("https://soundcloud.com/upload") }
  ];

  function textUrl(base) {
    return function (message) {
      return base + encodeURIComponent(message);
    };
  }

  function linkUrl(base) {
    return function (_message, link) {
      return base + encodeURIComponent(link);
    };
  }

  function fixed(url) {
    return function () {
      return url;
    };
  }

  function buildMessage(text, link) {
    const body = String(text || "").trim();
    const url = String(link || "").trim();
    if (body && url) return body + "\n\n" + url;
    return body || url;
  }

  function fit(message, limit) {
    if (!limit || message.length <= limit) return message;
    return message.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
  }

  function plan(text, link, selectedIds) {
    const full = buildMessage(text, link);
    const chosen = new Set(selectedIds);
    return ACCOUNTS.filter(function (account) {
      return chosen.has(account.id);
    }).map(function (account) {
      const message = fit(full, account.limit);
      return {
        id: account.id,
        name: account.name,
        mode: account.mode,
        message: message,
        url: account.url(message, String(link || "").trim())
      };
    });
  }

  return {
    ACCOUNTS: ACCOUNTS,
    buildMessage: buildMessage,
    plan: plan
  };
});
