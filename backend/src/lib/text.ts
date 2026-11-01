/** Extracts unique lowercase hashtags (without "#"), max 20. */
export function extractHashtags(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_&#])#([\p{L}\p{N}_]{1,50})/gu)) {
    const tag = m[1]!.toLowerCase();
    if (!/^\d+$/.test(tag)) set.add(tag);
    if (set.size >= 20) break;
  }
  return [...set];
}

/** Extracts unique lowercase @usernames, max 20. */
export function extractMentions(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_.@])@([a-zA-Z0-9._]{3,30})/gu)) {
    set.add(m[1]!.toLowerCase().replace(/\.+$/, ''));
    if (set.size >= 20) break;
  }
  return [...set].filter((u) => u.length >= 3);
}

/** Escapes LIKE/ILIKE wildcards. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function snippet(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
