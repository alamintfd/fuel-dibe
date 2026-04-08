"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

type Station = {
  id?: string;
  stationName?: string;
  location?: string;
  fuelType?: string;
  queueStatus?: string;
  lat?: number | null;
  lng?: number | null;
};

function LocationPicker({
  onSelect,
}: {
  onSelect?: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (onSelect) {
        onSelect(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

function RecenterMap({
  lat,
  lng,
}: {
  lat?: number | null;
  lng?: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (
      typeof lat === "number" &&
      !Number.isNaN(lat) &&
      typeof lng === "number" &&
      !Number.isNaN(lng)
    ) {
      map.setView([lat, lng], 13);
    }
  }, [lat, lng, map]);

  return null;
}

function getIcon(queue: string) {
  let color = "green";

  if (queue?.toLowerCase().includes("medium")) color = "orange";
  if (queue?.toLowerCase().includes("high")) color = "red";

  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl:
      "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
}

export default function Map({
  stations,
  onMapClick,
  userLat,
  userLng,
}: {
  stations: Station[];
  onMapClick?: (lat: number, lng: number) => void;
  userLat?: number | null;
  userLng?: number | null;
}) {
  const safeCenter: [number, number] = [23.8103, 90.4125];

  return (
    <MapContainer
      center={safeCenter}
      zoom={12}
      style={{ height: "400px", width: "100%", borderRadius: "12px" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <RecenterMap lat={userLat} lng={userLng} />

      {onMapClick && <LocationPicker onSelect={onMapClick} />}

      {typeof userLat === "number" &&
        !Number.isNaN(userLat) &&
        typeof userLng === "number" &&
        !Number.isNaN(userLng) && (
          <CircleMarker
            center={[userLat, userLng]}
            radius={10}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#60a5fa",
              fillOpacity: 0.9,
            }}
          >
            <Popup>You are here</Popup>
          </CircleMarker>
        )}

      {stations
        .filter(
          (station) =>
            typeof station.lat === "number" &&
            station.lat !== null &&
            !Number.isNaN(station.lat) &&
            typeof station.lng === "number" &&
            station.lng !== null &&
            !Number.isNaN(station.lng)
        )
        .map((station, index) => (
          <Marker
            key={station.id || index}
            position={[station.lat as number, station.lng as number]}
            icon={getIcon(station.queueStatus || "")}
          >
            <Popup>
              <strong>{station.stationName || "Unknown Station"}</strong>
              <br />
              {station.location || "No location"}
              <br />
              {station.fuelType || "No fuel type"}
              <br />
              Queue: {station.queueStatus || "N/A"}
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
