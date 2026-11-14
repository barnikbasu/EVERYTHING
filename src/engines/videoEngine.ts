import { encodeAudioBufferToWav } from './audioEngine';
import { createBrowserAudioContext } from '../utils/mediaUtils';

export interface VideoExportOptions {
  trimStartSec: number;
  trimEndSec: number;
  rotateDeg: 0 | 90 | 180 | 270;
  aspectPreset: 'original' | '16:9' | '9:16' | '1:1' | '4:5';
  maxWidth: number; // e.g. 1280 or 720
  muteAudio: boolean;
  playbackRate: number;
}

export interface GifExportOptions {
  trimStartSec: number;
  trimEndSec: number;
  fps: number;
  width: number;
}

export function computeOutputDimensions(
  srcW: number,
  srcH: number,
  rotateDeg: 0 | 90 | 180 | 270,
  aspectPreset: VideoExportOptions['aspectPreset'],
  maxWidth: number
): { width: number; height: number } {
  const rot90 = rotateDeg === 90 || rotateDeg === 270;
  const effW = rot90 ? srcH : srcW;
  const effH = rot90 ? srcW : srcH;

  let ratio = effW / Math.max(1, effH);
  if (aspectPreset === '16:9') ratio = 16 / 9;
  else if (aspectPreset === '9:16') ratio = 9 / 16;
  else if (aspectPreset === '1:1') ratio = 1;
  else if (aspectPreset === '4:5') ratio = 4 / 5;

  const w = Math.min(maxWidth, Math.max(120, effW));
  const evenW = w % 2 === 0 ? w : w - 1;
  const h = Math.round(evenW / ratio);
  const evenH = h % 2 === 0 ? h : h - 1;
  return { width: evenW, height: Math.max(120, evenH) };
}

async function seekVideoWithTimeout(video: HTMLVideoElement, timeSec: number, timeoutMs = 4000): Promise<void> {
  const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : timeSec;
  const clamped = Math.max(0, Math.min(safeDuration, timeSec));
  if (Math.abs(video.currentTime - clamped) < 0.001 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      video.onseeked = null;
      video.onerror = null;
      reject(new Error('Video seek timed out.'));
    }, timeoutMs);
    video.onseeked = () => {
      clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
      reject(new Error('Video decoding error while seeking.'));
    };
    video.currentTime = clamped;
  });
}

export async function exportVideoToGif(
  videoUrl: string,
  opts: GifExportOptions,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not decode video for GIF export'));
  });

  const aspect = video.videoWidth / Math.max(1, video.videoHeight);
  const outW = Math.min(640, Math.max(120, opts.width));
  const outH = Math.max(90, Math.round(outW / aspect));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  const duration = Math.max(0.2, Math.min(15, opts.trimEndSec - opts.trimStartSec));
  const totalFrames = Math.max(2, Math.floor(duration * opts.fps));
  const delayMs = Math.round(1000 / opts.fps);

  const gifMod = await import('gifenc');
  const gifNs = (
    'GIFEncoder' in gifMod
      ? gifMod
      : (gifMod as unknown as { default: typeof gifMod }).default
  ) as typeof gifMod;
  const { GIFEncoder, quantize, applyPalette } = gifNs;

  const gif = GIFEncoder();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) throw new Error('GIF export cancelled');
    const targetTime = opts.trimStartSec + (i / opts.fps);
    await seekVideoWithTimeout(video, targetTime);
    ctx.drawImage(video, 0, 0, outW, outH);
    const { data } = ctx.getImageData(0, 0, outW, outH);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, outW, outH, { palette, delay: delayMs });
    onProgress?.(Math.round(((i + 1) / totalFrames) * 100));
  }

  gif.finish();
  return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' });
}

export async function extractVideoThumbnails(
  videoUrl: string,
  timestampsSec: number[]
): Promise<Array<{ timeSec: number; blob: Blob; dataUrl: string }>> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not load video metadata'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const results: Array<{ timeSec: number; blob: Blob; dataUrl: string }> = [];
  for (const t of timestampsSec) {
    await seekVideoWithTimeout(video, t);
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Snapshot failed'))), 'image/png')
    );
    results.push({ timeSec: t, blob, dataUrl });
  }
  return results;
}

export async function extractAudioTrackFromVideo(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = createBrowserAudioContext();
  try {
    const audioBuf = await ctx.decodeAudioData(arrayBuffer);
    return encodeAudioBufferToWav(audioBuf);
  } catch {
    throw new Error(
      'This browser could not decode the audio codec inside the container directly. Try a WebM or MP4 with AAC/Opus audio.'
    );
  } finally {
    await ctx.close();
  }
}

export async function transcodeVideoWithCanvas(
  videoUrl: string,
  opts: VideoExportOptions,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.playsInline = true;
  video.muted = opts.muteAudio;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not load video for rendering'));
  });

  const { width, height } = computeOutputDimensions(
    video.videoWidth,
    video.videoHeight,
    opts.rotateDeg,
    opts.aspectPreset,
    opts.maxWidth
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));

  // Attach audio stream if unmuted and supported
  let audioCtx: AudioContext | null = null;
  if (!opts.muteAudio) {
    try {
      const vidWithCapture = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      if (typeof vidWithCapture.captureStream === 'function') {
        const vStream = vidWithCapture.captureStream();
        vStream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
      } else {
        audioCtx = createBrowserAudioContext();
        const src = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
      }
    } catch {
      // Proceed video-only if browser restricts captureStream audio
    }
  }

  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const supportedMime =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is unavailable in this browser.');
  }

  const recorder = supportedMime
    ? new MediaRecorder(combinedStream, { mimeType: supportedMime })
    : new MediaRecorder(combinedStream);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  video.playbackRate = opts.playbackRate;
  await seekVideoWithTimeout(video, opts.trimStartSec);

  const totalSpan = Math.max(0.1, opts.trimEndSec - opts.trimStartSec);

  return new Promise<Blob>((resolve, reject) => {
    let rafId = 0;

    const handleAbort = () => {
      cleanup();
      if (recorder.state !== 'inactive') recorder.stop();
      reject(new Error('Video export cancelled'));
    };

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      video.pause();
      canvasStream.getTracks().forEach((t) => t.stop());
      combinedStream.getTracks().forEach((t) => t.stop());
      signal?.removeEventListener('abort', handleAbort);
      if (audioCtx) audioCtx.close().catch(() => {});
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    recorder.onerror = () => {
      cleanup();
      reject(new Error('MediaRecorder encountered an encoding error during video export.'));
    };

    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunks, { type: supportedMime || 'video/webm' }));
    };

    const drawFrame = () => {
      if (signal?.aborted) return;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((opts.rotateDeg * Math.PI) / 180);

      const rot90 = opts.rotateDeg === 90 || opts.rotateDeg === 270;
      const targetW = rot90 ? height : width;
      const targetH = rot90 ? width : height;
      const scale = Math.min(targetW / video.videoWidth, targetH / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();

      const elapsed = Math.max(0, video.currentTime - opts.trimStartSec);
      onProgress?.(Math.min(99, Math.round((elapsed / totalSpan) * 100)));

      if (video.currentTime >= opts.trimEndSec || video.ended) {
        onProgress?.(100);
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      rafId = requestAnimationFrame(drawFrame);
    };

    recorder.start(250);
    video
      .play()
      .then(() => {
        rafId = requestAnimationFrame(drawFrame);
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}
