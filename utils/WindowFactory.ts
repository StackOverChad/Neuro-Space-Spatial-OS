// utils/WindowFactory.ts
import {
  Scene,
  MeshBuilder,
  Mesh,
  Vector3,
  StandardMaterial,
  Color3,
  DynamicTexture,
  VideoTexture,
  Texture,
  Vector4,
  Matrix,
  ActionManager,
  ExecuteCodeAction
} from "@babylonjs/core";

import {
  AdvancedDynamicTexture,
  Rectangle,
  TextBlock,
  Button,
  Image,
  Control,
  InputText,
  ScrollViewer,
  StackPanel,
  Slider
} from "@babylonjs/gui";

export type WeatherData = {
  city?: string;
  country?: string;
  tempC?: number;
  description?: string;
  humidity?: number;
  windMs?: number;
};

// --- YOUTUBE WINDOW (Fixed: Syncs Iframe to 3D Mesh) ---
export const createYoutubeWindow = (
  id: string,
  scene: Scene,
  position: Vector3,
  videoId: string,
  onClose: () => void
): Mesh => {
  // 1. Create the 3D Holder (The thing you actually grab)
  const width = 8;
  const height = 4.5;
  const fallbackIframeWidth = 640;
  const fallbackIframeHeight = 360;
  const plane = MeshBuilder.CreatePlane(id, { width, height }, scene);
  plane.position = position;

  // Make it invisible (The video will sit on top) but clickable for hand tracking
  const mat = new StandardMaterial(id + "_mat", scene);
  mat.alpha = 0; // Invisible, but handles collisions
  plane.material = mat;

  // 2. Create UI Buttons (Close Button) - attached to the 3D mesh
  const uiPlane = MeshBuilder.CreatePlane(id + "_ui", { width, height }, scene);
  uiPlane.parent = plane;
  uiPlane.position.z = -0.1; // Slightly in front

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(uiPlane, 1024, 576, false);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "80px";
  closeBtn.height = "80px";
  closeBtn.color = "white";
  closeBtn.background = "red";
  closeBtn.cornerRadius = 40;
  closeBtn.fontSize = 40;
  closeBtn.fontWeight = "bold";
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  closeBtn.top = "20px";
  closeBtn.left = "-20px";

  closeBtn.onPointerUpObservable.add(() => {
    onClose();
  });
  advancedTexture.addControl(closeBtn);

  // 3. Inject the HTML Iframe (The Real Player)
  if (typeof document !== "undefined") {
    // Remove existing if duplicate
    const existing = document.getElementById(id + "_iframe");
    if (existing) existing.remove();
    const existingBtn = document.getElementById(id + "_close_btn");
    if (existingBtn) existingBtn.remove();

    const iframe = document.createElement("iframe");
    iframe.id = id + "_iframe";
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&playsinline=1`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    iframe.style.width = `${fallbackIframeWidth}px`;
    iframe.style.height = `${fallbackIframeHeight}px`;
    iframe.style.zIndex = "2147483000";

    // We'll update left/top/width/height every frame based on projected plane corners
    iframe.style.transform = "";

    iframe.style.pointerEvents = "auto";
    (iframe.style as any).touchAction = "auto";

    const mount = document.body;
    mount.appendChild(iframe);

    const closeBtnEl = document.createElement("button");
    closeBtnEl.id = id + "_close_btn";
    closeBtnEl.innerText = "✕";
    closeBtnEl.type = "button";
    closeBtnEl.setAttribute("aria-label", "Close YouTube window");
    Object.assign(closeBtnEl.style, {
      position: "fixed",
      width: "44px",
      height: "44px",
      borderRadius: "22px",
      border: "none",
      background: "rgba(255, 0, 0, 0.9)",
      color: "white",
      fontSize: "22px",
      fontWeight: "700",
      cursor: "pointer",
      zIndex: "2147483100",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      display: "block",
      pointerEvents: "auto"
    } as Partial<CSSStyleDeclaration>);

    closeBtnEl.onclick = () => {
      onClose();
    };

    mount.appendChild(closeBtnEl);

    const openBtnEl = document.createElement("button");
    openBtnEl.id = id + "_open_btn";
    openBtnEl.innerText = "OPEN";
    openBtnEl.type = "button";
    openBtnEl.setAttribute("aria-label", "Open on YouTube");
    Object.assign(openBtnEl.style, {
      position: "fixed",
      height: "44px",
      borderRadius: "12px",
      border: "none",
      padding: "0 14px",
      background: "rgba(0, 0, 0, 0.65)",
      color: "white",
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      zIndex: "2147483100",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      display: "block",
      pointerEvents: "auto"
    } as Partial<CSSStyleDeclaration>);

    openBtnEl.onclick = () => {
      window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
    };

    mount.appendChild(openBtnEl);

    // --- THE SYNC LOGIC ---
    // Every frame, calculate where the 3D mesh is on the 2D screen
    const engine = scene.getEngine();

    const renderObserver = scene.onBeforeRenderObservable.add(() => {
      if (!scene.activeCamera) return;

      const viewport = scene.activeCamera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight()
      );

      // Project plane corners into screen space
      const world = plane.getWorldMatrix();
      const halfW = width / 2;
      const halfH = height / 2;
      const corners = [
        new Vector3(-halfW, halfH, 0),
        new Vector3(halfW, halfH, 0),
        new Vector3(halfW, -halfH, 0),
        new Vector3(-halfW, -halfH, 0)
      ].map(v => Vector3.Project(v, world, scene.getTransformMatrix(), viewport));

      const center = Vector3.Project(Vector3.Zero(), world, scene.getTransformMatrix(), viewport);

      const xs = corners.map(c => c.x);
      const ys = corners.map(c => c.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const cssW = Math.max(1, maxX - minX);
      const cssH = Math.max(1, maxY - minY);

      iframe.style.left = `${minX}px`;
      iframe.style.top = `${minY}px`;
      iframe.style.width = `${cssW}px`;
      iframe.style.height = `${cssH}px`;

      // Buttons
      closeBtnEl.style.left = `${maxX - 44 - 8}px`;
      closeBtnEl.style.top = `${minY + 8}px`;
      openBtnEl.style.left = `${minX + 8}px`;
      openBtnEl.style.top = `${minY + 8}px`;

      // Hide if behind the camera
      if (center.z > 1 || center.z < 0) {
        iframe.style.display = "none";
        closeBtnEl.style.display = "none";
        openBtnEl.style.display = "none";
      } else {
        iframe.style.display = "block";
        closeBtnEl.style.display = "block";
        openBtnEl.style.display = "block";
      }
    });

    // Cleanup: When 3D window is deleted, delete the Iframe and stop the loop
    plane.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      const el = document.getElementById(id + "_iframe");
      if (el) el.remove();
      const btn = document.getElementById(id + "_close_btn");
      if (btn) btn.remove();
      const openBtn = document.getElementById(id + "_open_btn");
      if (openBtn) openBtn.remove();
    });
  }

  return plane;
};

export type MusicTrack = {
  videoId: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
};

export type MusicController = {
  setTrack: (track: MusicTrack) => void;
  setQueue: (queue: MusicTrack[], index?: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  getState: () => {
    track: MusicTrack | null;
    isPlaying: boolean;
    volume: number;
    currentTime: number;
    duration: number;
  };
  onAction?: (action: string, payload?: any) => void;
  dispose: () => void;
};

export const createMusicWindow = (
  id: string,
  scene: Scene,
  position: Vector3,
  data: MusicTrack,
  onClose: () => void
): Mesh => {
  const width = 4.2;
  const height = 5.2;
  const plane = MeshBuilder.CreatePlane(id, { width, height }, scene);
  plane.position = position;

  const mat = new StandardMaterial(id + "_mat", scene);
  mat.alpha = 0.15;
  mat.emissiveColor = new Color3(0, 0.9, 0.9);
  mat.disableLighting = true;
  plane.material = mat;

  const uiPlane = MeshBuilder.CreatePlane(id + "_ui", { width, height }, scene);
  uiPlane.parent = plane;
  uiPlane.position.z = -0.02;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(uiPlane, 1024, 1280, false);

  const root = new Rectangle();
  root.width = 1;
  root.height = 1;
  root.thickness = 2;
  root.color = "rgba(0, 255, 255, 0.35)";
  root.background = "rgba(0, 0, 0, 0.55)";
  root.cornerRadius = 28;
  advancedTexture.addControl(root);

  const stack = new StackPanel();
  stack.width = 1;
  stack.height = 1;
  stack.paddingTop = "18px";
  stack.paddingBottom = "14px";
  stack.paddingLeft = "18px";
  stack.paddingRight = "18px";
  root.addControl(stack);

  const cover = new Image(id + "_cover", data.thumbnail || "");
  cover.width = 1;
  cover.height = "520px";
  cover.stretch = Image.STRETCH_UNIFORM;
  stack.addControl(cover);

  const title = new TextBlock();
  title.text = data.title || "Now Playing";
  title.color = "white";
  title.fontSize = 44;
  title.fontWeight = "700";
  title.textWrapping = true;
  title.height = "140px";
  title.paddingTop = "16px";
  title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  stack.addControl(title);

  const artist = new TextBlock();
  artist.text = data.artist || "";
  artist.color = "rgba(255,255,255,0.75)";
  artist.fontSize = 32;
  artist.height = "70px";
  artist.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  stack.addControl(artist);

  const progressStack = new StackPanel();
  progressStack.isVertical = true;
  progressStack.height = "100px";
  progressStack.paddingTop = "6px";
  progressStack.paddingBottom = "6px";
  stack.addControl(progressStack);

  const progressSlider = new Slider();
  progressSlider.minimum = 0;
  progressSlider.maximum = 1;
  progressSlider.value = 0;
  progressSlider.height = "20px";
  progressSlider.color = "#00f0ff";
  progressSlider.background = "rgba(255,255,255,0.15)";
  progressSlider.borderColor = "rgba(255,255,255,0.25)";
  progressStack.addControl(progressSlider);

  const timeText = new TextBlock();
  timeText.text = "0:00 / 0:00";
  timeText.color = "rgba(255,255,255,0.7)";
  timeText.fontSize = 22;
  timeText.height = "40px";
  timeText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  progressStack.addControl(timeText);

  const controls = new StackPanel();
  controls.isVertical = false;
  controls.height = "90px";
  controls.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  stack.addControl(controls);

  const mkBtn = (label: string, bg: string, width: string = "160px") => {
    const b = Button.CreateSimpleButton(id + "_btn_" + label, label);
    b.width = width;
    b.height = "72px";
    b.color = "white";
    b.background = bg;
    b.cornerRadius = 18;
    b.fontSize = 28;
    b.thickness = 0;
    b.paddingLeft = "10px";
    b.paddingRight = "10px";
    return b;
  };

  const prevBtn = mkBtn("⏮", "rgba(255,255,255,0.12)", "120px");
  const playPauseBtn = mkBtn("⏸", "rgba(0, 255, 255, 0.35)", "160px");
  const nextBtn = mkBtn("⏭", "rgba(255,255,255,0.12)", "120px");

  controls.addControl(prevBtn);
  controls.addControl(playPauseBtn);
  controls.addControl(nextBtn);

  const volumeRow = new StackPanel();
  volumeRow.isVertical = false;
  volumeRow.height = "70px";
  volumeRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  stack.addControl(volumeRow);

  const volumeLabel = new TextBlock();
  volumeLabel.text = "VOL";
  volumeLabel.color = "rgba(255,255,255,0.7)";
  volumeLabel.fontSize = 22;
  volumeLabel.width = "80px";
  volumeLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  volumeRow.addControl(volumeLabel);

  const volumeSlider = new Slider();
  volumeSlider.minimum = 0;
  volumeSlider.maximum = 100;
  volumeSlider.value = 70;
  volumeSlider.height = "18px";
  volumeSlider.width = "520px";
  volumeSlider.color = "#00f0ff";
  volumeSlider.background = "rgba(255,255,255,0.15)";
  volumeRow.addControl(volumeSlider);

  const queueText = new TextBlock();
  queueText.text = "Queue: -";
  queueText.color = "rgba(255,255,255,0.6)";
  queueText.fontSize = 20;
  queueText.height = "70px";
  queueText.textWrapping = true;
  queueText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  stack.addControl(queueText);

  const actionRow = new StackPanel();
  actionRow.isVertical = false;
  actionRow.height = "70px";
  actionRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  stack.addControl(actionRow);

  const openBtn = mkBtn("OPEN", "rgba(0, 0, 0, 0.45)", "200px");
  const closeBtn = mkBtn("✕", "rgba(255, 0, 0, 0.85)", "120px");
  actionRow.addControl(openBtn);
  actionRow.addControl(closeBtn);

  let isPlaying = true;
  let iframeEl: HTMLIFrameElement | null = null;
  let currentTrack: MusicTrack | null = data || null;
  let currentTime = 0;
  let duration = 0;
  let isSeeking = false;
  let volume = 70;
  let pollTimer: number | null = null;
  let onMessage: ((event: MessageEvent) => void) | null = null;

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const post = (func: string, args: any[] = []) => {
    try {
      if (!iframeEl || !iframeEl.contentWindow) return;
      iframeEl.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args }),
        "*"
      );
    } catch (e) {
    }
  };

  const updateTimeUI = () => {
    timeText.text = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  };

  const updateProgressUI = () => {
    if (isSeeking) return;
    progressSlider.maximum = duration > 0 ? duration : 1;
    progressSlider.value = Math.min(currentTime, progressSlider.maximum);
    updateTimeUI();
  };

  const setTrack = (track: MusicTrack) => {
    currentTrack = track;
    title.text = track.title || "Now Playing";
    artist.text = track.artist || "";
    cover.source = track.thumbnail || "";
    currentTime = 0;
    duration = 0;
    updateProgressUI();
    if (iframeEl) {
      iframeEl.src = `https://www.youtube.com/embed/${track.videoId}?autoplay=1&controls=0&playsinline=1&enablejsapi=1`;
    }
    isPlaying = true;
    (playPauseBtn.textBlock as any).text = "⏸";
  };

  const setQueue = (queue: MusicTrack[], index: number = 0) => {
    if (!queue.length) {
      queueText.text = "Queue: -";
      return;
    }
    const nextItems = queue.slice(index + 1, index + 4).map((t) => t.title || t.videoId);
    queueText.text = nextItems.length ? `Queue: ${nextItems.join(" • ")}` : "Queue: (end)";
  };

  const play = () => {
    isPlaying = true;
    (playPauseBtn.textBlock as any).text = "⏸";
    post("playVideo");
  };

  const pause = () => {
    isPlaying = false;
    (playPauseBtn.textBlock as any).text = "▶";
    post("pauseVideo");
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const seekTo = (seconds: number) => {
    const target = Math.max(0, Math.min(seconds, duration || seconds));
    currentTime = target;
    updateProgressUI();
    post("seekTo", [target, true]);
  };

  const setVolume = (value: number) => {
    volume = Math.max(0, Math.min(100, value));
    volumeSlider.value = volume;
    post("setVolume", [Math.round(volume)]);
  };

  playPauseBtn.onPointerUpObservable.add(() => {
    togglePlay();
    controller.onAction?.("toggle", { isPlaying });
  });

  prevBtn.onPointerUpObservable.add(() => {
    controller.onAction?.("prev");
  });

  nextBtn.onPointerUpObservable.add(() => {
    controller.onAction?.("next");
  });

  openBtn.onPointerUpObservable.add(() => {
    if (typeof window !== "undefined") {
      window.open(`https://www.youtube.com/watch?v=${data.videoId}`, "_blank");
    }
  });

  closeBtn.onPointerUpObservable.add(() => {
    onClose();
  });

  volumeSlider.onValueChangedObservable.add((value) => {
    if (Math.abs(value - volume) < 0.5) return;
    setVolume(value);
    controller.onAction?.("volume", { volume });
  });

  progressSlider.onPointerDownObservable.add(() => {
    isSeeking = true;
  });

  progressSlider.onPointerUpObservable.add(() => {
    isSeeking = false;
    seekTo(progressSlider.value);
    controller.onAction?.("seek", { time: progressSlider.value });
  });

  if (typeof document !== "undefined") {
    const existing = document.getElementById(id + "_music_iframe");
    if (existing) existing.remove();

    const iframe = document.createElement("iframe");
    iframeEl = iframe;
    iframe.id = id + "_music_iframe";
    iframe.src = `https://www.youtube.com/embed/${data.videoId}?autoplay=1&controls=0&playsinline=1&enablejsapi=1`;
    iframe.allow = "autoplay; encrypted-media";
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.zIndex = "1";

    document.body.appendChild(iframe);

    onMessage = (event: MessageEvent) => {
      if (!event || typeof event.data !== "string") return;
      let payload: any = null;
      try {
        payload = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (payload?.event === "infoDelivery" && payload.info) {
        if (Number.isFinite(payload.info.currentTime)) {
          currentTime = payload.info.currentTime;
        }
        if (Number.isFinite(payload.info.duration)) {
          duration = payload.info.duration;
        }
        updateProgressUI();
      }
    };

    window.addEventListener("message", onMessage);

    pollTimer = window.setInterval(() => {
      post("getCurrentTime");
      post("getDuration");
    }, 1000);

    plane.onDisposeObservable.add(() => {
      if (pollTimer) window.clearInterval(pollTimer);
      if (onMessage) window.removeEventListener("message", onMessage);
      const el = document.getElementById(id + "_music_iframe");
      if (el) el.remove();
    });
  }

  const controller: MusicController = {
    setTrack,
    setQueue,
    play,
    pause,
    togglePlay,
    seekTo,
    setVolume,
    getState: () => ({
      track: currentTrack,
      isPlaying,
      volume,
      currentTime,
      duration
    }),
    dispose: () => {
      if (pollTimer) window.clearInterval(pollTimer);
      if (onMessage) window.removeEventListener("message", onMessage);
    }
  };

  (plane as any).metadata = { ...(plane as any).metadata, musicController: controller };

  return plane;
};

// --- VIDEO WINDOW (Standard MP4) ---
export const createVideoWindow = (
  name: string,
  scene: Scene,
  position: Vector3,
  videoUrl: string,
  onClose: () => void
): Mesh => {
  const width = 8;
  const height = 4.5;

  const videoPlane = MeshBuilder.CreatePlane(name, { width, height }, scene);
  videoPlane.position = position;

  const vidMat = new StandardMaterial(name + "_mat", scene);
  const vidTex = new VideoTexture("vidtex", videoUrl, scene, true, false);

  vidMat.diffuseTexture = vidTex;
  vidMat.emissiveColor = new Color3(0, 0, 0); // Fix white bloom
  vidMat.emissiveTexture = vidTex;
  vidMat.disableLighting = true;
  videoPlane.material = vidMat;

  const uiPlane = MeshBuilder.CreatePlane(name + "_ui", { width, height }, scene);
  uiPlane.isPickable = true;
  uiPlane.parent = videoPlane;
  uiPlane.position.z = -0.05;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(uiPlane, 1024, 576, false);

  const header = new StackPanel();
  header.height = "60px";
  header.width = "100%";
  header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  header.isVertical = false;
  header.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  advancedTexture.addControl(header);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "60px";
  closeBtn.height = "60px";
  closeBtn.color = "white";
  closeBtn.background = "red";
  closeBtn.cornerRadius = 30;
  closeBtn.onPointerUpObservable.add(() => {
    if (vidTex.video) vidTex.video.pause();
    onClose();
  });
  header.addControl(closeBtn);

  const container = new Rectangle();
  container.width = "60%";
  container.height = "80px";
  container.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  container.paddingBottom = "20px";
  container.background = "rgba(0, 0, 0, 0.5)";
  container.cornerRadius = 20;
  container.thickness = 0;
  advancedTexture.addControl(container);

  const controlsPanel = new StackPanel();
  controlsPanel.isVertical = false;
  controlsPanel.width = "100%";
  controlsPanel.height = "100%";
  container.addControl(controlsPanel);

  const createCtrlBtn = (text: string, onClick: () => void) => {
    const btn = Button.CreateSimpleButton("btn_" + text, text);
    btn.width = "120px";
    btn.height = "60px";
    btn.color = "white";
    btn.background = "#2b5797";
    btn.cornerRadius = 10;
    btn.paddingLeft = "10px";
    btn.paddingRight = "10px";
    btn.onPointerUpObservable.add(onClick);
    return btn;
  };

  controlsPanel.addControl(createCtrlBtn("⏪ -10s", () => {
    if (vidTex.video) vidTex.video.currentTime -= 10;
  }));

  controlsPanel.addControl(createCtrlBtn("▶ PLAY", () => {
    if (vidTex.video) vidTex.video.play();
  }));

  controlsPanel.addControl(createCtrlBtn("⏸ PAUSE", () => {
    if (vidTex.video) vidTex.video.pause();
  }));

  controlsPanel.addControl(createCtrlBtn("⏩ +10s", () => {
    if (vidTex.video) vidTex.video.currentTime += 10;
  }));

  return videoPlane;
};

export const createBrowserWindow = (
  id: string,
  scene: Scene,
  position: Vector3,
  url: string,
  onClose: () => void
): Mesh => {
  const width = 8;
  const height = 4.5;
  const fallbackIframeWidth = 900;
  const fallbackIframeHeight = 520;

  const plane = MeshBuilder.CreatePlane(id, { width, height }, scene);
  plane.position = position;

  const mat = new StandardMaterial(id + "_mat", scene);
  mat.alpha = 0;
  plane.material = mat;

  const uiPlane = MeshBuilder.CreatePlane(id + "_ui", { width, height }, scene);
  uiPlane.isPickable = true;
  uiPlane.parent = plane;
  uiPlane.position.z = -0.1;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(uiPlane, 1024, 576, false);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "80px";
  closeBtn.height = "80px";
  closeBtn.color = "white";
  closeBtn.background = "red";
  closeBtn.cornerRadius = 40;
  closeBtn.fontSize = 40;
  closeBtn.fontWeight = "bold";
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  closeBtn.top = "20px";
  closeBtn.left = "-20px";
  closeBtn.onPointerUpObservable.add(() => onClose());
  advancedTexture.addControl(closeBtn);

  if (typeof document !== "undefined") {
    const existing = document.getElementById(id + "_browser_iframe");
    if (existing) existing.remove();
    const existingBtn = document.getElementById(id + "_browser_close_btn");
    if (existingBtn) existingBtn.remove();

    const iframe = document.createElement("iframe");
    iframe.id = id + "_browser_iframe";
    iframe.src = url;
    iframe.referrerPolicy = "no-referrer";
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    iframe.style.width = `${fallbackIframeWidth}px`;
    iframe.style.height = `${fallbackIframeHeight}px`;
    iframe.style.zIndex = "100";
    iframe.style.pointerEvents = "auto";
    document.body.appendChild(iframe);

    const closeBtnEl = document.createElement("button");
    closeBtnEl.id = id + "_browser_close_btn";
    closeBtnEl.innerText = "✕";
    closeBtnEl.type = "button";
    closeBtnEl.setAttribute("aria-label", "Close Browser window");
    Object.assign(closeBtnEl.style, {
      position: "fixed",
      width: "44px",
      height: "44px",
      borderRadius: "22px",
      border: "none",
      background: "rgba(255, 0, 0, 0.9)",
      color: "white",
      fontSize: "22px",
      fontWeight: "700",
      cursor: "pointer",
      zIndex: "200",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      display: "block",
      pointerEvents: "auto"
    } as Partial<CSSStyleDeclaration>);
    closeBtnEl.onclick = () => onClose();
    document.body.appendChild(closeBtnEl);

    const engine = scene.getEngine();
    const renderObserver = scene.onBeforeRenderObservable.add(() => {
      if (!scene.activeCamera) return;
      const viewport = scene.activeCamera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight()
      );

      const world = plane.getWorldMatrix();
      const halfW = width / 2;
      const halfH = height / 2;
      const corners = [
        new Vector3(-halfW, halfH, 0),
        new Vector3(halfW, halfH, 0),
        new Vector3(halfW, -halfH, 0),
        new Vector3(-halfW, -halfH, 0)
      ].map(v => Vector3.Project(v, world, scene.getTransformMatrix(), viewport));

      const center = Vector3.Project(Vector3.Zero(), world, scene.getTransformMatrix(), viewport);

      const xs = corners.map(c => c.x);
      const ys = corners.map(c => c.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const cssW = Math.max(1, maxX - minX);
      const cssH = Math.max(1, maxY - minY);

      iframe.style.left = `${minX}px`;
      iframe.style.top = `${minY}px`;
      iframe.style.width = `${cssW}px`;
      iframe.style.height = `${cssH}px`;

      closeBtnEl.style.left = `${maxX - 44 - 8}px`;
      closeBtnEl.style.top = `${minY + 8}px`;

      if (center.z > 1 || center.z < 0) {
        iframe.style.display = "none";
        closeBtnEl.style.display = "none";
      } else {
        iframe.style.display = "block";
        closeBtnEl.style.display = "block";
      }
    });

    plane.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      const el = document.getElementById(id + "_browser_iframe");
      if (el) el.remove();
      const btn = document.getElementById(id + "_browser_close_btn");
      if (btn) btn.remove();
    });
  }

  return plane;
};

// --- WIDGET WINDOW FACTORY ---
export const createWidgetWindow = (
  id: string,
  scene: Scene,
  position: any,
  type: string,
  data: any,
  onClose: () => void
) => {
  const isWallet = type === "WALLET" || type === "WIDGET_WALLET";

  const normalizedType = typeof type === "string" && type.startsWith("WIDGET_")
    ? type.replace("WIDGET_", "")
    : type;

  const width = isWallet ? 4 : 3;
  const height = isWallet ? 2.5 : 1.5;

  const mesh = MeshBuilder.CreatePlane(id, { width, height }, scene);
  mesh.position.set(position.x, position.y, position.z);

  const texture = new DynamicTexture(id + "_tex", { width: 512, height: 320 }, scene);
  const mat = new StandardMaterial(id + "_mat", scene);
  mat.diffuseTexture = texture;
  mat.backFaceCulling = false;
  mat.emissiveColor = new Color3(1, 1, 1);
  mat.emissiveTexture = texture;
  mat.disableLighting = true;
  mesh.material = mat;

  const ctx = texture.getContext() as CanvasRenderingContext2D;
  const redraw = (nextData: any) => {
    // Clear
    ctx.clearRect(0, 0, 512, 320);

    if (isWallet) {
      const grad = ctx.createLinearGradient(0, 0, 512, 320);
      grad.addColorStop(0, "#8E2DE2");
      grad.addColorStop(1, "#4A00E0");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 320);

      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(512, 0);
      ctx.lineTo(0, 320);
      ctx.fill();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 492, 300);

      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.font = "bold 40px monospace";
      ctx.fillText("💎 ETHEREUM", 40, 60);

      ctx.textAlign = "center";
      ctx.font = "bold 80px monospace";
      const ethVal = nextData?.balance || "0.00";
      ctx.fillText(`${ethVal} ETH`, 256, 180);

      ctx.font = "30px monospace";
      const addr = nextData?.address || "0x000...0000";
      const shortAddr = addr.length > 10 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
      ctx.fillText(shortAddr, 256, 260);
      texture.update();
      return;
    }

    const drawTitle = (title: string, bg: string) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 320);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, 502, 310);
      ctx.fillStyle = "white";
      (ctx as any).textAlign = "center";
      ctx.font = "bold 56px monospace";
      ctx.fillText(title, 256, 86);
    };

    if (normalizedType === "TIMER") {
      drawTitle("🕒 TIMER", "#FF4444");
      const totalSeconds = nextData?.duration || 600;
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const timeString = `${mins}:${secs.toString().padStart(2, "0")}`;
      ctx.font = "bold 100px monospace";
      ctx.fillText(timeString, 256, 206);
      if (nextData?.running) {
        ctx.font = "bold 28px monospace";
        ctx.fillText("RUNNING", 256, 290);
      }
      texture.update();
      return;
    }

    if (normalizedType === "STOCK") {
      drawTitle(`📈 ${nextData?.symbol || "STK"}`, "#44FF44");
      ctx.font = "bold 100px monospace";
      ctx.fillText(`$${nextData?.price || "---"}`, 256, 206);
      texture.update();
      return;
    }

    if (normalizedType === "CLOCK") {
      drawTitle("🕒 CLOCK", "#3B82F6");
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const ss = now.getSeconds().toString().padStart(2, "0");
      ctx.font = "bold 96px monospace";
      ctx.fillText(`${hh}:${mm}:${ss}`, 256, 206);
      texture.update();
      return;
    }

    if (normalizedType === "CALCULATOR") {
      drawTitle("🧮 CALC", "#111827");
      const expr = typeof nextData?.expr === "string" ? nextData.expr : "";
      const result = typeof nextData?.result === "string" ? nextData.result : "";
      ctx.textAlign = "left";
      ctx.font = "bold 44px monospace";
      ctx.fillText(expr || "0", 30, 170);
      ctx.font = "bold 64px monospace";
      ctx.fillText(result || "", 30, 250);
      texture.update();
      return;
    }

    if (normalizedType === "NOTES") {
      drawTitle("📝 NOTES", "#F59E0B");
      const text = typeof nextData?.text === "string" ? nextData.text : "";
      ctx.textAlign = "left";
      ctx.font = "28px monospace";
      const lines = text.split("\n").slice(0, 6);
      lines.forEach((line: string, idx: number) => {
        ctx.fillText(line.slice(0, 28), 20, 150 + idx * 32);
      });
      texture.update();
      return;
    }

    if (normalizedType === "REMINDERS") {
      drawTitle("⏰ REMIND", "#8B5CF6");
      const items: any[] = Array.isArray(nextData?.items) ? nextData.items : [];
      ctx.textAlign = "left";
      ctx.font = "28px monospace";
      items.slice(0, 6).forEach((it: any, idx: number) => {
        const label = typeof it?.text === "string" ? it.text : String(it ?? "");
        ctx.fillText(`- ${label}`.slice(0, 30), 20, 150 + idx * 32);
      });
      texture.update();
      return;
    }

    if (normalizedType === "WEATHER") {
      drawTitle("☁ WEATHER", "#06B6D4");
      const w = (nextData || {}) as WeatherData;
      const place = `${w.city || ""}${w.country ? ", " + w.country : ""}`.trim() || "-";
      const temp = Number.isFinite(w.tempC) ? `${Math.round(w.tempC as number)}°C` : "-";
      const desc = typeof w.description === "string" ? w.description : "-";
      ctx.textAlign = "left";
      ctx.font = "bold 44px monospace";
      ctx.fillText(place.slice(0, 20), 20, 160);
      ctx.font = "bold 84px monospace";
      ctx.fillText(temp, 20, 248);
      ctx.font = "28px monospace";
      ctx.fillText(desc.slice(0, 28), 20, 290);
      texture.update();
      return;
    }

    drawTitle("WIDGET", "#374151");
    texture.update();
  };

  redraw(data || {});

  (mesh as any).metadata = { ...(mesh as any).metadata, widgetType: normalizedType, widgetData: data || {}, widgetRedraw: redraw };

  if (!mesh.actionManager) mesh.actionManager = new ActionManager(scene);
  mesh.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
      if (typeof window === "undefined") return;
      if (normalizedType === "NOTES") {
        const nextText = window.prompt("Notes", typeof (mesh as any).metadata?.widgetData?.text === "string" ? (mesh as any).metadata.widgetData.text : "") ?? null;
        if (nextText === null) return;
        const nextData = { ...(mesh as any).metadata.widgetData, text: nextText };
        (mesh as any).metadata.widgetData = nextData;
        redraw(nextData);
        (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, normalizedType);
        return;
      }

      if (normalizedType === "REMINDERS") {
        const nextItem = window.prompt("Add reminder", "") ?? null;
        if (nextItem === null || !nextItem.trim()) return;
        const current = (mesh as any).metadata.widgetData;
        const items = Array.isArray(current?.items) ? [...current.items] : [];
        items.push({ text: nextItem.trim() });
        const nextData = { ...current, items };
        (mesh as any).metadata.widgetData = nextData;
        redraw(nextData);
        (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, normalizedType);
        return;
      }

      if (normalizedType === "CALCULATOR") {
        const expr = window.prompt("Calculator expression", typeof (mesh as any).metadata?.widgetData?.expr === "string" ? (mesh as any).metadata.widgetData.expr : "2+2") ?? null;
        if (expr === null) return;
        let result = "";
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function(`return (${expr})`);
          const v = fn();
          result = String(v);
        } catch (e) {
          result = "Error";
        }
        const nextData = { ...(mesh as any).metadata.widgetData, expr, result };
        (mesh as any).metadata.widgetData = nextData;
        redraw(nextData);
        (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, normalizedType);
        return;
      }

      if (normalizedType === "WEATHER") {
        (window as any).__NEURO_WIDGET_ONREFRESH__?.(id, (mesh as any).metadata.widgetData, normalizedType);
      }
    })
  );

  if (normalizedType === "CLOCK") {
    const timer = window.setInterval(() => {
      if (mesh.isDisposed()) return;
      redraw((mesh as any).metadata?.widgetData || {});
    }, 1000);
    mesh.onDisposeObservable.add(() => {
      window.clearInterval(timer);
    });
  }

  if (normalizedType === "TIMER") {
    const timer = window.setInterval(() => {
      if (mesh.isDisposed()) return;
      const current = (mesh as any).metadata?.widgetData || {};
      if (!current?.running) return;
      const dur = Number.isFinite(current?.duration) ? Number(current.duration) : 0;
      const nextDur = Math.max(0, Math.floor(dur - 1));
      const nextRunning = nextDur > 0;
      const nextData = { ...current, duration: nextDur, running: nextRunning };
      (mesh as any).metadata.widgetData = nextData;
      redraw(nextData);
      (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, normalizedType);
    }, 1000);
    mesh.onDisposeObservable.add(() => {
      window.clearInterval(timer);
    });
  }

  // Small UI plane only for the close button (so the main widget mesh remains clickable for edit)
  const uiPlane = MeshBuilder.CreatePlane(id + "_ui", { width: 0.45, height: 0.45 }, scene);
  uiPlane.isPickable = true;
  uiPlane.parent = mesh;
  uiPlane.position.x = width / 2 - 0.225;
  uiPlane.position.y = height / 2 - 0.225;
  uiPlane.position.z = -0.02;

  const adt = AdvancedDynamicTexture.CreateForMesh(uiPlane, 256, 256, false);
  const closeBtn = Button.CreateSimpleButton(id + "_close", "X");
  closeBtn.width = "1";
  closeBtn.height = "1";
  closeBtn.color = "white";
  closeBtn.background = "rgba(255,0,0,0.95)";
  closeBtn.cornerRadius = 60;
  closeBtn.fontSize = 64;
  closeBtn.fontWeight = "bold";
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  closeBtn.onPointerUpObservable.add(() => onClose());
  adt.addControl(closeBtn);

  return mesh;
};

// --- TERMINAL WINDOW FACTORY ---
export const createTerminalWindow = (
  name: string,
  scene: Scene,
  position: Vector3,
  onClose: () => void,
  onSend: (text: string) => void
): { mesh: Mesh, addMessage: (text: string, isUser: boolean) => void } => {

  const width = 6;
  const height = 4;
  const plane = MeshBuilder.CreatePlane(name, { width, height }, scene);
  plane.position = position;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(plane, 1024, 768, false);

  const background = new Rectangle();
  background.width = 1;
  background.height = 1;
  background.cornerRadius = 20;
  background.color = "#00f0ff";
  background.thickness = 4;
  background.background = "rgba(0, 0, 0, 0.9)";
  advancedTexture.addControl(background);

  const titleBar = new Rectangle();
  titleBar.width = 1;
  titleBar.height = "60px";
  titleBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  titleBar.background = "#00f0ff";
  background.addControl(titleBar);

  const titleText = new TextBlock();
  titleText.text = `>_ ${name.toUpperCase()} [AI_LINK: OFFLINE]`;
  titleText.color = "black";
  titleText.fontSize = 30;
  titleText.fontFamily = "monospace";
  titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  titleText.paddingLeft = "20px";
  titleBar.addControl(titleText);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "60px";
  closeBtn.height = "60px";
  closeBtn.color = "white";
  closeBtn.background = "#ff0055";
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.cornerRadius = 10;
  closeBtn.onPointerUpObservable.add(() => onClose());
  titleBar.addControl(closeBtn);

  const chatScroll = new ScrollViewer();
  chatScroll.width = 1;
  chatScroll.height = "600px";
  chatScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  chatScroll.top = "60px";
  chatScroll.thickness = 0;
  chatScroll.barColor = "#00f0ff";
  background.addControl(chatScroll);

  const messageStack = new StackPanel();
  messageStack.width = "100%";
  messageStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  chatScroll.addControl(messageStack);

  const addMessage = (text: string, isUser: boolean) => {
    const msgBlock = new TextBlock();
    msgBlock.text = (isUser ? "> YOU: " : "> SYSTEM: ") + text;
    msgBlock.color = isUser ? "#00f0ff" : "#00ff00";
    msgBlock.fontSize = 24;
    msgBlock.fontFamily = "Consolas, monospace";
    msgBlock.textWrapping = true;
    msgBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    msgBlock.height = "60px";
    msgBlock.paddingLeft = "20px";

    if (text.length > 50) msgBlock.height = "120px";
    messageStack.addControl(msgBlock);
  };

  addMessage("Neural Interface initialized.", false);

  const inputBar = new InputText();
  inputBar.width = "90%";
  inputBar.height = "60px";
  inputBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  inputBar.top = "-20px";
  inputBar.color = "white";
  inputBar.background = "rgba(255, 255, 255, 0.1)";
  inputBar.focusedBackground = "rgba(255, 255, 255, 0.2)";
  inputBar.placeholderText = "Type command...";
  inputBar.placeholderColor = "gray";
  inputBar.onKeyboardEventProcessedObservable.add((eventData) => {
    if (eventData.key === "Enter") {
      const text = inputBar.text;
      if (text.length > 0) {
        addMessage(text, true);
        onSend(text);
        inputBar.text = "";
      }
    }
  });
  background.addControl(inputBar);

  return { mesh: plane, addMessage };
};

// --- IMAGE WINDOW FACTORY ---
export const createImageWindow = (
  name: string,
  scene: Scene,
  position: Vector3,
  imageUrl: string,
  onClose: () => void
): Mesh => {
  const width = 4;
  const height = 4;
  const faceUV = new Vector4(0, 1, 1, 0);

  const imagePlane = MeshBuilder.CreatePlane(name, {
    width,
    height,
    frontUVs: faceUV
  }, scene);

  imagePlane.position = position;

  const imageMat = new StandardMaterial(name + "_img_mat", scene);
  imageMat.backFaceCulling = false;
  imageMat.disableLighting = true;
  imageMat.emissiveColor = new Color3(0, 0, 0); // Fix white bloom
  imageMat.emissiveTexture = new Texture(imageUrl, scene);

  const texture = new Texture(imageUrl, scene);
  imageMat.diffuseTexture = texture;
  imagePlane.material = imageMat;

  const uiPlane = MeshBuilder.CreatePlane(name + "_ui", { width, height }, scene);
  uiPlane.isPickable = true;
  uiPlane.parent = imagePlane;
  uiPlane.position.z = -0.05;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(uiPlane, 512, 512, false);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "50px";
  closeBtn.height = "50px";
  closeBtn.color = "white";
  closeBtn.background = "red";
  closeBtn.cornerRadius = 25;
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  closeBtn.top = "10px";
  closeBtn.left = "-10px";
  closeBtn.onPointerUpObservable.add(() => onClose());

  advancedTexture.addControl(closeBtn);

  return imagePlane;
};

// --- DOCUMENT WINDOW FACTORY ---
export const createDocumentWindow = (
  name: string,
  scene: Scene,
  position: Vector3,
  initialContent: string,
  onClose: () => void,
  onSave: (newContent: string) => void
): Mesh => {
  const width = 5;
  const height = 6;

  const plane = MeshBuilder.CreatePlane(name, { width, height }, scene);
  plane.position = position;

  const paperMat = new StandardMaterial(name + "_paper_mat", scene);
  paperMat.diffuseColor = new Color3(1, 1, 1);
  paperMat.emissiveColor = new Color3(0.8, 0.8, 0.8);
  paperMat.backFaceCulling = false;
  plane.material = paperMat;

  const advancedTexture = AdvancedDynamicTexture.CreateForMesh(plane, 1024, 1280, false);

  const header = new Rectangle();
  header.width = 1;
  header.height = "80px";
  header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  header.background = "#2b5797";
  header.thickness = 0;
  advancedTexture.addControl(header);

  const titleText = new TextBlock();
  titleText.text = name;
  titleText.color = "white";
  titleText.fontSize = 36;
  titleText.fontFamily = "Arial, sans-serif";
  header.addControl(titleText);

  const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
  closeBtn.width = "80px";
  closeBtn.height = "80px";
  closeBtn.color = "white";
  closeBtn.background = "#ff0000";
  closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  closeBtn.onPointerUpObservable.add(() => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    const existingEditor = document.getElementById("neuro-doc-editor");
    if (existingEditor) existingEditor.remove();
    onClose();
  });
  header.addControl(closeBtn);

  const editBtn = Button.CreateSimpleButton("editBtn", "EDIT");
  editBtn.width = "100px";
  editBtn.height = "60px";
  editBtn.color = "white";
  editBtn.background = "#eba834";
  editBtn.cornerRadius = 10;
  editBtn.left = "20px";
  editBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  header.addControl(editBtn);

  const scrollView = new ScrollViewer();
  scrollView.width = 0.9;
  scrollView.height = 0.85;
  scrollView.top = "50px";
  scrollView.thickness = 0;
  scrollView.barColor = "#2b5797";
  advancedTexture.addControl(scrollView);

  const textBlock = new TextBlock();
  textBlock.text = initialContent;
  textBlock.color = "black";
  textBlock.fontSize = 24;
  textBlock.fontFamily = "Times New Roman";
  textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  textBlock.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  textBlock.textWrapping = true;
  textBlock.resizeToFit = true;
  textBlock.paddingTop = "20px";
  textBlock.paddingLeft = "20px";
  textBlock.paddingRight = "20px";
  scrollView.addControl(textBlock);

  const speakBtn = Button.CreateSimpleButton("speakBtn", "🔊 READ");
  speakBtn.width = "120px";
  speakBtn.height = "60px";
  speakBtn.color = "white";
  speakBtn.background = "#28a745";
  speakBtn.cornerRadius = 10;
  speakBtn.left = "140px";
  speakBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

  speakBtn.onPointerUpObservable.add(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textBlock.text);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.name.includes("Google US English") ||
      v.name.includes("Microsoft David")
    );
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  });
  header.addControl(speakBtn);

  editBtn.onPointerUpObservable.add(() => {
    if (document.getElementById("neuro-doc-editor")) return;

    const textArea = document.createElement("textarea");
    textArea.id = "neuro-doc-editor";
    textArea.value = textBlock.text;
    Object.assign(textArea.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "600px",
      height: "70vh",
      zIndex: "1000",
      backgroundColor: "white",
      color: "black",
      fontSize: "18px",
      fontFamily: "Times New Roman",
      padding: "20px",
      border: "4px solid #2b5797",
      borderRadius: "8px",
      outline: "none",
      boxShadow: "0 0 50px rgba(0,0,0,0.8)"
    });

    const saveBtn = document.createElement("button");
    saveBtn.innerText = "SAVE & CLOSE";
    Object.assign(saveBtn.style, {
      position: "fixed",
      top: "calc(50% - 35vh - 50px)",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "1001",
      padding: "10px 20px",
      backgroundColor: "#2b5797",
      color: "white",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      fontWeight: "bold"
    });

    const closeEditor = () => {
      const newText = textArea.value;
      textBlock.text = newText;
      onSave(newText);
      document.body.removeChild(textArea);
      document.body.removeChild(saveBtn);
    };

    saveBtn.onclick = closeEditor;
    document.body.appendChild(textArea);
    document.body.appendChild(saveBtn);
    textArea.focus();
  });

  return plane;
};