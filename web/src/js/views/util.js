// Only https links from curated content are rendered.
export function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
