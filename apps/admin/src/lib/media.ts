"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  COOKIES,
  HEADERS,
  type DetailResponse,
  type ListResponse,
  type MediaAssetSummary,
} from "@cartforge/types";
import {
  API_BASE,
  ApiError,
  apiRequest,
  newRequestId,
  normalizeError,
  readCookie,
} from "./api-client";
import { MEDIA_VIDEO_MIME_TYPES } from "@cartforge/validation";
import { storeKey, useSession } from "./session";

export interface UploadHandle {
  promise: Promise<MediaAssetSummary>;
  abort: () => void;
}

/**
 * Multipart POST with progress. fetch() can't report upload progress, so this uses
 * XHR while keeping the same headers and error normalization as apiRequest.
 */
function postForm<T>(
  path: string,
  body: FormData,
  storeId: string,
  onProgress: (fraction: number) => void,
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const requestId = newRequestId();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader(HEADERS.REQUEST_ID, requestId);
    xhr.setRequestHeader(HEADERS.STORE_ID, storeId);
    const csrf = readCookie(COOKIES.CSRF, document.cookie);
    if (csrf) xhr.setRequestHeader(HEADERS.CSRF, csrf);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = async () => {
      const res = new Response(xhr.responseText, {
        status: xhr.status,
        headers: { "x-request-id": xhr.getResponseHeader("x-request-id") ?? requestId },
      });
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(((await res.json()) as DetailResponse<T>).data);
      } else {
        reject(await normalizeError(res, requestId));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError(
          0,
          "NETWORK_ERROR",
          "Upload failed. Check your connection and retry.",
          requestId,
        ),
      );
    xhr.onabort = () => reject(new ApiError(0, "ABORTED", "Upload cancelled.", requestId));
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

/** Uploads an image, or a video (see uploadVideo), with progress. */
export function uploadMedia(
  file: File,
  storeId: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  if (isVideoFile(file)) return uploadVideo(file, storeId, onProgress);
  const body = new FormData();
  body.append("file", file);
  return postForm<MediaAssetSummary>("/media", body, storeId, onProgress);
}

export const isVideoFile = (f: File) =>
  (VIDEO_TYPES as readonly string[]).includes(f.type) || /\.(mp4|m4v|webm|mov)$/i.test(f.name);

const videoMime = (f: File): string =>
  (VIDEO_TYPES as readonly string[]).includes(f.type)
    ? f.type
    : /\.webm$/i.test(f.name)
      ? "video/webm"
      : /\.mov$/i.test(f.name)
        ? "video/quicktime"
        : "video/mp4";

const aborted = () => new ApiError(0, "ABORTED", "Upload cancelled.", newRequestId());
const unplayable = () =>
  new ApiError(
    0,
    "VIDEO_UNPLAYABLE",
    "This browser can't play this video, so shoppers' browsers may not either. Export it as MP4 (H.264) and try again.",
    newRequestId(),
  );

/**
 * Reads a video's size and length and grabs a cover frame (a JPEG, at most 1920 px).
 * Done here because the server doesn't decode video. A video this browser can't decode
 * is refused: it wouldn't play for most shoppers either.
 */
export async function inspectVideo(
  file: File,
): Promise<{ width: number; height: number; duration_ms: number; poster: Blob }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadeddata = () => resolve();
      v.onerror = () => reject(unplayable());
      setTimeout(() => reject(unplayable()), 20_000);
    });
    if (!v.videoWidth || !v.videoHeight) throw unplayable();
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    // A frame a little in, past fades from black.
    const at = Math.min(1, duration / 4);
    if (at > 0) {
      await new Promise<void>((resolve) => {
        v.onseeked = () => resolve();
        v.currentTime = at;
        setTimeout(resolve, 5_000);
      });
    }
    const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(unplayable())), "image/jpeg", 0.88),
    );
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      duration_ms: Math.round(duration * 1000),
      poster,
    };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Video upload: inspect in the browser, ask the API where to send the file, upload it
 * (straight to Vercel Blob on the hosted site; through the API elsewhere), then register
 * it with its cover frame. Progress covers the file transfer.
 */
export function uploadVideo(
  file: File,
  storeId: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const controller = new AbortController();
  let abortForm: (() => void) | null = null;
  const promise = (async () => {
    const mime = videoMime(file);
    const [meta, checksum] = await Promise.all([inspectVideo(file), sha256Hex(file)]);
    if (controller.signal.aborted) throw aborted();

    const start = await apiRequest<
      DetailResponse<{
        asset: MediaAssetSummary | null;
        upload:
          | { strategy: "vercel-blob"; pathname: string; client_token: string }
          | { strategy: "api" }
          | null;
      }>
    >("/media/videos/uploads", {
      method: "POST",
      storeId,
      body: {
        filename: file.name.slice(0, 255) || "video",
        mime_type: mime,
        size_bytes: file.size,
        checksum_sha256: checksum,
      },
    });
    if (start.data.asset) {
      onProgress(1);
      return start.data.asset;
    }

    const form = new FormData();
    form.append("filename", file.name.slice(0, 255) || "video");
    form.append("mime_type", mime);
    form.append("checksum_sha256", checksum);
    form.append("width", String(meta.width));
    form.append("height", String(meta.height));
    form.append("duration_ms", String(meta.duration_ms));
    form.append("poster", meta.poster, "poster.jpg");

    const upload = start.data.upload!;
    if (upload.strategy === "vercel-blob") {
      const { put } = await import("@vercel/blob/client");
      try {
        await put(upload.pathname, file, {
          access: "public",
          token: upload.client_token,
          contentType: mime,
          multipart: file.size > 20 * 1024 * 1024,
          abortSignal: controller.signal,
          onUploadProgress: (p) => onProgress((p.loaded / p.total) * 0.97),
        });
      } catch (err) {
        if (controller.signal.aborted) throw aborted();
        throw new ApiError(
          0,
          "NETWORK_ERROR",
          err instanceof Error && err.message ? `Upload failed: ${err.message}` : "Upload failed.",
          newRequestId(),
        );
      }
      if (controller.signal.aborted) throw aborted();
      const done = postForm<MediaAssetSummary>("/media/videos", form, storeId, () => {});
      abortForm = done.abort;
      const asset = await done.promise;
      onProgress(1);
      return asset;
    }

    // Through the API: the video travels with the registration request.
    form.append("file", file, file.name || "video");
    const done = postForm<MediaAssetSummary>("/media/videos", form, storeId, onProgress);
    abortForm = done.abort;
    return done.promise;
  })();
  return {
    promise,
    abort: () => {
      controller.abort();
      abortForm?.();
    },
  };
}

export function useMediaLibrary(
  params: { q?: string; page: number; page_size: number; type?: "image" | "video" },
  enabled = true,
) {
  const storeId = useSession().store?.store_id;
  return useQuery({
    queryKey: storeKey(storeId, "media", "list", params),
    enabled: enabled && Boolean(storeId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiRequest<ListResponse<MediaAssetSummary>>("/media", {
        storeId,
        signal,
        query: { ...params },
      }),
  });
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = MEDIA_VIDEO_MIME_TYPES;

/** "0:15", "2:05" */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
