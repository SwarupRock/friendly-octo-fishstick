/**
 * Campaign storage: one Firestore document per offer, owned by one user.
 *
 * A campaign is written piece by piece as the pipeline advances (transcript →
 * facts → lock → plan → poster/voice/video), so a package interrupted by a
 * closed app can be resumed from whatever was saved.
 */

import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import type { Storyboard } from './brag/director';
import type { Facts, Validation } from './facts';
import { db, storage } from './firebase';
import type { CopyCheck, Plan, Turn } from './pipeline';
import type { VideoStatus } from './providers/magichour';

export type Poster = {
  /** Text-free artwork; a Firebase Storage URL once uploaded, else the provider's URL. */
  artUrl: string | null;
  stored: boolean;
  headline: string;
  subline: string;
  /** True when the artwork could not be made and a plain background is shown. */
  usedFallback: boolean;
  artError?: string | null;
};

export type VoiceOver = { url: string; stored: boolean; language: string; speaker: string; script: string };

export type CampaignVideo = {
  taskId: string;
  status: VideoStatus;
  url: string | null;
  stored: boolean;
  error: string | null;
  startedAt: number;
};

export type Campaign = {
  id: string;
  createdAt: number;
  updatedAt: number;
  transcript: string;
  languageCode: string | null;
  /** Why speech-to-text failed, when it did. */
  sttError?: string | null;
  /** Why fact extraction failed, when it did. */
  extractionError?: string | null;
  facts: Facts;
  validation: Validation | null;
  turns: Turn[];
  locked: boolean;
  factHash: string | null;
  lockedAt: number | null;
  plan: Plan | null;
  poster: Poster | null;
  voice: VoiceOver | null;
  video: CampaignVideo | null;
  /** The Brag Director's storyboard for the brag video (absent on older offers). */
  brag?: Storyboard | null;
  checks: CopyCheck[] | null;
  /** True once the owner has accepted a package whose number check flagged something. */
  reviewed: boolean;
};

export type CampaignDraft = Omit<Campaign, 'id'>;

export type Profile = {
  displayName: string;
  businessName: string;
  businessLocation: string;
  email: string;
  speaker: string;
  createdAt: number;
};

const campaignsOf = (uid: string) => collection(db(), 'users', uid, 'campaigns');

// ── profile ─────────────────────────────────────────────────────────────
export async function loadProfile(uid: string): Promise<Profile | null> {
  const snapshot = await getDoc(doc(db(), 'users', uid));
  return snapshot.exists() ? (snapshot.data() as Profile) : null;
}

export async function saveProfile(uid: string, profile: Partial<Profile>): Promise<void> {
  await setDoc(doc(db(), 'users', uid), profile, { merge: true });
}

// ── campaigns ───────────────────────────────────────────────────────────
export async function createCampaign(uid: string, draft: CampaignDraft): Promise<Campaign> {
  const created = await addDoc(campaignsOf(uid), draft);
  return { ...draft, id: created.id };
}

export async function updateCampaign(uid: string, id: string, patch: Partial<CampaignDraft>): Promise<void> {
  await updateDoc(doc(campaignsOf(uid), id), { ...patch, updatedAt: Date.now() });
}

export async function getCampaign(uid: string, id: string): Promise<Campaign | null> {
  const snapshot = await getDoc(doc(campaignsOf(uid), id));
  return snapshot.exists() ? ({ ...(snapshot.data() as CampaignDraft), id: snapshot.id }) : null;
}

/** Live list of the owner's offers, newest first. Returns the unsubscribe function. */
export function watchCampaigns(
  uid: string,
  onChange: (campaigns: Campaign[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(campaignsOf(uid), orderBy('createdAt', 'desc'), limit(50)),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...(item.data() as CampaignDraft), id: item.id }))),
    (error) => onError?.(error),
  );
}

// ── media ───────────────────────────────────────────────────────────────
/**
 * Copy a generated file (a local file, a `data:` URI, or a provider's
 * short-lived URL) into the owner's Storage folder and return its permanent
 * download URL. Resolves to null when Storage is not set up or the upload
 * fails; the caller then keeps the original URL.
 */
export async function persistMedia(
  uid: string,
  campaignId: string,
  name: string,
  sourceUri: string,
  contentType: string,
): Promise<string | null> {
  const bucket = storage();
  if (!bucket) return null;
  try {
    const blob = await (await fetch(sourceUri)).blob();
    const target = ref(bucket, `users/${uid}/campaigns/${campaignId}/${name}`);
    await uploadBytes(target, blob, { contentType });
    return await getDownloadURL(target);
  } catch (error) {
    console.warn(`[storage] could not persist ${name}:`, (error as Error)?.message);
    return null;
  }
}
