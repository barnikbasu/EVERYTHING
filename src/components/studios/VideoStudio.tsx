import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Pause, Play, RotateCw, Square, X } from 'lucide-react';
import { StudioShell, type StudioRailTab } from '../StudioShell';
import { StudioEmptyCard, StudioNotice } from '../StudioFeedback';
import { useWorkspace } from '../../state/workspaceStore';
import {
  exportVideoToGif,
  extractAudioTrackFromVideo,
  extractVideoThumbnails,
  transcodeVideoWithCanvas,
  type VideoExportOptions,
} from '../../engines/videoEngine';
import { downloadBlob, formatBytes, formatSeconds, replaceFileExtension } from '../../utils/formatters';

const VIDEO_RAIL_TABS: StudioRailTab[] = [
  { id: 'trim', label: 'Edit', icon: 'Scissors' },
  { id: 'gif', label: 'GIF', icon: 'Clapperboard' },
  { id: 'frames', label: 'Frames', icon: 'Images' },
  { id: 'audio', label: 'Audio', icon: 'AudioLines' },
  { id: 'screen', label: 'Record', icon: 'Monitor' },
];

export const VideoStudio: React.FC = () => {
  const { selectedTool, files, addFiles, recordHistory } = useWorkspace();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeFile = files[0]?.file || null;
  const activeUrl = files[0]?.objectUrl || '';

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (selectedTool?.id === 'video-to-gif') return 'gif';
    if (selectedTool?.id === 'screen-recorder') return 'screen';
    return 'trim';
  });

  const [filename, setFilename] = useState('video_export.webm');
  const [durationSec, setDurationSec] = useState(0);
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const [opts, setOpts] = useState<VideoExportOptions>({
    trimStartSec: 0,
    trimEndSec: 10,
    rotateDeg: 0,
    aspectPreset: 'original',
    maxWidth: 1280,
    muteAudio: false,
    playbackRate: 1.0,
  });

  // GIF controls
  const [gifFps, setGifFps] = useState(10);
  const [gifWidth, setGifWidth] = useState(480);

  // Thumbnails
  const [thumbs, setThumbs] = useState<Array<{ timeSec: number; blob: Blob; dataUrl: string }>>([]);

  // Processing & Cancel
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Screen recorder state
  const [isRecordingScreen, setIsRecordingScreen] = useState(false);
  const [includeMic, setIncludeMic] = useState(false);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (selectedTool?.id === 'video-to-gif') setActiveTab('gif');
    else if (selectedTool?.id === 'screen-recorder') setActiveTab('screen');
  }, [selectedTool?.id]);

  // Abort active video render and release capture streams when leaving VideoStudio
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
        screenRecorderRef.current.onstop = null;
        screenRecorderRef.current.stop();
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (activeFile) {
      const nextExt = activeTab === 'gif' ? 'gif' : activeTab === 'audio' ? 'wav' : 'webm';
      setFilename(replaceFileExtension(activeFile.name, nextExt));
      setThumbs([]);
      setStatusMsg(null);
      setErrorMsg(null);
    }
  }, [activeFile, activeTab]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDurationSec(v.duration);
    setVideoDims({ w: v.videoWidth, h: v.videoHeight });
    setOpts((o) => ({
      ...o,
      trimStartSec: 0,
      trimEndSec: Number(v.duration.toFixed(2)),
    }));
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < opts.trimStartSec || v.currentTime >= opts.trimEndSec) {
        v.currentTime = opts.trimStartSec;
      }
      v.playbackRate = opts.playbackRate;
      v.muted = opts.muteAudio;
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleCancelProcessing = () => {
    abortRef.current?.abort();
  };

  const handleExport = async () => {
    if (!activeFile || !activeUrl) return;
    setErrorMsg(null);
    setStatusMsg(null);
    setIsProcessing(true);
    setProgressPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = performance.now();

    try {
      if (activeTab === 'gif') {
        const gifBlob = await exportVideoToGif(
          activeUrl,
          {
            trimStartSec: opts.trimStartSec,
            trimEndSec: opts.trimEndSec,
            fps: gifFps,
            width: gifWidth,
          },
          setProgressPct,
          controller.signal
        );
        const outName = replaceFileExtension(filename, 'gif');
        downloadBlob(gifBlob, outName);
        setStatusMsg(`Exported animated GIF (${formatBytes(gifBlob.size)})`);
        recordHistory({
          toolId: 'video-to-gif',
          toolName: 'Video to GIF',
          category: 'audio-video',
          inputFilename: activeFile.name,
          outputFilename: outName,
          inputSize: activeFile.size,
          outputSize: gifBlob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } else if (activeTab === 'audio') {
        const wavBlob = await extractAudioTrackFromVideo(activeFile);
        const outName = replaceFileExtension(filename, 'wav');
        downloadBlob(wavBlob, outName);
        setStatusMsg(`Extracted lossless audio (${formatBytes(wavBlob.size)})`);
        recordHistory({
          toolId: 'video-extract-audio',
          toolName: 'Extract Audio',
          category: 'audio-video',
          inputFilename: activeFile.name,
          outputFilename: outName,
          inputSize: activeFile.size,
          outputSize: wavBlob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      } else {
        const webmBlob = await transcodeVideoWithCanvas(
          activeUrl,
          opts,
          setProgressPct,
          controller.signal
        );
        const outName = replaceFileExtension(filename, 'webm');
        downloadBlob(webmBlob, outName);
        setStatusMsg(`Exported WebM video (${formatBytes(webmBlob.size)})`);
        recordHistory({
          toolId: 'video-trim-edit',
          toolName: 'Video Studio',
          category: 'audio-video',
          inputFilename: activeFile.name,
          outputFilename: outName,
          inputSize: activeFile.size,
          outputSize: webmBlob.size,
          durationMs: performance.now() - t0,
          mode: 'local',
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Video export failed.');
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const handleExtractThumbnails = async () => {
    if (!activeUrl || durationSec <= 0) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const stamps = [
        opts.trimStartSec,
        opts.trimStartSec + (opts.trimEndSec - opts.trimStartSec) * 0.33,
        opts.trimStartSec + (opts.trimEndSec - opts.trimStartSec) * 0.66,
        Math.max(0, opts.trimEndSec - 0.1),
      ];
      const frames = await extractVideoThumbnails(activeUrl, stamps);
      setThumbs(frames);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not extract frames.');
    } finally {
      setIsProcessing(false);
    }
  };

  const startScreenRecord = async () => {
    setErrorMsg(null);
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const combined = new MediaStream(displayStream.getTracks());
      if (includeMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          mic.getAudioTracks().forEach((t) => combined.addTrack(t));
        } catch {
          // Proceed without mic if denied
        }
      }

      const recorder = new MediaRecorder(combined, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        combined.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        const f = new File([blob], `screen_capture_${Date.now()}.webm`, { type: 'video/webm' });
        addFiles([f], true);
        setIsRecordingScreen(false);
        setActiveTab('trim');
      };

      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };

      recorder.start(300);
      screenRecorderRef.current = recorder;
      screenStreamRef.current = combined;
      setIsRecordingScreen(true);
    } catch {
      setErrorMsg('Screen capture permission cancelled or unavailable in this browser.');
    }
  };

  const stopScreenRecord = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.stop();
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecordingScreen(false);
  };

  const settingsPanel = (
    <div className="space-y-4">
      {activeTab === 'trim' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Trim & Transform</h3>
          {durationSec > 0 && (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#717782]">Start</span>
                  <span className="font-mono">{formatSeconds(opts.trimStartSec)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, opts.trimEndSec - 0.1)}
                  step={0.1}
                  value={opts.trimStartSec}
                  onChange={(e) => setOpts((o) => ({ ...o, trimStartSec: Number(e.target.value) }))}
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
                  min={Math.min(durationSec, opts.trimStartSec + 0.1)}
                  max={durationSec}
                  step={0.1}
                  value={opts.trimEndSec}
                  onChange={(e) => setOpts((o) => ({ ...o, trimEndSec: Number(e.target.value) }))}
                  className="w-full accent-[#D97706]"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5 pt-2 border-t border-[#E2E5EC]">
            <label className="text-xs font-semibold text-[#17191D] block">Aspect Ratio</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['original', '16:9', '9:16', '1:1', '4:5'] as const).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setOpts((o) => ({ ...o, aspectPreset: ar }))}
                  className={`py-1.5 text-[11px] font-mono rounded border cursor-pointer ${
                    opts.aspectPreset === ar
                      ? 'bg-[#FFFBEB] border-[#D97706] text-[#B45309]'
                      : 'bg-[#F6F7F9] border-[#E2E5EC]'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#E2E5EC]">
            <span className="text-xs font-medium">Rotate</span>
            <button
              type="button"
              onClick={() =>
                setOpts((o) => ({
                  ...o,
                  rotateDeg: ((o.rotateDeg + 90) % 360) as 0 | 90 | 180 | 270,
                }))
              }
              className="px-2.5 py-1 text-xs font-mono bg-[#F6F7F9] border border-[#E2E5EC] rounded inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCw className="w-3 h-3" />
              <span>{opts.rotateDeg}°</span>
            </button>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Playback Speed</span>
              <span className="font-mono">{opts.playbackRate}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.25}
              value={opts.playbackRate}
              onChange={(e) => setOpts((o) => ({ ...o, playbackRate: Number(e.target.value) }))}
              className="w-full accent-[#D97706]"
            />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={opts.muteAudio}
              onChange={(e) => setOpts((o) => ({ ...o, muteAudio: e.target.checked }))}
              className="accent-[#D97706]"
            />
            <span>Mute audio track</span>
          </label>
        </div>
      )}

      {activeTab === 'gif' && (
        <div className="space-y-3.5">
          <h3 className="text-sm font-bold text-[#17191D]">Video to GIF</h3>
          <p className="text-xs text-[#717782]">
            Encodes trimmed clip (up to 15s) using 256-color quantized palette via gifenc.
          </p>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Frame Rate</span>
              <span className="font-mono">{gifFps} FPS</span>
            </div>
            <input
              type="range"
              min={5}
              max={20}
              value={gifFps}
              onChange={(e) => setGifFps(Number(e.target.value))}
              className="w-full accent-[#D97706]"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#717782]">Output Width</span>
              <span className="font-mono">{gifWidth} px</span>
            </div>
            <input
              type="range"
              min={240}
              max={640}
              step={40}
              value={gifWidth}
              onChange={(e) => setGifWidth(Number(e.target.value))}
              className="w-full accent-[#D97706]"
            />
          </div>
        </div>
      )}

      {activeTab === 'frames' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Thumbnail Extractor</h3>
          <p className="text-xs text-[#717782]">
            Sample 4 crisp PNG frames across your selected trim range.
          </p>
          <button
            type="button"
            disabled={!activeUrl || isProcessing}
            onClick={handleExtractThumbnails}
            className="w-full h-9 px-3 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Extract 4 PNG Frames
          </button>
        </div>
      )}

      {activeTab === 'audio' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Extract Audio Track</h3>
          <p className="text-xs text-[#717782]">
            Decodes the video’s audio stream locally and exports a lossless 16-bit PCM WAV file.
          </p>
        </div>
      )}

      {activeTab === 'screen' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#17191D]">Screen Recorder</h3>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={includeMic}
              onChange={(e) => setIncludeMic(e.target.checked)}
              className="accent-[#D97706]"
            />
            <span>Mix microphone audio</span>
          </label>
        </div>
      )}
    </div>
  );

  return (
    <StudioShell
      filename={filename}
      onFilenameChange={setFilename}
      outputLabel={
        activeTab === 'gif'
          ? `GIF · ${gifWidth}px`
          : activeTab === 'audio'
          ? 'WAV Audio'
          : `WebM · ${opts.aspectPreset}`
      }
      isProcessing={isProcessing}
      onExport={handleExport}
      exportLabel={
        activeTab === 'gif'
          ? 'Export GIF'
          : activeTab === 'audio'
          ? 'Extract WAV'
          : 'Render & Download'
      }
      exportDisabled={!activeFile || activeTab === 'frames' || activeTab === 'screen'}
      railTabs={VIDEO_RAIL_TABS}
      activeRailTab={activeTab}
      onSelectRailTab={setActiveTab}
      settingsPanel={settingsPanel}
      bottomMetaLeft={
        videoDims.w
          ? `${videoDims.w} × ${videoDims.h} px · ${formatSeconds(durationSec)} · ${formatBytes(activeFile?.size || 0)}`
          : 'No video loaded'
      }
      bottomMetaRight="Canvas + MediaRecorder + gifenc"
    >
      <input
        ref={filePickerRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(Array.from(e.target.files), true);
        }}
      />

      <div className="min-h-full studio-grid-bg p-4 sm:p-6 flex flex-col items-center justify-center gap-4">
        {errorMsg && (
          <StudioNotice variant="error" className="max-w-2xl w-full">
            {errorMsg}
          </StudioNotice>
        )}
        {statusMsg && (
          <StudioNotice variant="success" className="max-w-2xl w-full">
            {statusMsg}
          </StudioNotice>
        )}

        {isProcessing && (
          <div className="max-w-md w-full bg-white border border-[#E2E5EC] rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-mono tabular-nums mb-1">
                <span>Rendering locally…</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 bg-[#F6F7F9] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1D4ED8] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelProcessing}
              aria-label="Cancel video processing"
              className="p-1.5 text-[#E5322D] hover:bg-[#FEF2F2] rounded cursor-pointer"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'screen' ? (
          <div className="max-w-md w-full bg-white border border-[#E2E5EC] rounded-xl p-6 sm:p-8 text-center space-y-4">
            <div className="w-11 h-11 mx-auto rounded-xl bg-[#FFFBEB] border border-[#D97706]/25 text-[#D97706] flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#17191D]">Browser Screen Recorder</h2>
              <p className="text-xs text-[#717782] mt-1 leading-relaxed">
                Capture a screen, window, or browser tab directly into Video Studio for trimming or GIF export.
              </p>
            </div>
            {!isRecordingScreen ? (
              <button
                type="button"
                onClick={startScreenRecord}
                className="h-9 px-5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Start Screen Capture
              </button>
            ) : (
              <button
                type="button"
                onClick={stopScreenRecord}
                className="h-9 px-5 bg-[#E5322D] hover:bg-[#DC2626] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>Stop & Edit Capture</span>
              </button>
            )}
          </div>
        ) : !activeUrl ? (
          <StudioEmptyCard
            category="audio-video"
            iconName="Film"
            title="Load a Video File"
            description="Supports MP4, WebM, and MOV clips up to 250 MB in browser memory."
            primaryLabel="Select Video"
            onPrimaryClick={() => filePickerRef.current?.click()}
            secondaryLabel="Record Screen"
            onSecondaryClick={() => setActiveTab('screen')}
          />
        ) : (
          <div className="w-full max-w-3xl space-y-4">
            <div className="bg-[#17191D] rounded-xl overflow-hidden border border-[#E2E5EC] flex items-center justify-center max-h-[420px]">
              <video
                ref={videoRef}
                src={activeUrl}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  setCurrentTime(v.currentTime);
                  if (v.currentTime >= opts.trimEndSec && !v.paused) {
                    v.pause();
                    setIsPlaying(false);
                  }
                }}
                onEnded={() => setIsPlaying(false)}
                style={{ transform: `rotate(${opts.rotateDeg}deg)` }}
                className="max-h-[400px] w-auto"
                playsInline
              />
            </div>

            <div className="bg-white border border-[#E2E5EC] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="h-8 px-3.5 bg-[#17191D] hover:bg-[#272A30] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play Trim'}</span>
              </button>
              <input
                type="range"
                aria-label="Video playback position"
                min={0}
                max={durationSec || 1}
                step={0.05}
                value={currentTime}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setCurrentTime(t);
                  if (videoRef.current) videoRef.current.currentTime = t;
                }}
                className="flex-1 accent-[#1D4ED8]"
              />
              <span className="font-mono text-xs text-[#717782] tabular-nums">
                {formatSeconds(currentTime)} / {formatSeconds(durationSec)}
              </span>
            </div>

            {thumbs.length > 0 && (
              <div className="bg-white border border-[#E2E5EC] rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-[#17191D]">Extracted Video Frames</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {thumbs.map((t, i) => (
                    <div key={i} className="border border-[#E2E5EC] rounded-lg overflow-hidden">
                      <img src={t.dataUrl} alt={`Frame ${i + 1}`} className="w-full aspect-video object-cover" />
                      <div className="px-2 py-1.5 flex items-center justify-between text-[11px] font-mono">
                        <span>{formatSeconds(t.timeSec)}</span>
                        <button
                          type="button"
                          onClick={() => downloadBlob(t.blob, `frame_${i + 1}.png`)}
                          className="text-[#1D4ED8] hover:underline cursor-pointer"
                        >
                          Save PNG
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  );
};
