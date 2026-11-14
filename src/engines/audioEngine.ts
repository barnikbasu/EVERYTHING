import { createBrowserAudioContext } from '../utils/mediaUtils';

export interface AudioProcessOptions {
  trimStartSec: number;
  trimEndSec: number;
  normalizeDb: number | null; // e.g. -1.0 dBFS peak normalize, or null
  removeSilence: boolean;
  silenceThresholdDb: number; // e.g. -40 dB
  minSilenceSec: number; // e.g. 0.35s
  playbackRate: number; // 0.5 to 2.0
  fadeInSec: number;
  fadeOutSec: number;
  mono: boolean;
}

export async function decodeAudioFile(file: File | Blob): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = createBrowserAudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

export function extractWaveformPeaks(buffer: AudioBuffer, bucketCount = 320): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / bucketCount));
  const peaks: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    let maxAmp = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j]);
      if (v > maxAmp) maxAmp = v;
    }
    peaks.push(maxAmp);
  }
  return peaks;
}

export function encodeAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export async function processAudioBuffer(
  source: AudioBuffer,
  options: AudioProcessOptions
): Promise<{ buffer: AudioBuffer; wavBlob: Blob; durationMs: number }> {
  const t0 = performance.now();
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(options.trimStartSec * sampleRate));
  const endSample = Math.min(
    source.length,
    Math.max(startSample + 1, Math.floor(options.trimEndSec * sampleRate))
  );

  const outChannels = options.mono ? 1 : source.numberOfChannels;
  let workingChannels: Float32Array[] = [];

  for (let c = 0; c < outChannels; c++) {
    const slice = new Float32Array(endSample - startSample);
    if (options.mono && source.numberOfChannels > 1) {
      const ch0 = source.getChannelData(0);
      const ch1 = source.getChannelData(1);
      for (let i = 0; i < slice.length; i++) {
        slice[i] = (ch0[startSample + i] + ch1[startSample + i]) * 0.5;
      }
    } else {
      const ch = source.getChannelData(c);
      slice.set(ch.subarray(startSample, endSample));
    }
    workingChannels.push(slice);
  }

  // Silence removal pass
  if (options.removeSilence && workingChannels[0].length > 0) {
    const thresholdAmp = Math.pow(10, options.silenceThresholdDb / 20);
    const minSilentSamples = Math.max(1, Math.floor(options.minSilenceSec * sampleRate));
    const len = workingChannels[0].length;
    const keepMask = new Uint8Array(len);
    keepMask.fill(1);

    let silentRun = 0;
    for (let i = 0; i < len; i++) {
      let maxVal = 0;
      for (let c = 0; c < outChannels; c++) {
        const v = Math.abs(workingChannels[c][i]);
        if (v > maxVal) maxVal = v;
      }
      if (maxVal < thresholdAmp) {
        silentRun++;
      } else {
        if (silentRun >= minSilentSamples) {
          const pad = Math.min(Math.floor(0.02 * sampleRate), Math.floor(silentRun / 4));
          for (let k = i - silentRun + pad; k < i - pad; k++) {
            if (k >= 0 && k < len) keepMask[k] = 0;
          }
        }
        silentRun = 0;
      }
    }
    if (silentRun >= minSilentSamples) {
      const pad = Math.min(Math.floor(0.02 * sampleRate), Math.floor(silentRun / 4));
      for (let k = len - silentRun + pad; k < len; k++) {
        if (k >= 0 && k < len) keepMask[k] = 0;
      }
    }

    let keptCount = 0;
    for (let i = 0; i < len; i++) if (keepMask[i]) keptCount++;

    if (keptCount > 0 && keptCount < len) {
      workingChannels = workingChannels.map((ch) => {
        const out = new Float32Array(keptCount);
        let idx = 0;
        for (let i = 0; i < len; i++) {
          if (keepMask[i]) out[idx++] = ch[i];
        }
        return out;
      });
    }
  }

  // Playback rate resampling via OfflineAudioContext if != 1.0
  let finalLen = workingChannels[0].length;
  const tempCtx = new OfflineAudioContext(outChannels, Math.max(1, finalLen), sampleRate);
  const tempBuf = tempCtx.createBuffer(outChannels, Math.max(1, finalLen), sampleRate);
  for (let c = 0; c < outChannels; c++) {
    tempBuf.getChannelData(c).set(workingChannels[c]);
  }

  let resampledBuf = tempBuf;
  if (Math.abs(options.playbackRate - 1.0) > 0.01) {
    const newLen = Math.max(1, Math.floor(finalLen / options.playbackRate));
    const offline = new OfflineAudioContext(outChannels, newLen, sampleRate);
    const srcNode = offline.createBufferSource();
    srcNode.buffer = tempBuf;
    srcNode.playbackRate.value = options.playbackRate;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    resampledBuf = await offline.startRendering();
    finalLen = resampledBuf.length;
  }

  // Peak normalize & Fade In / Out
  if (options.normalizeDb !== null) {
    let peak = 0;
    for (let c = 0; c < outChannels; c++) {
      const ch = resampledBuf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
    }
    if (peak > 1e-5) {
      const targetPeak = Math.pow(10, options.normalizeDb / 20);
      const gain = targetPeak / peak;
      for (let c = 0; c < outChannels; c++) {
        const ch = resampledBuf.getChannelData(c);
        for (let i = 0; i < ch.length; i++) {
          ch[i] = Math.max(-1, Math.min(1, ch[i] * gain));
        }
      }
    }
  }

  const fadeInSamples = Math.min(finalLen, Math.floor(options.fadeInSec * sampleRate));
  const fadeOutSamples = Math.min(finalLen, Math.floor(options.fadeOutSec * sampleRate));
  for (let c = 0; c < outChannels; c++) {
    const ch = resampledBuf.getChannelData(c);
    for (let i = 0; i < fadeInSamples; i++) {
      ch[i] *= i / fadeInSamples;
    }
    for (let i = 0; i < fadeOutSamples; i++) {
      ch[finalLen - 1 - i] *= i / fadeOutSamples;
    }
  }

  const wavBlob = encodeAudioBufferToWav(resampledBuf);
  return {
    buffer: resampledBuf,
    wavBlob,
    durationMs: performance.now() - t0,
  };
}

export async function mergeAudioFiles(files: File[]): Promise<{ buffer: AudioBuffer; wavBlob: Blob }> {
  if (files.length < 2) throw new Error('Select at least 2 audio files to merge.');
  const decoded = await Promise.all(files.map((f) => decodeAudioFile(f)));
  const targetRate = decoded[0].sampleRate;
  const maxChannels = Math.max(...decoded.map((b) => b.numberOfChannels));
  const totalSamples = decoded.reduce(
    (sum, b) => sum + Math.round((b.length / b.sampleRate) * targetRate),
    0
  );

  const offline = new OfflineAudioContext(maxChannels, Math.max(1, totalSamples), targetRate);
  let cursorSec = 0;
  for (const buf of decoded) {
    const src = offline.createBufferSource();
    src.buffer = buf;
    src.connect(offline.destination);
    src.start(cursorSec);
    cursorSec += buf.duration;
  }

  const merged = await offline.startRendering();
  return { buffer: merged, wavBlob: encodeAudioBufferToWav(merged) };
}
