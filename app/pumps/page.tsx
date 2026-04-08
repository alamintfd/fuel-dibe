"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { stationsDirectory } from "../stationsDirectory";

type CustomStation = {
  id: string;
  stationName: string;
  location: string;
  mapsLink?: string;
  fuelType?: string;
  lat?: number | null;
  lng?: number | null;
  archived?: boolean;
};

type CombinedStation = {
  id: string;
  stationName: string;
  location: string;
  mapsLink?: string;
  fuelType?: string;
  lat?: number | null;
  lng?: number | null;
  source: "directory" | "custom";
};

export default function PumpsPage() {
  const [customStations, setCustomStations] = useState<CustomStation[]>([]);
  const [searchText, setSearchText] = useState("");
  const [archivedStationIds, setArchivedStationIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editingStation, setEditingStation] = useState<CombinedStation | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editMapsLink, setEditMapsLink] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleOpenEdit = (station: CombinedStation) => {
    setEditingStation(station);
    setEditName(station.stationName);
    setEditLocation(station.location);
    setEditMapsLink(station.mapsLink || "");
    setEditLat(station.lat != null ? String(station.lat) : "");
    setEditLng(station.lng != null ? String(station.lng) : "");
  };

  const handleSaveEdit = async () => {
    if (!editingStation || !editName.trim() || !editLocation.trim()) {
      alert("Station name and location are required");
      return;
    }
    try {
      setIsSavingEdit(true);
      const data = {
        stationName: editName.trim(),
        location: editLocation.trim(),
        mapsLink: editMapsLink.trim(),
        lat: editLat.trim() ? parseFloat(editLat) : null,
        lng: editLng.trim() ? parseFloat(editLng) : null,
      };
      if (editingStation.source === "custom") {
        await updateDoc(doc(db, "fuelStations", editingStation.id), data);
      } else {
        await addDoc(collection(db, "fuelStations"), {
          ...data,
          fuelType: editingStation.fuelType || "",
          createdAt: serverTimestamp(),
          isCommunityCorrection: true,
        });
      }
      setEditingStation(null);
      alert("Station updated — thank you for contributing!");
    } catch (err) {
      console.error(err);
      alert("Could not save changes");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteStation = async (stationId: string, stationName: string, source: "custom" | "directory") => {
    const confirmed = window.confirm(
      `Remove "${stationName}" from the directory?\n\nThis marks it as permanently closed for all users.`
    );
    if (!confirmed) return;
    try {
      if (source === "custom") {
        await updateDoc(doc(db, "fuelStations", stationId), { archived: true });
      } else {
        await addDoc(collection(db, "archivedStations"), {
          stationId,
          stationName,
          createdAt: serverTimestamp(),
        });
      }
      const updated = new Set([...archivedStationIds, stationId]);
      setArchivedStationIds(updated);
    } catch (err) {
      console.error(err);
      alert("Could not remove station");
    }
  };

  // Subscribe to archived stations from Firestore
  useEffect(() => {
    const q = query(collection(db, "archivedStations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ids = new Set(snapshot.docs.map((d) => d.data().stationId as string));
      setArchivedStationIds(ids);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "fuelStations"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: CustomStation[] = snapshot.docs.map((docItem) => {
        const item = docItem.data();
        return {
          id: docItem.id,
          stationName: item.stationName || "",
          location: item.location || "",
          mapsLink: item.mapsLink || "",
          fuelType: item.fuelType || "",
          lat: typeof item.lat === "number" ? item.lat : null,
          lng: typeof item.lng === "number" ? item.lng : null,
          archived: item.archived === true,
        };
      });
      setCustomStations(items);
    });
    return () => unsubscribe();
  }, []);

  const directoryStations: CombinedStation[] = useMemo(() => {
    return stationsDirectory.map((item) => ({
      id: `dir-${item.id}`,
      stationName: item.stationName,
      location: item.address,
      mapsLink: item.googleMapsUrl,
      fuelType: item.fuelType,
      source: "directory" as const,
    }));
  }, []);

  const customCombinedStations: CombinedStation[] = useMemo(() => {
    return customStations
      .filter(
        (item) =>
          item.stationName.trim() &&
          item.location.trim() &&
          !item.archived &&
          !archivedStationIds.has(item.id) &&
          item.stationName.toLowerCase().trim() !== "alamin er pump"
      )
      .map((item) => ({
        id: item.id,
        stationName: item.stationName,
        location: item.location,
        mapsLink: item.mapsLink || "",
        fuelType: item.fuelType || "",
        lat: item.lat ?? null,
        lng: item.lng ?? null,
        source: "custom" as const,
      }));
  }, [customStations]);

  const allStations: CombinedStation[] = useMemo(() => {
    const merged = [...customCombinedStations];
    for (const dirStation of directoryStations) {
      if (archivedStationIds.has(dirStation.id)) continue;
      const exists = merged.some((item) => {
        const a = item.stationName.toLowerCase().trim();
        const b = dirStation.stationName.toLowerCase().trim();
        const c = item.location.toLowerCase().trim();
        const d = dirStation.location.toLowerCase().trim();
        return a === b && c === d;
      });
      if (!exists) merged.push(dirStation);
    }
    return merged;
  }, [customCombinedStations, directoryStations]);

  const filteredStations = useMemo(() => {
    if (!searchText.trim()) return allStations;
    const q = searchText.toLowerCase().trim();
    return allStations.filter(
      (station) =>
        station.stationName.toLowerCase().includes(q) ||
        station.location.toLowerCase().includes(q)
    );
  }, [allStations, searchText]);

  return (
    <div style={pageStyle}>

      {/* ─── Edit Modal ─── */}
      {editingStation && (
        <div style={modalOverlayStyle}>
          <div style={editModalStyle}>
            <div style={editModalHeaderStyle}>
              <div style={editModalTitleStyle}>✏️ Edit Station Info</div>
              <div style={editModalSubStyle}>
                {editingStation.source === "directory"
                  ? "Your correction will be submitted as a community contribution"
                  : "Update the station details directly"}
              </div>
            </div>

            <div style={editFieldGroupStyle}>
              <label style={editLabelStyle}>Station Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Official station name"
                style={editInputStyle}
              />
            </div>

            <div style={editFieldGroupStyle}>
              <label style={editLabelStyle}>Address / Area</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Charigram, Narsingdi"
                style={editInputStyle}
              />
            </div>

            <div style={editFieldGroupStyle}>
              <label style={editLabelStyle}>Google Maps Link</label>
              <input
                type="text"
                value={editMapsLink}
                onChange={(e) => setEditMapsLink(e.target.value)}
                placeholder="https://maps.google.com/..."
                style={editInputStyle}
              />
            </div>

            <div style={editTwoColStyle}>
              <div style={editFieldGroupStyle}>
                <label style={editLabelStyle}>Latitude</label>
                <input
                  type="text"
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                  placeholder="23.8103"
                  style={editInputStyle}
                />
              </div>
              <div style={editFieldGroupStyle}>
                <label style={editLabelStyle}>Longitude</label>
                <input
                  type="text"
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                  placeholder="90.4125"
                  style={editInputStyle}
                />
              </div>
            </div>

            <div style={editActionsStyle}>
              <button style={editSaveBtnStyle} onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? "Saving..." : "Save Correction"}
              </button>
              <button style={editCancelBtnStyle} onClick={() => setEditingStation(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Navbar ─── */}
      <div style={navStyle}>
        <div style={brandRowStyle}>
          <div style={logoMarkStyle}>⛽</div>
          <div style={logoTextStyle}>
            Fuel<span style={{ color: "#F59E0B" }}>Dibe</span>
          </div>
        </div>
        <Link href="/" style={navLinkStyle}>← Back Home</Link>
      </div>

      {/* ─── Hero ─── */}
      <div style={heroStyle}>
        <h1 style={heroTitleStyle}>Pump Directory</h1>
        <p style={heroSubStyle}>
          Full Dhaka pump list plus user-added stations — all searchable, all editable.
        </p>
      </div>

      <div style={mainWrapStyle}>
        <div style={panelStyle}>
          <input
            type="text"
            placeholder="Search station name or area..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={inputStyle}
          />

          <div style={metaTextStyle}>
            {filteredStations.length} pump{filteredStations.length !== 1 ? "s" : ""} found
            {searchText ? ` for "${searchText}"` : ""}
          </div>

          <div style={stationGridStyle}>
            {filteredStations.length > 0 ? (
              filteredStations.map((station) => (
                <div key={station.id} style={stationCardStyle}>
                  <div style={cardHeaderRowStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={stationTitleStyle}>{station.stationName}</div>
                      <div style={stationLocationStyle}>{station.location}</div>
                    </div>
                    <button
                      style={editSmallBtnStyle}
                      onClick={() => handleOpenEdit(station)}
                      title="Suggest a correction"
                    >
                      ✏️
                    </button>
                  </div>

                  <div style={badgeRowStyle}>
                    <span style={station.source === "directory" ? directoryBadgeStyle : customBadgeStyle}>
                      {station.source === "directory" ? "Directory" : "User Added"}
                    </span>
                    {station.fuelType && (
                      <span style={fuelBadgeStyle}>{station.fuelType}</span>
                    )}
                  </div>

                  {station.mapsLink && (
                    <a href={station.mapsLink} target="_blank" rel="noreferrer" style={mapsLinkStyle}>
                      Open in Google Maps →
                    </a>
                  )}

                  <button
                    style={deleteStationBtnStyle}
                    onClick={() => handleDeleteStation(station.id, station.stationName, station.source)}
                  >
                    🗑️ Remove Station
                  </button>
                </div>
              ))
            ) : (
              <div style={emptyStyle}>No pumps found.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── STYLES ─────────────────────────── */

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0C0C0C",
  color: "#F0EDE8",
  fontFamily: "Arial, sans-serif",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.8)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const editModalStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: "28px",
  padding: "30px",
  maxWidth: "480px",
  width: "100%",
  boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const editModalHeaderStyle: React.CSSProperties = { marginBottom: "22px" };
const editModalTitleStyle: React.CSSProperties = { fontSize: "20px", fontWeight: 900, marginBottom: "4px" };
const editModalSubStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c" };

const editFieldGroupStyle: React.CSSProperties = { marginBottom: "14px" };

const editLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "6px",
};

const editInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

const editTwoColStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
};

const editActionsStyle: React.CSSProperties = { display: "grid", gap: "10px", marginTop: "6px" };

const editSaveBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
  color: "#111",
  fontWeight: 900,
  fontSize: "14px",
  cursor: "pointer",
};

const editCancelBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid #2e2e2e",
  background: "transparent",
  color: "#8c8c8c",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const editSmallBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid #2a2a2a",
  background: "#1e1e1e",
  color: "#d1d5db",
  fontSize: "13px",
  cursor: "pointer",
  flexShrink: 0,
};

const navStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1000,
  minHeight: "64px",
  padding: "12px 22px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  flexWrap: "wrap",
  borderBottom: "1px solid #232323",
  background: "rgba(12,12,12,0.92)",
  backdropFilter: "blur(10px)",
};

const brandRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px" };

const logoMarkStyle: React.CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "12px",
  background: "#F59E0B",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
};

const logoTextStyle: React.CSSProperties = { fontSize: "22px", fontWeight: 800, letterSpacing: "-0.5px" };

const navLinkStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "999px",
  border: "1px solid #333",
  background: "#151515",
  color: "#fff",
  fontWeight: 700,
  fontSize: "13px",
  textDecoration: "none",
};

const heroStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "60px 20px 34px",
  borderBottom: "1px solid #222",
};

const heroTitleStyle: React.CSSProperties = {
  fontSize: "clamp(30px, 5vw, 52px)",
  lineHeight: 1.05,
  fontWeight: 900,
  letterSpacing: "-1px",
  marginBottom: "12px",
};

const heroSubStyle: React.CSSProperties = {
  maxWidth: "700px",
  margin: "0 auto",
  color: "#9a9a9a",
  fontSize: "16px",
  lineHeight: 1.7,
};

const mainWrapStyle: React.CSSProperties = {
  maxWidth: "1140px",
  margin: "0 auto",
  padding: "34px 22px 60px",
};

const panelStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #262626",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 0 24px rgba(255,255,255,0.04)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  marginBottom: "10px",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const metaTextStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c", marginBottom: "18px" };

const stationGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "14px",
};

const stationCardStyle: React.CSSProperties = {
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: "20px",
  padding: "18px",
};

const cardHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  marginBottom: "10px",
};

const stationTitleStyle: React.CSSProperties = { fontSize: "16px", fontWeight: 800, marginBottom: "4px" };
const stationLocationStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c", lineHeight: 1.5 };

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "12px",
};

const directoryBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(245,158,11,0.12)",
  color: "#F59E0B",
  fontWeight: 800,
  fontSize: "11px",
};

const customBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(34,197,94,0.12)",
  color: "#22C55E",
  fontWeight: 800,
  fontSize: "11px",
};

const fuelBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(59,130,246,0.12)",
  color: "#60A5FA",
  fontWeight: 800,
  fontSize: "11px",
};

const mapsLinkStyle: React.CSSProperties = {
  color: "#F59E0B",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: "13px",
  display: "block",
  marginBottom: "10px",
};

const deleteStationBtnStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "8px",
  color: "#ef4444",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
  padding: "6px 10px",
  width: "100%",
  textAlign: "left",
};

const emptyStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  background: "#171717",
  border: "1px solid #2A2A2A",
  borderRadius: "18px",
  padding: "30px",
  textAlign: "center",
  color: "#777",
};
