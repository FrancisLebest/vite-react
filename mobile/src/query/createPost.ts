import {useState} from 'react';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {api} from '../api';
import type {CreatePostInput} from '../api/endpoints';
import type {Post} from '../api/types';
import {qk} from './keys';

/** POST /posts (multipart) with upload progress + cache invalidation. */
export function useCreatePost() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation<Post, unknown, CreatePostInput>({
    mutationFn: input => {
      setProgress(0);
      return api.posts.create(input, {onProgress: setProgress});
    },
    onSuccess: post => {
      qc.setQueryData(qk.post(post.id), post);
      qc.invalidateQueries(['feed']);
      qc.invalidateQueries(['userPosts', post.author.id]);
      qc.invalidateQueries(qk.user(post.author.id));
      if (post.community) {
        qc.invalidateQueries(qk.communityPosts(post.community.id));
        qc.invalidateQueries(qk.community(post.community.id));
      }
    },
  });
  return {...mutation, progress};
}
