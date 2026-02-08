// components/Scene3D.tsx
"use client";

import {
    createTerminalWindow,
    createImageWindow,
    createDocumentWindow,
    createWidgetWindow,
    createVideoWindow,
    createBrowserWindow,
    createYoutubeWindow,
    createMusicWindow,
    MusicController,
    MusicTrack
} from "../utils/WindowFactory";

import { useSocket } from "../hooks/useSocket";
import { ethers } from "ethers";
import "@babylonjs/loaders";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import * as mammoth from "mammoth";
// 1. IMPORT EVERYTHING AS BABYLON TO FIX GLOBAL ERRORS
import * as BABYLON from "@babylonjs/core";
import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight,
    MeshBuilder,
    Color4,
    Mesh,
    StandardMaterial,
    Color3,
    WebXRFeatureName
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import HandController from "./HandController";

// --- GLOBAL VARIABLE PATCH ---
if (typeof window !== "undefined") {
    (window as any).BABYLON = BABYLON;
}

// --- AVATAR FACTORY ---
const createAvatar = (name: string, color: any, scene: Scene) => {
    const sphere = MeshBuilder.CreateSphere("avatar_" + name, { diameter: 0.4 }, scene);
    const mat = new StandardMaterial("avatar_mat_" + name, scene);
    mat.emissiveColor = new Color3(color.r, color.g, color.b);
    sphere.material = mat;

    const plane = MeshBuilder.CreatePlane("nameTag_" + name, { width: 2, height: 1 }, scene);
    plane.parent = sphere;
    plane.position.y = 0.6;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    const advancedTexture = AdvancedDynamicTexture.CreateForMesh(plane, 512, 256, false);

    const label = new TextBlock();
    label.text = name;
    label.color = "white";
    label.fontSize = 60;
    label.fontWeight = "bold";
    label.outlineColor = "black";
    label.outlineWidth = 4;
    advancedTexture.addControl(label);

    return sphere;
};

const setupEnvironment = (scene: Scene) => {
    const ground = MeshBuilder.CreateGround("ground", { width: 100, height: 100, subdivisions: 50 }, scene);
    ground.position.y = -3;
    const gridMat = new StandardMaterial("gridMat", scene);
    gridMat.wireframe = true;
    gridMat.emissiveColor = new Color3(0, 1, 1);
    gridMat.disableLighting = true;
    gridMat.alpha = 0.1;
    ground.material = gridMat;

    const particleSystem = new BABYLON.ParticleSystem("particles", 2000, scene);
    particleSystem.particleTexture = new BABYLON.Texture("", scene);
    particleSystem.emitter = new Vector3(0, 0, 0);
    particleSystem.minEmitBox = new Vector3(-20, -10, -20);
    particleSystem.maxEmitBox = new Vector3(20, 10, 20);
    particleSystem.color1 = new Color4(0, 1, 1, 1.0);
    particleSystem.color2 = new Color4(1, 0, 1, 1.0);
    particleSystem.colorDead = new Color4(0, 0, 0, 0.0);
    particleSystem.minSize = 0.05;
    particleSystem.maxSize = 0.15;
    particleSystem.minLifeTime = 2.0;
    particleSystem.maxLifeTime = 8.0;
    particleSystem.emitRate = 100;
    particleSystem.gravity = new Vector3(0, 0.05, 0);
    particleSystem.start();
    scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
};

const Scene3D = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<Scene | null>(null);
    const fingerSpheresRef = useRef<Mesh[]>([]);
    const fingerMatRef = useRef<StandardMaterial | null>(null);
    const handOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const lastHandOverlayDrawRef = useRef<number>(0);
    const lastSpeechKickAtRef = useRef<number>(0);
    const [mounted, setMounted] = useState(false);

    const [callAssistantActive, setCallAssistantActive] = useState(false);
    const callAssistantActiveRef = useRef(false);
    const callAssistantLastRequestAtRef = useRef<number>(0);
    const callAssistantCooldownUntilRef = useRef<number>(0);
    const callAssistantDisabledUntilRef = useRef<number>(0);
    const callAssistantTranscriptHandledRef = useRef<string>("");
    const callAssistantWindowIdRef = useRef<string | null>(null);
    const suppressCallAssistantWindowExitRef = useRef<boolean>(false);
    const hardExitCallAssistantRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => { });
    const callSessionRef = useRef<{
        call_id: string;
        startedAt: number;
        language: "unknown" | "Hindi" | "English";
        intent: string;
        emotion: string;
        history: Array<{ role: "caller" | "assistant"; text: string }>;
        details: string[];
        actions: string[];
        action_required: "Yes" | "No";
        caller_name: string;
        caller_number: string;
    } | null>(null);
    const callLogsRef = useRef<any[]>([]);
    const callUtteranceTimeoutRef = useRef<number | null>(null);
    const callSpeakingRef = useRef(false);

    useEffect(() => {
        callAssistantActiveRef.current = callAssistantActive;
        if (!callAssistantActive) {
            callAssistantTranscriptHandledRef.current = "";
        }
    }, [callAssistantActive]);

    // --- LOGIN STATE ---
    const [username, setUsername] = useState("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // --- MULTIPLAYER AVATARS ---
    const otherUsersRef = useRef<Map<string, Mesh>>(new Map());

    // --- WINDOWS STATE ---
    const windowsMapRef = useRef<Map<string, Mesh>>(new Map());
    const windowFunctionsRef = useRef<Map<string, (text: string, isUser: boolean) => void>>(new Map());
    const windowTypesRef = useRef<Map<string, string>>(new Map());
    const windowContentsRef = useRef<Map<string, string>>(new Map());
    const windowDataRef = useRef<Map<string, any>>(new Map());

    const musicControllersRef = useRef<Map<string, MusicController>>(new Map());
    const musicQueuesRef = useRef<Map<string, { queue: MusicTrack[]; index: number }>>(new Map());
    const activeMusicIdRef = useRef<string | null>(null);
    const lastYoutubeIdRef = useRef<string | null>(null);
    const lastTimerIdRef = useRef<string | null>(null);

    const mapsWindowIdRef = useRef<string | null>(null);
    const linkedInWindowIdRef = useRef<string | null>(null);

    const relaxThemePendingRef = useRef<boolean>(false);
    const relaxThemeActiveRef = useRef<boolean>(false);
    const relaxThemeWindowIdRef = useRef<string | null>(null);
    const relaxThemeSnapshotRef = useRef<{
        clearColor: Color4;
        gridEmissiveColor: Color3;
        gridAlpha: number;
        particleColor1: Color4;
        particleColor2: Color4;
        lightIntensity: number;
        lightDiffuseColor: Color3;
    } | null>(null);

    const activeWindowIdRef = useRef<string | null>(null);
    const isGrabbingRef = useRef<boolean>(false);
    const grabOffsetRef = useRef<Vector3>(Vector3.Zero());

    const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
    const stashedWindowsRef = useRef<Array<{ id: string; type: string; content?: string; data?: any; position?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number } }>>([]);
    const [stashedWindowsVersion, setStashedWindowsVersion] = useState(0);

    // --- NETWORK THROTTLING ---
    const lastSocketUpdateRef = useRef<number>(0);
    const lastHandUpdateRef = useRef<number>(0);
    const socketRef = useRef<any>(null);
    const socket = useSocket();

    // --- SMART ENDPOINT SWITCHER ---
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    const AI_ENDPOINT = isLocal
        ? "http://localhost:3001"
        : "https://refractorily-unrevived-lucio.ngrok-free.dev";

    const speak = useCallback((text: string) => {
        try {
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        } catch (e) {
        }
    }, []);

    const loadStashedWindows = useCallback(() => {
        try {
            const raw = typeof window !== "undefined" ? window.localStorage.getItem("neuro_stashed_windows") : null;
            const parsed = raw ? JSON.parse(raw) : [];
            stashedWindowsRef.current = Array.isArray(parsed) ? parsed : [];
            setStashedWindowsVersion((v) => v + 1);
        } catch (e) {
            stashedWindowsRef.current = [];
            setStashedWindowsVersion((v) => v + 1);
        }
    }, []);

    const saveStashedWindows = useCallback(() => {
        try {
            if (typeof window === "undefined") return;
            window.localStorage.setItem("neuro_stashed_windows", JSON.stringify(stashedWindowsRef.current || []));
        } catch (e) {
        }
    }, []);

    useEffect(() => {
        loadStashedWindows();
    }, [loadStashedWindows]);

    // --- 1. LOGIN HANDLER ---
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim() && socket) {
            socket.emit("join_user", username);
            setIsLoggedIn(true);
            speak(`Welcome back, ${username}. System online.`);
        }
    };

    const applyRelaxTheme = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (!relaxThemeSnapshotRef.current) {
            const clear = scene.clearColor || new Color4(0, 0, 0, 1);
            const gridMat = scene.getMaterialByName("gridMat") as StandardMaterial | null;
            const particles = scene.particleSystems?.find((p: any) => p && p.name === "particles") as any;
            const light = scene.getLightByName("light1") as any;

            relaxThemeSnapshotRef.current = {
                clearColor: new Color4(clear.r, clear.g, clear.b, clear.a),
                gridEmissiveColor: new Color3(
                    gridMat?.emissiveColor?.r ?? 0,
                    gridMat?.emissiveColor?.g ?? 0,
                    gridMat?.emissiveColor?.b ?? 0
                ),
                gridAlpha: typeof gridMat?.alpha === "number" ? gridMat.alpha : 1,
                particleColor1: new Color4(
                    particles?.color1?.r ?? 0,
                    particles?.color1?.g ?? 0,
                    particles?.color1?.b ?? 0,
                    particles?.color1?.a ?? 1
                ),
                particleColor2: new Color4(
                    particles?.color2?.r ?? 0,
                    particles?.color2?.g ?? 0,
                    particles?.color2?.b ?? 0,
                    particles?.color2?.a ?? 1
                ),
                lightIntensity: typeof light?.intensity === "number" ? light.intensity : 1,
                lightDiffuseColor: new Color3(
                    light?.diffuse?.r ?? 1,
                    light?.diffuse?.g ?? 1,
                    light?.diffuse?.b ?? 1
                )
            };
        }

        const gridMat = scene.getMaterialByName("gridMat") as StandardMaterial | null;
        const particles = scene.particleSystems?.find((p: any) => p && p.name === "particles") as any;
        const light = scene.getLightByName("light1") as any;

        scene.clearColor = new Color4(0.06, 0.02, 0.12, 1);
        if (gridMat) {
            gridMat.emissiveColor = new Color3(1.0, 0.35, 0.85);
            gridMat.alpha = 0.18;
        }
        if (particles) {
            particles.color1 = new Color4(1.0, 0.55, 0.9, 1.0);
            particles.color2 = new Color4(0.35, 0.85, 1.0, 1.0);
        }
        if (light) {
            light.intensity = 0.65;
            light.diffuse = new Color3(1.0, 0.75, 0.95);
        }
    }, []);

    const restoreRelaxTheme = useCallback(() => {
        const scene = sceneRef.current;
        const snap = relaxThemeSnapshotRef.current;
        if (!scene || !snap) return;

        const gridMat = scene.getMaterialByName("gridMat") as StandardMaterial | null;
        const particles = scene.particleSystems?.find((p: any) => p && p.name === "particles") as any;
        const light = scene.getLightByName("light1") as any;

        scene.clearColor = new Color4(snap.clearColor.r, snap.clearColor.g, snap.clearColor.b, snap.clearColor.a);
        if (gridMat) {
            gridMat.emissiveColor = new Color3(snap.gridEmissiveColor.r, snap.gridEmissiveColor.g, snap.gridEmissiveColor.b);
            gridMat.alpha = snap.gridAlpha;
        }
        if (particles) {
            particles.color1 = new Color4(snap.particleColor1.r, snap.particleColor1.g, snap.particleColor1.b, snap.particleColor1.a);
            particles.color2 = new Color4(snap.particleColor2.r, snap.particleColor2.g, snap.particleColor2.b, snap.particleColor2.a);
        }
        if (light) {
            light.intensity = snap.lightIntensity;
            light.diffuse = new Color3(snap.lightDiffuseColor.r, snap.lightDiffuseColor.g, snap.lightDiffuseColor.b);
        }

        relaxThemeActiveRef.current = false;
        relaxThemeWindowIdRef.current = null;
    }, []);

    // --- 2. SPAWN LOGIC ---
    const spawnWindow = useCallback((id: string, position: Vector3, type: string = "TERMINAL", content?: string, widgetData?: any) => {
        if (!sceneRef.current) return;
        if (windowsMapRef.current.has(id)) return;

        let mesh: Mesh;
        let addMessage: ((text: string, isUser: boolean) => void) | null = null;

        const handleClose = () => {
            if (socketRef.current) socketRef.current.emit("close_window", id);
            mesh.dispose();
            windowsMapRef.current.delete(id);
            windowFunctionsRef.current.delete(id);
            windowTypesRef.current.delete(id);
            windowContentsRef.current.delete(id);
            windowDataRef.current.delete(id);
            musicControllersRef.current.delete(id);
            musicQueuesRef.current.delete(id);
            if (activeMusicIdRef.current === id) activeMusicIdRef.current = null;
            if (lastYoutubeIdRef.current === id) lastYoutubeIdRef.current = null;

            if (mapsWindowIdRef.current === id) mapsWindowIdRef.current = null;
            if (linkedInWindowIdRef.current === id) linkedInWindowIdRef.current = null;

            if (relaxThemeWindowIdRef.current === id) {
                restoreRelaxTheme();
            }

            if (callAssistantWindowIdRef.current === id && !suppressCallAssistantWindowExitRef.current) {
                callAssistantWindowIdRef.current = null;
                hardExitCallAssistantRef.current({ silent: true });
            }
        };

        if (type === "VIDEO" && content) {
            mesh = createVideoWindow(
                id,
                sceneRef.current!,
                position,
                content,
                handleClose
            );
        }
        else if (type === "BROWSER" || type === "WIDGET_BROWSER") {
            const url = (typeof widgetData?.url === "string" && widgetData.url.trim())
                ? widgetData.url.trim()
                : (typeof content === "string" && content.trim())
                    ? content.trim()
                    : "https://www.google.com";
            mesh = createBrowserWindow(id, sceneRef.current, position, url, handleClose);
        }
        else if (
            type === "WIDGET_TIMER" ||
            type === "WIDGET_STOCK" ||
            type === "WIDGET_WALLET" ||
            type === "WALLET" ||
            type === "WIDGET_NOTES" ||
            type === "WIDGET_CALCULATOR" ||
            type === "WIDGET_CLOCK" ||
            type === "WIDGET_WEATHER" ||
            type === "WIDGET_REMINDERS"
        ) {
            mesh = createWidgetWindow(
                id,
                sceneRef.current,
                position,
                type as any,
                widgetData || {},
                handleClose
            );
        }
        else if (type === "IMAGE" && content) {
            mesh = createImageWindow(id, sceneRef.current, position, content, handleClose);
        }
        else if (type === "DOC" && content) {
            mesh = createDocumentWindow(id, sceneRef.current, position, content, handleClose, (newText) => {
                if (socketRef.current) socketRef.current.emit("update_content", { id, content: newText });
            });
        }
        else if (type === "YOUTUBE" && widgetData?.videoId) {
            mesh = createYoutubeWindow(
                id,
                sceneRef.current!,
                position,
                widgetData.videoId,
                handleClose
            );
            lastYoutubeIdRef.current = id;
        }
        else if (type === "MUSIC" && widgetData?.videoId) {
            mesh = createMusicWindow(
                id,
                sceneRef.current!,
                position,
                widgetData,
                handleClose
            );

            const controller = (mesh as any).metadata?.musicController as MusicController | undefined;
            if (controller) {
                musicControllersRef.current.set(id, controller);
                musicQueuesRef.current.set(id, { queue: [widgetData], index: 0 });
                controller.setQueue([widgetData], 0);

            }
        }
        else {
            const terminal = createTerminalWindow(
                id,
                sceneRef.current,
                position,
                handleClose,
                async (text) => {
                    if (!socketRef.current) return;
                    socketRef.current.emit("chat_message", { windowId: id, text, isUser: true });
                }
            );
            mesh = terminal.mesh;
            addMessage = terminal.addMessage;
        }

        // --- UNIVERSAL METADATA REGISTRATION ---
        if (mesh) {
            console.log(`[Spawn] Registered window ${id} (Type: ${type})`, mesh);
            (mesh as any).metadata = {
                ...(mesh as any).metadata,
                windowId: id,
                type: type
            };

            windowsMapRef.current.set(id, mesh);
            if (addMessage) windowFunctionsRef.current.set(id, addMessage);
            windowTypesRef.current.set(id, type);
            windowContentsRef.current.set(id, typeof content === "string" ? content : "");
            windowDataRef.current.set(id, widgetData);
        } else {
            console.error(`[Spawn] Failed to create mesh for ${id} (Type: ${type})`);
        }
    }, [AI_ENDPOINT, restoreRelaxTheme]);

    const spawnWindowRef = useRef(spawnWindow);
    useEffect(() => { spawnWindowRef.current = spawnWindow; }, [spawnWindow]);

    const getMusicController = (id: string | null) => {
        if (!id) return null;
        const controller = musicControllersRef.current.get(id);
        if (controller) return controller;
        const mesh = windowsMapRef.current.get(id);
        return (mesh as any)?.metadata?.musicController as MusicController | undefined || null;
    };

    const updateQueueState = (id: string, queue: MusicTrack[], index: number) => {
        musicQueuesRef.current.set(id, { queue, index });
        const controller = getMusicController(id);
        controller?.setQueue(queue, index);
    };

    const handleMusicAction = (
        id: string,
        action: string,
        payload?: any,
        emit: boolean = false
    ) => {
        const controller = getMusicController(id);
        if (!controller) return;
        const queueState = musicQueuesRef.current.get(id);

        if (action === "prev" && queueState) {
            const nextIndex = Math.max(0, queueState.index - 1);
            queueState.index = nextIndex;
            const track = queueState.queue[nextIndex];
            if (track) {
                controller.setTrack(track);
            }
            controller.setQueue(queueState.queue, queueState.index);
            if (emit && socketRef.current) {
                socketRef.current.emit("music_action", { id, action: "set_track", payload: { track, index: queueState.index, queue: queueState.queue } });
            }
            return;
        }

        if (action === "next" && queueState) {
            const nextIndex = Math.min(queueState.queue.length - 1, queueState.index + 1);
            queueState.index = nextIndex;
            const track = queueState.queue[nextIndex];
            if (track) {
                controller.setTrack(track);
            }
            controller.setQueue(queueState.queue, queueState.index);
            if (emit && socketRef.current) {
                socketRef.current.emit("music_action", { id, action: "set_track", payload: { track, index: queueState.index, queue: queueState.queue } });
            }
            return;
        }

        if (action === "set_track" && payload?.track) {
            const track = payload.track as MusicTrack;
            controller.setTrack(track);
            if (Array.isArray(payload.queue)) {
                updateQueueState(id, payload.queue, Number.isFinite(payload.index) ? payload.index : 0);
            }
        }

        if (action === "set_queue" && Array.isArray(payload?.queue)) {
            updateQueueState(id, payload.queue, Number.isFinite(payload.index) ? payload.index : 0);
        }

        if (action === "play") controller.play();
        if (action === "pause") controller.pause();
        if (action === "toggle") controller.togglePlay();
        if (action === "seek" && Number.isFinite(payload?.time)) controller.seekTo(payload.time);
        if (action === "volume" && Number.isFinite(payload?.volume)) controller.setVolume(payload.volume);

        if (emit && socketRef.current) {
            socketRef.current.emit("music_action", { id, action, payload });
        }
    };

    const closeWindowById = useCallback((id: string | null) => {
        if (!id) return;
        const mesh = windowsMapRef.current.get(id);
        if (!mesh) return;
        socketRef.current?.emit("close_window", id);

        mesh.dispose();
        windowsMapRef.current.delete(id);
        windowFunctionsRef.current.delete(id);
        windowTypesRef.current.delete(id);
        windowContentsRef.current.delete(id);
        windowDataRef.current.delete(id);
        musicControllersRef.current.delete(id);
        musicQueuesRef.current.delete(id);
        if (activeMusicIdRef.current === id) activeMusicIdRef.current = null;
        if (lastYoutubeIdRef.current === id) lastYoutubeIdRef.current = null;

        if (mapsWindowIdRef.current === id) mapsWindowIdRef.current = null;
        if (linkedInWindowIdRef.current === id) linkedInWindowIdRef.current = null;

        if (relaxThemeWindowIdRef.current === id) {
            restoreRelaxTheme();
        }

        if (callAssistantWindowIdRef.current === id && !suppressCallAssistantWindowExitRef.current) {
            callAssistantWindowIdRef.current = null;
            hardExitCallAssistantRef.current({ silent: true });
        }
    }, []);

    const stashWindowById = useCallback((id: string | null) => {
        console.log("[Stash] Request to stash:", id);
        if (!id) return;
        const mesh = windowsMapRef.current.get(id);
        if (!mesh) {
            console.error("[Stash] Mesh not found for id:", id);
            return;
        }

        const type = windowTypesRef.current.get(id) || "TERMINAL";
        const content = windowContentsRef.current.get(id) || "";
        const data = windowDataRef.current.get(id);

        console.log(`[Stash] Stashing ${id} (Type: ${type})`);

        // Save spatial state
        const position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
        const rotation = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };

        const existingIndex = stashedWindowsRef.current.findIndex((w) => w && w.id === id);
        const entry = { id, type, content, data, position, rotation };

        console.log(`[Stash] Saving entry:`, entry);

        if (existingIndex >= 0) {
            stashedWindowsRef.current[existingIndex] = entry;
        } else {
            stashedWindowsRef.current = [entry, ...(stashedWindowsRef.current || [])].slice(0, 200);
        }

        saveStashedWindows();
        setStashedWindowsVersion((v) => v + 1);

        // Broadcast stash event to other tabs/users
        if (socketRef.current) {
            socketRef.current.emit("sync_stash_add", entry);
        }

        closeWindowById(id);
        // speak("Stored window."); // Too chatty for bulk stash
    }, [closeWindowById, saveStashedWindows, speak]);

    const restoreStashedWindow = useCallback((id: string) => {
        const idx = stashedWindowsRef.current.findIndex((w) => w && w.id === id);
        if (idx < 0) return;
        const item = stashedWindowsRef.current[idx];

        stashedWindowsRef.current = stashedWindowsRef.current.filter((w) => w && w.id !== id);
        saveStashedWindows();
        setStashedWindowsVersion((v) => v + 1);

        // Broadcast remove from stash event
        if (socketRef.current) {
            socketRef.current.emit("sync_stash_remove", id);
        }

        const spawnId = item.id;
        const spawnPos = item.position ? new Vector3(item.position.x, item.position.y, item.position.z) : new Vector3(0, 2, 2);

        spawnWindowRef.current(spawnId, spawnPos, item.type, item.content || "", item.data);

        // Re-track spatial state in local mesh and notify server
        setTimeout(() => {
            const mesh = windowsMapRef.current.get(spawnId);
            if (mesh) {
                if (item.rotation) {
                    mesh.rotation = new Vector3(item.rotation.x, item.rotation.y, item.rotation.z);
                }
                if (socketRef.current) {
                    socketRef.current.emit("move_window", {
                        id: spawnId,
                        pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                        rot: item.rotation ? { x: item.rotation.x, y: item.rotation.y, z: item.rotation.z } : undefined,
                        type: item.type,
                        content: item.content || "",
                        data: item.data
                    });
                }
            }
        }, 100);
    }, [saveStashedWindows]);

    const closeWindowsByType = useCallback((types: string[]) => {
        const ids: string[] = [];
        windowTypesRef.current.forEach((type, id) => {
            if (types.includes(type)) ids.push(id);
        });
        ids.forEach((id) => closeWindowById(id));
    }, [closeWindowById]);

    const emitWindowSpawn = useCallback((id: string, pos: Vector3, type: string, content?: string, data?: any) => {
        if (!socketRef.current) return;
        socketRef.current.emit("move_window", {
            id,
            pos: { x: pos.x, y: pos.y, z: pos.z },
            type,
            content,
            data
        });
    }, []);

    const setBrowserIframeUrl = useCallback((id: string, url: string) => {
        if (typeof document === "undefined") return;
        const iframe = document.getElementById(id + "_browser_iframe") as HTMLIFrameElement | null;
        if (!iframe) return;
        if (iframe.src === url) return;
        iframe.src = url;
    }, []);

    const updateBrowserWindowUrl = useCallback((id: string, url: string) => {
        const mesh = windowsMapRef.current.get(id);
        if (mesh) {
            setBrowserIframeUrl(id, url);
            const pos = mesh.position;
            socketRef.current?.emit("move_window", {
                id,
                pos: { x: pos.x, y: pos.y, z: pos.z },
                type: "BROWSER",
                content: url
            });
        }
    }, [setBrowserIframeUrl]);

    const normalizeUrl = useCallback((raw: string) => {
        const value = (raw || "").trim();
        if (!value) return "https://www.google.com";
        if (/^https?:\/\//i.test(value)) return value;
        return `https://${value}`;
    }, []);

    const spawnDirectWidget = useCallback((widgetType: string, data?: any, content?: string) => {
        const id = `${widgetType}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        const pos = new Vector3((Math.random() * 4) - 2, 2, 0);
        spawnWindowRef.current(id, pos, widgetType, content, data);
        emitWindowSpawn(id, pos, widgetType, content, data);
        if (widgetType === "WIDGET_TIMER") lastTimerIdRef.current = id;
        return { id, pos };
    }, [emitWindowSpawn]);

    const startTimerById = useCallback((id: string) => {
        const mesh = windowsMapRef.current.get(id);
        if (!mesh) return;
        const current = (mesh as any)?.metadata?.widgetData || {};

        const nextData = { ...current, running: true };
        (mesh as any).metadata = { ...(mesh as any).metadata, widgetData: nextData };
        const redraw = (mesh as any)?.metadata?.widgetRedraw;
        if (typeof redraw === "function") redraw(nextData);
        (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, "TIMER");
    }, []);

    const stopTimerById = useCallback((id: string) => {
        const mesh = windowsMapRef.current.get(id);
        if (!mesh) return;
        const current = (mesh as any)?.metadata?.widgetData || {};

        const nextData = { ...current, running: false };
        (mesh as any).metadata = { ...(mesh as any).metadata, widgetData: nextData };
        const redraw = (mesh as any)?.metadata?.widgetRedraw;
        if (typeof redraw === "function") redraw(nextData);
        (window as any).__NEURO_WIDGET_ONCHANGE__?.(id, nextData, "TIMER");
    }, []);

    const loadCallLogs = useCallback(() => {
        try {
            const raw = typeof window !== "undefined" ? window.localStorage.getItem("neuro_call_logs") : null;
            const parsed = raw ? JSON.parse(raw) : [];
            callLogsRef.current = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            callLogsRef.current = [];
        }
    }, []);

    const saveCallLogs = useCallback(() => {
        try {
            if (typeof window === "undefined") return;
            window.localStorage.setItem("neuro_call_logs", JSON.stringify(callLogsRef.current || []));
        } catch (e) {
        }
    }, []);

    useEffect(() => {
        loadCallLogs();
    }, [loadCallLogs]);

    const persistCallSession = useCallback((session: any) => {
        try {
            if (!session) return;
            const endedAt = Date.now();
            const history = Array.isArray(session.history) ? session.history : [];
            const log = {
                call_id: session.call_id,
                timestamp: new Date(session.startedAt).toISOString(),
                caller_name: session.caller_name || "unknown",
                caller_number: session.caller_number || "unknown",
                language: session.language === "unknown" ? "English" : session.language,
                intent: session.intent || "Support",
                emotion: session.emotion || "Calm",
                summary: session.details?.length ? session.details[0] : (history.length ? history[history.length - 1]?.text : "Call handled by Jarvis."),
                details: Array.isArray(session.details) ? session.details : [],
                action_required: session.action_required || "No",
                actions: Array.isArray(session.actions) ? session.actions : [],
                call_duration_sec: Math.max(0, Math.round((endedAt - session.startedAt) / 1000)),
                history
            };

            callLogsRef.current = [log, ...(callLogsRef.current || [])].slice(0, 200);
            saveCallLogs();
        } catch (e) {
        }
    }, [saveCallLogs]);

    const speakAsync = useCallback((text: string) => {
        return new Promise<void>((resolve) => {
            try {
                const u = new SpeechSynthesisUtterance(text);
                u.onend = () => resolve();
                u.onerror = () => resolve();
                window.speechSynthesis.speak(u);
            } catch (e) {
                resolve();
            }
        });
    }, []);

    const appendToCallWindow = useCallback((text: string, isUser: boolean) => {
        const id = callAssistantWindowIdRef.current;
        if (!id) return;
        const add = windowFunctionsRef.current.get(id);
        if (add) add(text, isUser);
    }, []);

    const startCallAssistant = useCallback(async () => {
        if (Date.now() < callAssistantDisabledUntilRef.current) return;
        if (callAssistantActiveRef.current) return;
        if (typeof window === "undefined") return;

        const callId = `call_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        callSessionRef.current = {
            call_id: callId,
            startedAt: Date.now(),
            language: "unknown",
            intent: "",
            emotion: "",
            history: [],
            details: [],
            actions: [],
            action_required: "No",
            caller_name: "unknown",
            caller_number: "unknown"
        };

        callAssistantActiveRef.current = true;
        setCallAssistantActive(true);

        const callWindowId = `PHONE_ASSISTANT_${callId}`;
        callAssistantWindowIdRef.current = callWindowId;
        spawnWindowRef.current(callWindowId, new Vector3(0, 2.5, 3), "TERMINAL");
        windowFunctionsRef.current.get(callWindowId)?.("Phone assistant started. Close this window to exit.", false);

        if (socketRef.current) {
            socketRef.current.emit("move_window", {
                id: callWindowId,
                pos: { x: 0, y: 2.5, z: 3 },
                type: "TERMINAL",
                content: ""
            });
        }

        callSpeakingRef.current = true;
        SpeechRecognition.stopListening();
        await speakAsync("Okay. I will handle the call now.");
        callSpeakingRef.current = false;
        SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
    }, [appendToCallWindow, speakAsync]);

    const endCallAssistant = useCallback(async () => {
        if (!callAssistantActiveRef.current) return;

        callAssistantDisabledUntilRef.current = Date.now() + 2500;

        callAssistantActiveRef.current = false;
        setCallAssistantActive(false);

        if (callUtteranceTimeoutRef.current) {
            window.clearTimeout(callUtteranceTimeoutRef.current);
            callUtteranceTimeoutRef.current = null;
        }

        SpeechRecognition.stopListening();

        const session = callSessionRef.current;
        callSessionRef.current = null;
        if (!session) {
            SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
            return;
        }

        persistCallSession(session);

        callSpeakingRef.current = true;
        await speakAsync("Call summary saved.");
        callSpeakingRef.current = false;

        await new Promise<void>((r) => window.setTimeout(r, 600));
        SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
    }, [persistCallSession, speakAsync]);

    const hardExitCallAssistant = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        const session = callSessionRef.current;

        callAssistantDisabledUntilRef.current = Date.now() + 5000;
        callAssistantCooldownUntilRef.current = Date.now() + 5000;
        callAssistantLastRequestAtRef.current = 0;
        callAssistantActiveRef.current = false;
        setCallAssistantActive(false);
        callSessionRef.current = null;
        callAssistantTranscriptHandledRef.current = "";

        persistCallSession(session);

        if (callAssistantWindowIdRef.current) {
            const windowId = callAssistantWindowIdRef.current;
            callAssistantWindowIdRef.current = null;
            suppressCallAssistantWindowExitRef.current = true;
            closeWindowById(windowId);
            suppressCallAssistantWindowExitRef.current = false;
        }

        if (callUtteranceTimeoutRef.current) {
            window.clearTimeout(callUtteranceTimeoutRef.current);
            callUtteranceTimeoutRef.current = null;
        }

        if (!silent) {
            callSpeakingRef.current = true;
            SpeechRecognition.stopListening();
            await speakAsync("Goodbye. Thank you for calling. Have a great day.");
            callSpeakingRef.current = false;
        } else {
            SpeechRecognition.stopListening();
        }

        await new Promise<void>((r) => window.setTimeout(r, 800));
        SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
    }, [closeWindowById, persistCallSession, speakAsync]);

    useEffect(() => {
        hardExitCallAssistantRef.current = hardExitCallAssistant;
    }, [hardExitCallAssistant]);

    const briefLastCall = useCallback(async () => {
        loadCallLogs();
        const last = Array.isArray(callLogsRef.current) ? callLogsRef.current[0] : null;
        if (!last) {
            await speakAsync("No call notes found.");
            return;
        }
        const lines = [
            `Last call: ${last.intent || ""}`,
            last.summary ? `Summary: ${last.summary}` : "",
            last.action_required === "Yes" ? "Action required: Yes" : "Action required: No"
        ].filter(Boolean);
        await speakAsync(lines.join(". "));
    }, [loadCallLogs, speakAsync]);

    const summarizeTodaysCalls = useCallback(async () => {
        loadCallLogs();
        const all = Array.isArray(callLogsRef.current) ? callLogsRef.current : [];
        const today = new Date();

        const y = today.getFullYear();
        const m = today.getMonth();
        const d = today.getDate();
        const isSameDay = (iso: string) => {
            const dt = new Date(iso);
            return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
        };
        const todays = all.filter((c) => c && typeof c.timestamp === "string" && isSameDay(c.timestamp));
        if (!todays.length) {
            await speakAsync("No calls logged today.");
            return;
        }

        const short = todays.slice(0, 5).map((c: any, i: number) => {
            const summary = typeof c.summary === "string" ? c.summary : "";
            const intent = typeof c.intent === "string" ? c.intent : "Call";
            return `${i + 1}. ${intent}. ${summary}`.trim();
        });
        await speakAsync(`Today you have ${todays.length} calls. ${short.join(". ")}`);
    }, [loadCallLogs, speakAsync]);

    const connectWallet = useCallback(async () => {
        if (typeof window === "undefined" || !(window as any).ethereum) {
            speak("MetaMask is not installed. Please install it to connect your wallet.");
            return;
        }
        try {
            speak("Connecting to MetaMask...");
            const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                speak("Wallet connected successfully.");
                console.log("Connected account:", accounts[0]);
            }
        } catch (error: any) {
            if (error.code === 4001) {
                speak("Connection request denied.");
            } else {
                speak("An error occurred while connecting to the wallet.");
                console.error(error);
            }
        }
    }, [speak]);

    const handleGenerativeCommand = useCallback(async (prompt: string) => {
        if (callAssistantActiveRef.current) return;

        const promptLower = String(prompt || "").toLowerCase();
        relaxThemePendingRef.current = (
            promptLower.includes("relax") ||
            promptLower.includes("calm") ||
            promptLower.includes("meditation") ||
            promptLower.includes("sleep")
        ) && (
                promptLower.includes("music") ||
                promptLower.includes("song") ||
                promptLower.includes("sounds") ||
                promptLower.includes("play")
            );

        speak("Processing request...");
        try {
            const response = await fetch(`${AI_ENDPOINT}/generate-ui`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json();
            const widgets = (data && Array.isArray((data as any).widgets)) ? (data as any).widgets : [];

            widgets.forEach((widget: any) => {
                if (!widget || typeof widget !== "object") return;

                const id = (typeof widget.id === "string" && widget.id.trim().length > 0)
                    ? widget.id
                    : `AI_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

                const type = typeof widget.type === "string" ? widget.type : "";
                const p = (widget.position && typeof widget.position === "object") ? widget.position : {};

                const x = Number.isFinite(p.x) ? p.x : 0;
                const y = Number.isFinite(p.y) ? p.y : 2;
                const z = Number.isFinite(p.z) ? p.z : 0;
                const pos = new Vector3(x, y, z);

                if (type === "WIDGET_WALLET") {
                    connectWallet();
                    return;
                }

                if (type === "DOC") {
                    const docText = widget?.data?.text;
                    if (typeof docText !== "string") return;
                    spawnWindowRef.current(id, pos, "DOC", docText);
                    emitWindowSpawn(id, pos, "DOC", docText, widget.data);
                    return;
                }

                if (type === "YOUTUBE") {
                    spawnWindowRef.current(id, pos, "YOUTUBE", "", widget.data);
                    if (relaxThemePendingRef.current && !relaxThemeActiveRef.current) {
                        relaxThemeActiveRef.current = true;
                        relaxThemeWindowIdRef.current = id;
                        applyRelaxTheme();
                    }
                    emitWindowSpawn(id, pos, "YOUTUBE", "", widget.data);
                    return;
                }

                if (type === "MUSIC") {
                    spawnWindowRef.current(id, pos, "MUSIC", "", widget.data);
                    if (relaxThemePendingRef.current && !relaxThemeActiveRef.current) {
                        relaxThemeActiveRef.current = true;
                        relaxThemeWindowIdRef.current = id;
                        applyRelaxTheme();
                    }
                    emitWindowSpawn(id, pos, "MUSIC", "", widget.data);
                    return;
                }

                if (type === "BROWSER" || type === "WIDGET_BROWSER") {
                    const url = typeof widget?.data?.url === "string" && widget.data.url.trim()
                        ? widget.data.url.trim()
                        : (typeof widget?.content === "string" ? widget.content : "https://www.google.com");
                    spawnWindowRef.current(id, pos, "BROWSER", url, widget.data);
                    emitWindowSpawn(id, pos, "BROWSER", url, widget.data);
                    return;
                }

                spawnWindowRef.current(id, pos, type || "TERMINAL", widget?.content, widget.data);
                emitWindowSpawn(id, pos, type || "TERMINAL", widget?.content, widget.data);
            });
        } catch (e) {
            speak("Error generating interface.");
        }
    }, [AI_ENDPOINT, applyRelaxTheme, connectWallet, emitWindowSpawn, speak]);

    const isReservedAssistantPhrase = useCallback((raw: string) => {
        const t = String(raw || "").trim().toLowerCase();
        if (!t) return false;
        if (t === "answer the phone" || t === "answer phone") return true;

        if (t === "answer the call" || t === "answer call") return true;
        if (t === "end assistant" || t === "end the assistant") return true;
        if (t === "end call assistant" || t === "end the call assistant") return true;
        if (t === "bye jarvis" || t === "bye, jarvis" || t === "goodbye jarvis" || t === "goodbye, jarvis") return true;
        if (t.includes("brief") && t.includes("last") && (t.includes("phone") || t.includes("call"))) return true;
        if (t.includes("summarize") && (t.includes("phones") || t.includes("calls") || t.includes("today"))) return true;
        if (t === "open maps" || t === "open map") return true;
        if (t === "new maps window" || t === "open maps in new window" || t === "spawn maps window") return true;
        if (t === "open google maps" || t === "open google map") return true;
        if (t.startsWith("search maps for ") || t.startsWith("maps search for ") || t.startsWith("search map for ")) return true;
        if (t.startsWith("directions from ") || t.startsWith("navigate from ") || t.startsWith("route from ")) return true;

        // Stash commands overlap with AI if not reserved
        if (t === "store windows" || t === "store all windows") return true;
        if (t === "stash windows" || t === "stash all windows") return true;

        return false;
    }, []);

    const commands = useMemo(() => [
        {
            command: 'Open terminal',
            callback: () => {
                spawnWindowRef.current(`Term_${Date.now()}`, new Vector3((Math.random() * 4) - 2, 2, 0), "TERMINAL");
            }
        },
        { command: 'Connect wallet', callback: () => connectWallet() },
        { command: 'Collect wallet', callback: () => connectWallet() },
        { command: 'Turn wallet', callback: () => connectWallet() },
        { command: 'Turned wallet', callback: () => connectWallet() },
        { command: 'Jarvis answer the phone', callback: () => { startCallAssistant(); } },
        { command: 'Jarvis, answer the phone', callback: () => { startCallAssistant(); } },
        { command: 'Jarvis end assistant', callback: () => { endCallAssistant(); } },
        { command: 'Jarvis, end assistant', callback: () => { endCallAssistant(); } },
        {
            command: 'Bye Jarvis',
            callback: async () => {
                if (callAssistantActiveRef.current) {
                    await hardExitCallAssistant();
                    return;
                }
                await speakAsync("Goodbye. Have a great day.");
            }
        },
        {
            command: 'Bye, Jarvis',
            callback: async () => {
                if (callAssistantActiveRef.current) {
                    await hardExitCallAssistant();
                    return;
                }
                await speakAsync("Goodbye. Have a great day.");
            }
        },
        { command: 'Jarvis, give me a brief of the last phone', callback: () => { briefLastCall(); } },
        { command: 'Jarvis brief last phone', callback: () => { briefLastCall(); } },
        { command: 'Jarvis brief the last phone', callback: () => { briefLastCall(); } },
        { command: 'Jarvis, brief the last phone', callback: () => { briefLastCall(); } },
        { command: 'Jarvis, brief the last call', callback: () => { briefLastCall(); } },
        { command: 'Jarvis brief the last call', callback: () => { briefLastCall(); } },
        { command: 'Jarvis, brief last call', callback: () => { briefLastCall(); } },
        { command: 'Jarvis brief last call', callback: () => { briefLastCall(); } },
        { command: 'Jarvis, summarize today\'s phones', callback: () => { summarizeTodaysCalls(); } },

        { command: 'Open notes', callback: () => spawnDirectWidget("WIDGET_NOTES", { text: "" }) },
        { command: 'Open calculator', callback: () => spawnDirectWidget("WIDGET_CALCULATOR", { expr: "", result: "" }) },
        { command: 'Open clock', callback: () => spawnDirectWidget("WIDGET_CLOCK", {}) },
        { command: 'Open reminders', callback: () => spawnDirectWidget("WIDGET_REMINDERS", { items: [] }) },
        { command: 'Open weather', callback: () => spawnDirectWidget("WIDGET_WEATHER", { city: "London" }) },

        { command: 'Open browser *', callback: (command: string) => spawnDirectWidget("WIDGET_BROWSER", { url: normalizeUrl(command) }, "") },
        {
            command: ['Open file explorer', 'Open File Explorer'],
            callback: () => {
                setFileExplorerOpen(true);
                resetTranscript();
            }
        },
        {
            command: 'Close all',
            callback: () => {
                const ids = Array.from(windowsMapRef.current.keys());
                ids.forEach((id) => closeWindowById(id));
                activeWindowIdRef.current = null;
                isGrabbingRef.current = false;
                resetTranscript();
            }
        },
        {
            command: ['Open LinkedIn', 'Open linkedin'],
            callback: () => {
                const url = "https://www.linkedin.com";
                const existingId = linkedInWindowIdRef.current;
                if (existingId && windowsMapRef.current.has(existingId)) {
                    updateBrowserWindowUrl(existingId, url);
                    speak("Opening LinkedIn.");
                    resetTranscript();
                    return;
                }

                const id = `LINKEDIN_${Date.now()}`;
                linkedInWindowIdRef.current = id;
                const pos = new Vector3(-1.5, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak("Opening LinkedIn.");
                resetTranscript();
            }
        },
        {
            command: ['Search LinkedIn jobs for *', 'Search linkedin jobs for *', 'LinkedIn jobs for *', 'Linkedin jobs for *'],
            callback: (raw: string) => {
                const qRaw = String(raw || "").trim();
                if (!qRaw) return;

                let keywords = qRaw;
                let location = "";
                const lower = qRaw.toLowerCase();
                const idx = lower.lastIndexOf(" in ");
                if (idx > 0) {
                    keywords = qRaw.slice(0, idx).trim();
                    location = qRaw.slice(idx + 4).trim();
                }

                const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}${location ? `&location=${encodeURIComponent(location)}` : ""}`;

                const existingId = linkedInWindowIdRef.current;
                if (existingId && windowsMapRef.current.has(existingId)) {
                    updateBrowserWindowUrl(existingId, url);
                    speak("Searching LinkedIn jobs.");
                    resetTranscript();
                    return;
                }

                const id = `LINKEDIN_${Date.now()}`;
                linkedInWindowIdRef.current = id;
                const pos = new Vector3(-1.5, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak("Searching LinkedIn jobs.");
                resetTranscript();
            }
        },
        {
            command: 'Open *',
            callback: (command: string) => {
                if (typeof command === "string" && command.trim().toLowerCase().startsWith("music ")) return;
                const lower = typeof command === "string" ? command.trim().toLowerCase() : "";

                if (lower === "maps" || lower === "map" || lower.startsWith("maps ") || lower.startsWith("map ")) return;
                handleGenerativeCommand("Open " + command);
            }
        },
        {
            command: ['Play music *', 'Play song *'],
            callback: (q: string) => {
                const query = String(q || "").trim();
                if (!query) return;
                handleGenerativeCommand(`Play music ${query}`);
            }
        },
        {
            command: 'Jarvis *',
            callback: (command: string) => {
                if (isReservedAssistantPhrase(command)) return;
                handleGenerativeCommand(command);
            }
        },

        {
            command: ['Open maps', 'Open map'],
            callback: () => {
                const existingId = mapsWindowIdRef.current;
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const url = `${origin}/maps`;
                if (existingId && windowsMapRef.current.has(existingId)) {
                    updateBrowserWindowUrl(existingId, url);
                    speak("Opening maps.");
                    resetTranscript();
                    return;
                }

                const id = `MAPS_${Date.now()}`;
                mapsWindowIdRef.current = id;
                const pos = new Vector3(0, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak("Opening maps.");
                resetTranscript();
            }
        },
        {
            command: ['New maps window', 'Open maps in new window', 'Spawn maps window'],
            callback: () => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const url = `${origin}/maps`;
                const id = `MAPS_${Date.now()}`;
                mapsWindowIdRef.current = id;
                const pos = new Vector3(1.5, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak("Opening a new maps window.");
                resetTranscript();
            }
        },
        {
            command: ['Open Google Maps', 'Open google maps', 'Open google map'],
            callback: () => {
                try {
                    window.open("https://www.google.com/maps", "_blank");
                } catch (e) {
                }
                speak("Opening Google Maps.");
                resetTranscript();
            }
        },
        {
            command: ['Search maps for *', 'Search map for *', 'Maps search for *'],
            callback: (q: string) => {
                const query = String(q || "").trim();
                if (!query) return;
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const url = `${origin}/maps?q=${encodeURIComponent(query)}`;

                const existingId = mapsWindowIdRef.current;
                if (existingId && windowsMapRef.current.has(existingId)) {
                    updateBrowserWindowUrl(existingId, url);
                    speak(`Searching maps for ${query}.`);
                    resetTranscript();
                    return;
                }

                const id = `MAPS_${Date.now()}`;
                mapsWindowIdRef.current = id;
                const pos = new Vector3(0, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak(`Searching maps for ${query}.`);
                resetTranscript();
            }
        },
        {
            command: ['Directions from * to *', 'Navigate from * to *', 'Route from * to *'],
            callback: (from: string, to: string) => {
                const origin = String(from || "").trim();
                const destination = String(to || "").trim();
                if (!origin || !destination) return;
                const appOrigin = typeof window !== "undefined" ? window.location.origin : "";
                const url = `${appOrigin}/maps?from=${encodeURIComponent(origin)}&to=${encodeURIComponent(destination)}`;

                const existingId = mapsWindowIdRef.current;
                if (existingId && windowsMapRef.current.has(existingId)) {
                    updateBrowserWindowUrl(existingId, url);
                    speak("Opening directions.");
                    resetTranscript();
                    return;
                }

                const id = `MAPS_${Date.now()}`;
                mapsWindowIdRef.current = id;
                const pos = new Vector3(0, 2, 2);
                spawnWindowRef.current(id, pos, "BROWSER", url);
                emitWindowSpawn(id, pos, "BROWSER", url);
                speak("Opening directions.");
                resetTranscript();
            }
        },
        {
            command: ['Store windows', 'Store all windows', 'Stash windows', 'Stash all windows'],
            callback: () => {
                console.log("[Command] Store windows invoked.");
                const ids = Array.from(windowsMapRef.current.keys());
                console.log("[Command] Windows to store:", ids);
                if (ids.length === 0) {
                    speak("No windows to store.");
                    return;
                }

                // Use reverse loop or copy to avoid issues if stash modifies the map (it does, via closeWindowById)
                [...ids].forEach(id => {
                    stashWindowById(id);
                });

                speak("All windows stored.");
                resetTranscript();
            }
        },
    ], [
        AI_ENDPOINT,
        briefLastCall,
        closeWindowById,
        closeWindowsByType,
        connectWallet,
        emitWindowSpawn,
        endCallAssistant,
        handleGenerativeCommand,
        handleMusicAction,
        hardExitCallAssistant,
        isReservedAssistantPhrase,
        normalizeUrl,
        speak,
        speakAsync,
        spawnDirectWidget,
        startCallAssistant,
        startTimerById,
        stopTimerById,
        summarizeTodaysCalls,
        updateBrowserWindowUrl
    ]);

    const { listening, browserSupportsSpeechRecognition, transcript, resetTranscript } = useSpeechRecognition({ commands });

    useEffect(() => {
        if (!browserSupportsSpeechRecognition) return;
        SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
        const interval = window.setInterval(() => {
            if (!listening && mounted) {
                SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
            }
        }, 1000);
        return () => window.clearInterval(interval);
    }, [browserSupportsSpeechRecognition, listening, mounted]);

    useEffect(() => {
        if (!browserSupportsSpeechRecognition) return;
        const interval = window.setInterval(() => {
            if (callAssistantActiveRef.current) return;
            const now = Date.now();
            if (!listening || now - lastSpeechKickAtRef.current > 5000) {
                lastSpeechKickAtRef.current = now;
                SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
            }
        }, 1500);

        return () => window.clearInterval(interval);
    }, [browserSupportsSpeechRecognition, listening]);

    useEffect(() => {
        if (!callAssistantActiveRef.current) return;
        if (!transcript || callSpeakingRef.current) return;

        if (callUtteranceTimeoutRef.current) {
            window.clearTimeout(callUtteranceTimeoutRef.current);
        }

        callUtteranceTimeoutRef.current = window.setTimeout(async () => {
            try {
                const now = Date.now();

                if (now < callAssistantDisabledUntilRef.current || now < callAssistantCooldownUntilRef.current) {
                    resetTranscript();
                    callAssistantTranscriptHandledRef.current = "";
                    return;
                }

                const full = (transcript || "").trim();
                if (!full) return;

                const handled = callAssistantTranscriptHandledRef.current;
                const utter = (handled && full.toLowerCase().startsWith(handled.toLowerCase()))
                    ? full.slice(handled.length).trim()
                    : full;

                callAssistantTranscriptHandledRef.current = full;
                if (!utter) return;

                const utterLower = utter.toLowerCase();
                const shouldExitCallMode =
                    utterLower.includes("bye jarvis") ||
                    utterLower.includes("goodbye jarvis") ||
                    utterLower.includes("end assistant") ||
                    utterLower.includes("end the assistant") ||
                    utterLower.includes("end phone assistant") ||
                    utterLower.includes("end the phone assistant") ||
                    utterLower.includes("stop assistant") ||
                    utterLower.includes("stop jarvis") ||
                    utterLower === "bye" ||
                    utterLower === "goodbye" ||
                    utterLower === "good bye" ||
                    utterLower.startsWith("bye ");

                if (shouldExitCallMode) {
                    await hardExitCallAssistant();
                    return;
                }

                const session = callSessionRef.current;
                if (!session) {
                    await hardExitCallAssistant();
                    return;
                }

                if (now - callAssistantLastRequestAtRef.current < 1800) {
                    resetTranscript();
                    callAssistantTranscriptHandledRef.current = "";
                    return;
                }

                callAssistantLastRequestAtRef.current = now;
                session.history.push({ role: "caller", text: utter });
                appendToCallWindow(utter, true);

                const response = await fetch(`${AI_ENDPOINT}/call-assistant`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        caller_utterance: utter,
                        history: session.history
                    })
                });

                if (response.status === 429) {
                    callAssistantCooldownUntilRef.current = Date.now() + 15000;
                }

                const json = await response.json();
                const reply = json && typeof json.reply === "string" ? json.reply : "";
                const note = json && typeof json.note === "object" && json.note ? json.note : {};

                if (typeof note.caller_name === "string" && note.caller_name.trim()) session.caller_name = note.caller_name.trim();
                if (typeof note.caller_number === "string" && note.caller_number.trim()) session.caller_number = note.caller_number.trim();
                if (Array.isArray(note.details)) {
                    for (const d of note.details) {
                        if (typeof d === "string" && d.trim()) session.details.push(d.trim());
                    }
                }
                if (typeof note.action_required === "string" && (note.action_required === "Yes" || note.action_required === "No")) {
                    session.action_required = note.action_required;
                }
                if (Array.isArray(note.actions)) {
                    for (const a of note.actions) {
                        if (typeof a === "string" && a.trim()) session.actions.push(a.trim());
                    }
                }

                if (reply) {
                    session.history.push({ role: "assistant", text: reply });
                    appendToCallWindow(reply, false);
                    callSpeakingRef.current = true;
                    SpeechRecognition.stopListening();
                    await speakAsync(reply);
                    callSpeakingRef.current = false;
                    await new Promise<void>((r) => window.setTimeout(r, 400));
                    SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
                }
            } catch (e) {
            } finally {
                resetTranscript();
                callAssistantTranscriptHandledRef.current = "";
            }
        }, 1200);

        return () => {
            if (callUtteranceTimeoutRef.current) {
                window.clearTimeout(callUtteranceTimeoutRef.current);
                callUtteranceTimeoutRef.current = null;
            }
        };
    }, [AI_ENDPOINT, appendToCallWindow, hardExitCallAssistant, resetTranscript, speakAsync, transcript]);

    useEffect(() => {
        socketRef.current = socket;
    }, [socket]);

    useEffect(() => {
        if (!socket || !sceneRef.current) return;

        socket.on("init_state", (state: any) => {
            if (!state) return;
            Object.keys(state).forEach((id) => {
                if (!windowsMapRef.current.has(id)) {
                    spawnWindow(
                        id,
                        new Vector3(state[id].x, state[id].y, state[id].z),
                        state[id].type,
                        state[id].content,
                        state[id].data
                    );
                }

                if (
                    !mapsWindowIdRef.current &&
                    state[id]?.type === "BROWSER" &&
                    typeof state[id]?.content === "string" &&
                    (state[id].content.includes("google.com/maps") || state[id].content.includes("openstreetmap.org") || state[id].content.includes("/maps"))
                ) {
                    mapsWindowIdRef.current = id;
                }

                if (
                    !linkedInWindowIdRef.current &&
                    state[id]?.type === "BROWSER" &&
                    typeof state[id]?.content === "string" &&
                    (state[id].content.includes("linkedin.com") || state[id].content.includes("/linkedin"))
                ) {
                    linkedInWindowIdRef.current = id;
                }

                if (state[id]?.musicState && state[id].musicState.action) {
                    handleMusicAction(id, state[id].musicState.action, state[id].musicState.payload, false);
                }
            });
        });

        socket.on("update_window", (data: any) => {
            const isActive = activeWindowIdRef.current === data.id;
            const mesh = windowsMapRef.current.get(data.id);

            if (mesh) {
                if (!isActive) {
                    mesh.position.x = data.pos.x;
                    mesh.position.y = data.pos.y;
                    mesh.position.z = data.pos.z ?? 0;
                }

                if (data.type === "BROWSER" && typeof data.content === "string" && data.content.trim()) {
                    setBrowserIframeUrl(data.id, data.content.trim());
                }

                if (typeof data.type === "string") windowTypesRef.current.set(data.id, data.type);
                if (typeof data.content === "string") windowContentsRef.current.set(data.id, data.content);
                if (typeof data.data !== "undefined") windowDataRef.current.set(data.id, data.data);
            } else {
                spawnWindow(
                    data.id,
                    new Vector3(data.pos.x, data.pos.y, data.pos.z ?? 0),
                    data.type,
                    data.content,
                    data.data
                );
            }
        });

        socket.on("window_closed", (id: string) => {
            windowsMapRef.current.get(id)?.dispose();
            windowsMapRef.current.delete(id);
            windowFunctionsRef.current.delete(id);
            windowTypesRef.current.delete(id);
            windowContentsRef.current.delete(id);
            windowDataRef.current.delete(id);
            musicControllersRef.current.delete(id);
            musicQueuesRef.current.delete(id);
            if (activeMusicIdRef.current === id) activeMusicIdRef.current = null;
            if (lastYoutubeIdRef.current === id) lastYoutubeIdRef.current = null;

            if (mapsWindowIdRef.current === id) mapsWindowIdRef.current = null;

            if (relaxThemeWindowIdRef.current === id) {
                restoreRelaxTheme();
            }

            if (callAssistantWindowIdRef.current === id && !suppressCallAssistantWindowExitRef.current) {
                callAssistantWindowIdRef.current = null;
                hardExitCallAssistantRef.current({ silent: true });
            }
        });

        socket.on("chat_message", (data: any) => windowFunctionsRef.current.get(data.windowId)?.(data.text, data.isUser));

        socket.on("music_action", (data: any) => {
            if (!data || !data.id) return;
            handleMusicAction(data.id, data.action, data.payload, false);
        });

        socket.on("init_users", (users: any) => {
            Object.keys(users).forEach(id => {
                if (id !== socket.id && !otherUsersRef.current.has(id)) {
                    const mesh = createAvatar(users[id].name, users[id].color, sceneRef.current!);
                    otherUsersRef.current.set(id, mesh);
                }
            });
        });

        socket.on("user_joined", (user: any) => {
            if (!otherUsersRef.current.has(user.id)) {
                const mesh = createAvatar(user.name, user.color, sceneRef.current!);
                otherUsersRef.current.set(user.id, mesh);
            }
        });

        socket.on("user_moved", (data: any) => {
            const mesh = otherUsersRef.current.get(data.id);
            if (mesh) {
                mesh.position.x = data.pos.x;
                mesh.position.y = data.pos.y;
                mesh.position.z = 0;
            }
        });

        socket.on("user_left", (id: string) => {
            const mesh = otherUsersRef.current.get(id);
            if (mesh) {
                mesh.dispose();
                otherUsersRef.current.delete(id);
            }
        });

        // --- STASH SYNC ---
        socket.on("sync_stash_add", (entry: any) => {
            if (!entry || !entry.id) return;
            const existingIndex = stashedWindowsRef.current.findIndex((w) => w && w.id === entry.id);
            if (existingIndex >= 0) {
                stashedWindowsRef.current[existingIndex] = entry;
            } else {
                stashedWindowsRef.current = [entry, ...(stashedWindowsRef.current || [])].slice(0, 200);
            }
            saveStashedWindows();
            setStashedWindowsVersion((v) => v + 1);
        });

        socket.on("sync_stash_remove", (id: string) => {
            if (!id) return;
            stashedWindowsRef.current = stashedWindowsRef.current.filter((w) => w && w.id !== id);
            saveStashedWindows();
            setStashedWindowsVersion((v) => v + 1);
        });

        return () => {
            socket.off("init_state");
            socket.off("update_window");
            socket.off("window_closed");
            socket.off("chat_message");
            socket.off("music_action");
            socket.off("init_users");
            socket.off("user_joined");
            socket.off("user_moved");
            socket.off("user_left");
            socket.off("sync_stash_add");
            socket.off("sync_stash_remove");
        };
    }, [socket, spawnWindow, handleMusicAction, saveStashedWindows]);

    useEffect(() => {
        setMounted(true);
        if (!canvasRef.current) return;

        const engine = new Engine(canvasRef.current, true);
        const scene = new Scene(engine);
        sceneRef.current = scene;

        setupEnvironment(scene);

        const camera = new ArcRotateCamera("Camera", -Math.PI / 2, Math.PI / 2.5, 15, Vector3.Zero(), scene);
        camera.attachControl(canvasRef.current, true);
        new HemisphericLight("light1", new Vector3(1, 1, 0), scene);

        (async () => {
            try {
                const arSupported = await navigator.xr?.isSessionSupported("immersive-ar");
                const sessionMode = arSupported ? "immersive-ar" : "immersive-vr";
                await scene.createDefaultXRExperienceAsync({
                    uiOptions: { sessionMode: sessionMode, referenceSpaceType: "local-floor" }
                });
            } catch (e) {
                console.error("WebXR Error:", e);
            }
        })();

        const sphereMat = new StandardMaterial("fingerMat", scene);
        sphereMat.emissiveColor = new Color3(0, 1, 1);
        fingerMatRef.current = sphereMat;
        for (let i = 0; i < 21; i++) {
            const sphere = MeshBuilder.CreateSphere(`joint${i}`, { diameter: 0.25 }, scene);
            sphere.material = sphereMat;
            sphere.position = new Vector3(0, -100, 0);
            sphere.isPickable = false;
            sphere.isVisible = false;
            fingerSpheresRef.current.push(sphere);
        }

        engine.runRenderLoop(() => { scene.render(); });
        const resize = () => engine.resize();
        window.addEventListener("resize", resize);
        return () => { scene.dispose(); engine.dispose(); window.removeEventListener("resize", resize); };
    }, []);

    useEffect(() => {
        if (typeof document === "undefined") return;

        const canvas = document.createElement("canvas");
        canvas.id = "neuro-hand-overlay";
        Object.assign(canvas.style, {
            position: "fixed",
            inset: "0",
            zIndex: "2147483647",
            pointerEvents: "none"
        } as Partial<CSSStyleDeclaration>);

        document.body.appendChild(canvas);
        handOverlayCanvasRef.current = canvas;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        resize();
        window.addEventListener("resize", resize);

        return () => {
            window.removeEventListener("resize", resize);
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            if (handOverlayCanvasRef.current === canvas) handOverlayCanvasRef.current = null;
        };
    }, []);

    const handleHandMove = useCallback((landmarks: any) => {
        if (!fingerSpheresRef.current.length || !sceneRef.current) return;
        const scaleX = 10; const scaleY = 8;

        landmarks.forEach((point: any, index: number) => {
            const sphere = fingerSpheresRef.current[index];
            sphere.position.x = (0.5 - point.x) * scaleX;
            sphere.position.y = (0.5 - point.y) * scaleY + 2;
            sphere.position.z = 0;
        });

        const wrist = fingerSpheresRef.current[0];
        const tips = [8, 12, 16, 20].map(i => fingerSpheresRef.current[i]);

        let totalDistance = 0;
        tips.forEach(tip => totalDistance += Vector3.Distance(tip.position, wrist.position));
        const avgDist = totalDistance / 4;
        const isFist = avgDist < 1.8;

        // Grab/release logic (scene.pick expects screen-space coordinates)
        const wristLm = Array.isArray(landmarks) ? landmarks[0] : null;
        if (isFist && !isGrabbingRef.current && wristLm && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const screenX = (1 - wristLm.x) * rect.width;
            const screenY = wristLm.y * rect.height;
            const pickResult = sceneRef.current.pick(screenX, screenY);
            let picked = pickResult?.pickedMesh as any;
            if (picked) console.log("[Grab] Picked mesh:", picked.name, picked.metadata);

            // --- ROBUST PARENT WALK ---
            // Walk up the hierarchy to find the actual window root mesh
            // We look for a mesh that has 'windowId' in its metadata OR is directly in our windowsMapRef
            let foundRoot: any = null;
            let currentMesh = picked;
            let attempts = 0;

            while (currentMesh && attempts < 10) {
                if ((currentMesh as any).metadata?.windowId) {
                    foundRoot = currentMesh;
                    break;
                }
                // Fallback: check if this mesh is in our map (less reliable if map uses wrappers, but good backup)
                const isMapped = Array.from(windowsMapRef.current.values()).includes(currentMesh);
                if (isMapped) {
                    foundRoot = currentMesh;
                    break;
                }
                currentMesh = currentMesh.parent;
                attempts++;
            }

            if (foundRoot) {
                // If we found a root via metadata, use that ID directly
                const metaId = (foundRoot as any).metadata?.windowId;
                console.log("[Grab] Found root:", foundRoot.name, "ID:", metaId);

                if (metaId && windowsMapRef.current.has(metaId)) {
                    isGrabbingRef.current = true;
                    activeWindowIdRef.current = metaId;
                    grabOffsetRef.current = wrist.position.subtract(foundRoot.position);
                }
                else {
                    // Fallback scan
                    const meshId = Array.from(windowsMapRef.current.entries()).find(([_, m]) => m === foundRoot)?.[0];
                    if (meshId) {
                        console.log("[Grab] Fallback ID found:", meshId);
                        isGrabbingRef.current = true;
                        activeWindowIdRef.current = meshId;
                        grabOffsetRef.current = wrist.position.subtract(foundRoot.position);
                    } else {
                        console.warn("[Grab] Root found but not in map!");
                    }
                }
            } else {
                if (picked) console.warn("[Grab] Picked something but no root found.");
            }
        } else if (!isFist && isGrabbingRef.current) {
            const releasedId = activeWindowIdRef.current;
            console.log("[Release] Released ID:", releasedId);
            isGrabbingRef.current = false;
            activeWindowIdRef.current = null;

            const icon = typeof document !== "undefined" ? document.getElementById("neuro-file-explorer-icon") : null;
            if (releasedId && icon && wristLm && canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                const screenX = (1 - wristLm.x) * rect.width;
                const screenY = wristLm.y * rect.height;
                const iconRect = icon.getBoundingClientRect();
                const inside = screenX >= iconRect.left && screenX <= iconRect.right && screenY >= iconRect.top && screenY <= iconRect.bottom;
                console.log("[Release] Inside Icon?", inside);
                if (inside) {
                    stashWindowById(releasedId);
                }
            }
        }

        // Move grabbed window
        if (isGrabbingRef.current && activeWindowIdRef.current) {
            const mesh = windowsMapRef.current.get(activeWindowIdRef.current);
            if (mesh) {
                mesh.position = wrist.position.subtract(grabOffsetRef.current);
                const now = Date.now();
                if (socketRef.current && now - lastSocketUpdateRef.current > 50) {
                    lastSocketUpdateRef.current = now;
                    socketRef.current.emit("move_window", {
                        id: activeWindowIdRef.current,
                        pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                        type: (mesh as any)?.metadata?.widgetType ? `WIDGET_${(mesh as any).metadata.widgetType}` : undefined,
                        data: (mesh as any)?.metadata?.widgetData
                    });
                }
            }
        }

        if (fingerMatRef.current) {
            fingerMatRef.current.emissiveColor = isFist ? Color3.Red() : new Color3(0, 1, 1);
        }

        const overlayCanvas = handOverlayCanvasRef.current;
        if (overlayCanvas && Array.isArray(landmarks)) {
            const nowDraw = Date.now();
            if (nowDraw - lastHandOverlayDrawRef.current > 33) {
                const ctx = overlayCanvas.getContext("2d");
                if (ctx) {
                    const w = overlayCanvas.width;
                    const h = overlayCanvas.height;
                    ctx.clearRect(0, 0, w, h);
                    ctx.fillStyle = isFist ? "rgba(255, 0, 0, 0.9)" : "rgba(0, 255, 255, 0.9)";
                    for (let i = 0; i < landmarks.length; i++) {
                        const pt = landmarks[i];
                        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
                        const x2d = (1 - pt.x) * w;
                        const y2d = pt.y * h;
                        ctx.beginPath();
                        ctx.arc(x2d, y2d, 6, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                lastHandOverlayDrawRef.current = nowDraw;
            }
        }
    }, [sceneRef, fingerSpheresRef, isGrabbingRef, activeWindowIdRef, grabOffsetRef, fingerMatRef, handOverlayCanvasRef, lastHandOverlayDrawRef]);

    // --- DROP HANDLER ---
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const id = `File_${Date.now()}`;
        const spawnPos = new Vector3(0, 2, 0);

        if (file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                spawnWindowRef.current(id, spawnPos, "IMAGE", evt.target?.result as string);
                speak("Image imported.");
            };
            reader.readAsDataURL(file);
            return;
        }

        if (file.name.endsWith(".docx")) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                mammoth.extractRawText({ arrayBuffer: evt.target?.result as ArrayBuffer })
                    .then((r) => { spawnWindowRef.current(id, spawnPos, "DOC", r.value); speak("Document imported."); })
                    .catch(() => speak("Error reading document."));
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        if (file.name.endsWith(".glb") || file.name.endsWith(".gltf")) {
            const modelUrl = URL.createObjectURL(file);
            speak("Importing 3D Model...");

            BABYLON.SceneLoader.ImportMeshAsync("", modelUrl, "", sceneRef.current!)
                .then((result) => {
                    const root = result.meshes[0];
                    root.position = spawnPos;
                    root.scaling = new Vector3(0.5, 0.5, 0.5);

                    const bounds = MeshBuilder.CreateBox(id + "_bounds", { size: 2 }, sceneRef.current!);
                    bounds.position = spawnPos;
                    bounds.visibility = 0;
                    root.setParent(bounds);

                    windowsMapRef.current.set(id, bounds);
                    speak("Hologram rendered.");
                })
                .catch((err) => {
                    console.error(err);
                    speak("Failed to load model.");
                });
        }
    }, [speak]);

    return (
        <div id="neuro-space-root" className="relative w-full h-full" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            {!isLoggedIn && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
                    <form onSubmit={handleLogin} className="flex flex-col gap-4 p-8 border border-cyan-500 rounded bg-gray-900">
                        <h1 className="text-2xl text-cyan-400 font-mono">IDENTITY REQUIRED</h1>
                        <input
                            type="text"
                            placeholder="Enter Agent Name..."
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="p-2 bg-black text-white border border-gray-600 focus:border-cyan-500 outline-none"
                            autoFocus
                        />
                        <button type="submit" className="px-4 py-2 bg-cyan-600 text-white font-bold hover:bg-cyan-500">
                            ENTER NEURO-SPACE
                        </button>
                    </form>
                </div>
            )}
            <canvas ref={canvasRef} className="outline-none" style={{ width: "100vw", height: "100vh", display: "block", touchAction: "none" }} />
            {isLoggedIn && <HandController onHandMove={handleHandMove} />}
            {isLoggedIn && (
                <div
                    id="neuro-file-explorer-icon"
                    onClick={() => setFileExplorerOpen(true)}
                    className="absolute left-50 top-1/2 -translate-y-1/2 z-[2147483600] w-14 h-14 rounded-full border border-cyan-400 bg-black/70 text-cyan-200 flex items-center justify-center select-none cursor-pointer"
                >
                    FE
                </div>
            )}
            {isLoggedIn && fileExplorerOpen && (
                <div className="absolute inset-0 z-[2147483599] bg-black/70 flex items-center justify-center">
                    <div className="w-[520px] max-w-[92vw] max-h-[80vh] overflow-auto rounded border border-cyan-500 bg-gray-950 p-4 text-cyan-100">
                        <div className="flex items-center justify-between mb-3">
                            <div className="font-mono text-sm">NEURO FILE EXPLORER</div>
                            <button
                                className="px-3 py-1 border border-cyan-500 rounded bg-black/40"
                                onClick={() => setFileExplorerOpen(false)}
                            >
                                Close
                            </button>
                        </div>
                        <div className="space-y-2">
                            {(() => {
                                const list = stashedWindowsRef.current || [];
                                if (!list.length) {
                                    return <div className="text-cyan-200/70 font-mono text-sm">No stored windows.</div>;
                                }
                                return list.map((w) => (
                                    <div key={w.id} className="flex items-center justify-between gap-3 border border-cyan-900 rounded p-2 bg-black/30">
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs text-cyan-200/80">{w.type}</div>
                                            <div className="font-mono text-sm truncate">{w.id}</div>
                                        </div>
                                        <button
                                            className="px-3 py-1 border border-cyan-500 rounded bg-black/40 shrink-0"
                                            onClick={() => restoreStashedWindow(w.id)}
                                        >
                                            Restore
                                        </button>
                                    </div>
                                ));
                            })()}
                            {stashedWindowsVersion ? null : null}
                        </div>
                    </div>
                </div>
            )}
            <div className="absolute bottom-5 left-5 text-white/50 font-mono text-sm pointer-events-none">
                VOICE SYSTEM: {mounted && browserSupportsSpeechRecognition ? "LISTENING..." : "OFFLINE"} <br />
                IDENTITY: {isLoggedIn ? username.toUpperCase() : "UNKNOWN"}
            </div>
        </div>
    );
};

export default Scene3D;