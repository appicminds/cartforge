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
import { storeKey, useSession } from "./session";

export interface UploadHandle {
  promise: Promise<MediaAssetSummary>;
  abort: () => void;
}

/**
 * Multipart upload with progress. fetch() can't report upload progress, so this
 * uses XHR while keeping the same headers and error normalization as apiRequest.
 */
export function uploadMedia(
  file: File,
  storeId: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const requestId = newRequestId();
  const promise = new Promise<MediaAssetSummary>((resolve, reject) => {
    xhr.open("POST", `${API_BASE}/media`);
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
        resolve(((await res.json()) as DetailResponse<MediaAssetSummary>).data);
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
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

export function useMediaLibrary(
  params: { q?: string; page: number; page_size: number },
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

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
