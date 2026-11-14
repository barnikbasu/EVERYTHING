import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, Plus, Trash2 } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  decodeAudioFile,
  extractWaveformPeaks,
  mergeAudioFiles,
  processAudioBuffer,
  type AudioProcessOptions,
} from '../../engines/audioEngine';
import { downloadBlob, formatBytes, formatDurationMs, formatSeconds, replaceFileExtension } from '../../utils/formatters';
import { createBrowserAudioContext } from '../../utils/mediaUtils';

const AUDIO_RAIL_TABS: StudioRailTab[] = [
  { id: 'trim', label: 'Trim', icon: 'Scissors' },
  { id: 'enhance', label: 'Levels', icon: 'SlidersHorizontal' },
  { id: 'merge', label: 'Merge', icon: 'Layers' },
  { id: 'record', label: 'Record', icon: 'Mic' },
];

export const AudioStudio: React.FC = () => {
  const { selectedTool, files, addFiles, removeFile, recordHistory } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const activeFile = files[0]?.file || null;

  const [activeTab, setActiveTab] = useState<string>(() =>
    selectedTool?.id === 'audio-record' ? 'record' : 'trim'
  );
  const [filename, setFilename] = useState('audio_export.wav');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playOffsetSec, setPlayOffsetSec] = useState(0);
  const playCtxRef = useRef<AudioContext | null>(null);
  const playSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);

  // Processing options
  const [opts, setOpts] = useState<AudioProcessOptions>({
    trimStartSec: 0,
    trimEndSec: 10,
    normalizeDb: null,
    removeSilence: false,
    silenceThresholdDb: -38,
    minSilenceSec: 0.35,
    playbackRate: 1.0,
    fadeInSec: 0,
    fadeOutSec: 0,
    mono: false,
  });

  // Microphone recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedTool?.id === 'audio-record') setActiveTab('record');
  }, [selectedTool?.id]);

  // Stop playback, microphone capture, and timers when leaving AudioStudio
  useEffect(() => {
    return () => {
      try {
        playSrcRef.current?.stop();
      } catch {
        // ignore if not started
      }
      playCtxRef.current?.close().catch(() => {});
      if (recordTimerRef.current !== null) {
        clearInterval(recordTimerRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Decode audio when activeFile changes
  useEffect(() => {
    if (!activeFile) {
      setAudioBuffer(null);
      setPeaks([]);
      setOutputBlob(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsProcessing(true);
        setErrorMsg(null);
        const buf = await decodeAudioFile(activeFile);
        if (cancelled) return;
        setAudioBuffer(buf);
        setPeaks(extractWaveformPeaks(buf, 360));
        setFilename(replaceFileExtension(activeFile.name, 'wav'));
        setOpts((prev) => ({
          ...prev,
          trimStartSec: 0,
          trimEndSec: Number(buf.duration.toFixed(2)),
        }));
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to decode audio file.');
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  // Draw waveform + selection range on canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas || !audioBuffer || peaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    const dur = Math.max(0.01, audioBuffer.duration);
    const startRatio = opts.trimStartSec / dur;
    const endRatio = opts.trimEndSec / dur;

    // Highlight active trim region
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(startRatio * w, 0, (endRatio - startRatio) * w, h);

    const barW = w / peaks.length;
    peaks.forEach((amp, i) => {
      const ratio = i / peaks.length;
      const inRange = ratio >= startRatio && ratio <= endRatio;
      const barH = Math.max(2, amp * (h * 0.84));
      ctx.fillStyle = inRange ? '#D97706' : '#CBD5E1';
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 1), barH);
    });

    // Playhead line
    const playX = (playOffsetSec / dur) * w;
    ctx.fillStyle = '#1D4ED8';
    ctx.fillRect(playX, 0, 2, h);
  }, [peaks, audioBuffer, opts.trimStartSec, opts.trimEndSec, playOffsetSec]);

  const stopPlayback = () => {
    try {
      playSrcRef.current?.stop();
    } catch {
      // ignore
    }
    playCtxRef.current?.close().catch(() => {});
    playSrcRef.current = null;
    playCtxRef.current = null;
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (!audioBuffer) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const ctx = createBrowserAudioContext();
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.playbackRate.value = opts.playbackRate;
    src.connect(ctx.destination);
    const span = Math.max(0.05, opts.trimEndSec - opts.trimStartSec);
    src.start(0, opts.trimStartSec, span);
    setPlayOffsetSec(opts.trimStartSec);
    setIsPlaying(true);

    playCtxRef.current = ctx;
    playSrcRef.current = src;
    src.onended = () => {
      setIsPlaying(false);
      ctx.close().catch(() => {});
    };
  };

  const handleRenderExport = async () => {
    if (!audioBuffer) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await processAudioBuffer(audioBuffer, opts);
      setOutputBlob(res.wavBlob);
      setLastDurationMs(res.durationMs);
      downloadBlob(res.wavBlob, filename);
      recordHistory({
        toolId: selectedTool?.id || 'audio-studio',
        toolName: selectedTool?.name || 'Audio Studio',
        category: 'audio-video',
        inputFilename: activeFile?.name || 'recording.wav',
        outputFilename: filename,
        inputSize: activeFile?.size || 0,
        outputSize: res.wavBlob.size,
        durationMs: res.durationMs,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Audio processing failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMergeAudio = async () => {
    const audioFiles = files.map((f) => f.file);
    if (audioFiles.length < 2) {
      setErrorMsg('Load at least 2 audio files to merge.');
      return;
    }
    setIsProcessing(true);
    setErrorMsg(null);
    const t0 = performance.now();
    try {
      const res = await mergeAudioFiles(audioFiles);
      downloadBlob(res.wavBlob, 'merged_audio.wav');
      recordHistory({
        toolId: 'audio-merge',
        toolName: 'Merge Audio',
        category: 'audio-video',
        inputFilename: `${audioFiles.length} tracks`,
        outputFilename: 'merged_audio.wav',
        inputSize: audioFiles.reduce((s, f) => s + f.size, 0),
        outputSize: res.wavBlob.size,
        durationMs: performance.now() - t0,
        mode: 'local',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Audio merge failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const startMicRecord = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        if (recordTimerRef.current !== null) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const recordedFile = new File([blob], `mic_recording_${Date.now()}.webm`, {
          type: blob.type,
        });
        addFiles([recordedFile], true);
        setActiveTab('trim');
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setErrorMsg('Microphone permission denied or no audio input device available.');
    }
  };

  const stopMicRecord = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const settingsPanel = (
    <div className="space-y-4">
      {activeTab === 'trim' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Trim & Speed</h3>
          {audioBuffer ? (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">Start</span>
                  <span className="font-mono">{formatSeconds(opts.trimStartSec)}</span>
                </div>
                <input
                  type="range"
                  aria-label="Trim start time"
                  min={0}
                  max={Math.max(0.1, opts.trimEndSec - 0.1)}
                  step={0.05}
                  value={opts.trimStartSec}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, trimStartSec: Number(e.target.value) }))
                  }
                  className="w-full accent-[#D97706]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">End</span>
                  <span className="font-mono">{formatSeconds(opts.trimEndSec)}</span>
                </div>
                <input
                  type="range"
                  aria-label="Trim end time"
                  min={Math.min(audioBuffer.duration, opts.trimStartSec + 0.1)}
                  max={audioBuffer.duration}
                  step={0.05}
                  value={opts.trimEndSec}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, trimEndSec: Number(e.target.value) }))
                  }
                  className="w-full accent-[#D97706]"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">Speed</span>
                  <span className="font-mono">{opts.playbackRate.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  aria-label="Playback speed"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={opts.playbackRate}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, playbackRate: Number(e.target.value) }))
                  }
                  className="w-full accent-[#D97706]"
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-[#717782]">Load an audio file or record one to enable trim handles.</p>
          )}
        </div>
      )}

      {activeTab === 'enhance' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Normalize & Silence</h3>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={opts.normalizeDb !== null}
              onChange={(e) =>
                setOpts((o) => ({ ...o, normalizeDb: e.target.checked ? -1.0 : null }))
              }
              className="mt-0.5 accent-[#D97706]"
            />
            <div>
              <div className="font-medium text-[#17191D]">Peak Normalize (-1 dBFS)</div>
              <div className="text-[11px] text-[#717782]">Maximizes headroom without clipping</div>
            </div>
          </label>

          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={opts.removeSilence}
              onChange={(e) => setOpts((o) => ({ ...o, removeSilence: e.target.checked }))}
              className="mt-0.5 accent-[#D97706]"
            />
            <div>
              <div className="font-medium text-[#17191D]">Strip Dead Silence</div>
              <div className="text-[11px] text-[#717782]">Removes gaps below {opts.silenceThresholdDb} dB</div>
            </div>
          </label>

          {opts.removeSilence && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#717782]">Threshold</span>
                <span className="font-mono">{opts.silenceThresholdDb} dB</span>
              </div>
              <input
                type="range"
                min={-60}
                max={-15}
                value={opts.silenceThresholdDb}
                onChange={(e) =>
                  setOpts((o) => ({ ...o, silenceThresholdDb: Number(e.target.value) }))
                }
                className="w-full accent-[#D97706]"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E2E5EC]">
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Fade In (s)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.2}
                value={opts.fadeInSec}
                onChange={(e) => setOpts((o) => ({ ...o, fadeInSec: Number(e.target.value) }))}
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#717782] block mb-1">Fade Out (s)</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.2}
                value={opts.fadeOutSec}
                onChange={(e) => setOpts((o) => ({ ...o, fadeOutSec: Number(e.target.value) }))}
                className="w-full h-8 px-2 bg-[#F6F7F9] border border-[#E2E5EC] focus:outline-none focus:border-[#1D4ED8] focus:bg-white rounded-md text-xs font-mono"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={opts.mono}
              onChange={(e) => setOpts((o) => ({ ...o, mono: e.target.checked }))}
              className="accent-[#D97706]"
            />
            <span>Downmix to Mono</span>
          </label>
        </div>
      )}

      {activeTab === 'merge' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Concatenate Tracks</h3>
          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            className="w-full h-9 px-3 bg-[#FFFBEB] hover:bg-[#FEF3C7] border border-[#D97706]/30 text-[#B45309] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Audio Tracks</span>
          </button>
          <div className="space-y-1">
            {files.map((f, i) => (
              <div
                key={f.id}
                className="text-xs font-mono px-2 py-1.5 bg-[#F6F7F9] border border-[#E2E5EC] rounded-md flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {i + 1}. {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  aria-label={`Remove ${f.name}`}
                  className="text-[#717782] hover:text-[#E5322D] shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={files.length < 2 || isProcessing}
            onClick={handleMergeAudio}
            className="w-full h-9 px-3 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Merge & Export WAV
          </button>
        </div>
      )}

      {activeTab === 'record' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Microphone Capture</h3>
          <p className="text-xs text-[#717782]">
            Record voice locally via MediaRecorder. Once stopped, the recording opens immediately in the waveform editor.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      outputLabel={outputBlob ? `WAV · ${formatBytes(outputBlob.size)}` : '16-bit PCM WAV'}
      isProcessing={isProcessing}
      onExport={handleRenderExport}
      exportLabel="Export WAV"
      exportDisabled={!audioBuffer || activeTab === 'record' || activeTab === 'merge'}
      railTabs={AUDIO_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        audioBuffer
          ? `${audioBuffer.sampleRate} Hz · ${audioBuffer.numberOfChannels}ch · ${formatSeconds(audioBuffer.duration)}`
          : 'No audio loaded'
      }
      bottomMetaRight={
        lastDurationMs > 0 ? `Rendered in ${formatDurationMs(lastDurationMs)}` : 'Web Audio OfflineContext'
      }
    >
      <input
        ref={filePickerRef}
        type="file"
        multiple
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(Array.from(e.target.files), activeTab !== 'merge');
          }
        }}
      />

      <div className="min-h-full studio-grid-bg p-4 sm:p-8 flex flex-col items-center justify-center gap-4">
        {errorMsg && (
          <StudioNotice variant="error" className="max-w-xl w-full">
            {errorMsg}
          </StudioNotice>
        )}

        {activeTab === 'record' ? (
          <div className="max-w-md w-full bg-white border border-[#E2E5EC] rounded-xl p-6 sm:p-8 text-center space-y-4">
            <div className="w-11 h-11 mx-auto rounded-xl bg-[#FFFBEB] border border-[#D97706]/25 text-[#D97706] flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#17191D]">Local Voice Recorder</h2>
              <p className="text-2xl font-mono font-semibold text-[#17191D] mt-2 tabular-nums">
                {formatSeconds(recordSeconds)}
              </p>
            </div>
            {!isRecording ? (
              <button
                type="button"
                onClick={startMicRecord}
                className="h-9 px-5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>Start Recording</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopMicRecord}
                className="h-9 px-5 bg-[#E5322D] hover:bg-[#DC2626] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>Stop & Load into Editor</span>
              </button>
            )}
          </div>
        ) : !audioBuffer ? (
          <StudioEmptyCard
            category="audio-video"
            iconName="AudioLines"
            title="Load an Audio File"
            description="Supports MP3, WAV, OGG, WebM, M4A, and FLAC decoded locally via Web Audio API."
            primaryLabel="Select Audio"
            onPrimaryClick={() => filePickerRef.current?.click()}
            secondaryLabel="Record Mic"
            onSecondaryClick={() => setActiveTab('record')}
          />
        ) : (
          <div className="w-full max-w-4xl bg-white border border-[#E2E5EC] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#17191D]">{activeFile?.name}</h2>
                <p className="text-xs font-mono text-[#717782] tabular-nums">
                  Selection: {formatSeconds(opts.trimStartSec)} → {formatSeconds(opts.trimEndSec)} (
                  {formatSeconds(Math.max(0, opts.trimEndSec - opts.trimStartSec))})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="h-9 px-4 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Stop' : 'Preview Selection'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => filePickerRef.current?.click()}
                  className="h-9 px-3 bg-[#F6F7F9] hover:bg-[#ECEFF4] border border-[#E2E5EC] text-[#17191D] text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Replace
                </button>
              </div>
            </div>

            <canvas
              ref={waveCanvasRef}
              width={900}
              height={220}
              className="w-full h-48 border border-[#E2E5EC] rounded-lg"
            />
          </div>
        )}
      </div>
    </StudioShell>
  );
};
