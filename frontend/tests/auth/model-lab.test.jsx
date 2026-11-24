import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_NAV, isNavVisible } from "@/components/admin/nav";

const state = vi.hoisted(() => ({
  auth: {
    status: "signedIn",
    profile: {
      id: "admin-1",
      email: "admin@balitech.com",
      displayName: "Super Admin",
      roles: ["SUPER_ADMIN"],
      permissions: ["users:manage"],
      candidateId: null,
      isStaff: true,
      providers: ["admin-password"],
    },
  },
  health: vi.fn(),
  modelInfo: vi.fn(),
  metrics: vi.fn(),
  inferFrame: vi.fn(),
}));

vi.mock("@/lib/config/environment", () => ({
  APP_MODE: "api",
  isApiMode: true,
  isDemoMode: false,
  API_BASE_URL: "http://localhost:4000/api/v1",
}));

vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/lib/api/model-lab", async () => {
  const actual = await vi.importActual("@/lib/api/model-lab");
  return {
    ...actual,
    modelLabApi: {
      health: state.health,
      modelInfo: state.modelInfo,
      metrics: state.metrics,
      inferFrame: state.inferFrame,
    },
  };
});

import { ModelLabView } from "@/components/admin/model-lab-view";

const READY_HEALTH = {
  enabled: true,
  configured: true,
  status: "ready",
  ready: true,
  live: true,
  modelVersion: "v5",
  serviceVersion: "1.0.0",
  device: "cpu",
  classesCount: 7,
  ensembleMembersLoaded: 3,
  maxUploadBytes: 10_000_000,
  requestTimeoutMs: 18000,
  reason: null,
  checkedAt: "2026-11-24T18:00:00.000Z",
};

const READY_INFO = {
  model_name: "Facial Expression V5 Ensemble",
  model_version: "v5",
  service_version: "1.0.0",
  ready: true,
  labels: ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"],
  input_size: 224,
  channel_order: "RGB",
  preprocessing_summary: "48x48 gray -> 224x224 RGB",
  device: "cpu",
  ensemble_available: true,
  calibrated: false,
  members: [],
  historical_benchmark: null,
  responsible_use_notice: "Demo only",
};

const READY_METRICS = {
  total_requests: 5,
  successful_inferences: 4,
  failed_requests: 0,
  no_face_cases: 1,
  multiple_face_cases: 0,
  average_latency_ms: 820.5,
  p50_latency_ms: 810.0,
  p95_latency_ms: 890.0,
  sample_window_count: 5,
  model_load_duration_ms: 2150.0,
  ready: true,
  uptime_seconds: 120,
  device: "cpu",
};

describe("Admin Model Lab UI & Navigation", () => {
  const stopTrackMock = vi.fn();
  const getUserMediaMock = vi.fn();

  beforeEach(() => {
    state.auth = {
      status: "signedIn",
      profile: {
        id: "admin-1",
        email: "admin@balitech.com",
        displayName: "Super Admin",
        roles: ["SUPER_ADMIN"],
        permissions: ["users:manage"],
        candidateId: null,
        isStaff: true,
        providers: ["admin-password"],
      },
    };
    state.health.mockReset().mockResolvedValue(READY_HEALTH);
    state.modelInfo.mockReset().mockResolvedValue(READY_INFO);
    state.metrics.mockReset().mockResolvedValue(READY_METRICS);
    state.inferFrame.mockReset();

    stopTrackMock.mockReset();
    getUserMediaMock.mockReset().mockResolvedValue({
      getTracks: () => [{ stop: stopTrackMock }],
      getVideoTracks: () => [{ stop: stopTrackMock, getSettings: () => ({ deviceId: "cam-1" }) }],
    });

    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "cam-1", label: "Built-in Camera" }]),
      },
    });
    URL.createObjectURL = vi.fn(() => "blob:mock-preview");
    URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 50 }),
      drawImage: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("restricts Model Lab navigation item to SUPER_ADMIN", () => {
    const modelLabNav = ALL_NAV.find((n) => n.href === "/admin/model-lab");
    expect(modelLabNav).toBeDefined();
    expect(isNavVisible(modelLabNav, ["users:manage"], true, ["SUPER_ADMIN"])).toBe(true);
    expect(isNavVisible(modelLabNav, ["users:manage"], true, ["HR_MANAGER"])).toBe(false);
    expect(isNavVisible(modelLabNav, ["candidates:read"], true, ["RECRUITER"])).toBe(false);
    expect(isNavVisible(modelLabNav, ["interviews:take"], true, ["CANDIDATE"])).toBe(false);
  });

  it("denies non-Super-Admin access in the view", () => {
    state.auth.profile.roles = ["HR_MANAGER"];
    state.auth.profile.permissions = ["candidates:read"];
    render(<ModelLabView />);
    expect(screen.getByText("Model Lab access restricted")).toBeTruthy();
    expect(state.health).not.toHaveBeenCalled();
  });

  it("does not start camera automatically and stops tracks on Stop Camera and unmount", async () => {
    const { unmount } = render(<ModelLabView />);
    await screen.findByText("Online / Ready");
    expect(getUserMediaMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Start Camera/i }));
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));

    const stopBtn = await screen.findByRole("button", { name: /Stop Camera/i });
    fireEvent.click(stopBtn);
    expect(stopTrackMock).toHaveBeenCalledTimes(1);

    // Start again and verify unmount stops tracks cleanly
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/i }));
    await screen.findByRole("button", { name: /Stop Camera/i });
    unmount();
    expect(stopTrackMock).toHaveBeenCalledTimes(2);
  });

  it("displays offline state gracefully when FastAPI is unavailable", async () => {
    state.health.mockResolvedValueOnce({
      ...READY_HEALTH,
      status: "offline",
      ready: false,
      live: false,
      reason: "Facial Expression V5 service is offline or unreachable.",
    });
    render(<ModelLabView />);
    await screen.findByText("Offline");
    expect(screen.getByText(/Facial Expression V5 service is offline or unreachable/i)).toBeTruthy();
  });

  it("uploads a photo, displays all 7 probabilities, and handles NO_FACE_DETECTED and MULTIPLE_FACES_DETECTED", async () => {
    render(<ModelLabView />);
    await screen.findByText("Online / Ready");

    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "face.png", { type: "image/png" });
    const input = screen.getByLabelText("Select JPEG or PNG photo");
    fireEvent.change(input, { target: { files: [file] } });

    state.inferFrame.mockResolvedValueOnce({
      request_id: "req-ok",
      status: "OK",
      model_version: "v5",
      face_detected: true,
      face_count: 1,
      expression_label: "happy",
      confidence: 0.875,
      probabilities: { angry: 0.01, disgust: 0.01, fear: 0.02, happy: 0.875, neutral: 0.05, sad: 0.02, surprise: 0.015 },
      top_predictions: [{ label: "happy", confidence: 0.875 }],
      face_bbox: { x: 10, y: 10, width: 100, height: 100, image_width: 200, image_height: 200, coordinate_space: "pixel_xywh_top_left" },
      processing_ms: 812.4,
      device: "cpu",
      quality_warning: null,
      uncertain: false,
      responsible_use_notice: "Demo only",
      timestamp: "2026-11-24T18:00:00Z",
    });

    fireEvent.click(screen.getByRole("button", { name: /Analyze Photo/i }));
    const matches = await screen.findAllByText("87.5%");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("progressbar", { name: "happy probability" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "surprise probability" })).toBeTruthy();

    state.inferFrame.mockResolvedValueOnce({
      request_id: "req-nf",
      status: "NO_FACE_DETECTED",
      model_version: "v5",
      face_detected: false,
      face_count: 0,
      expression_label: null,
      confidence: null,
      probabilities: null,
      top_predictions: null,
      face_bbox: null,
      processing_ms: 10.2,
      device: "cpu",
      quality_warning: null,
      uncertain: false,
      responsible_use_notice: "Demo only",
      timestamp: "2026-11-24T18:00:01Z",
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Photo/i }));
    await screen.findByText("No face detected — adjust the camera or image and try again.");

    state.inferFrame.mockResolvedValueOnce({
      request_id: "req-mf",
      status: "MULTIPLE_FACES_DETECTED",
      model_version: "v5",
      face_detected: true,
      face_count: 2,
      expression_label: null,
      confidence: null,
      probabilities: null,
      top_predictions: null,
      face_bbox: null,
      processing_ms: 14.0,
      device: "cpu",
      quality_warning: "MULTIPLE_FACES_IN_FRAME",
      uncertain: false,
      responsible_use_notice: "Demo only",
      timestamp: "2026-11-24T18:00:02Z",
    });
    fireEvent.click(screen.getByRole("button", { name: /Analyze Photo/i }));
    await screen.findByText(/Multiple faces detected \(2\)/i);
  });
});
