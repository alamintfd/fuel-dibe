"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { stationsDirectory } from "./stationsDirectory";

const Map = dynamic(() => import("./Map"), { ssr: false });

type CombinedStation = {
  id: string;
  stationName: string;
  location: string;
  mapsLink?: string;
  lat?: number | null;
  lng?: number | null;
  fuelType?: string;
  source: "directory" | "custom";
};

type FuelReport = {
  id: string;
  stationId: string;
  stationName: string;
  location: string;
  status: "active" | "fuel_finished" | "closed";
  availableFuelType: string;
  startTime: string;
  reporterName?: string;
  createdAt?: any;
  mapsLink?: string;
  confirmVotes?: number;
  wrongVotes?: number;
  closedVotes?: number;
};

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

type LivePump = CombinedStation & {
  latestReport?: FuelReport;
  distanceKm?: number | null;
};

const dummyActivePumps: LivePump[] = [
  {
    id: "dummy-1",
    stationName: "Trust Filling Station",
    location: "Bijoy Sarani, Tejgaon, Dhaka",
    mapsLink: "https://www.google.com/maps/search/Trust+Filling+Station+Bijoy+Sarani,+Tejgaon,+Dhaka",
    lat: 23.7645, lng: 90.3892, fuelType: "Petrol", source: "directory",
    latestReport: { id: "dummy-report-1", stationId: "dummy-1", stationName: "Trust Filling Station", location: "Bijoy Sarani, Tejgaon, Dhaka", status: "active", availableFuelType: "Petrol", startTime: "8:00 AM", reporterName: "Community User", confirmVotes: 5, wrongVotes: 0, closedVotes: 0 },
  },
  {
    id: "dummy-2",
    stationName: "Royal Filling Station",
    location: "Mohakhali, Dhaka",
    mapsLink: "https://www.google.com/maps/search/Royal+Filling+Station+Mohakhali,+Dhaka",
    lat: 23.778, lng: 90.3975, fuelType: "Octane", source: "directory",
    latestReport: { id: "dummy-report-2", stationId: "dummy-2", stationName: "Royal Filling Station", location: "Mohakhali, Dhaka", status: "active", availableFuelType: "Octane", startTime: "9:15 AM", reporterName: "Community User", confirmVotes: 4, wrongVotes: 1, closedVotes: 0 },
  },
  {
    id: "dummy-3",
    stationName: "Mirpur Filling Station",
    location: "Mirpur-1, Dhaka",
    mapsLink: "https://www.google.com/maps/search/Mirpur+Filling+Station+Mirpur-1,+Dhaka",
    lat: 23.8041, lng: 90.3537, fuelType: "Diesel", source: "directory",
    latestReport: { id: "dummy-report-3", stationId: "dummy-3", stationName: "Mirpur Filling Station", location: "Mirpur-1, Dhaka", status: "active", availableFuelType: "Diesel", startTime: "7:40 AM", reporterName: "Community User", confirmVotes: 3, wrongVotes: 0, closedVotes: 0 },
  },
  {
    id: "dummy-4",
    stationName: "Gulshan Filling Station",
    location: "Gulshan, Dhaka",
    mapsLink: "https://www.google.com/maps/search/Gulshan+Filling+Station+Gulshan,+Dhaka",
    lat: 23.7925, lng: 90.4078, fuelType: "Petrol", source: "directory",
    latestReport: { id: "dummy-report-4", stationId: "dummy-4", stationName: "Gulshan Filling Station", location: "Gulshan, Dhaka", status: "active", availableFuelType: "Petrol", startTime: "10:10 AM", reporterName: "Community User", confirmVotes: 6, wrongVotes: 0, closedVotes: 0 },
  },
];

export default function Home() {
  const [activeView, setActiveView] = useState<"submit" | "add">("submit");
  const [customStations, setCustomStations] = useState<CustomStation[]>([]);
  const [reports, setReports] = useState<FuelReport[]>([]);

  const [stationQuery, setStationQuery] = useState("");
  const [selectedStation, setSelectedStation] = useState<CombinedStation | null>(null);

  const [reportStatus, setReportStatus] = useState<"active" | "fuel_finished" | "closed">("active");
  const [availableFuelType, setAvailableFuelType] = useState("Petrol");

  const [newStationName, setNewStationName] = useState("");
  const [newStationLocation, setNewStationLocation] = useState("");
  const [newStationMapsLink, setNewStationMapsLink] = useState("");
  const [newStationFuelType, setNewStationFuelType] = useState("Petrol");
  const [newStationLat, setNewStationLat] = useState("");
  const [newStationLng, setNewStationLng] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Per-browser vote tracking (localStorage)
  const [userVotes, setUserVotes] = useState<Record<string, "confirm" | "wrong" | "closed">>({});
  // Stations the community has flagged as permanently closed
  const [archivedStationIds, setArchivedStationIds] = useState<Set<string>>(new Set());

  const [liveSearchText, setLiveSearchText] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState("Allow location to see nearby pumps");
  const [showLocationModal, setShowLocationModal] = useState(true);

  // Edit station states
  const [editingStation, setEditingStation] = useState<CombinedStation | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editMapsLink, setEditMapsLink] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const requestLocation = () => {
    setShowLocationModal(false);
    if (!navigator.geolocation) {
      setGeoStatus("Geolocation not supported by your browser");
      return;
    }
    setGeoStatus("Detecting your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("Nearby pumps sorted by your location");
      },
      () => {
        setGeoStatus("Location access denied — enable in browser settings");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const query = address.includes("Bangladesh") ? address : `${address}, Bangladesh`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch {}
    return null;
  };

  const getCurrentTime = () =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const handleOpenEdit = (station: CombinedStation, e: React.MouseEvent) => {
    e.stopPropagation();
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
        // Directory station — submit as community correction
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

  // Load votes from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fueldibe_votes");
      if (saved) setUserVotes(JSON.parse(saved));
    } catch {}
  }, []);

  // Subscribe to archived directory stations from Firestore
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

  useEffect(() => {
    const q = query(collection(db, "fuelReports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: FuelReport[] = snapshot.docs.map((docItem) => {
        const item = docItem.data();
        return {
          id: docItem.id,
          stationId: item.stationId || "",
          stationName: item.stationName || "",
          location: item.location || "",
          status: item.status || "active",
          availableFuelType: item.availableFuelType || "",
          startTime: item.startTime || "",
          reporterName: item.reporterName || "Community User",
          createdAt: item.createdAt,
          mapsLink: item.mapsLink || "",
          confirmVotes: item.confirmVotes || 0,
          wrongVotes: item.wrongVotes || 0,
          closedVotes: item.closedVotes || 0,
        };
      });
      setReports(items);
    });
    return () => unsubscribe();
  }, []);

  const directoryCombinedStations: CombinedStation[] = useMemo(() => {
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
    for (const dirStation of directoryCombinedStations) {
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
  }, [customCombinedStations, directoryCombinedStations]);

  const stationSuggestions = useMemo(() => {
    if (!stationQuery.trim()) return [];
    const q = stationQuery.toLowerCase().trim();
    return allStations
      .filter(
        (station) =>
          station.stationName.toLowerCase().includes(q) ||
          station.location.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [allStations, stationQuery]);

  const getLatestReportForStation = (stationId: string) => {
    return reports.find((report) => report.stationId === stationId);
  };

  const realActivePumps: LivePump[] = useMemo(() => {
    return allStations
      .map((station) => ({
        ...station,
        latestReport: getLatestReportForStation(station.id),
      }))
      .filter(
        (station) =>
          station.latestReport?.status === "active" &&
          (station.latestReport?.closedVotes || 0) < 3 &&
          station.stationName.toLowerCase().trim() !== "alamin er pump" &&
          !archivedStationIds.has(station.id)
      );
  }, [allStations, reports]);

  const mergedLivePumps: LivePump[] = useMemo(() => {
    const merged = [...realActivePumps];
    for (const dummy of dummyActivePumps) {
      const exists = merged.some(
        (item) =>
          item.stationName.toLowerCase().trim() === dummy.stationName.toLowerCase().trim()
      );
      if (!exists) merged.push(dummy);
    }
    return merged;
  }, [realActivePumps]);

  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const livePumpsWithDistance: LivePump[] = useMemo(() => {
    return mergedLivePumps.map((pump) => {
      if (userCoords && typeof pump.lat === "number" && typeof pump.lng === "number") {
        return { ...pump, distanceKm: getDistanceKm(userCoords.lat, userCoords.lng, pump.lat, pump.lng) };
      }
      return { ...pump, distanceKm: null };
    });
  }, [mergedLivePumps, userCoords]);

  const filteredLivePumps = useMemo(() => {
    return livePumpsWithDistance
      .filter((pump) =>
        !liveSearchText.trim()
          ? true
          : pump.stationName.toLowerCase().includes(liveSearchText.toLowerCase()) ||
            pump.location.toLowerCase().includes(liveSearchText.toLowerCase())
      )
      .sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [livePumpsWithDistance, liveSearchText]);

  const trendingPumps = useMemo(() => {
    return [...filteredLivePumps]
      .sort((a, b) => {
        const av = (a.latestReport?.confirmVotes || 0) - (a.latestReport?.wrongVotes || 0) - (a.latestReport?.closedVotes || 0);
        const bv = (b.latestReport?.confirmVotes || 0) - (b.latestReport?.wrongVotes || 0) - (b.latestReport?.closedVotes || 0);
        return bv - av;
      })
      .slice(0, 4);
  }, [filteredLivePumps]);

  const activeMapStations = useMemo(() => {
    return filteredLivePumps.filter(
      (station) =>
        typeof station.lat === "number" &&
        typeof station.lng === "number" &&
        station.stationName.toLowerCase().trim() !== "alamin er pump"
    );
  }, [filteredLivePumps]);

  const handleChooseStation = (station: CombinedStation) => {
    setSelectedStation(station);
    setStationQuery(station.stationName);
  };

  const getReportAge = (createdAt: any) => {
    if (!createdAt?.seconds) return "Demo";
    const diff = Math.floor((Date.now() - createdAt.seconds * 1000) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  const handleSubmitReport = async () => {
    if (!selectedStation) {
      alert("Please choose a station first");
      return;
    }
    try {
      setIsSubmitting(true);
      await addDoc(collection(db, "fuelReports"), {
        stationId: selectedStation.id,
        stationName: selectedStation.stationName,
        location: selectedStation.location,
        mapsLink: selectedStation.mapsLink || "",
        status: reportStatus,
        availableFuelType,
        startTime: getCurrentTime(),
        reporterName: "Community User",
        confirmVotes: 0,
        wrongVotes: 0,
        closedVotes: reportStatus === "closed" ? 1 : 0,
        createdAt: serverTimestamp(),
      });
      setReportStatus("active");
      setAvailableFuelType("Petrol");
      setStationQuery("");
      setSelectedStation(null);
      alert("Fuel update submitted successfully");
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStation = async () => {
    if (!newStationName.trim() || !newStationLocation.trim()) {
      alert("Please enter station name and address");
      return;
    }
    try {
      setIsAddingStation(true);

      let finalLat: number | null = newStationLat.trim() ? parseFloat(newStationLat) : null;
      let finalLng: number | null = newStationLng.trim() ? parseFloat(newStationLng) : null;

      // Auto-geocode from address if lat/lng not provided
      if (finalLat === null || finalLng === null) {
        setIsGeocoding(true);
        const coords = await geocodeAddress(newStationLocation);
        setIsGeocoding(false);
        if (coords) {
          finalLat = coords.lat;
          finalLng = coords.lng;
        }
      }

      await addDoc(collection(db, "fuelStations"), {
        stationName: newStationName.trim(),
        location: newStationLocation.trim(),
        mapsLink: newStationMapsLink.trim(),
        fuelType: newStationFuelType,
        lat: finalLat,
        lng: finalLng,
        createdAt: serverTimestamp(),
      });
      setNewStationName("");
      setNewStationLocation("");
      setNewStationMapsLink("");
      setNewStationFuelType("Petrol");
      setNewStationLat("");
      setNewStationLng("");
      alert("Fuel station added successfully" + (finalLat ? " — location detected automatically!" : ""));
      setActiveView("submit");
    } catch (error) {
      console.error(error);
      alert("Could not add station");
    } finally {
      setIsAddingStation(false);
      setIsGeocoding(false);
    }
  };

  const handleVote = async (reportId: string, voteType: "confirm" | "wrong" | "closed") => {
    if (reportId.startsWith("dummy-")) {
      alert("Demo pumps cannot be voted on");
      return;
    }

    const existingVote = userVotes[reportId];

    // Clicking the same vote again = no-op
    if (existingVote === voteType) return;

    try {
      const reportRef = doc(db, "fuelReports", reportId);

      // Remove previous vote if user is changing
      if (existingVote) {
        const dec: Record<string, any> = {};
        if (existingVote === "confirm") dec.confirmVotes = increment(-1);
        if (existingVote === "wrong")   dec.wrongVotes   = increment(-1);
        if (existingVote === "closed")  dec.closedVotes  = increment(-1);
        await updateDoc(reportRef, dec);
      }

      // Add new vote
      const inc: Record<string, any> = {};
      if (voteType === "confirm") inc.confirmVotes = increment(1);
      if (voteType === "wrong")   inc.wrongVotes   = increment(1);
      if (voteType === "closed")  inc.closedVotes  = increment(1);
      await updateDoc(reportRef, inc);

      // Persist to localStorage
      const updated = { ...userVotes, [reportId]: voteType };
      setUserVotes(updated);
      localStorage.setItem("fueldibe_votes", JSON.stringify(updated));
    } catch (error) {
      console.error(error);
      alert("Could not save vote");
    }
  };

  const handleDeleteStation = async (stationId: string, stationName: string, source: "custom" | "directory") => {
    const confirmed = window.confirm(
      `Remove "${stationName}" from the live list?\n\nThis marks it as permanently closed for all users.`
    );
    if (!confirmed) return;

    try {
      if (source === "custom") {
        await updateDoc(doc(db, "fuelStations", stationId), { archived: true });
      } else {
        // For directory stations, write to archivedStations collection
        await addDoc(collection(db, "archivedStations"), {
          stationId,
          stationName,
          createdAt: serverTimestamp(),
        });
      }
      // Update local state so it disappears immediately
      const updated = new Set([...archivedStationIds, stationId]);
      setArchivedStationIds(updated);
    } catch (err) {
      console.error(err);
      alert("Could not remove station");
    }
  };

  return (
    <div style={pageStyle}>

      {/* ─── Location Permission Modal ─── */}
      {showLocationModal && (
        <div style={modalOverlayStyle}>
          <div style={locationModalStyle}>
            <div style={locationModalIconStyle}>📍</div>
            <div style={locationModalTitleStyle}>Enable Nearby Pump Detection</div>
            <div style={locationModalSubStyle}>
              FuelDibe will sort active pumps by distance from your current location, so you find fuel faster.
            </div>
            <button style={locationAllowBtnStyle} onClick={requestLocation}>
              Allow Location Access
            </button>
            <button
              style={locationSkipBtnStyle}
              onClick={() => {
                setShowLocationModal(false);
                setGeoStatus("Location skipped — pumps shown without distance");
              }}
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* ─── Edit Station Modal ─── */}
      {editingStation && (
        <div style={modalOverlayStyle}>
          <div style={editModalStyle}>
            <div style={editModalHeaderStyle}>
              <div style={editModalTitleStyle}>✏️ Edit Station Info</div>
              <div style={editModalSubStyle}>Your correction helps the whole community</div>
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

        <div style={navActionsStyle}>
          <button
            type="button"
            style={activeView === "submit" ? navPrimaryButtonStyle : navButtonStyle}
            onClick={() => {
              setActiveView("submit");
              setTimeout(() => document.getElementById("action-section")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
          >
            Submit Fuel Update
          </button>

          <button
            type="button"
            style={activeView === "add" ? navPrimaryButtonStyle : navButtonStyle}
            onClick={() => {
              setActiveView("add");
              setTimeout(() => document.getElementById("action-section")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
          >
            Add Fuel Station
          </button>

          <button
            type="button"
            style={navButtonStyle}
            onClick={() => {
              document.getElementById("live-fuel-pumps-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Live Fuel Pumps
          </button>

          <button
            type="button"
            style={navButtonStyle}
            onClick={() => {
              document.getElementById("map-section")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Map
          </button>

          <Link href="/pumps" style={navLinkStyle}>
            Pump List
          </Link>
        </div>
      </div>

      {/* ─── Hero ─── */}
      <div style={heroStyle}>
        <div style={heroBadgeStyle}>⚡ Community-powered fuel tracking</div>
        <h1 style={heroTitleStyle}>Search Fuel Pump</h1>
        <p style={heroSubStyle}>
          Nearby active pumps, trending stations, live badges, and community voting.
        </p>
      </div>

      <div style={mainWrapStyle}>

        {/* ─── Search Box ─── */}
        <div style={searchBoxStyle}>
          <div style={searchTitleStyle}>Pump Search</div>

          <div style={searchRowStyle}>
            <input
              type="text"
              placeholder="Type pump name or area..."
              value={stationQuery}
              onChange={(e) => { setStationQuery(e.target.value); setSelectedStation(null); }}
              style={searchInputStyle}
            />
            <button
              type="button"
              style={searchButtonStyle}
              onClick={() => { if (stationSuggestions.length > 0) handleChooseStation(stationSuggestions[0]); }}
            >
              GO
            </button>
          </div>

          {stationSuggestions.length > 0 && !selectedStation && (
            <div style={suggestionBoxStyle}>
              {stationSuggestions.map((station) => (
                <button
                  key={station.id}
                  onClick={() => handleChooseStation(station)}
                  style={suggestionItemStyle}
                >
                  <div style={{ fontWeight: 800 }}>{station.stationName}</div>
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "2px" }}>{station.location}</div>
                </button>
              ))}
            </div>
          )}

          {selectedStation && (
            <div style={selectedStationStyle}>
              <div>
                <div style={{ fontWeight: 800 }}>{selectedStation.stationName}</div>
                <div style={{ fontSize: "13px", color: "#999", marginTop: "2px" }}>{selectedStation.location}</div>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button style={editInlineBtnStyle} onClick={(e) => handleOpenEdit(selectedStation, e)}>
                  ✏️ Edit Info
                </button>
                {selectedStation.mapsLink && (
                  <a href={selectedStation.mapsLink} target="_blank" rel="noreferrer" style={mapsLinkStyle}>
                    Open in Maps
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Top Grid: Trending + Nearby ─── */}
        <div style={topGridStyle}>
          <div style={trendPanelStyle}>
            <div style={sectionTitleStyle}>🔥 Trending Pumps</div>
            <div style={sectionSubStyle}>Highest confirmed live pumps right now.</div>

            <div style={trendListStyle}>
              {trendingPumps.map((pump) => (
                <div key={pump.id} style={trendCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div>
                      <div style={trendNameStyle}>{pump.stationName}</div>
                      <div style={trendLocationStyle}>{pump.location}</div>
                    </div>
                    <button style={editSmallBtnStyle} onClick={(e) => handleOpenEdit(pump, e)} title="Suggest an edit">✏️</button>
                  </div>
                  <div style={trendBadgeRowStyle}>
                    <span style={liveBadgeStyle}>⚡ Active</span>
                    <span style={fuelBadgeStyle}>
                      {(pump.latestReport?.availableFuelType || pump.fuelType || "Unknown").toUpperCase()}
                    </span>
                    <span style={statusAgeBadgeStyle}>
                      {pump.latestReport?.createdAt ? getReportAge(pump.latestReport.createdAt) : "Demo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={panelStyle}>
            <div style={sectionTitleStyle}>📍 Nearby Pumps</div>
            <div style={sectionSubStyle}>
              {geoStatus}
              {!userCoords && (
                <button style={geoRetryBtnStyle} onClick={requestLocation}>
                  Enable Location
                </button>
              )}
            </div>

            <div style={nearbyListStyle}>
              {filteredLivePumps.slice(0, 5).map((pump) => (
                <div key={pump.id} style={nearbyCardStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={nearbyNameStyle}>{pump.stationName}</div>
                    <div style={nearbyLocationStyle}>{pump.location}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={distancePillStyle}>
                      {pump.distanceKm != null ? `${pump.distanceKm.toFixed(1)} km` : "—"}
                    </div>
                    <button style={editSmallBtnStyle} onClick={(e) => handleOpenEdit(pump, e)} title="Suggest an edit">✏️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Submit Report ─── */}
        {activeView === "submit" && (
          <div id="action-section" style={submitPanelStyle}>

            {/* Step 1 — Station Search */}
            <div style={submitStepStyle}>
              <div style={submitStepLabelStyle}>① Search Pump</div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Type pump name or area..."
                  value={stationQuery}
                  onChange={(e) => { setStationQuery(e.target.value); setSelectedStation(null); }}
                  style={submitSearchInputStyle}
                />
                {stationSuggestions.length > 0 && !selectedStation && (
                  <div style={submitSuggestionBoxStyle}>
                    {stationSuggestions.map((station) => (
                      <button
                        key={station.id}
                        onClick={() => handleChooseStation(station)}
                        style={submitSuggestionItemStyle}
                      >
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>{station.stationName}</div>
                        <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{station.location}</div>
                      </button>
                    ))}
                    <button
                      style={submitAddNewItemStyle}
                      onClick={() => {
                        if (stationQuery.trim()) setNewStationName(stationQuery.trim());
                        setActiveView("add");
                        setTimeout(() => document.getElementById("action-section")?.scrollIntoView({ behavior: "smooth" }), 50);
                      }}
                    >
                      <span style={{ color: "#F59E0B", fontWeight: 700 }}>+ Add "{stationQuery}" as new station</span>
                    </button>
                  </div>
                )}
              </div>

              {selectedStation && (
                <div style={submitSelectedStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: "15px" }}>{selectedStation.stationName}</div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>{selectedStation.location}</div>
                  </div>
                  <button
                    style={submitClearBtnStyle}
                    onClick={() => { setSelectedStation(null); setStationQuery(""); }}
                  >✕</button>
                </div>
              )}

              {!selectedStation && !stationQuery && (
                <button
                  style={submitAddNewBtnStyle}
                  onClick={() => {
                    setActiveView("add");
                    setTimeout(() => document.getElementById("action-section")?.scrollIntoView({ behavior: "smooth" }), 50);
                  }}
                >
                  + Can't find your pump? Add it
                </button>
              )}
            </div>

            {/* Step 2 — Status + Fuel Type */}
            <div style={submitStepStyle}>
              <div style={submitStepLabelStyle}>② Fuel Status</div>
              <div style={submitTwoColStyle}>
                <div style={{ flex: 1 }}>
                  <div style={submitFieldLabelStyle}>Current Status</div>
                  <select value={reportStatus} onChange={(e) => setReportStatus(e.target.value as any)} style={submitSelectStyle}>
                    <option value="active">✅ Fuel Available</option>
                    <option value="fuel_finished">⚠️ Fuel Finished</option>
                    <option value="closed">🔴 Station Closed</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={submitFieldLabelStyle}>Fuel Type</div>
                  <select value={availableFuelType} onChange={(e) => setAvailableFuelType(e.target.value)} style={submitSelectStyle}>
                    <option value="Petrol">Petrol</option>
                    <option value="Octane">Octane</option>
                    <option value="Diesel">Diesel</option>
                    <option value="CNG">CNG</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmitReport}
              style={selectedStation ? primaryButtonStyle : { ...primaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }}
              disabled={!selectedStation || isSubmitting}
            >
              {isSubmitting ? "Submitting..." : selectedStation ? `Submit Update for ${selectedStation.stationName}` : "Select a station first"}
            </button>
          </div>
        )}

        {/* ─── Add Station ─── */}
        {activeView === "add" && (
          <div id="action-section" style={panelStyle}>
            <div style={sectionTitleStyle}>Add Fuel Station</div>
            <div style={sectionSubStyle}>New stations appear in the directory and on the map when active. Coordinates are detected automatically from the address.</div>

            <div style={formCardStyle}>
              <input type="text" placeholder="Station name" value={newStationName} onChange={(e) => setNewStationName(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Address / area (e.g. Charigram Bazar, Narsingdi)" value={newStationLocation} onChange={(e) => setNewStationLocation(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Google Maps link (optional)" value={newStationMapsLink} onChange={(e) => setNewStationMapsLink(e.target.value)} style={inputStyle} />

              <select value={newStationFuelType} onChange={(e) => setNewStationFuelType(e.target.value)} style={selectStyleBlock}>
                <option value="Petrol">Petrol</option>
                <option value="Octane">Octane</option>
                <option value="Diesel">Diesel</option>
                <option value="CNG">CNG</option>
              </select>

              <div style={responsiveTwoInputsStyle}>
                <input type="text" placeholder="Latitude (optional)" value={newStationLat} onChange={(e) => setNewStationLat(e.target.value)} style={inputStyleNoMargin} />
                <input type="text" placeholder="Longitude (optional)" value={newStationLng} onChange={(e) => setNewStationLng(e.target.value)} style={inputStyleNoMargin} />
              </div>

              <button onClick={handleAddStation} style={primaryButtonStyle} disabled={isAddingStation || isGeocoding}>
                {isGeocoding ? "📍 Detecting location from address..." : isAddingStation ? "Adding..." : "Save New Station"}
              </button>
            </div>
          </div>
        )}

        {/* ─── Live Fuel Pumps ─── */}
        <div id="live-fuel-pumps-section" style={{ ...panelStyle, marginTop: "22px" }}>
          <div style={sectionTitleStyle}>⚡ Live Fuel Pumps</div>
          <div style={sectionSubStyle}>Community-verified active pumps with live badges and voting.</div>

          <div style={{ marginTop: "16px", marginBottom: "16px" }}>
            <input
              type="text"
              placeholder="Search live pumps..."
              value={liveSearchText}
              onChange={(e) => setLiveSearchText(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={stationGridStyle}>
            {filteredLivePumps.length > 0 ? (
              filteredLivePumps.map((pump) => {
                const confirms = pump.latestReport?.confirmVotes || 0;
                const wrongs = pump.latestReport?.wrongVotes || 0;
                const closed = pump.latestReport?.closedVotes || 0;
                const total = confirms + wrongs + closed;
                const reliabilityPct = total > 0 ? Math.round((confirms / total) * 100) : null;
                const barColor = reliabilityPct == null ? "#555"
                  : reliabilityPct >= 70 ? "#22c55e"
                  : reliabilityPct >= 40 ? "#f59e0b"
                  : "#ef4444";

                return (
                  <div key={pump.id} style={stationCardStyle}>
                    {/* Header */}
                    <div style={cardHeaderRowStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={stationTitleStyle}>{pump.stationName}</div>
                        <div style={stationLocationStyle}>{pump.location}</div>
                      </div>
                      <button
                        style={editSmallBtnStyle}
                        onClick={(e) => handleOpenEdit(pump, e)}
                        title="Suggest an edit"
                      >
                        ✏️
                      </button>
                    </div>

                    {/* Badges */}
                    <div style={badgeRowStyle}>
                      <span style={liveBadgeStyle}>⚡ Active</span>
                      <span style={fuelBadgeStyle}>
                        {(pump.latestReport?.availableFuelType || pump.fuelType || "Unknown").toUpperCase()}
                      </span>
                      <span style={statusAgeBadgeStyle}>
                        {pump.latestReport?.createdAt ? getReportAge(pump.latestReport.createdAt) : "Demo"}
                      </span>
                      {pump.distanceKm != null && (
                        <span style={distanceBadgeStyle}>{pump.distanceKm.toFixed(1)} km</span>
                      )}
                    </div>

                    {/* Meta */}
                    <div style={metaRowStyle}>
                      <span><strong>Started:</strong> {pump.latestReport?.startTime || "N/A"}</span>
                      <span><strong>By:</strong> {pump.latestReport?.reporterName || "Community User"}</span>
                    </div>

                    {/* ─── Reliability Bar ─── */}
                    <div style={reliabilityWrapStyle}>
                      <div style={reliabilityTopRowStyle}>
                        <span style={reliabilityLabelStyle}>Community Reliability</span>
                        <span style={{ ...reliabilityPctStyle, color: barColor }}>
                          {reliabilityPct != null ? `${reliabilityPct}%` : "No votes yet"}
                        </span>
                      </div>
                      <div style={reliabilityTrackStyle}>
                        <div
                          style={{
                            ...reliabilityFillStyle,
                            width: reliabilityPct != null ? `${reliabilityPct}%` : "0%",
                            background: barColor,
                          }}
                        />
                      </div>
                      <div style={voteCountsRowStyle}>
                        <span style={{ color: "#22c55e" }}>✓ {confirms} confirmed</span>
                        <span style={{ color: "#9ca3af" }}>✗ {wrongs} wrong</span>
                        <span style={{ color: "#ef4444" }}>⊘ {closed} closed</span>
                      </div>
                    </div>

                    {/* ─── Vote Buttons ─── */}
                    {(() => {
                      const reportId = pump.latestReport?.id || "";
                      const myVote = userVotes[reportId];
                      const isDemo = reportId.startsWith("dummy-");

                      const btnStyle = (type: "confirm" | "wrong" | "closed") => {
                        const isActive = myVote === type;
                        const isDisabled = !!myVote && myVote !== type;
                        const base = type === "confirm" ? confirmVoteBtnStyle
                          : type === "wrong" ? wrongVoteBtnStyle : closedVoteBtnStyle;
                        return {
                          ...base,
                          ...(isActive ? { filter: "brightness(1.4)", boxShadow: "0 0 0 2px currentColor" } : {}),
                          ...(isDisabled ? { opacity: 0.3, cursor: "not-allowed" } : {}),
                        };
                      };

                      return (
                        <div>
                          {myVote && !isDemo && (
                            <div style={votedLabelStyle}>
                              Your vote: <strong style={{ color: myVote === "confirm" ? "#22c55e" : myVote === "wrong" ? "#9ca3af" : "#ef4444" }}>
                                {myVote === "confirm" ? "✓ Confirmed" : myVote === "wrong" ? "✗ Wrong info" : "⊘ Closed"}
                              </strong>
                              <span style={{ color: "#555", marginLeft: "6px", fontSize: "11px" }}>— tap another to change</span>
                            </div>
                          )}
                          <div style={voteRowStyle}>
                            <button
                              style={btnStyle("confirm")}
                              disabled={isDemo || myVote === "confirm"}
                              onClick={() => reportId && handleVote(reportId, "confirm")}
                            >
                              <span style={voteBtnIconStyle}>✓</span>
                              <span>Confirm</span>
                            </button>
                            <button
                              style={btnStyle("wrong")}
                              disabled={isDemo || myVote === "wrong"}
                              onClick={() => reportId && handleVote(reportId, "wrong")}
                            >
                              <span style={voteBtnIconStyle}>✗</span>
                              <span>Wrong</span>
                            </button>
                            <button
                              style={btnStyle("closed")}
                              disabled={isDemo || myVote === "closed"}
                              onClick={() => reportId && handleVote(reportId, "closed")}
                            >
                              <span style={voteBtnIconStyle}>⊘</span>
                              <span>Closed</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ─── Footer row ─── */}
                    <div style={cardFooterRowStyle}>
                      {pump.mapsLink && (
                        <a href={pump.mapsLink} target="_blank" rel="noreferrer" style={mapsLinkStyle}>
                          Open in Maps →
                        </a>
                      )}
                      <button
                        style={deleteStationBtnStyle}
                        onClick={() => handleDeleteStation(pump.id, pump.stationName, pump.source)}
                        title="Mark as permanently closed"
                      >
                        🗑️ Remove Station
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={emptyStyle}>No active pumps found.</div>
            )}
          </div>
        </div>

        {/* ─── Map ─── */}
        <div id="map-section" style={{ ...panelStyle, marginTop: "22px" }}>
          <div style={sectionTitleStyle}>Active Pump Map</div>
          <div style={mapWrapStyle}>
            <Map
              stations={activeMapStations}
              userLat={userCoords?.lat ?? null}
              userLng={userCoords?.lng ?? null}
            />
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

const locationModalStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: "28px",
  padding: "36px 32px",
  maxWidth: "400px",
  width: "100%",
  textAlign: "center",
  boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
};

const locationModalIconStyle: React.CSSProperties = {
  fontSize: "48px",
  marginBottom: "16px",
  display: "block",
};

const locationModalTitleStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 900,
  marginBottom: "10px",
  letterSpacing: "-0.5px",
};

const locationModalSubStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#8c8c8c",
  lineHeight: 1.7,
  marginBottom: "24px",
};

const locationAllowBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 20px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
  color: "#111",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
  marginBottom: "10px",
  boxShadow: "0 8px 20px rgba(245,158,11,0.25)",
};

const locationSkipBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 20px",
  borderRadius: "16px",
  border: "1px solid #2e2e2e",
  background: "transparent",
  color: "#8c8c8c",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
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

const editModalHeaderStyle: React.CSSProperties = {
  marginBottom: "22px",
};

const editModalTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 900,
  marginBottom: "4px",
};

const editModalSubStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#8c8c8c",
};

const editFieldGroupStyle: React.CSSProperties = {
  marginBottom: "14px",
};

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

const editActionsStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
  marginTop: "6px",
};

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

const editInlineBtnStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(245,158,11,0.3)",
  background: "rgba(245,158,11,0.08)",
  color: "#F59E0B",
  fontWeight: 700,
  fontSize: "12px",
  cursor: "pointer",
};

const geoRetryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: "8px",
  padding: "6px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(245,158,11,0.3)",
  background: "rgba(245,158,11,0.08)",
  color: "#F59E0B",
  fontWeight: 700,
  fontSize: "12px",
  cursor: "pointer",
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
const navActionsStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" };

const navButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "999px",
  border: "1px solid #333",
  background: "#151515",
  color: "#fff",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const navPrimaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "999px",
  border: "1px solid rgba(245,158,11,0.35)",
  background: "#F59E0B",
  color: "#111",
  fontWeight: 800,
  fontSize: "13px",
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(245,158,11,0.18)",
};

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

const heroStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "72px 20px 46px",
  borderBottom: "1px solid #222",
  background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(16,185,129,0.08) 0%, transparent 70%)",
};

const heroBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  background: "rgba(16,185,129,0.12)",
  border: "1px solid rgba(16,185,129,0.28)",
  color: "#10B981",
  borderRadius: "999px",
  padding: "7px 14px",
  fontSize: "12px",
  fontWeight: 700,
  marginBottom: "18px",
};

const heroTitleStyle: React.CSSProperties = {
  fontSize: "clamp(34px, 6vw, 60px)",
  lineHeight: 1.05,
  fontWeight: 900,
  letterSpacing: "-1.5px",
  marginBottom: "14px",
};

const heroSubStyle: React.CSSProperties = {
  maxWidth: "760px",
  margin: "0 auto",
  color: "#9a9a9a",
  fontSize: "16px",
  lineHeight: 1.7,
};

const mainWrapStyle: React.CSSProperties = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "34px 22px 60px",
};

const searchBoxStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #262626",
  borderRadius: "24px",
  padding: "20px",
  marginBottom: "22px",
  boxShadow: "0 0 24px rgba(255,255,255,0.04)",
};

const searchTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 800,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  marginBottom: "12px",
};

const searchRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "16px 18px",
  borderRadius: "16px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const searchButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 18px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(180deg, #10b981 0%, #059669 100%)",
  color: "#fff",
  fontWeight: 900,
  fontSize: "18px",
  cursor: "pointer",
};

const topGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "22px",
  marginBottom: "22px",
};

const panelStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #262626",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 0 24px rgba(255,255,255,0.04)",
};

const trendPanelStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(16,185,129,0.08) 0%, rgba(20,20,20,1) 100%)",
  border: "1px solid rgba(16,185,129,0.18)",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 0 24px rgba(255,255,255,0.04)",
};

const formCardStyle: React.CSSProperties = {
  background: "#1A1A1A",
  border: "1px solid #2A2A2A",
  borderRadius: "22px",
  padding: "16px",
  marginTop: "12px",
};

const sectionTitleStyle: React.CSSProperties = { fontSize: "22px", fontWeight: 800, marginBottom: "4px" };
const sectionSubStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c", lineHeight: 1.6 };

const suggestionBoxStyle: React.CSSProperties = {
  marginTop: "12px",
  border: "1px solid #2a2a2a",
  borderRadius: "16px",
  overflow: "hidden",
  background: "#101010",
};

const suggestionItemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "12px 14px",
  background: "transparent",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  borderBottom: "1px solid #232323",
};

const selectedStationStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  background: "rgba(245,158,11,0.08)",
  border: "1px solid rgba(245,158,11,0.22)",
  borderRadius: "16px",
  padding: "12px 14px",
  marginTop: "12px",
  flexWrap: "wrap",
};

const mapsLinkStyle: React.CSSProperties = {
  color: "#F59E0B",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: "13px",
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

const inputStyleNoMargin: React.CSSProperties = {
  ...inputStyle,
  marginBottom: 0,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "14px 16px",
  borderRadius: "12px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyleBlock: React.CSSProperties = { ...selectStyle, marginBottom: "10px" };

const timeInputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "14px 16px",
  borderRadius: "12px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
};

const responsiveTwoInputsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
  marginBottom: "10px",
};

const responsiveSingleInputStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  marginBottom: "10px",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "16px",
  border: "none",
  background: "linear-gradient(180deg, #FBBF24 0%, #F59E0B 100%)",
  color: "#111",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(245,158,11,0.18)",
};

const notFoundRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
};

const inlineLinkButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#F59E0B",
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
  padding: 0,
};

const trendListStyle: React.CSSProperties = { display: "grid", gap: "12px", marginTop: "14px" };

const trendCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "18px",
  padding: "16px",
};

const trendNameStyle: React.CSSProperties = { fontSize: "16px", fontWeight: 800, marginBottom: "4px" };
const trendLocationStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c" };

const trendBadgeRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "12px",
};

const nearbyListStyle: React.CSSProperties = { display: "grid", gap: "12px", marginTop: "14px" };

const nearbyCardStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "18px",
  padding: "16px",
};

const nearbyNameStyle: React.CSSProperties = { fontSize: "15px", fontWeight: 800 };
const nearbyLocationStyle: React.CSSProperties = { fontSize: "13px", color: "#8c8c8c", marginTop: "3px" };

const distancePillStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "rgba(16,185,129,0.12)",
  color: "#10B981",
  fontWeight: 800,
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const stationGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "14px",
  marginTop: "16px",
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
  gap: "6px",
  marginBottom: "12px",
};

const liveBadgeStyle: React.CSSProperties = {
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
  background: "rgba(245,158,11,0.12)",
  color: "#F59E0B",
  fontWeight: 800,
  fontSize: "11px",
};

const statusAgeBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(59,130,246,0.12)",
  color: "#60A5FA",
  fontWeight: 800,
  fontSize: "11px",
};

const distanceBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "rgba(16,185,129,0.10)",
  color: "#10B981",
  fontWeight: 800,
  fontSize: "11px",
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  flexWrap: "wrap",
  color: "#d6d6d6",
  fontSize: "12px",
  marginBottom: "14px",
};

/* ─── Reliability Bar ─── */
const reliabilityWrapStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.02)",
  border: "1px solid #2a2a2a",
  borderRadius: "14px",
  padding: "12px 14px",
  marginBottom: "12px",
};

const reliabilityTopRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const reliabilityLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const reliabilityPctStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 800,
};

const reliabilityTrackStyle: React.CSSProperties = {
  height: "6px",
  background: "#2a2a2a",
  borderRadius: "999px",
  overflow: "hidden",
  marginBottom: "8px",
};

const reliabilityFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "999px",
  transition: "width 0.4s ease",
};

const voteCountsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
  fontSize: "11px",
  fontWeight: 700,
};

/* ─── Vote Buttons ─── */
const voteRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "8px",
  marginBottom: "12px",
};

const baseVoteBtnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  padding: "10px 6px",
  borderRadius: "12px",
  border: "1px solid transparent",
  fontSize: "12px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const voteBtnIconStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 900,
};

const confirmVoteBtnStyle: React.CSSProperties = {
  ...baseVoteBtnStyle,
  background: "rgba(34,197,94,0.08)",
  border: "1px solid rgba(34,197,94,0.2)",
  color: "#22c55e",
};

const wrongVoteBtnStyle: React.CSSProperties = {
  ...baseVoteBtnStyle,
  background: "rgba(107,114,128,0.08)",
  border: "1px solid rgba(107,114,128,0.2)",
  color: "#9ca3af",
};

const closedVoteBtnStyle: React.CSSProperties = {
  ...baseVoteBtnStyle,
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.2)",
  color: "#ef4444",
};

const mapWrapStyle: React.CSSProperties = {
  overflow: "hidden",
  borderRadius: "20px",
  border: "1px solid #2A2A2A",
  marginTop: "16px",
};

const submitPanelStyle: React.CSSProperties = {
  background: "#141414",
  border: "1px solid #262626",
  borderRadius: "24px",
  padding: "24px",
  boxShadow: "0 0 24px rgba(255,255,255,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
};

const submitStepStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const submitStepLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const submitSearchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid #2e2e2e",
  background: "#111",
  color: "#fff",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

const submitSuggestionBoxStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 100,
  background: "#111",
  border: "1px solid #2a2a2a",
  borderRadius: "14px",
  overflow: "hidden",
  boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
};

const submitSuggestionItemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "12px 14px",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #1e1e1e",
  color: "#fff",
  cursor: "pointer",
};

const submitAddNewItemStyle: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "12px 14px",
  background: "rgba(245,158,11,0.05)",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  fontSize: "13px",
};

const submitSelectedStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  background: "rgba(16,185,129,0.07)",
  border: "1px solid rgba(16,185,129,0.2)",
  borderRadius: "14px",
  padding: "12px 14px",
};

const submitClearBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#6b7280",
  fontSize: "16px",
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: "8px",
  flexShrink: 0,
};

const submitAddNewBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px dashed #2e2e2e",
  borderRadius: "12px",
  color: "#F59E0B",
  fontWeight: 700,
  fontSize: "13px",
  padding: "10px 14px",
  cursor: "pointer",
  textAlign: "left",
};

const submitTwoColStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const submitFieldLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#9ca3af",
  marginBottom: "6px",
};

const submitSelectStyle: React.CSSProperties = {
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
const votedLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  marginBottom: "8px",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "4px",
};

const cardFooterRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "4px",
  flexWrap: "wrap",
  gap: "8px",
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
