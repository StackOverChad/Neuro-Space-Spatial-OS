"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];
const DEFAULT_ZOOM = 5;

export default function MapsPage() {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const fromMarkerRef = useRef<any>(null);
  const toMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const [query, setQuery] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const title = useMemo(() => {
    if (from && to) return `Directions: ${from} → ${to}`;
    if (query) return `Search: ${query}`;
    return "Map";
  }, [from, to, query]);

  useEffect(() => {
    const applyFromLocation = () => {
      try {
        const p = new URLSearchParams(window.location.search);
        setQuery((p.get("q") || "").trim());
        setFrom((p.get("from") || "").trim());
        setTo((p.get("to") || "").trim());
      } catch (e) {
        setQuery("");
        setFrom("");
        setTo("");
      }
    };

    applyFromLocation();
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const ensureLeaflet = async () => {
      if (typeof window === "undefined") return;

      const w = window as any;
      if (w.L) return;

      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("leaflet_css");
        if (!existing) {
          const link = document.createElement("link");
          link.id = "leaflet_css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          link.onload = () => resolve();
          link.onerror = () => reject(new Error("Failed to load Leaflet CSS"));
          document.head.appendChild(link);
        } else {
          resolve();
        }
      });

      await new Promise<void>((resolve, reject) => {
        const existing = document.getElementById("leaflet_js");
        if (existing && (window as any).L) {
          resolve();
          return;
        }

        if (!existing) {
          const script = document.createElement("script");
          script.id = "leaflet_js";
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Leaflet JS"));
          document.body.appendChild(script);
          return;
        }

        const interval = window.setInterval(() => {
          if ((window as any).L) {
            window.clearInterval(interval);
            resolve();
          }
        }, 50);

        window.setTimeout(() => {
          window.clearInterval(interval);
          reject(new Error("Leaflet JS load timeout"));
        }, 8000);
      });
    };

    const initMap = async () => {
      if (!mapElRef.current) return;
      await ensureLeaflet();
      if (cancelled) return;

      const L = (window as any).L;

      if (!mapRef.current) {
        mapRef.current = L.map(mapElRef.current, {
          zoomControl: true,
          attributionControl: true
        }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap"
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;

      const clearLayer = (layer: any) => {
        if (!layer) return;
        try {
          map.removeLayer(layer);
        } catch (e) {
        }
      };

      clearLayer(markerRef.current);
      markerRef.current = null;
      clearLayer(fromMarkerRef.current);
      fromMarkerRef.current = null;
      clearLayer(toMarkerRef.current);
      toMarkerRef.current = null;
      clearLayer(routeLayerRef.current);
      routeLayerRef.current = null;

      const hasDirections = !!(from && to);
      const hasSearch = !!query;

      if (!hasDirections && !hasSearch) {
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        return;
      }

      const isMyLocation = (s: string) => {
        const t = String(s || "").trim().toLowerCase();
        return t === "my location" || t === "my current location" || t === "current location" || t === "my place";
      };

      const getBrowserLocation = async (): Promise<[number, number] | null> => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return null;
        return await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
          );
        });
      };

      const geocode = async (q: string): Promise<[number, number] | null> => {
        const text = String(q || "").trim();
        if (!text) return null;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=1`,
            { headers: { "Accept": "application/json" } }
          );
          const json = await res.json();
          const first = Array.isArray(json) ? json[0] : null;
          const lat = first && first.lat ? Number(first.lat) : NaN;
          const lon = first && first.lon ? Number(first.lon) : NaN;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return [lat, lon];
        } catch (e) {
          return null;
        }
      };

      if (hasDirections) {
        const fromCoord = isMyLocation(from) ? await getBrowserLocation() : await geocode(from);
        const toCoord = isMyLocation(to) ? await getBrowserLocation() : await geocode(to);
        if (!fromCoord || !toCoord) {
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
          return;
        }

        const [fromLat, fromLon] = fromCoord;
        const [toLat, toLon] = toCoord;

        fromMarkerRef.current = L.circleMarker([fromLat, fromLon], {
          radius: 7,
          color: "#22c55e",
          weight: 3,
          fillOpacity: 0.9
        }).addTo(map);
        toMarkerRef.current = L.circleMarker([toLat, toLon], {
          radius: 7,
          color: "#ef4444",
          weight: 3,
          fillOpacity: 0.9
        }).addTo(map);

        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
          const res = await fetch(osrmUrl, { headers: { "Accept": "application/json" } });
          const json = await res.json();
          const coords = json && Array.isArray(json.routes) && json.routes[0] && json.routes[0].geometry && Array.isArray(json.routes[0].geometry.coordinates)
            ? json.routes[0].geometry.coordinates
            : null;

          if (!coords || !coords.length) {
            map.fitBounds(L.latLngBounds([fromCoord, toCoord]).pad(0.2));
            return;
          }

          const latLngs = coords.map((c: any) => [Number(c[1]), Number(c[0])]);
          routeLayerRef.current = L.polyline(latLngs, {
            color: "#ff2d2d",
            weight: 5,
            opacity: 0.95
          }).addTo(map);

          map.fitBounds(routeLayerRef.current.getBounds().pad(0.2));
        } catch (e) {
          map.fitBounds(L.latLngBounds([fromCoord, toCoord]).pad(0.2));
        }

        return;
      }

      if (hasSearch) {
        const coord = await geocode(query);
        if (!coord) {
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
          return;
        }
        const [lat, lon] = coord;
        markerRef.current = L.marker([lat, lon]).addTo(map);
        markerRef.current.bindPopup(title).openPopup();
        map.setView([lat, lon], 14);
        return;
      }
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, [from, to, query, title]);

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#0b0f14", color: "white" }}>
      <div style={{ padding: "10px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace", fontSize: 14, opacity: 0.9 }}>
        {title}
      </div>
      <div ref={mapElRef} style={{ height: "calc(100vh - 44px)", width: "100%" }} />
    </div>
  );
}
