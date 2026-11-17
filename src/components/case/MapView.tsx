"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/** An OpenStreetMap map of one area: its outline when known, and a marker at its centre. */
export function MapView({ lat, lon, bbox, label }: { lat: number; lon: number; bbox: [number, number, number, number] | null; label: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    // Leaflet touches window on import, so it loads in the browser only.
    void import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      if (bbox) {
        // Nominatim gives [south, north, west, east].
        const bounds = L.latLngBounds([bbox[0], bbox[2]], [bbox[1], bbox[3]]);
        L.rectangle(bounds, { color: "#ED5A31", weight: 1.5, fillOpacity: 0.06 }).addTo(map);
        map.fitBounds(bounds, { padding: [16, 16], maxZoom: 16 });
      } else {
        map.setView([lat, lon], 14);
      }
      L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#ED5A31", fillOpacity: 1 }).bindTooltip(label).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lon, bbox, label]);

  return <div ref={el} className="relative z-0 h-[300px] w-full overflow-hidden rounded-xl border border-line" role="img" aria-label={`Map of ${label}`} />;
}
