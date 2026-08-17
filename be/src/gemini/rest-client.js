import { ProviderError } from '../lib/errors.js';

// Talks to the Interactions API over plain REST, not the SDK — the SDK's
// value here is mostly types and retries, and we deliberately don't want
// its retries. No retry logic anywhere in this file: a failed call
// always throws ProviderError and surfaces to the user as a failed step
// with a retry button (non-negotiable #3).
export function createRestClient({ apiKey, baseUrl, apiRevision, requestTimeoutMs }) {
  function authHeaders(extra = {}) {
    return { 'x-goog-api-key': apiKey, ...extra };
  }

  async function request(url, init, what) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new ProviderError({
          status: 504,
          body: `${what} timed out after ${Math.round(requestTimeoutMs / 1000)}s.`,
        });
      }
      throw new ProviderError({
        status: 502,
        body: `${what} could not reach Gemini: ${err.message}`,
      });
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      let message = bodyText;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        // body wasn't JSON — use the raw text
      }
      throw new ProviderError({
        status: res.status,
        body: `${what} failed (HTTP ${res.status}): ${message}`,
      });
    }

    return res;
  }

  async function waitUntilActive(file, { attempts = 10, delayMs = 1000 } = {}) {
    // text/plain is ACTIVE immediately in practice; this loop exists only
    // so a slow server doesn't hand back a still-PROCESSING uri. It's
    // polling *upload metadata*, not retrying a generation call, so it
    // doesn't violate non-negotiable #3 (no auto-retrying generations).
    let current = file;
    let attempt = 0;
    while (current.state === 'PROCESSING' && attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const res = await request(
        `${baseUrl}/v1beta/${current.name}`,
        { method: 'GET', headers: authHeaders() },
        'File status check'
      );
      current = await res.json();
      attempt++;
    }

    if (current.state === 'FAILED') {
      throw new ProviderError({
        status: 502,
        body: 'File upload failed to become ACTIVE.',
      });
    }

    return current;
  }

  async function uploadFile({ bytes, mimeType, displayName }) {
    const startRes = await request(
      `${baseUrl}/upload/v1beta/files`,
      {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(bytes.length),
          'X-Goog-Upload-Header-Content-Type': mimeType,
        }),
        body: JSON.stringify({ file: { display_name: displayName } }),
      },
      'File upload start'
    );

    const uploadUrl = startRes.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new ProviderError({
        status: 502,
        body: 'File upload start did not return an upload URL.',
      });
    }

    const finishRes = await request(
      uploadUrl,
      {
        method: 'POST',
        headers: {
          'Content-Length': String(bytes.length),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: bytes,
      },
      'File upload finalize'
    );

    const parsed = await finishRes.json();
    if (!parsed?.file?.uri) {
      throw new ProviderError({
        status: 502,
        body: 'File upload finalize did not return a file URI.',
      });
    }

    return waitUntilActive(parsed.file);
  }

  async function createInteraction({
    model,
    input,
    previousInteractionId,
    responseFormat,
    systemInstruction,
  }) {
    const body = {
      model,
      input,
      ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

    const res = await request(
      `${baseUrl}/v1beta/interactions`,
      {
        method: 'POST',
        // Only this endpoint needs Api-Revision — the File API calls don't.
        headers: authHeaders({ 'Content-Type': 'application/json', 'Api-Revision': apiRevision }),
        body: JSON.stringify(body),
      },
      'Interaction creation'
    );

    const parsed = await res.json();
    if (!parsed?.id) {
      throw new ProviderError({
        status: 502,
        body: 'Interaction creation did not return an id.',
      });
    }

    return parsed;
  }

  return { uploadFile, createInteraction };
}
