import { Injectable } from '@angular/core';
import {
  DataSnapshot,
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update
} from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '../firebase';

export interface Post {
  id: string;
  title: string;
  body: string;
  community: string;
  authorId: string;
  authorName: string;
  score: number;
  commentCount: number;
  createdAt: number;
}

export interface Comment {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
}

@Injectable({ providedIn: 'root' })
export class SocialService {
  private readonly db = getDatabase(firebaseApp);
  private readonly auth = getAuth(firebaseApp);

  watchPosts(callback: (posts: Post[]) => void, onError?: (error: Error) => void): () => void {
    return onValue(ref(this.db, 'posts'), (snapshot) => {
      const posts = this.snapshotChildren<Post>(snapshot).sort(
        (first, second) => second.createdAt - first.createdAt
      );
      callback(posts);
    }, onError);
  }

  watchPost(postId: string, callback: (post: Post | null) => void): () => void {
    return onValue(ref(this.db, `posts/${postId}`), (snapshot) => {
      callback(snapshot.exists() ? this.snapshotValue<Post>(snapshot) : null);
    });
  }

  watchComments(postId: string, callback: (comments: Comment[]) => void): () => void {
    return onValue(ref(this.db, `comments/${postId}`), (snapshot) => {
      callback(this.snapshotChildren<Comment>(snapshot).sort(
        (first, second) => first.createdAt - second.createdAt
      ));
    });
  }

  async createPost(title: string, body: string, community: string): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('auth/not-authenticated');
    }

    const postRef = push(ref(this.db, 'posts'));
    await set(postRef, {
      title,
      body,
      community: community || 'general',
      authorId: user.uid,
      authorName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      score: 0,
      commentCount: 0,
      createdAt: serverTimestamp()
    });

    if (!postRef.key) {
      throw new Error('database/post-id-missing');
    }
    return postRef.key;
  }

  async createComment(postId: string, body: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('auth/not-authenticated');
    }

    const commentRef = push(ref(this.db, `comments/${postId}`));
    const postRef = ref(this.db, `posts/${postId}`);
    await set(commentRef, {
      body,
      authorId: user.uid,
      authorName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      createdAt: serverTimestamp()
    });
    await update(postRef, {
      commentCount: (await this.readNumber(`${postId}/commentCount`)) + 1
    });
  }

  async vote(postId: string, value: 1 | -1): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('auth/not-authenticated');
    }

    await set(ref(this.db, `votes/${postId}/${user.uid}`), value);
    await update(ref(this.db, `posts/${postId}`), {
      score: await this.calculateScore(postId)
    });
  }

  async deletePost(postId: string): Promise<void> {
    await remove(ref(this.db, `posts/${postId}`));
    await remove(ref(this.db, `comments/${postId}`));
    await remove(ref(this.db, `votes/${postId}`));
  }

  private async calculateScore(postId: string): Promise<number> {
    return new Promise((resolve) => {
      onValue(ref(this.db, `votes/${postId}`), (snapshot) => {
        let score = 0;
        snapshot.forEach((child) => {
          score += Number(child.val()) || 0;
        });
        resolve(score);
      }, { onlyOnce: true });
    });
  }

  private async readNumber(path: string): Promise<number> {
    return new Promise((resolve) => {
      onValue(ref(this.db, `posts/${path}`), (snapshot) => {
        resolve(Number(snapshot.val()) || 0);
      }, { onlyOnce: true });
    });
  }

  private snapshotChildren<T extends { id?: string }>(snapshot: DataSnapshot): T[] {
    const values: T[] = [];
    snapshot.forEach((child) => {
      values.push({ ...child.val(), id: child.key } as T);
      return false;
    });
    return values;
  }

  private snapshotValue<T>(snapshot: DataSnapshot): T {
    return { ...snapshot.val(), id: snapshot.key } as T;
  }
}
