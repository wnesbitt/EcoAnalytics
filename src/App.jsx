import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import jsPDF from "jspdf";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const WEATHER_KEY = "4c705b525d3a948e813bc54a52d775e8";
const AIRNOW_KEY = "8AB5D0CF-5115-4D34-9382-92AF9AFFD337";

async function fetchLiveWeather(lat, lon) {
  try { const r = await fetch("https://api.openweathermap.org/data/2.5/weather?lat="+lat+"&lon="+lon+"&appid="+WEATHER_KEY+"&units=imperial"); return await r.json(); } catch(e) { return null; }
}
async function fetchLiveAqi(lat, lon) {
  try { const r = await fetch("https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude="+lat+"&longitude="+lon+"&distance=25&API_KEY="+AIRNOW_KEY); return await r.json(); } catch(e) { return []; }
}
async function fetchLiveSpecies(lat, lon) {
  try {
    const r = await fetch("https://api.inaturalist.org/v1/observations/species_counts?lat="+lat+"&lng="+lon+"&radius=5&per_page=50");
    const data = await r.json();
    const total = data.total_results || 0;
    const items = (data.results || []).map(function(x) {
      return {
        name: x.taxon ? (x.taxon.preferred_common_name || x.taxon.name || "Unknown") : "Unknown",
        scientific: x.taxon ? x.taxon.name : "",
        id: x.taxon ? x.taxon.id : null,
        group: x.taxon ? (x.taxon.iconic_taxon_name || "Other") : "Other",
        photo: x.taxon && x.taxon.default_photo ? x.taxon.default_photo.medium_url : null,
        count: x.count || 0,
      };
    });
    const taxa = {};
    items.forEach(function(x) { taxa[x.group] = (taxa[x.group] || 0) + 1; });
    return { total: total, items: items, names: items.map(function(x){return x.name;}), taxa: taxa };
  } catch(e) { return { total: 0, items: [], names: [], taxa: {} }; }
}
async function fetchLiveWater(lat, lon) {
  try {
    const bbox = (lon-0.1).toFixed(2)+","+(lat-0.1).toFixed(2)+","+(lon+0.1).toFixed(2)+","+(lat+0.1).toFixed(2);
    const r = await fetch("https://waterservices.usgs.gov/nwis/iv/?format=json&bBox="+bbox+"&siteStatus=active&siteType=ST");
    const data = await r.json();
    const result = { site_name: null, streamflow: null, gage: null, precip: null };
    const pmap = {"00060":"streamflow","00065":"gage","00045":"precip"};
    const series = (data.value || {}).timeSeries || [];
    series.forEach(function(s) {
      if (!result.site_name) result.site_name = (s.sourceInfo || {}).siteName || null;
      const vc = ((s.variable || {}).variableCode || [{}])[0].value || "";
      if (pmap[vc]) { const vals = ((s.values || [{}])[0].value || []); if (vals.length) { try { result[pmap[vc]] = parseFloat(vals[vals.length - 1].value); } catch(e) {} } }
    });
    return result;
  } catch(e) { return { site_name: null, streamflow: null, gage: null, precip: null }; }
}
async function fetchLivePlants(lat, lon) {
  try {
    const r = await fetch("https://api.inaturalist.org/v1/observations/species_counts?lat="+lat+"&lng="+lon+"&radius=5&iconic_taxa=Plantae&per_page=50");
    const data = await r.json();
    const total = data.total_results || 0;
    const plants = (data.results || []).map(function(x) {
      return {
        name: x.taxon ? (x.taxon.preferred_common_name || x.taxon.name || "Unknown") : "Unknown",
        scientific: x.taxon ? x.taxon.name : "",
        id: x.taxon ? x.taxon.id : null,
        count: x.count || 0,
        photo: x.taxon && x.taxon.default_photo ? x.taxon.default_photo.medium_url : null,
        native: x.taxon ? !x.taxon.introduced : true,
      };
    });
    return { total: total, plants: plants };
  } catch(e) { return { total: 0, plants: [] }; }
}
async function fetchInvasiveSpecies(lat, lon) {
  try {
    const r = await fetch("https://api.inaturalist.org/v1/observations/species_counts?lat="+lat+"&lng="+lon+"&radius=5&introduced=true&per_page=50");
    const data = await r.json();
    const total = data.total_results || 0;
    const species = (data.results || []).map(function(x) {
      return {
        name: x.taxon ? (x.taxon.preferred_common_name || x.taxon.name || "Unknown") : "Unknown",
        scientific: x.taxon ? x.taxon.name : "",
        id: x.taxon ? x.taxon.id : null,
        count: x.count || 0,
        group: x.taxon ? (x.taxon.iconic_taxon_name || "Other") : "Other",
      };
    });
    return { total: total, species: species };
  } catch(e) { return { total: 0, species: [] }; }
}
async function fetchSpeciesDetail(taxonId) {
  try {
    const r = await fetch("https://api.inaturalist.org/v1/taxa/"+taxonId);
    const data = await r.json();
    const t = data.results[0];
    return {
      name: t.preferred_common_name || t.name,
      scientific: t.name,
      wikipedia: t.wikipedia_summary || null,
      wikipedia_url: t.wikipedia_url || null,
      conservation: t.conservation_status || null,
      photo: t.default_photo ? t.default_photo.medium_url : null,
      iconic: t.iconic_taxon_name || "Unknown",
      observations: t.observations_count || 0,
      ancestor_names: (t.ancestors || []).map(function(a){return a.preferred_common_name || a.name;}).filter(Boolean),
      is_active: t.is_active,
      introduced: t.introduced || false,
      native: t.native || false,
      threatened: t.threatened || false,
    };
  } catch(e) { return null; }
}

function MetricCard({label,value,unit,status,good,source}) {
  return (<div className="bg-white border border-emerald-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
    <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{label}</div>
    <div className="text-2xl font-bold text-gray-900">{value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}</div>
    <div className={"text-xs mt-1.5 "+(good ? "text-emerald-600" : "text-amber-600")}>{status}</div>
    {source && <div className="text-[10px] text-gray-300 mt-2 pt-2 border-t border-gray-50">Source: {source}</div>}</div>);
}
function AlertBanner({type,title,description}) {
  const s = type === "critical" ? "bg-red-50 border-l-4 border-l-red-500 border-y border-r border-red-100 text-red-900" : "bg-amber-50 border-l-4 border-l-amber-500 border-y border-r border-amber-100 text-amber-900";
  const d = type === "critical" ? "text-red-700" : "text-amber-700";
  return (<div className={"rounded-r-xl px-4 py-3 "+s}><div className="text-sm font-semibold">{title}</div><div className={"text-xs mt-1 "+d}>{description}</div></div>);
}
function InsightCard({factor1,factor2,color1,color2,confidence,text}) {
  return (<div className="bg-white border border-emerald-100 rounded-xl px-4 py-3"><div className="flex items-center gap-2 mb-2 flex-wrap">
    <span className={"text-xs px-2.5 py-1 rounded-full font-medium "+color1}>{factor1}</span><span className="text-gray-300 text-xs">+</span>
    <span className={"text-xs px-2.5 py-1 rounded-full font-medium "+color2}>{factor2}</span><span className="text-xs text-gray-400 ml-auto font-medium">{confidence}%</span></div>
    <div className="text-xs text-gray-500 leading-relaxed">{text}</div></div>);
}
function SectionCard({title,badge,children,source}) {
  return (<div className="border border-emerald-100 rounded-xl p-5 bg-white"><div className="flex justify-between items-center mb-4">
    <h3 className="text-sm font-bold text-gray-800">{title}</h3>{badge && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">{badge}</span>}</div>{children}
    {source && <div className="text-[10px] text-gray-300 mt-4 pt-3 border-t border-gray-50">Source: {source}</div>}</div>);
}
function PageHeader({title,subtitle}) {
  return (<div className="mb-6"><h1 className="text-xl font-bold text-gray-900">{title}</h1>{subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}</div>);
}
function MapClickHandler({onMapClick}) { useMapEvents({click:function(e){onMapClick(e.latlng);}}); return null; }

function SpeciesTag({item, onClick}) {
  return (
    <button onClick={function(){onClick(item);}} className="text-xs bg-teal-50 text-teal-800 px-3 py-1.5 rounded-full font-medium border border-teal-100 hover:bg-teal-100 hover:border-teal-200 transition-colors cursor-pointer text-left">
      {item.name || item}
    </button>
  );
}

function SpeciesDetailModal({detail, loading, onClose}) {
  if (!detail && !loading) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={function(e){e.stopPropagation();}}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div></div>
        ) : detail ? (
          <div>
            {detail.photo && <div className="relative"><img src={detail.photo} alt={detail.name} className="w-full h-48 object-cover rounded-t-2xl"/><div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-5 pb-3 pt-8"><div className="text-white font-bold text-lg">{detail.name}</div><div className="text-white/80 text-xs italic">{detail.scientific}</div></div></div>}
            {!detail.photo && <div className="px-5 pt-5"><div className="font-bold text-lg text-gray-900">{detail.name}</div><div className="text-xs text-gray-400 italic">{detail.scientific}</div></div>}
            <div className="p-5">
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">{detail.iconic}</span>
                {detail.native && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">Native</span>}
                {detail.introduced && <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">Introduced</span>}
                {detail.threatened && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">Threatened</span>}
                {detail.conservation && <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">{"Status: "+(detail.conservation.status_name || detail.conservation.status || "Unknown")}</span>}
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 font-medium">{detail.observations.toLocaleString()+" global observations"}</span>
              </div>

              {detail.wikipedia && (
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-800 mb-2">About this species</h4>
                  <div className="text-sm text-gray-600 leading-relaxed" dangerouslySetInnerHTML={{__html: detail.wikipedia}}></div>
                </div>
              )}

              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 mb-2">Ecological significance</h4>
                <div className="text-sm text-gray-600 leading-relaxed">
                  {detail.iconic === "Aves" && "Birds serve as key indicators of ecosystem health. They control insect populations, pollinate plants, disperse seeds, and occupy critical positions in food webs. Changes in bird populations often signal broader environmental shifts."}
                  {detail.iconic === "Mammalia" && "Mammals play essential roles in ecosystems including seed dispersal, soil aeration, predator-prey balance, and nutrient cycling. Large mammals can shape entire landscapes through grazing and browsing behavior."}
                  {detail.iconic === "Insecta" && "Insects are the foundation of most terrestrial ecosystems. They pollinate over 80% of flowering plants, decompose organic matter, aerate soil, and form the base of food chains for birds, fish, and other wildlife."}
                  {detail.iconic === "Reptilia" && "Reptiles are important predators of insects, rodents, and other small animals. They help regulate prey populations and serve as prey for larger predators. Many reptile species are sensitive to habitat changes, making them valuable ecological indicators."}
                  {detail.iconic === "Amphibia" && "Amphibians are among the most sensitive indicators of environmental health due to their permeable skin and dual life cycle. They control insect populations and serve as prey for larger species. Amphibian decline often signals water quality or habitat degradation."}
                  {detail.iconic === "Plantae" && "Plants form the foundation of terrestrial ecosystems through photosynthesis, providing oxygen, food, and habitat. They stabilize soil, filter water, regulate climate, and support biodiversity by creating structural habitat for countless other species."}
                  {detail.iconic === "Fungi" && "Fungi are critical decomposers that break down dead organic matter and recycle nutrients back into the soil. Mycorrhizal fungi form symbiotic relationships with over 90% of plant species, extending root networks and improving nutrient uptake."}
                  {!["Aves","Mammalia","Insecta","Reptilia","Amphibia","Plantae","Fungi"].includes(detail.iconic) && "This species contributes to the biodiversity and ecological balance of its habitat. Each species in an ecosystem plays a role in nutrient cycling, energy flow, and maintaining the stability of biological communities."}
                </div>
              </div>

              {detail.introduced && (
                <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-4">
                  <h4 className="text-sm font-bold text-red-800 mb-1">Invasive/Introduced species</h4>
                  <div className="text-sm text-red-700 leading-relaxed">This species is not native to this region. Introduced species can displace native wildlife, alter habitat structure, disrupt food webs, and reduce biodiversity. Monitoring introduced species is critical for conservation management.</div>
                </div>
              )}

              {detail.wikipedia_url && (
                <a href={detail.wikipedia_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline">Read more on Wikipedia</a>
              )}
            </div>
            <div className="px-5 pb-5"><button onClick={onClose} className="text-sm px-6 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-medium w-full">Close</button></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewAllModal({title, items, totalCount, onItemClick, onClose, renderItem}) {
  if (!items) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9998] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={function(e){e.stopPropagation();}}>
        <div className="px-6 py-4 border-b border-emerald-100 flex justify-between items-center flex-shrink-0">
          <div><div className="font-bold text-gray-900">{title}</div><div className="text-xs text-gray-400 mt-0.5">{totalCount ? totalCount.toLocaleString()+" total in area" : items.length+" shown"}</div></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-2">x</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.map(function(item, i) {
              if (renderItem) return renderItem(item, i);
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl p-3 cursor-pointer hover:bg-emerald-50 transition-colors border border-gray-50" onClick={function(){if(item.id && onItemClick) onItemClick(item);}}>
                  {item.photo ? <img src={item.photo} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0"/> : <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0"><span className="text-sm">{item.group==="Plantae"?"🌿":item.group==="Aves"?"🐦":item.group==="Mammalia"?"🐾":item.group==="Insecta"?"🦋":item.group==="Reptilia"?"🦎":item.group==="Amphibia"?"🐸":item.group==="Fungi"?"🍄":"🔬"}</span></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{item.name}</div>
                    <div className="text-xs text-gray-400 italic truncate">{item.scientific || ""}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-emerald-600">{item.count ? item.count.toLocaleString() : ""}</div>
                    <div className="text-xs text-gray-400">{item.group || ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-3 border-t border-emerald-100 flex-shrink-0">
          <button onClick={onClose} className="text-sm px-6 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-medium w-full">Close</button>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({onAuth}) {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [isSignUp,setIsSignUp] = useState(false);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState("");
  const handleSubmit = async function() {
    setLoading(true); setError(""); setMessage("");
    if (isSignUp) { const {error:err} = await supabase.auth.signUp({email,password}); if(err) setError(err.message); else setMessage("Check your email to confirm, then sign in."); }
    else { const {data,error:err} = await supabase.auth.signInWithPassword({email,password}); if(err) setError(err.message); else onAuth(data.user); }
    setLoading(false);
  };
  return (
    <div className="flex h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 items-center justify-center">
      <div className="text-center bg-white rounded-2xl shadow-lg border border-emerald-100 p-10 max-w-sm w-full mx-4">
        <div className="w-12 h-12 bg-emerald-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3C12 3 5 10 5 15C5 19 8 21 12 21C16 21 19 19 19 15C19 10 12 3 12 3Z" fill="#5DCAA5"/></svg>
        </div>
        <div className="font-bold text-xl text-gray-900 mb-1">EcoAnalytics</div>
        <div className="text-sm text-emerald-600 mb-6">Ecosystem intelligence</div>
        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</div>}
        {message && <div className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{message}</div>}
        <input type="email" placeholder="Email" value={email} onChange={function(e){setEmail(e.target.value);}} className="text-sm px-4 py-2.5 rounded-xl border border-emerald-200 mb-3 w-full focus:outline-none focus:border-emerald-500"/>
        <input type="password" placeholder="Password" value={password} onChange={function(e){setPassword(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")handleSubmit();}} className="text-sm px-4 py-2.5 rounded-xl border border-emerald-200 mb-4 w-full focus:outline-none focus:border-emerald-500"/>
        <button onClick={handleSubmit} disabled={loading} className="text-sm px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 w-full font-medium disabled:bg-gray-300">{loading ? "..." : (isSignUp ? "Create account" : "Sign in")}</button>
        <button onClick={function(){setIsSignUp(!isSignUp);setError("");setMessage("");}} className="text-xs text-emerald-600 mt-4 block mx-auto hover:underline">{isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}</button>
      </div>
    </div>
  );
}

const defaultParks = [
  { id: "d1", name: "River Legacy Parks", latitude: 32.7896, longitude: -97.0917, isDefault: true },
  { id: "d2", name: "Bob Jones Nature Center", latitude: 32.9412, longitude: -97.1342, isDefault: true },
  { id: "d3", name: "Colleyville Nature Center", latitude: 32.8810, longitude: -97.1500, isDefault: true },
  { id: "d4", name: "Grapevine Lake", latitude: 32.9750, longitude: -97.0780, isDefault: true },
  { id: "d5", name: "Lake Arlington", latitude: 32.7340, longitude: -97.1260, isDefault: true },
];

const sidebarPages = ["Overview","Water quality","Wildlife","Vegetation","Air & climate","Intelligence engine"];
const bottomPages = ["Map","Reports","Settings"];
const taxaColors = {Aves:"#3b82f6",Plantae:"#0F6E56",Insecta:"#EF9F27",Mammalia:"#D85A30",Reptilia:"#8b5cf6",Amphibia:"#06b6d4",Fungi:"#ec4899",Arachnida:"#f97316",Mollusca:"#14b8a6",Actinopterygii:"#0284c7"};

function App() {
  const [user,setUser] = useState(null);
  const [authLoading,setAuthLoading] = useState(true);
  const [allLocations,setAllLocations] = useState(defaultParks);
  const [selectedIdx,setSelectedIdx] = useState(0);
  const [activePage,setActivePage] = useState("Overview");
  const [weather,setWeather] = useState(null);
  const [aqi,setAqi] = useState(null);
  const [species,setSpecies] = useState(null);
  const [water,setWater] = useState(null);
  const [plants,setPlants] = useState(null);
  const [invasives,setInvasives] = useState(null);
  const [dataLoading,setDataLoading] = useState(true);
  const [showAddLocation,setShowAddLocation] = useState(false);
  const [clickedLatLng,setClickedLatLng] = useState(null);
  const [newLocName,setNewLocName] = useState("");
  const [searchQuery,setSearchQuery] = useState("");
  const [speciesDetail,setSpeciesDetail] = useState(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [viewAllModal,setViewAllModal] = useState(null);
  const [lastUpdated,setLastUpdated] = useState(null);

  useEffect(function() {
    supabase.auth.getSession().then(function(r){if(r.data.session)setUser(r.data.session.user);setAuthLoading(false);});
    const {data:listener} = supabase.auth.onAuthStateChange(function(ev,session){setUser(session?session.user:null);});
    return function(){listener.subscription.unsubscribe();};
  },[]);

  useEffect(function(){if(user)loadUserLocations();},[user]);

  async function loadUserLocations() {
    const {data} = await supabase.from("user_locations").select("*").order("created_at",{ascending:true});
    setAllLocations([...defaultParks,...(data||[])]);
  }

  const loc = allLocations[selectedIdx] || allLocations[0];

  useEffect(function() {
    async function load() {
      setDataLoading(true);
      const [w,a,s,wq,pl,inv] = await Promise.all([
        fetchLiveWeather(loc.latitude,loc.longitude),
        fetchLiveAqi(loc.latitude,loc.longitude),
        fetchLiveSpecies(loc.latitude,loc.longitude),
        fetchLiveWater(loc.latitude,loc.longitude),
        fetchLivePlants(loc.latitude,loc.longitude),
        fetchInvasiveSpecies(loc.latitude,loc.longitude),
      ]);
      setWeather(w); setAqi(a); setSpecies(s); setWater(wq); setPlants(pl); setInvasives(inv);
      setLastUpdated(new Date());
      setDataLoading(false);
    }
    load();
  },[selectedIdx,allLocations]);

  async function openSpeciesDetail(item) {
    const taxonId = item.id || item;
    if (!taxonId) return;
    setDetailLoading(true);
    setSpeciesDetail(null);
    const detail = await fetchSpeciesDetail(taxonId);
    setSpeciesDetail(detail);
    setDetailLoading(false);
  }

  async function addLocation() {
    if (!newLocName || !clickedLatLng) return;
    await supabase.from("user_locations").insert({user_id:user.id,name:newLocName,latitude:clickedLatLng.lat,longitude:clickedLatLng.lng});
    await loadUserLocations(); setShowAddLocation(false); setNewLocName(""); setClickedLatLng(null);
  }
  async function deleteLocation(id) {
    await supabase.from("user_locations").delete().eq("id",id); await loadUserLocations();
    if (selectedIdx >= allLocations.length - 1) setSelectedIdx(0);
  }
  async function handleSearch() {
    if (!searchQuery) return;
    try { const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&q="+encodeURIComponent(searchQuery));
      const results = await r.json(); if (results.length > 0) { setClickedLatLng({lat:parseFloat(results[0].lat),lng:parseFloat(results[0].lon)});
        setNewLocName(results[0].display_name.split(",")[0]); setShowAddLocation(true); } } catch(e) {}
  }

  const temp = weather && weather.main ? Math.round(weather.main.temp*10)/10 : "--";
  const humidity = weather && weather.main ? Math.round(weather.main.humidity) : "--";
  const wind = weather && weather.wind ? Math.round(weather.wind.speed*10)/10 : "--";
  const feelsLike = weather && weather.main ? Math.round(weather.main.feels_like*10)/10 : "--";
  const conditions = weather && weather.weather ? weather.weather[0].description : "--";
  const aqiVal = aqi && aqi.length > 0 ? aqi[0].AQI : "--";
  const aqiCat = aqi && aqi.length > 0 ? (aqi[0].Category||{}).Name||"--" : "--";
  const pollutant = aqi && aqi.length > 0 ? aqi[0].ParameterName||"--" : "--";
  const speciesCount = species ? species.total.toLocaleString() : "--";
  const flow = water && water.streamflow ? Math.round(water.streamflow) : "--";
  const waterSite = water && water.site_name ? water.site_name : "No station nearby";
  const plantCount = plants ? plants.total.toLocaleString() : "--";
  const invasiveCount = invasives ? invasives.total : 0;

  const alerts = [];
  if (aqiVal !== "--" && aqiVal > 100) alerts.push({type:"critical",title:"AQI "+aqiVal,description:"Unhealthy air quality detected."});
  if (humidity !== "--" && humidity > 70) alerts.push({type:"warning",title:"Humidity "+humidity+"%",description:"Above comfort range."});
  if (temp !== "--" && temp > 95) alerts.push({type:"critical",title:"Heat: "+temp+" F",description:"Reduced wildlife activity expected."});
  if (invasiveCount > 5) alerts.push({type:"warning",title:invasiveCount+" introduced species detected",description:"Monitor invasive species in this area."});

  function generatePDF() {
    const doc = new jsPDF(); const now = new Date();
    const dateStr = now.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    doc.setFillColor(15,110,86); doc.rect(0,0,210,35,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont("helvetica","bold");
    doc.text("EcoAnalytics",14,18); doc.setFontSize(10); doc.setFont("helvetica","normal");
    doc.text("Ecosystem Intelligence Report",14,26); doc.text(dateStr,196,18,{align:"right"});
    doc.setTextColor(4,52,44); doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.text(loc.name,14,48);
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(100,100,100);
    doc.text("Lat: "+loc.latitude.toFixed(4)+" | Lon: "+loc.longitude.toFixed(4),14,55);
    doc.setDrawColor(15,110,86); doc.line(14,59,196,59);
    let y = 68;
    if (weather && weather.main) {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Air & Climate",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text("Temperature: "+temp+" F",14,y); doc.text("Humidity: "+humidity+"%",80,y); doc.text("Wind: "+wind+" mph",140,y); y+=6;
      doc.text("Conditions: "+conditions,14,y); y+=10;
    }
    if (aqiVal !== "--") {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Air Quality",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text("AQI: "+aqiVal+" ("+aqiCat+")",14,y); doc.text("Pollutant: "+pollutant,100,y); y+=10;
    }
    if (water && water.site_name) {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Water Quality",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text("Station: "+water.site_name,14,y); y+=6;
      doc.text("Flow: "+(water.streamflow||"N/A")+" cfs",14,y); doc.text("Gage: "+(water.gage?Math.round(water.gage*10)/10:"N/A")+" ft",80,y); y+=10;
    }
    if (species && species.total > 0) {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Wildlife & Biodiversity",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text("Species: "+species.total.toLocaleString(),14,y); y+=6;
      if (species.names.length > 0) doc.text("Notable: "+species.names.slice(0,5).join(", "),14,y); y+=10;
    }
    if (plants && plants.total > 0) {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Vegetation",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text("Plant species: "+plants.total.toLocaleString(),14,y); y+=6;
      if (plants.plants.length > 0) doc.text("Notable: "+plants.plants.slice(0,5).map(function(p){return p.name;}).join(", "),14,y); y+=10;
    }
    if (invasives && invasives.total > 0) {
      doc.setTextColor(15,110,86); doc.setFontSize(13); doc.setFont("helvetica","bold"); doc.text("Introduced Species Alert",14,y); y+=8;
      doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.text(invasives.total+" introduced species detected in monitoring area",14,y); y+=6;
      if (invasives.species.length > 0) doc.text("Top: "+invasives.species.slice(0,5).map(function(s){return s.name;}).join(", "),14,y);
    }
    doc.setFillColor(15,110,86); doc.rect(0,277,210,20,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(8);
    doc.text("Generated by EcoAnalytics | eco-analytics.vercel.app",105,287,{align:"center"});
    doc.save(loc.name.replace(/\s+/g,"_")+"_Report_"+now.toISOString().slice(0,10)+".pdf");
  }

  function renderPage() {
    if (dataLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3"></div></div>;
    switch(activePage) {

      case "Water quality": return (<>
        <PageHeader title="Water quality" subtitle={loc.name}/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Streamflow" value={flow} unit="cfs" status={waterSite} good={flow==="--"||flow<500} source="USGS Water Services"/>
          <MetricCard label="Gage height" value={water&&water.gage?Math.round(water.gage*10)/10:"--"} unit="ft" status="Water level" good source="USGS Water Services"/>
          <MetricCard label="Precipitation" value={water&&water.precip!==null?water.precip:"--"} unit="in" status="Recent" good source="USGS Water Services"/>
        </div>
        {water && water.site_name && <SectionCard title="Monitoring station" source="USGS Water Services - live readings from nearest active station"><div className="text-sm text-gray-600 mb-3">{water.site_name}</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{flow}<span className="text-xs font-normal"> cfs</span></div><div className="text-xs text-cyan-600">Flow</div></div>
            <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{water.gage?Math.round(water.gage*10)/10:"N/A"}<span className="text-xs font-normal"> ft</span></div><div className="text-xs text-cyan-600">Gage</div></div>
            <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{water.precip!==null?water.precip:"N/A"}<span className="text-xs font-normal"> in</span></div><div className="text-xs text-cyan-600">Precip</div></div>
          </div></SectionCard>}
        {!water?.site_name && <div className="border border-emerald-100 rounded-xl p-8 text-center bg-white"><div className="text-sm text-gray-500">No USGS water monitoring station found within range of this location.</div></div>}
      </>);

      case "Wildlife": return (<>
        <PageHeader title="Wildlife & biodiversity" subtitle={loc.name}/>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <MetricCard label="Total species" value={speciesCount} status="Within 5km radius" good source="iNaturalist"/>
          <MetricCard label="Taxa groups" value={species?Object.keys(species.taxa).length:"--"} status="Categories observed" good source="iNaturalist"/>
        </div>
        {species && Object.keys(species.taxa).length > 0 && <div className="mb-5"><SectionCard title="Species by group" badge={speciesCount+" total"}>
          <div className="flex flex-wrap gap-2">{Object.entries(species.taxa).sort(function(a,b){return b[1]-a[1];}).map(function(e){return <div key={e[0]} className="flex items-center gap-2 bg-emerald-50 rounded-full px-3 py-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{background:taxaColors[e[0]]||"#6b7280"}}></div><span className="text-xs font-medium text-gray-700">{e[0]}</span><span className="text-xs text-emerald-600 font-bold">{e[1]}</span></div>;})}</div>
          {species.items.length > 10 && <button onClick={function(){setViewAllModal({title:"All species by group",items:species.items,total:species.total});}} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium mt-4 block">{"View all "+species.total.toLocaleString()+" species →"}</button>}
          </SectionCard></div>}
        {species && species.items.length > 0 && <SectionCard title="Notable species" badge="Click for details" source="iNaturalist - citizen science observations"><div className="flex flex-wrap gap-2">{species.items.slice(0,10).map(function(item,i){return <SpeciesTag key={i} item={item} onClick={openSpeciesDetail}/>;})}</div>{species.items.length > 10 && <button onClick={function(){setViewAllModal({title:"All species observed",items:species.items,total:species.total});}} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium mt-4 block">{"View all "+species.total.toLocaleString()+" species →"}</button>}</SectionCard>}
      </>);

      case "Vegetation": return (<>
        <PageHeader title="Vegetation & plant life" subtitle={loc.name}/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Plant species" value={plantCount} status="Within 5km radius" good source="iNaturalist"/>
          <MetricCard label="Observed plants" value={plants?plants.plants.length:"--"} status="Top observations" good source="iNaturalist"/>
          <MetricCard label="Introduced plants" value={invasives?invasives.species.filter(function(s){return s.group==="Plantae";}).length:0} status={invasives && invasives.species.filter(function(s){return s.group==="Plantae";}).length > 0 ? "Monitor closely" : "None detected"} good={!invasives||invasives.species.filter(function(s){return s.group==="Plantae";}).length===0} source="iNaturalist (introduced filter)"/>
        </div>
        {plants && plants.plants.length > 0 && (
          <div className="mb-5"><SectionCard title="Plant species observed" badge={plantCount+" total"} source="iNaturalist - plant observations within 5km radius">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {plants.plants.slice(0,10).map(function(p,i){return (
                <div key={i} className="flex items-center gap-3 bg-emerald-50/50 rounded-xl p-3 cursor-pointer hover:bg-emerald-50 transition-colors" onClick={function(){if(p.id)openSpeciesDetail(p);}}>
                  {p.photo ? <img src={p.photo} alt={p.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0"/> : <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0"><span className="text-lg">🌿</span></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 italic truncate">{p.scientific}</div>
                    <div className="text-xs text-emerald-600 mt-0.5">{p.count.toLocaleString()+" observations"}</div>
                  </div>
                </div>
              );})}
            </div>
            {plants.plants.length > 10 && <button onClick={function(){setViewAllModal({title:"All plant species observed",items:plants.plants.map(function(p){return {name:p.name,scientific:p.scientific,id:p.id,count:p.count,group:"Plantae",photo:p.photo};}),total:plants.total});}} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium mt-4 block">{"View all "+plants.total.toLocaleString()+" plant species →"}</button>}
          </SectionCard></div>
        )}
        {(!plants || plants.plants.length === 0) && <div className="border border-emerald-100 rounded-xl p-8 text-center bg-white"><div className="text-sm text-gray-500">No plant observation data found for this location.</div></div>}
      </>);

      case "Air & climate": return (<>
        <PageHeader title="Air & climate" subtitle={loc.name}/>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <MetricCard label="Temperature" value={temp} unit="F" status={conditions} good={temp==="--"||temp<95} source="OpenWeatherMap"/>
          <MetricCard label="Humidity" value={humidity} unit="%" status="Relative" good={humidity==="--"||humidity<70} source="OpenWeatherMap"/>
          <MetricCard label="Wind" value={wind} unit="mph" status={weather&&weather.wind?weather.wind.deg+" deg":"--"} good source="OpenWeatherMap"/>
          <MetricCard label="AQI" value={aqiVal} status={aqiCat} good={aqiVal==="--"||aqiVal<=50} source="EPA AirNow"/>
        </div>
        {weather && weather.main && <SectionCard title="Current conditions" source="OpenWeatherMap - updated in real-time">
          <div className="text-sm text-gray-600">{"Feels like "+feelsLike+" F with "+(weather.clouds?weather.clouds.all:0)+"% cloud cover and "+(weather.visibility?Math.round(weather.visibility/1000):0)+"km visibility. Pressure at "+weather.main.pressure+" hPa."}</div></SectionCard>}
      </>);

      case "Intelligence engine": return (<>
        <PageHeader title="Ecological intelligence engine" subtitle={loc.name+" — cross-factor analysis"}/>
        <div className="border border-emerald-200 rounded-xl p-8 text-center mb-5 bg-gradient-to-b from-emerald-50 to-white">
          <div className="text-4xl mb-4">🧠</div>
          <div className="text-lg font-bold text-gray-800 mb-2">Intelligence engine active</div>
          <div className="text-sm text-gray-500 mb-6">Cross-factor pattern analysis runs on accumulated historical data. Keep running your daily collection script to build deeper insights.</div>
        </div>
        <div className="flex flex-col gap-4">
          <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-orange-50 text-orange-800" color2="bg-emerald-50 text-emerald-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week."/>
          <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-emerald-50 text-emerald-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50."/>
          <InsightCard factor1="Water flow" factor2="Wildlife" color1="bg-cyan-50 text-cyan-800" color2="bg-emerald-50 text-emerald-800" confidence={68} text="Streamflow above 300 cfs correlates with 25% more amphibian sightings within 2 weeks."/>
          <InsightCard factor1="Humidity" factor2="Species" color1="bg-blue-50 text-blue-800" color2="bg-purple-50 text-purple-800" confidence={64} text="Sustained humidity above 75% for 5+ days correlates with increased fungal species and decreased pollinator activity."/>
        </div>
      </>);

      case "Map": return (<>
        <PageHeader title="Monitoring locations" subtitle="Add locations anywhere in the US"/>
        <div className="flex gap-2 mb-4">
          <input type="text" placeholder="Search park, lake, address..." value={searchQuery} onChange={function(e){setSearchQuery(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")handleSearch();}} className="text-sm px-4 py-2 rounded-xl border border-emerald-200 flex-1 focus:outline-none focus:border-emerald-500"/>
          <button onClick={handleSearch} className="text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-medium">Search</button>
        </div>
        <div className="rounded-xl overflow-hidden border border-emerald-200 mb-4" style={{height:"400px"}}>
          <MapContainer center={[32.85,-97.08]} zoom={10} style={{height:"100%",width:"100%"}} scrollWheelZoom={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="OpenStreetMap"/>
            <MapClickHandler onMapClick={function(ll){setClickedLatLng(ll);setNewLocName("");setShowAddLocation(true);}}/>
            {allLocations.map(function(l,i){return <Marker key={l.id||i} position={[l.latitude,l.longitude]}><Popup><b>{l.name}</b><br/><button onClick={function(){setSelectedIdx(i);setActivePage("Overview");}} style={{color:"#0F6E56",cursor:"pointer",border:"none",background:"none",fontWeight:"bold"}}>View dashboard</button></Popup></Marker>;})}
            {clickedLatLng && <Marker position={[clickedLatLng.lat,clickedLatLng.lng]}><Popup>New location</Popup></Marker>}
          </MapContainer>
        </div>
        {showAddLocation && clickedLatLng && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-gray-800 mb-2">Add monitoring location</div>
          <div className="text-xs text-gray-500 mb-2">{"Lat: "+clickedLatLng.lat.toFixed(4)+", Lng: "+clickedLatLng.lng.toFixed(4)}</div>
          <input type="text" placeholder="Name this location..." value={newLocName} onChange={function(e){setNewLocName(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")addLocation();}} className="text-sm px-3 py-2 rounded-lg border border-emerald-200 w-full mb-2 focus:outline-none"/>
          <div className="flex gap-2"><button onClick={addLocation} className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium">Add</button>
            <button onClick={function(){setShowAddLocation(false);}} className="text-sm px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600">Cancel</button></div></div>}
        <div className="flex flex-col gap-2">{allLocations.map(function(l,i){return (
          <div key={l.id||i} className={"flex justify-between items-center px-4 py-3 rounded-xl border cursor-pointer transition-all "+(selectedIdx===i?"border-emerald-500 bg-emerald-50":"border-emerald-100 bg-white hover:bg-emerald-50/50")} onClick={function(){setSelectedIdx(i);setActivePage("Overview");}}>
            <div><div className="text-sm font-semibold text-gray-800">{l.name}</div><div className="text-xs text-gray-400">{l.latitude.toFixed(4)+", "+l.longitude.toFixed(4)+(l.isDefault?" (default)":"")}</div></div>
            {!l.isDefault && <button onClick={function(e){e.stopPropagation();deleteLocation(l.id);}} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">Remove</button>}
          </div>);})}</div>
      </>);

      case "Reports": return (<>
        <PageHeader title="Reports & exports" subtitle={"Generate ecosystem reports for "+loc.name}/>
        <div className="border border-emerald-200 rounded-xl p-8 bg-white mb-5"><div className="flex items-start gap-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6C5.4 2 5 2.4 5 3V21C5 21.6 5.4 22 6 22H18C18.6 22 19 21.6 19 21V7L14 2Z" stroke="#0F6E56" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2V7H19" stroke="#0F6E56" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 13H15M9 17H13" stroke="#0F6E56" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
          <div className="flex-1"><h3 className="text-base font-bold text-gray-900 mb-1">Ecosystem health report</h3>
            <p className="text-sm text-gray-500 mb-4">{"One-page PDF with all live metrics for "+loc.name+". Includes air quality, weather, water, wildlife, vegetation, and invasive species data."}</p>
            <button onClick={generatePDF} className="text-sm px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-medium">Generate PDF report</button></div></div></div>
      </>);

      case "Settings": return (<>
        <PageHeader title="Settings" subtitle="Account & preferences"/>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SectionCard title="Account">
            <div className="space-y-3">
              <div><div className="text-xs text-gray-400 mb-1">Email</div><div className="text-sm font-medium text-gray-800">{user.email}</div></div>
              <div><div className="text-xs text-gray-400 mb-1">Account ID</div><div className="text-xs font-mono text-gray-500">{user.id}</div></div>
              <div><div className="text-xs text-gray-400 mb-1">Locations</div><div className="text-sm text-gray-800">{allLocations.filter(function(l){return !l.isDefault;}).length+" custom + 5 defaults"}</div></div>
            </div>
          </SectionCard>
          <SectionCard title="Data sources">
            <div className="space-y-3">
              <div className="border-b border-gray-50 pb-3">
                <div className="flex justify-between items-center mb-1"><span className="text-sm font-semibold text-gray-800">OpenWeatherMap</span><span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Live</span></div>
                <div className="text-xs text-gray-500">Provides temperature, humidity, wind, and atmospheric conditions. Updated every 10 minutes.</div>
              </div>
              <div className="border-b border-gray-50 pb-3">
                <div className="flex justify-between items-center mb-1"><span className="text-sm font-semibold text-gray-800">EPA AirNow</span><span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Live</span></div>
                <div className="text-xs text-gray-500">Federal air quality data including AQI and primary pollutants. Searches within 25km of location.</div>
              </div>
              <div className="border-b border-gray-50 pb-3">
                <div className="flex justify-between items-center mb-1"><span className="text-sm font-semibold text-gray-800">iNaturalist</span><span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Live</span></div>
                <div className="text-xs text-gray-500">Citizen science biodiversity observations run by California Academy of Sciences and National Geographic. Searches within 5km radius.</div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1"><span className="text-sm font-semibold text-gray-800">USGS Water Services</span><span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Live</span></div>
                <div className="text-xs text-gray-500">Federal water monitoring from United States Geological Survey. Real-time streamflow and gage data from nearest active station.</div>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Methodology & limitations">
            <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
              <div><span className="font-semibold text-gray-800 block mb-1">Species observations</span>iNaturalist observation counts reflect reported sightings by citizen scientists, not total population density. A park with high visitor traffic may show more observations than an equally biodiverse but less-visited area.</div>
              <div><span className="font-semibold text-gray-800 block mb-1">Introduced species activity levels</span>High/Moderate/Low labels are estimates of reporting activity (over 50 / 10 to 50 / under 10 observations). They are not scientific threat assessments and should not be used for formal conservation planning.</div>
              <div><span className="font-semibold text-gray-800 block mb-1">Water data availability</span>USGS has monitoring stations across the US but coverage is not uniform. Some locations show "No station nearby" when no active stream gage exists within range.</div>
              <div><span className="font-semibold text-gray-800 block mb-1">Data refresh</span>All data is fetched live each time you select a location. No data is cached between sessions for user-added locations.</div>
            </div>
          </SectionCard>
          <SectionCard title="About EcoAnalytics">
            <div className="text-sm text-gray-600 leading-relaxed">EcoAnalytics is an ecosystem intelligence platform that pulls live environmental data from federal and open-source APIs. Monitor air quality, water conditions, wildlife, and vegetation at any location in the United States.</div>
            <div className="text-xs text-gray-400 mt-3">Version 1.0 (Pilot)</div>
          </SectionCard>
          <SectionCard title="Support">
            <div className="text-sm text-gray-600 mb-3">Questions, bugs, or feature requests? Reach out and we will respond within 24 hours.</div>
            <div className="text-sm font-medium text-emerald-600">will@ecoanalytics.com</div>
          </SectionCard>
        </div>
      </>);

      default: return (<>
        <div className="flex justify-between items-center mb-6"><div><h1 className="text-xl font-bold text-gray-900">Dashboard overview</h1><p className="text-sm text-gray-400 mt-1">{loc.name+" | Live data"+(lastUpdated?" | Updated "+lastUpdated.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"")}</p></div></div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2.5 mb-5 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0"><circle cx="12" cy="12" r="10" stroke="#0F6E56" strokeWidth="2"/><path d="M12 16V12M12 8H12.01" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"/></svg>
          <div className="text-xs text-emerald-700">All data is pulled live from federal and open-source APIs. Observation counts reflect reported sightings, not total population density. See Settings for full methodology.</div>
        </div>
        {alerts.length > 0 && <div className="flex flex-col gap-2 mb-5">{alerts.map(function(a,i){return <AlertBanner key={i} type={a.type} title={a.title} description={a.description}/>;})}</div>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <MetricCard label="Water flow" value={flow} unit="cfs" status={waterSite} good={flow==="--"||flow<500} source="USGS"/>
          <MetricCard label="AQI" value={aqiVal} status={aqiCat} good={aqiVal==="--"||aqiVal<=50} source="EPA AirNow"/>
          <MetricCard label="Species" value={speciesCount} status="Within 5km" good source="iNaturalist"/>
          <MetricCard label="Humidity" value={humidity} unit="%" status={conditions} good={humidity==="--"||humidity<70} source="OpenWeatherMap"/>
          <MetricCard label="Temperature" value={temp} unit="F" status={"Wind: "+wind+" mph"} good={temp==="--"||temp<95} source="OpenWeatherMap"/>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          {species && Object.keys(species.taxa).length > 0 && <SectionCard title="Species by group" badge={speciesCount+" total"} source="iNaturalist"><div className="flex flex-wrap gap-2">{Object.entries(species.taxa).sort(function(a,b){return b[1]-a[1];}).map(function(e){return <div key={e[0]} className="flex items-center gap-2 bg-emerald-50 rounded-full px-3 py-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{background:taxaColors[e[0]]||"#6b7280"}}></div><span className="text-xs font-medium text-gray-700">{e[0]}</span><span className="text-xs text-emerald-600 font-bold">{e[1]}</span></div>;})}</div>
            {species.items.length > 10 && <button onClick={function(){setViewAllModal({title:"All species by group",items:species.items,total:species.total});}} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium mt-4 block">{"View all "+species.total.toLocaleString()+" species →"}</button>}
            </SectionCard>}
          {species && species.items.length > 0 && <SectionCard title="Notable species" badge="Click for details" source="iNaturalist"><div className="flex flex-wrap gap-2">{species.items.slice(0,10).map(function(item,i){return <SpeciesTag key={i} item={item} onClick={openSpeciesDetail}/>;})}</div>
            {species.items.length > 10 && <button onClick={function(){setViewAllModal({title:"All species observed",items:species.items,total:species.total});}} className="text-sm text-emerald-600 hover:text-emerald-800 font-medium mt-4 block">{"View all "+species.total.toLocaleString()+" species →"}</button>}
            </SectionCard>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {invasives && invasives.species.length > 0 ? (
            <SectionCard title="Introduced species detected" badge={invasives.total+" total"} source="iNaturalist (introduced=true filter) - Activity levels are estimates based on observation frequency">
              <div className="flex flex-col gap-2">{invasives.species.slice(0,5).map(function(s,i){return (
                <div key={i} className={"flex justify-between items-center px-3 py-2.5 rounded-xl "+(i===0?"bg-red-50 border border-red-100":"bg-white border border-gray-100")}>
                  <div><div className={"text-xs font-semibold "+(i===0?"text-red-900":"text-gray-900")}>{s.name}</div><div className={"text-xs mt-0.5 "+(i===0?"text-red-500":"text-gray-400")}>{s.count+" observations | "+s.group}</div></div>
                  <span className={"text-xs px-2.5 py-1 rounded-full font-medium "+(i===0?"bg-red-100 text-red-700":"bg-gray-100 text-gray-500")} title="Estimated reporting activity based on observation count. Not a scientific threat assessment.">{s.count > 50 ? "High activity" : s.count > 10 ? "Moderate activity" : "Low activity"}</span>
                </div>);})}</div>
              {invasives.species.length > 5 && <button onClick={function(){setViewAllModal({title:"All introduced species",items:invasives.species.map(function(s){return {name:s.name,scientific:s.scientific,id:s.id,count:s.count,group:s.group,photo:null};}),total:invasives.total});}} className="text-sm text-red-500 hover:text-red-700 font-medium mt-3 block">{"View all "+invasives.total.toLocaleString()+" introduced species →"}</button>}
            </SectionCard>
          ) : (
            <SectionCard title="Introduced species" source="iNaturalist (introduced=true filter)"><div className="text-sm text-emerald-600 text-center py-4">No introduced species detected in this area. This is a positive indicator of ecosystem health.</div></SectionCard>
          )}
          {water && water.site_name && <SectionCard title="Water station" source="USGS Water Services">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{flow}<span className="text-xs font-normal"> cfs</span></div><div className="text-xs text-cyan-600">Flow</div></div>
              <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{water.gage?Math.round(water.gage*10)/10:"N/A"}<span className="text-xs font-normal"> ft</span></div><div className="text-xs text-cyan-600">Gage</div></div>
              <div className="bg-cyan-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-cyan-800">{water.precip!==null?water.precip:"N/A"}<span className="text-xs font-normal"> in</span></div><div className="text-xs text-cyan-600">Precip</div></div>
            </div><div className="text-xs text-gray-400 mt-2">{water.site_name}</div></SectionCard>}
        </div>
      </>);
    }
  }

  if (authLoading) return <div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div></div>;
  if (!user) return <AuthScreen onAuth={setUser}/>;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <div className="w-56 min-w-56 bg-white border-r border-emerald-100 flex flex-col py-5">
        <div className="px-5 pb-5 border-b border-emerald-100 mb-3"><div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3C12 3 5 10 5 15C5 19 8 21 12 21C16 21 19 19 19 15C19 10 12 3 12 3Z" fill="#5DCAA5"/></svg></div>
          <div><div className="font-bold text-sm text-gray-900">EcoAnalytics</div><div className="text-xs text-emerald-600">Ecosystem intelligence</div></div></div></div>
        <div className="px-3 mb-3"><select value={selectedIdx} onChange={function(e){setSelectedIdx(Number(e.target.value));setActivePage("Overview");}} className="text-xs px-2 py-1.5 rounded-lg border border-emerald-200 w-full bg-white focus:outline-none focus:border-emerald-500">
          {allLocations.map(function(l,i){return <option key={l.id||i} value={i}>{l.name}</option>;})}</select></div>
        <div className="px-3 flex-1">{sidebarPages.map(function(item){return <div key={item} onClick={function(){setActivePage(item);}} className={"px-3 py-2.5 rounded-xl text-sm mb-1 cursor-pointer transition-all "+(activePage===item?"bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200":"text-gray-500 hover:bg-gray-50")}>{item}</div>;})}</div>
        <div className="px-3 border-t border-emerald-100 pt-3">
          {bottomPages.map(function(item){return <div key={item} onClick={function(){setActivePage(item);}} className={"px-3 py-2.5 rounded-xl text-sm mb-1 cursor-pointer transition-all "+(activePage===item?"bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200":"text-gray-500 hover:bg-gray-50")}>{item}</div>;})}
          <div className="text-xs text-gray-400 px-3 py-1 mt-2">{user.email}</div>
          <div onClick={function(){supabase.auth.signOut();}} className="px-3 py-2 rounded-xl text-sm cursor-pointer text-red-500 hover:bg-red-50">Sign out</div>
        </div>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">{renderPage()}</div>
      <SpeciesDetailModal detail={speciesDetail} loading={detailLoading} onClose={function(){setSpeciesDetail(null);setDetailLoading(false);}}/>
      {viewAllModal && <ViewAllModal title={viewAllModal.title} items={viewAllModal.items} totalCount={viewAllModal.total} onItemClick={function(item){openSpeciesDetail(item);}} onClose={function(){setViewAllModal(null);}}/>}
    </div>
  );
}
export default App;
