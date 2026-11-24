"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  ImagePlus,
  LockKeyhole,
  Play,
  RefreshCw,
  ScanFace,
  ShieldAlert,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { MetricCard } from "@/components/admin/widgets";
import { Button } from "@/components/ui/button";
import { Badge, CardHeader, GlassCard, Pill, SkeletonPage, Switch } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import {
  modelLabApi,
  type ModelLabFaceBBox,
  type ModelLabHealth,
  type ModelLabInferenceResult,
  type ModelLabMetrics,
  type ModelLabModelInfo,
} from "@/lib/api/model-lab";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";
import { cn } from "@/lib/utils";

type LabWorkflowState =
  | "initial"
  | "awaiting_permission"
  | "camera_active"
  | "analyzing"
  | "classification"
  | "no_face"
  | "multiple_faces"
  | "unsupported_image"
  | "model_unavailable"
  | "network_timeout"
  | "unauthorized"
  | "stopped";

type ConnectionStatus =
  | "loading"
  | "ready"
  | "offline"
  | "auth_error"
  | "unavailable"
  | "inference_error"
  | "disabled";

const STATE_BADGE: Record<LabWorkflowState, { label: string; tone: "neutral" | "blue" | "cyan" | "success" | "warning" | "danger" }> = {
  initial: { label: "Idle · Ready to start", tone: "neutral" },
  awaiting_permission: { label: "Awaiting camera permission", tone: "cyan" },
  camera_active: { label: "Camera active", tone: "blue" },
  analyzing: { label: "Analyzing frame…", tone: "cyan" },
  classification: { label: "Classification received", tone: "success" },
  no_face: { label: "No face detected", tone: "warning" },
  multiple_faces: { label: "Multiple faces detected", tone: "warning" },
  unsupported_image: { label: "Unsupported or invalid image", tone: "danger" },
  model_unavailable: { label: "Model service unavailable", tone: "danger" },
  network_timeout: { label: "Request timed out", tone: "danger" },
  unauthorized: { label: "Authorization required", tone: "danger" },
  stopped: { label: "Camera stopped", tone: "neutral" },
};

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const EMA_ALPHA = 0.35;

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function drawBoundingBox(canvas: HTMLCanvasElement | null, bbox: ModelLabFaceBBox | null, label: string | null) {
  if (!canvas) return;
  const cw = canvas.clientWidth || 640;
  const ch = canvas.clientHeight || 480;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, cw, ch);
  if (!bbox) return;

  const scale = Math.min(cw / bbox.image_width, ch / bbox.image_height);
  const offsetX = (cw - bbox.image_width * scale) / 2;
  const offsetY = (ch - bbox.image_height * scale) / 2;
  const rx = offsetX + bbox.x * scale;
  const ry = offsetY + bbox.y * scale;
  const rw = bbox.width * scale;
  const rh = bbox.height * scale;

  ctx.strokeStyle = "#38BDF8";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(rx, ry, rw, rh);

  if (label) {
    ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    const textWidth = ctx.measureText(label).width + 12;
    const tagY = Math.max(20, ry);
    ctx.fillStyle = "rgba(14, 165, 233, 0.92)";
    ctx.fillRect(rx, tagY - 20, textWidth, 20);
    ctx.fillStyle = "#041222";
    ctx.fillText(label, rx + 6, tagY - 6);
  }
}

export function ModelLabView() {
  const { status: authStatus, profile } = useAuth();
  const isSuperAdmin = Boolean(
    profile?.roles?.includes("SUPER_ADMIN") && profile?.permissions?.includes("users:manage"),
  );

  const [health, setHealth] = useState<ModelLabHealth | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelLabModelInfo | null>(null);
  const [metrics, setMetrics] = useState<ModelLabMetrics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("loading");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [labState, setLabState] = useState<LabWorkflowState>("initial");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [liveTesting, setLiveTesting] = useState(false);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [smoothingEnabled, setSmoothingEnabled] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ModelLabInferenceResult | null>(null);
  const [emaProbabilities, setEmaProbabilities] = useState<Record<string, number> | null>(null);
  const [lastE2eMs, setLastE2eMs] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  const maxUploadBytes = health?.maxUploadBytes ?? 10_000_000;

  const stopLiveTimer = useCallback(() => {
    if (liveTimerRef.current !== null) {
      window.clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    setLiveTesting(false);
  }, []);

  const abortActiveInference = useCallback(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    inFlightRef.current = false;
  }, []);

  const stopCamera = useCallback(
    (nextState: LabWorkflowState = "stopped") => {
      stopLiveTimer();
      abortActiveInference();
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
      drawBoundingBox(overlayCanvasRef.current, null, null);
      setLabState(nextState);
    },
    [abortActiveInference, stopLiveTimer],
  );

  const loadDiagnostics = useCallback(async () => {
    if (!isApiMode || !isSuperAdmin) return;
    setDiagnosticsLoading(true);
    setConnectionStatus((prev) => (prev === "ready" ? "ready" : "loading"));
    try {
      const h = await modelLabApi.health();
      if (!mountedRef.current) return;
      setHealth(h);

      if (!h.enabled) {
        setConnectionStatus("disabled");
        setModelInfo(null);
        setMetrics(null);
        setErrorBanner(h.reason ?? "Model Lab is disabled.");
        return;
      }
      if (!h.configured || h.status === "unconfigured") {
        setConnectionStatus("unavailable");
        setModelInfo(null);
        setMetrics(null);
        setErrorBanner(h.reason ?? "Backend V5 service token is not configured.");
        return;
      }
      if (h.status === "offline") {
        setConnectionStatus("offline");
        setModelInfo(null);
        setMetrics(null);
        setErrorBanner(h.reason ?? "Facial Expression V5 FastAPI service is offline.");
        return;
      }
      if (!h.ready) {
        setConnectionStatus("unavailable");
        setErrorBanner(h.reason ?? "Facial Expression V5 model artifacts are not ready.");
      } else {
        setConnectionStatus("ready");
        setErrorBanner(null);
      }

      const [infoRes, metricsRes] = await Promise.allSettled([modelLabApi.modelInfo(), modelLabApi.metrics()]);
      if (!mountedRef.current) return;
      if (infoRes.status === "fulfilled") {
        setModelInfo(infoRes.value);
      }
      if (metricsRes.status === "fulfilled") {
        setMetrics(metricsRes.value);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          setConnectionStatus("auth_error");
          setLabState("unauthorized");
        } else {
          setConnectionStatus("offline");
        }
        setErrorBanner(err.message);
      } else {
        setConnectionStatus("offline");
        setErrorBanner("Failed to reach Model Lab diagnostics.");
      }
    } finally {
      if (mountedRef.current) {
        setDiagnosticsLoading(false);
      }
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    mountedRef.current = true;
    if (isApiMode && authStatus === "signedIn" && isSuperAdmin) {
      void loadDiagnostics();
    }
    return () => {
      mountedRef.current = false;
      stopCamera("stopped");
    };
  }, [authStatus, isSuperAdmin, loadDiagnostics, stopCamera]);

  // Stop camera and timers immediately if admin signs out or navigates/closes page
  useEffect(() => {
    if (authStatus !== "signedIn" && cameraActive) {
      stopCamera("stopped");
    }
  }, [authStatus, cameraActive, stopCamera]);

  useEffect(() => {
    const handlePageHide = () => stopCamera("stopped");
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [stopCamera]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const refreshVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      if (mountedRef.current) {
        setDevices(cams);
      }
    } catch {
      /* ignore device enumeration failure */
    }
  }, []);

  const clearSelectedPhoto = useCallback(() => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setSelectedPhoto(null);
    setPhotoPreviewUrl(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
    if (!cameraActive) {
      drawBoundingBox(overlayCanvasRef.current, null, null);
    }
  }, [cameraActive, photoPreviewUrl]);

  const startCamera = useCallback(
    async (deviceIdOverride?: string) => {
      setErrorBanner(null);
      setCameraPermissionDenied(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorBanner("Browser camera capture (MediaDevices API) is unavailable in this context.");
        return;
      }

      clearSelectedPhoto();
      stopCamera("awaiting_permission");

      const targetDevice = deviceIdOverride ?? selectedDeviceId;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: targetDevice
            ? { deviceId: { exact: targetDevice }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraActive(true);
        setLabState("camera_active");
        const activeTrack = stream.getVideoTracks()[0];
        const trackDeviceId = activeTrack?.getSettings()?.deviceId;
        if (trackDeviceId) {
          setSelectedDeviceId(trackDeviceId);
        }
        await refreshVideoDevices();
      } catch (err) {
        setCameraActive(false);
        setLabState("stopped");
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
        setCameraPermissionDenied(denied);
        setErrorBanner(
          denied
            ? "Camera permission was denied. Allow webcam access in your browser and click Retry Camera Permission."
            : err instanceof Error
              ? `Could not access camera: ${err.message}`
              : "Could not access camera.",
        );
      }
    },
    [clearSelectedPhoto, refreshVideoDevices, selectedDeviceId, stopCamera],
  );

  const runFrameInference = useCallback(
    async (blob: Blob, filename: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setErrorBanner(null);
      setLabState("analyzing");

      const controller = new AbortController();
      activeControllerRef.current = controller;
      const started = performance.now();

      try {
        const res = await modelLabApi.inferFrame(blob, filename, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;

        const e2eMs = Math.round(performance.now() - started);
        setLastE2eMs(e2eMs);
        setResult(res);
        setConnectionStatus("ready");

        if (res.status === "NO_FACE_DETECTED") {
          setLabState("no_face");
          setEmaProbabilities(null);
          drawBoundingBox(overlayCanvasRef.current, null, null);
        } else if (res.status === "MULTIPLE_FACES_DETECTED") {
          setLabState("multiple_faces");
          setEmaProbabilities(null);
          drawBoundingBox(overlayCanvasRef.current, null, null);
        } else {
          setLabState("classification");
          const labelTag =
            res.expression_label && res.confidence !== null
              ? `${res.expression_label} ${(res.confidence * 100).toFixed(1)}%`
              : res.expression_label;
          drawBoundingBox(overlayCanvasRef.current, res.face_bbox, labelTag);

          if (res.probabilities) {
            setEmaProbabilities((prev) => {
              if (!prev) return { ...res.probabilities };
              const next: Record<string, number> = {};
              for (const [key, val] of Object.entries(res.probabilities!)) {
                next[key] = EMA_ALPHA * val + (1 - EMA_ALPHA) * (prev[key] ?? val);
              }
              return next;
            });
          }
        }

        // Refresh operational metrics unobtrusively
        modelLabApi
          .metrics()
          .then((m) => {
            if (mountedRef.current) setMetrics(m);
          })
          .catch(() => undefined);
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted) return;

        if (err instanceof ApiError) {
          if (err.code === "REQUEST_ABORTED") return;
          if (err.status === 401 || err.status === 403) {
            stopLiveTimer();
            setConnectionStatus("auth_error");
            setLabState("unauthorized");
          } else if (err.code === "TIMEOUT" || err.code === "MODEL_INFERENCE_TIMEOUT" || err.status === 504) {
            setConnectionStatus("inference_error");
            setLabState("network_timeout");
          } else if (err.code === "INVALID_IMAGE_UPLOAD" || err.code === "IMAGE_TOO_LARGE" || err.status === 413 || err.status === 415 || err.status === 422) {
            setConnectionStatus("inference_error");
            setLabState("unsupported_image");
          } else {
            setConnectionStatus("unavailable");
            setLabState("model_unavailable");
          }
          setErrorBanner(err.message);
        } else {
          setConnectionStatus("offline");
          setLabState("model_unavailable");
          setErrorBanner("Inference failed unexpectedly.");
        }
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
        inFlightRef.current = false;
      }
    },
    [stopLiveTimer],
  );

  const captureAndAnalyze = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || !streamRef.current || video.readyState < 2 || inFlightRef.current) {
      return;
    }
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (blob && mountedRef.current) {
          void runFrameInference(blob, "webcam-frame.jpg");
        }
      },
      "image/jpeg",
      0.88,
    );
  }, [runFrameInference]);

  const startLiveTesting = useCallback(() => {
    if (!cameraActive) return;
    stopLiveTimer();
    setLiveTesting(true);
    liveTimerRef.current = window.setInterval(() => {
      if (!inFlightRef.current) {
        captureAndAnalyze();
      }
    }, intervalMs);
  }, [cameraActive, captureAndAnalyze, intervalMs, stopLiveTimer]);

  useEffect(() => {
    if (liveTesting && cameraActive) {
      startLiveTesting();
    }
  }, [cameraActive, intervalMs, liveTesting, startLiveTesting]);

  const handlePhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setErrorBanner(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setLabState("unsupported_image");
      setErrorBanner("Unsupported file type. Choose a JPEG or PNG image.");
      return;
    }
    if (file.size === 0 || file.size > maxUploadBytes) {
      setLabState("unsupported_image");
      setErrorBanner(`Image must be non-empty and under ${(maxUploadBytes / 1_000_000).toFixed(1)} MB.`);
      return;
    }

    if (cameraActive) {
      stopCamera("initial");
    }
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setSelectedPhoto(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    drawBoundingBox(overlayCanvasRef.current, null, null);
  };

  const analyzeUploadedPhoto = () => {
    if (!selectedPhoto) return;
    void runFrameInference(selectedPhoto, selectedPhoto.name);
  };

  const categoryLabels = useMemo(() => {
    if (modelInfo?.labels?.length) return modelInfo.labels;
    if (result?.probabilities) return Object.keys(result.probabilities);
    return [];
  }, [modelInfo?.labels, result?.probabilities]);

  const displayedProbabilities = useMemo(() => {
    if (!result?.probabilities) return null;
    if (smoothingEnabled && emaProbabilities) return emaProbabilities;
    return result.probabilities;
  }, [emaProbabilities, result?.probabilities, smoothingEnabled]);

  const connBadge = useMemo(() => {
    switch (connectionStatus) {
      case "ready":
        return <Badge tone="success">Online / Ready</Badge>;
      case "loading":
        return <Badge tone="cyan">Loading…</Badge>;
      case "offline":
        return <Badge tone="danger">Offline</Badge>;
      case "auth_error":
        return <Badge tone="danger">Authentication Error</Badge>;
      case "unavailable":
        return <Badge tone="warning">Model Unavailable</Badge>;
      case "inference_error":
        return <Badge tone="danger">Inference Error</Badge>;
      case "disabled":
        return <Badge tone="neutral">Disabled</Badge>;
    }
  }, [connectionStatus]);

  if (isApiMode && authStatus === "loading") {
    return <SkeletonPage />;
  }

  if (isApiMode && !isSuperAdmin) {
    return (
      <EmptyState
        icon={<LockKeyhole />}
        title="Model Lab access restricted"
        description="Authorized Super Administrator access is required to open Facial Expression V5 — Model Lab."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facial Expression V5 — Model Lab"
        description="Consent-based technical testing and model diagnostics"
        eyebrow={connBadge}
        actions={
          <Button
            variant="secondary"
            loading={diagnosticsLoading}
            disabled={diagnosticsLoading || !isApiMode}
            onClick={() => void loadDiagnostics()}
          >
            <RefreshCw />
            Refresh status
          </Button>
        }
      />

      {!isApiMode && (
        <GlassCard className="border-amber-400/30 bg-amber-500/[0.06] p-4 text-sm text-fg-secondary">
          Live Model Lab inference requires <code className="font-mono text-xs">NEXT_PUBLIC_APP_MODE=api</code> connected to the
          InterviewOS NestJS backend and V5 FastAPI service. No simulated or placeholder expression predictions are generated.
        </GlassCard>
      )}

      {/* F. Privacy and Limitations Banner */}
      <GlassCard className="border-blue-400/25 bg-blue-500/[0.05] p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-brand-cyan" aria-hidden />
          <p className="text-xs leading-relaxed text-fg-secondary sm:text-[13px]">
            Facial-expression predictions are visual model estimates, not reliable measurements of a person&apos;s emotions,
            honesty, personality or employment suitability. This Model Lab is for voluntary technical testing only.
          </p>
        </div>
      </GlassCard>

      {errorBanner && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{errorBanner}</span>
          </div>
          {cameraPermissionDenied && (
            <Button size="sm" variant="secondary" onClick={() => void startCamera()}>
              Retry Camera Permission
            </Button>
          )}
        </div>
      )}

      {/* A. Model Status Header */}
      <GlassCard className="p-5 sm:p-6">
        <CardHeader
          title="Model Status & Contract Metadata"
          description="Live readiness and capabilities reported server-side by the NestJS bridge"
          icon={<Cpu />}
          action={<Badge tone={STATE_BADGE[labState].tone}>{STATE_BADGE[labState].label}</Badge>}
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
            <p className="text-xs text-fg-muted">Model Readiness &amp; Version</p>
            <p className="mt-1 font-mono text-sm font-semibold text-fg">
              {health?.ready ? "Ready" : health?.status ?? "Unknown"} · {modelInfo?.model_version ?? health?.modelVersion ?? "v5"}
            </p>
          </div>
          <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
            <p className="text-xs text-fg-muted">Execution Device</p>
            <p className="mt-1 font-mono text-sm font-semibold text-fg">
              {modelInfo?.device ?? health?.device ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
            <p className="text-xs text-fg-muted">Latest Request Latency</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-fg">
              {result ? `${result.processing_ms.toFixed(1)} ms` : "—"}
              {lastE2eMs !== null ? ` (E2E ${lastE2eMs} ms)` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
            <p className="text-xs text-fg-muted">Ensemble Members</p>
            <p className="mt-1 font-mono text-sm font-semibold text-fg">
              {health?.ensembleMembersLoaded ?? modelInfo?.members.length ?? 0} loaded
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-muted">Verified categories:</span>
          {categoryLabels.length > 0 ? (
            categoryLabels.map((lbl) => <Pill key={lbl}>{lbl}</Pill>)
          ) : (
            <span className="text-xs text-fg-muted">Unavailable until model metadata loads</span>
          )}
        </div>

        {modelInfo?.historical_benchmark && (
          <p className="mt-4 rounded-lg border border-subtle bg-overlay/[0.02] px-3 py-2 text-xs text-fg-muted">
            Historical offline reference ({modelInfo.historical_benchmark.dataset}, n=
            {modelInfo.historical_benchmark.sample_count ?? "?"}):{" "}
            {typeof modelInfo.historical_benchmark.accuracy === "number"
              ? `${(modelInfo.historical_benchmark.accuracy * 100).toFixed(2)}%`
              : "n/a"}{" "}
            accuracy. {modelInfo.historical_benchmark.note}
          </p>
        )}
      </GlassCard>

      {/* Main Split: Camera & Photo Input (left) + Classification Output (right) */}
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-7">
          {/* B. Camera Preview Panel */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader
              title="Camera Preview (Opt-In)"
              description="Images are processed temporarily in memory for this test and are never recorded or stored."
              icon={<Camera />}
            />

            <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-xl border border-subtle bg-ink-950/90">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn("absolute inset-0 h-full w-full object-contain", !cameraActive && "hidden")}
              />
              {photoPreviewUrl && !cameraActive && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreviewUrl}
                  alt="Selected test image preview"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

              {!cameraActive && !photoPreviewUrl && (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <CameraOff className="size-9 text-fg-disabled" aria-hidden />
                  <p className="mt-3 text-sm font-medium text-slate-200">Camera is off</p>
                  <p className="mt-1 max-w-sm text-xs text-slate-400">
                    Click <strong>Start Camera</strong> to request explicit webcam permission, or upload a JPEG/PNG photo below.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!cameraActive ? (
                <Button
                  type="button"
                  disabled={!isApiMode}
                  onClick={() => void startCamera()}
                >
                  <Camera />
                  Start Camera
                </Button>
              ) : (
                <Button type="button" variant="danger" onClick={() => stopCamera("stopped")}>
                  <Square />
                  Stop Camera
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                disabled={!cameraActive || labState === "analyzing"}
                onClick={captureAndAnalyze}
              >
                <ScanFace />
                Capture &amp; Analyze
              </Button>

              {!liveTesting ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!cameraActive}
                  onClick={startLiveTesting}
                >
                  <Play />
                  Start Live Testing
                </Button>
              ) : (
                <Button type="button" variant="danger" onClick={stopLiveTimer}>
                  <Square />
                  Stop Live Testing
                </Button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-subtle pt-4 text-xs text-fg-secondary">
              <label className="flex items-center gap-2">
                <span>Live interval:</span>
                <select
                  aria-label="Live frame interval"
                  value={intervalMs}
                  onChange={(e) => setIntervalMs(Number(e.target.value))}
                  className="h-8 rounded-lg border border-subtle bg-overlay/[0.04] px-2 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand/40"
                >
                  <option value={750}>750 ms (~1.3 FPS)</option>
                  <option value={1000}>1000 ms (~1.0 FPS)</option>
                  <option value={1500}>1500 ms (~0.7 FPS)</option>
                  <option value={2000}>2000 ms (0.5 FPS)</option>
                </select>
              </label>

              {devices.length > 1 && (
                <label className="flex items-center gap-2">
                  <span>Select Camera:</span>
                  <select
                    aria-label="Select Camera"
                    value={selectedDeviceId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedDeviceId(nextId);
                      if (cameraActive) void startCamera(nextId);
                    }}
                    className="h-8 max-w-52 rounded-lg border border-subtle bg-overlay/[0.04] px-2 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand/40"
                  >
                    {devices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="ml-auto flex cursor-pointer items-center gap-2">
                <Switch
                  checked={smoothingEnabled}
                  onCheckedChange={(checked) => setSmoothingEnabled(checked)}
                  aria-label="Toggle UI-only display smoothing"
                />
                <span>UI display smoothing</span>
              </label>
            </div>
          </GlassCard>

          {/* D. Photo Upload Test */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader
              title="Photo Upload Test"
              description={`Analyze one local JPEG or PNG image (max ${(maxUploadBytes / 1_000_000).toFixed(0)} MB). Not stored in database.`}
              icon={<ImagePlus />}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png"
                aria-label="Select JPEG or PNG photo"
                onChange={handlePhotoFileChange}
                className="block max-w-full text-xs text-fg-secondary file:mr-3 file:rounded-lg file:border file:border-subtle file:bg-overlay/[0.06] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-fg hover:file:bg-overlay/[0.1]"
              />
              <Button
                type="button"
                disabled={!selectedPhoto || !isApiMode || labState === "analyzing"}
                onClick={analyzeUploadedPhoto}
              >
                <Upload />
                Analyze Photo
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!selectedPhoto && !photoPreviewUrl}
                onClick={clearSelectedPhoto}
              >
                <Trash2 />
                Clear
              </Button>
            </div>
            {selectedPhoto && (
              <p className="mt-2 text-xs text-fg-muted">
                Selected: <span className="font-mono text-fg">{selectedPhoto.name}</span> (
                {(selectedPhoto.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </GlassCard>
        </div>

        {/* C. Expression Classification Panel */}
        <div className="space-y-6 xl:col-span-5">
          <GlassCard className="p-5 sm:p-6">
            <CardHeader
              title="Expression Classification"
              description="Visual facial-expression category estimates from the V5 PyTorch ensemble"
              icon={<ScanFace />}
            />

            {!result ? (
              <div className="mt-6 rounded-xl border border-dashed border-subtle p-6 text-center">
                <p className="text-sm font-medium text-fg">Awaiting first frame analysis</p>
                <p className="mt-1 text-xs text-fg-muted">
                  Start the camera and click <strong>Capture &amp; Analyze</strong>, or upload a JPEG/PNG photo to inspect real V5 predictions.
                </p>
              </div>
            ) : result.status === "NO_FACE_DETECTED" ? (
              <div className="mt-5 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-semibold">No face detected — adjust the camera or image and try again.</p>
                <p className="mt-1 text-xs opacity-90">
                  Empty or occluded frames are never defaulted to neutral. Processing time: {result.processing_ms.toFixed(1)} ms.
                </p>
              </div>
            ) : result.status === "MULTIPLE_FACES_DETECTED" ? (
              <div className="mt-5 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                <p className="font-semibold">
                  Multiple faces detected ({result.face_count}) — keep a single face in frame and try again.
                </p>
                <p className="mt-1 text-xs opacity-90">Processing time: {result.processing_ms.toFixed(1)} ms.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-subtle bg-overlay/[0.03] p-3.5">
                    <p className="text-[11px] uppercase tracking-wider text-fg-muted">Predicted Category</p>
                    <p className="mt-1 font-display text-2xl font-bold capitalize text-fg">
                      {result.expression_label ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-subtle bg-overlay/[0.03] p-3.5">
                    <p className="text-[11px] uppercase tracking-wider text-fg-muted">Raw Confidence</p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-fg">
                      {result.confidence !== null ? `${(result.confidence * 100).toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">Face detected ({result.face_count})</Badge>
                  <Badge tone="neutral">{result.processing_ms.toFixed(1)} ms</Badge>
                  <Badge tone="blue">{result.model_version}</Badge>
                  {result.uncertain && <Badge tone="warning">Uncertain prediction</Badge>}
                  {result.quality_warning && <Badge tone="warning">Quality: {result.quality_warning}</Badge>}
                </div>

                {displayedProbabilities && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg">Category Probabilities</span>
                      {smoothingEnabled && (
                        <span className="text-fg-muted">Display smoothing active (raw score shown above)</span>
                      )}
                    </div>
                    <div className="space-y-2.5">
                      {categoryLabels.map((lbl) => {
                        const score = displayedProbabilities[lbl] ?? 0;
                        const pct = Math.max(0, Math.min(100, score * 100));
                        const isTop = lbl === result.expression_label;
                        return (
                          <div key={lbl} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className={cn("font-mono lowercase", isTop ? "font-semibold text-fg" : "text-fg-secondary")}>
                                {lbl}
                              </span>
                              <span className="font-mono tabular-nums text-fg-muted">{pct.toFixed(1)}%</span>
                            </div>
                            <div
                              className="h-2 w-full overflow-hidden rounded-full bg-overlay/[0.08]"
                              role="progressbar"
                              aria-label={`${lbl} probability`}
                              aria-valuenow={Math.round(pct)}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <div
                                className={cn(
                                  "h-full rounded-full transition-[width] duration-150",
                                  isTop ? "bg-gradient-to-r from-emerald-400 to-brand-cyan" : "bg-brand/80",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {result.top_predictions && result.top_predictions.length > 0 && (
                  <div className="border-t border-subtle pt-3">
                    <p className="mb-2 text-xs font-semibold text-fg-secondary">Top-3 Predictions</p>
                    <div className="flex flex-wrap gap-2">
                      {result.top_predictions.map((item) => (
                        <Pill key={item.label} className="font-mono">
                          {item.label}: {(item.confidence * 100).toFixed(1)}%
                        </Pill>
                      ))}
                    </div>
                  </div>
                )}

                <details className="rounded-lg border border-subtle bg-overlay/[0.02] p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-fg-secondary">Raw API response (developer inspection)</summary>
                  <pre className="mt-2 max-h-56 overflow-auto font-mono text-[11px] text-fg-muted">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* E. Model Diagnostics */}
      <section aria-labelledby="model-diagnostics-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="model-diagnostics-heading" className="text-lg font-semibold text-fg">
              Model Diagnostics
            </h2>
            <p className="text-xs text-fg-muted">
              Aggregate FastAPI operational telemetry only. No frames or individual expression profiles are stored.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MetricCard
            label="Inference requests"
            value={metrics ? metrics.total_requests : "—"}
            icon={Activity}
            hint={metrics ? `${metrics.successful_inferences} successful` : "Waiting for status"}
          />
          <MetricCard
            label="Average latency"
            value={metrics?.average_latency_ms !== null && metrics?.average_latency_ms !== undefined ? `${metrics.average_latency_ms.toFixed(1)} ms` : "—"}
            icon={Clock3}
            hint={metrics?.p95_latency_ms != null ? `p95 ${metrics.p95_latency_ms.toFixed(1)} ms` : "Bounded memory window"}
          />
          <MetricCard
            label="Failed requests"
            value={metrics ? metrics.failed_requests : "—"}
            icon={AlertTriangle}
            hint={metrics ? `${metrics.no_face_cases} no-face · ${metrics.multiple_face_cases} multi-face` : undefined}
          />
          <MetricCard
            label="Service uptime"
            value={formatDuration(metrics?.uptime_seconds)}
            icon={metrics?.ready ? CheckCircle2 : Gauge}
            hint={`Device: ${metrics?.device ?? health?.device ?? "—"} · API ${modelInfo?.service_version ?? health?.serviceVersion ?? "—"}`}
          />
        </div>
      </section>

      <canvas ref={captureCanvasRef} className="hidden" aria-hidden />
    </div>
  );
}
