import type {InfiniteData, QueryClient, QueryKey} from '@tanstack/react-query';
import type {Page} from '../api/types';

type Obj = Record<string, unknown>;

/**
 * Structurally-shared deep map: returns the same reference when nothing
 * matched, so untouched queries don't re-render.
 */
export function mapDeep(
  data: unknown,
  match: (o: Obj) => boolean,
  update: (o: Obj) => Obj,
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map(v => {
      const n = mapDeep(v, match, update);
      if (n !== v) {
        changed = true;
      }
      return n;
    });
    return changed ? next : data;
  }
  if (data && typeof data === 'object') {
    const o = data as Obj;
    let current = o;
    let changed = false;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object') {
        const n = mapDeep(v, match, update);
        if (n !== v) {
          if (!changed) {
            current = {...o};
            changed = true;
          }
          current[k] = n;
        }
      }
    }
    if (match(current)) {
      return update(current);
    }
    return current;
  }
  return data;
}

export type Snapshot = Array<[QueryKey, unknown]>;

/**
 * Patch every cached entity matching `match` in every query (feeds, detail,
 * search, profiles…). Returns a snapshot of the previous data for rollback.
 */
export function patchEntities(
  qc: QueryClient,
  match: (o: Obj) => boolean,
  update: (o: Obj) => Obj,
): Snapshot {
  const snapshot: Snapshot = [];
  qc.getQueryCache()
    .getAll()
    .forEach(q => {
      const prev = q.state.data;
      if (prev === undefined) {
        return;
      }
      const next = mapDeep(prev, match, update);
      if (next !== prev) {
        snapshot.push([q.queryKey, prev]);
        qc.setQueryData(q.queryKey, next);
      }
    });
  return snapshot;
}

export function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}

export const isPost = (id: string) => (o: Obj) =>
  o.id === id && 'likedByMe' in o;
export const isUser = (id: string) => (o: Obj) =>
  o.id === id && 'isFollowing' in o;
export const isCommunity = (id: string) => (o: Obj) =>
  o.id === id && 'isMember' in o;
export const isConversation = (id: string) => (o: Obj) =>
  o.id === id && 'unreadCount' in o && 'participants' in o;

/** Remove an entity (by id) from every paginated list in the cache. */
export function removeFromPages(
  qc: QueryClient,
  prefix: QueryKey[] | null,
  id: string,
) {
  qc.getQueryCache()
    .getAll()
    .forEach(q => {
      if (prefix && !prefix.some(p => p[0] === q.queryKey[0])) {
        return;
      }
      const data = q.state.data as InfiniteData<Page<{id: string}>> | undefined;
      if (!data || !Array.isArray((data as {pages?: unknown}).pages)) {
        return;
      }
      if (!data.pages.every(p => p && Array.isArray(p.items))) {
        return;
      }
      const found = data.pages.some(p => p.items.some(i => i.id === id));
      if (found) {
        qc.setQueryData(q.queryKey, {
          ...data,
          pages: data.pages.map(p => ({
            ...p,
            items: p.items.filter(i => i.id !== id),
          })),
        });
      }
    });
}

/** Prepend an item to the first page of an infinite list (deduped). */
export function prependToPages<T extends {id: string}>(
  qc: QueryClient,
  key: QueryKey,
  item: T,
) {
  qc.setQueryData<InfiniteData<Page<T>>>(key, data => {
    if (!data || !data.pages.length) {
      return data;
    }
    const pages = data.pages.map(p => ({
      ...p,
      items: p.items.filter(i => i.id !== item.id),
    }));
    pages[0] = {...pages[0], items: [item, ...pages[0].items]};
    return {...data, pages};
  });
}
