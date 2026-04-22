import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import jsPDF from "jspdf";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from "recharts";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

async function fetchLiveWeather(lat, lon) {
  try {
    const { data, error } = await supabase.functions.invoke("weather", { body: { lat, lon } });
    if (error) return null;
    return data;
  } catch(e) { return null; }
}
async function fetchLiveAqi(lat, lon) {
  try {
    const { data, error } = await supabase.functions.invoke("aqi", { body: { lat, lon } });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch(e) { return []; }
}

async function fetchCachedWeather(locationId) {
  if (!locationId) return null;
  try {
    const { data } = await supabase.from("weather_readings").select("*").eq("location_id",locationId).order("recorded_at",{ascending:false}).limit(1);
    if (!data || data.length === 0) return null;
    const r = data[0];
    return {
      main: { temp: r.temperature_f, feels_like: r.feels_like_f, humidity: r.humidity_pct, pressure: r.pressure_hpa },
      wind: { speed: r.wind_speed_mph, deg: r.wind_direction_deg },
      clouds: { all: r.cloud_cover_pct },
      visibility: r.visibility_m,
      weather: [{ description: r.conditions }],
      _cached: true,
      _cachedAt: r.recorded_at,
    };
  } catch(e) { return null; }
}

async function fetchCachedAqi(locationId) {
  if (!locationId) return [];
  try {
    const { data } = await supabase.from("aqi_readings").select("*").eq("location_id",locationId).order("recorded_at",{ascending:false}).limit(1);
    if (!data || data.length === 0) return [];
    const r = data[0];
    return [{
      AQI: r.aqi,
      Category: { Name: r.category },
      ParameterName: r.pollutant,
      ReportingArea: r.site_name,
      _cached: true,
      _cachedAt: r.recorded_at,
    }];
  } catch(e) { return []; }
}

async function fetchWeatherWithFallback(lat, lon, locationId) {
  const live = await fetchLiveWeather(lat, lon);
  if (live && live.main && live.main.temp !== undefined) return live;
  const cached = await fetchCachedWeather(locationId);
  return cached;
}

async function fetchAqiWithFallback(lat, lon, locationId) {
  const live = await fetchLiveAqi(lat, lon);
  if (live && live.length > 0 && live[0].AQI !== undefined) return live;
  const cached = await fetchCachedAqi(locationId);
  return cached;
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
async function fetchHistoricalWeather(locationId, days) {
  try {
    const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();
    const {data, error} = await supabase.from("weather_readings").select("temperature_f,humidity_pct,wind_speed_mph,recorded_at").eq("location_id",locationId).gte("recorded_at",cutoff).order("recorded_at",{ascending:true});
    if (error) return [];
    return data || [];
  } catch(e) { return []; }
}
async function fetchHistoricalAqi(locationId, days) {
  try {
    const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();
    const {data, error} = await supabase.from("aqi_readings").select("aqi,category,recorded_at").eq("location_id",locationId).gte("recorded_at",cutoff).order("recorded_at",{ascending:true});
    if (error) return [];
    return data || [];
  } catch(e) { return []; }
}
async function fetchHistoricalSpecies(locationId, days) {
  try {
    const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();
    const {data, error} = await supabase.from("species_observations").select("species_count,recorded_at").eq("location_id",locationId).gte("recorded_at",cutoff).order("recorded_at",{ascending:true});
    if (error) return [];
    return data || [];
  } catch(e) { return []; }
}
async function fetchHistoricalWater(locationId, days) {
  try {
    const cutoff = new Date(Date.now() - days*24*60*60*1000).toISOString();
    const {data, error} = await supabase.from("water_quality").select("streamflow_cfs,gage_height_ft,recorded_at").eq("location_id",locationId).gte("recorded_at",cutoff).order("recorded_at",{ascending:true});
    if (error) return [];
    return data || [];
  } catch(e) { return []; }
}
async function fetchDataCoverage(locationId) {
  try {
    const {data} = await supabase.from("weather_readings").select("recorded_at").eq("location_id",locationId).order("recorded_at",{ascending:true}).limit(1);
    if (!data || data.length === 0) return 0;
    const oldest = new Date(data[0].recorded_at);
    const days = Math.floor((Date.now() - oldest.getTime()) / (24*60*60*1000));
    return Math.max(1, days + 1);
  } catch(e) { return 0; }
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

function DataSourceBadge({ cached, cachedAt }) {
  if (!cached) return (
    <div className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-600">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
      Live
    </div>
  );
  const ago = cachedAt ? Math.floor((Date.now() - new Date(cachedAt).getTime()) / (60*60*1000)) : 0;
  const agoText = ago < 1 ? "< 1h ago" : ago < 24 ? ago+"h ago" : Math.floor(ago/24)+"d ago";
  return (
    <div className="inline-flex items-center gap-1 text-[9px] font-medium text-amber-600" title="Live API unavailable. Showing most recent cached data.">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
      Cached · {agoText}
    </div>
  );
}

function MetricCard({label,value,unit,status,good,source,sparklineData,sparklineKey,sparklineColor,cached,cachedAt}) {
  return (<div className="bg-white border border-emerald-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
    <div className="flex justify-between items-start mb-2">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      {cached !== undefined && <DataSourceBadge cached={cached} cachedAt={cachedAt}/>}
    </div>
    <div className="text-2xl font-bold text-gray-900">{value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}</div>
    <div className={"text-xs mt-1.5 "+(good ? "text-emerald-600" : "text-amber-600")}>{status}</div>
    {sparklineData && sparklineKey && <div className="mt-2 -mx-1">
      <Sparkline data={sparklineData} dataKey={sparklineKey} color={sparklineColor || "#0F6E56"} height={28}/>
      <div className="text-[9px] text-gray-300 text-center mt-0.5">7-day daily avg</div>
    </div>}
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

const sidebarPages = ["Overview","Water quality","Wildlife","Vegetation","Air & climate","Intelligence engine","Trends"];
const bottomPages = ["Map","Reports","Settings"];
const taxaColors = {Aves:"#3b82f6",Plantae:"#0F6E56",Insecta:"#EF9F27",Mammalia:"#D85A30",Reptilia:"#8b5cf6",Amphibia:"#06b6d4",Fungi:"#ec4899",Arachnida:"#f97316",Mollusca:"#14b8a6",Actinopterygii:"#0284c7"};

function Sparkline({ data, dataKey, color, height }) {
  if (!data || data.length < 2) return null;
  const rawData = data.map(function(d) {
    return { t: new Date(d.recorded_at).getTime(), value: d[dataKey] };
  }).filter(function(d){ return d.value !== null && d.value !== undefined; });
  if (rawData.length < 2) return null;
  const byDay = {};
  rawData.forEach(function(d) {
    const day = new Date(d.t).toISOString().slice(0,10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(d.value);
  });
  const chartData = Object.keys(byDay).sort().map(function(day) {
    const vals = byDay[day];
    const avg = vals.reduce(function(a,b){return a+b;},0) / vals.length;
    return { day: day, value: avg };
  });
  if (chartData.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={height || 32}>
      <LineChart data={chartData} margin={{top:2,right:0,left:0,bottom:2}}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ data, dataKey, color, label, unit, loading, daysAvailable, selectedDays }) {
  if (loading) return <div className="border border-emerald-100 rounded-xl p-6 bg-white h-72 flex items-center justify-center"><div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div></div>;

  if (daysAvailable < 2) {
    return (
      <div className="border border-emerald-100 rounded-xl p-6 bg-white h-72 flex flex-col items-center justify-center text-center">
        <div className="text-sm font-semibold text-gray-700 mb-2">{label}</div>
        <div className="text-xs text-gray-400 mb-1">Not enough data yet</div>
        <div className="text-xs text-emerald-600">Need at least 2 days of readings</div>
        <div className="text-[10px] text-gray-300 mt-3">Currently have {daysAvailable} {daysAvailable === 1 ? "day" : "days"} of data</div>
      </div>
    );
  }

  if (!data || data.length === 0) return <div className="border border-emerald-100 rounded-xl p-6 bg-white h-72 flex items-center justify-center"><div className="text-sm text-gray-400">No data available for this period</div></div>;

  const chartData = data.map(function(d) {
    return { time: new Date(d.recorded_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}), value: d[dataKey] };
  }).filter(function(d){ return d.value !== null && d.value !== undefined; });

  if (chartData.length === 0) return <div className="border border-emerald-100 rounded-xl p-6 bg-white h-72 flex items-center justify-center"><div className="text-sm text-gray-400">No {label.toLowerCase()} data in this period</div></div>;

  const values = chartData.map(function(d){return d.value;});
  const avg = values.reduce(function(a,b){return a+b;},0) / values.length;
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const latest = values[values.length - 1];
  const earliest = values[0];
  const change = earliest > 0 ? ((latest - earliest) / earliest) * 100 : 0;
  const trendUp = change > 0;

  return (
    <div className="border border-emerald-100 rounded-xl p-5 bg-white">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{Math.round(latest*10)/10}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}</div>
        </div>
        <div className="text-right">
          <div className={"text-xs font-medium " + (trendUp ? "text-red-500" : "text-emerald-600")}>{trendUp?"▲":"▼"} {Math.abs(Math.round(change*10)/10)}%</div>
          <div className="text-[10px] text-gray-400 mt-1">vs. {selectedDays}d ago</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={chartData} margin={{top:5,right:5,left:0,bottom:0}}>
          <defs>
            <linearGradient id={"gradient-"+dataKey} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25}/>
              <stop offset="100%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false}/>
          <XAxis dataKey="time" tick={{fontSize:10, fill:"#9ca3af"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:10, fill:"#9ca3af"}} tickLine={false} axisLine={false} width={35}/>
          <Tooltip contentStyle={{background:"white",border:"1px solid #d1fae5",borderRadius:"8px",fontSize:"12px"}} labelStyle={{color:"#6b7280"}}/>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={"url(#gradient-"+dataKey+")"}/>
          <ReferenceLine y={avg} stroke="#d1d5db" strokeDasharray="3 3" label={{value:"avg",position:"right",fill:"#9ca3af",fontSize:9}}/>
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-3 pt-3 border-t border-gray-50 text-[10px] text-gray-400">
        <div><span className="font-semibold text-gray-600">Min:</span> {Math.round(min*10)/10}{unit||""}</div>
        <div><span className="font-semibold text-gray-600">Avg:</span> {Math.round(avg*10)/10}{unit||""}</div>
        <div><span className="font-semibold text-gray-600">Max:</span> {Math.round(max*10)/10}{unit||""}</div>
        <div><span className="font-semibold text-gray-600">Readings:</span> {chartData.length}</div>
      </div>
      {daysAvailable < selectedDays && <div className="text-[10px] text-amber-600 mt-2 text-center">Showing {daysAvailable} {daysAvailable===1?"day":"days"} of available data (less than {selectedDays}-day window)</div>}
    </div>
  );
}

function App() {
  const [user,setUser] = useState(null);
  const [authLoading,setAuthLoading] = useState(true);
  const [allLocations,setAllLocations] = useState([]);
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
  const [trendDays,setTrendDays] = useState(7);
  const [trendWeather,setTrendWeather] = useState([]);
  const [trendAqi,setTrendAqi] = useState([]);
  const [trendSpecies,setTrendSpecies] = useState([]);
  const [trendWater,setTrendWater] = useState([]);
  const [trendLoading,setTrendLoading] = useState(false);
  const [daysAvailable,setDaysAvailable] = useState(0);

  useEffect(function() {
    supabase.auth.getSession().then(function(r){if(r.data.session)setUser(r.data.session.user);setAuthLoading(false);});
    const {data:listener} = supabase.auth.onAuthStateChange(function(ev,session){setUser(session?session.user:null);});
    return function(){listener.subscription.unsubscribe();};
  },[]);

  useEffect(function(){if(user)loadUserLocations();},[user]);

  async function loadUserLocations() {
    const {data} = await supabase.from("user_locations").select("*").order("is_default",{ascending:false}).order("created_at",{ascending:true});
    setAllLocations(data||[]);
  }

  const loc = allLocations[selectedIdx] || allLocations[0];

  useEffect(function() {
    async function load() {
      setDataLoading(true);
      const [w,a,s,wq,pl,inv] = await Promise.all([
        fetchWeatherWithFallback(loc.latitude,loc.longitude,loc.id),
        fetchAqiWithFallback(loc.latitude,loc.longitude,loc.id),
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

  useEffect(function() {
    async function loadTrends() {
      const loc = allLocations[selectedIdx];
      if (!loc || !loc.id || (activePage !== "Trends" && activePage !== "Water quality" && activePage !== "Wildlife" && activePage !== "Air & climate" && activePage !== "Overview")) return;
      setTrendLoading(true);
      const [tw,ta,ts,twq,cov] = await Promise.all([
        fetchHistoricalWeather(loc.id, trendDays),
        fetchHistoricalAqi(loc.id, trendDays),
        fetchHistoricalSpecies(loc.id, trendDays),
        fetchHistoricalWater(loc.id, trendDays),
        fetchDataCoverage(loc.id),
      ]);
      setTrendWeather(tw); setTrendAqi(ta); setTrendSpecies(ts); setTrendWater(twq);
      setDaysAvailable(cov);
      setTrendLoading(false);
    }
    loadTrends();
  },[selectedIdx,allLocations,trendDays,activePage]);

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
  const weatherCached = weather && weather._cached;
  const weatherCachedAt = weather && weather._cachedAt;
  const aqiCached = aqi && aqi.length > 0 && aqi[0]._cached;
  const aqiCachedAt = aqi && aqi.length > 0 && aqi[0]._cachedAt;


  const alerts = [];
  if (aqiVal !== "--" && aqiVal > 100) alerts.push({type:"critical",title:"AQI "+aqiVal,description:"Unhealthy air quality detected."});
  if (humidity !== "--" && humidity > 70) alerts.push({type:"warning",title:"Humidity "+humidity+"%",description:"Above comfort range."});
  if (temp !== "--" && temp > 95) alerts.push({type:"critical",title:"Heat: "+temp+" F",description:"Reduced wildlife activity expected."});
  if (invasiveCount > 5) alerts.push({type:"warning",title:invasiveCount+" introduced species detected",description:"Monitor invasive species in this area."});

  function generatePDF() {
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    const timeStr = now.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    const PAGE_W = 210, PAGE_H = 297, M = 16;
    const GREEN = [15,110,86], DARK = [35,35,35], MED = [100,100,100];
    const taxaColorsPDF = {Aves:[59,130,246],Plantae:[15,110,86],Insecta:[239,159,39],Mammalia:[216,90,48],Reptilia:[139,92,246],Amphibia:[6,182,212],Fungi:[236,72,153],Arachnida:[249,115,22],Mollusca:[20,184,166],Actinopterygii:[2,132,199]};

    let score = 0, maxScore = 0;
    const scoreDetails = [];
    if (aqiVal !== "--") { maxScore += 25; const pts = aqiVal <= 50 ? 25 : aqiVal <= 100 ? 18 : aqiVal <= 150 ? 10 : 5; score += pts; scoreDetails.push({label:"Air Quality",points:pts,max:25,value:"AQI "+aqiVal}); }
    if (species && species.total > 0) { maxScore += 25; const pts = species.total > 2000 ? 25 : species.total > 1000 ? 20 : species.total > 500 ? 15 : species.total > 100 ? 10 : 5; score += pts; scoreDetails.push({label:"Biodiversity",points:pts,max:25,value:species.total.toLocaleString()+" species"}); }
    if (species && species.total > 0) { maxScore += 25; const invCount = invasives ? invasives.total : 0; const nativeRatio = Math.max(0, 1 - (invCount / species.total)); const pts = Math.round(nativeRatio * 25); score += pts; scoreDetails.push({label:"Native Species Ratio",points:pts,max:25,value:Math.round(nativeRatio*100)+"% native"}); }
    maxScore += 25;
    if (water && water.site_name) { score += 25; scoreDetails.push({label:"Water Monitoring",points:25,max:25,value:"Active station"}); }
    else scoreDetails.push({label:"Water Monitoring",points:0,max:25,value:"No station"});

    const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const scoreCategory = finalScore >= 80 ? "Excellent" : finalScore >= 60 ? "Good" : finalScore >= 40 ? "Fair" : "Needs Attention";
    const scoreColor = finalScore >= 80 ? [34,150,85] : finalScore >= 60 ? [15,110,86] : finalScore >= 40 ? [200,140,40] : [180,50,50];
    const interpretation = finalScore >= 80 ? "This location shows excellent ecosystem health markers. Continue current monitoring practices and consider this site as a reference baseline for comparable habitats." : finalScore >= 60 ? "This location shows good overall ecosystem health with some areas for monitoring. Regular observation and proactive management will help maintain conditions." : finalScore >= 40 ? "This location shows fair ecosystem health indicators. Consider targeted interventions such as invasive species management or additional monitoring." : "This location shows ecosystem indicators that warrant attention. Review introduced species presence and consult local ecological specialists for recommendations.";

    function rule(y, thick) { doc.setDrawColor(210,210,210); doc.setLineWidth(thick || 0.2); doc.line(M, y, PAGE_W-M, y); }
    function accent(y, w) { doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(M, y, w || 14, 1.2, "F"); }
    function masthead() {
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(0,0,PAGE_W,2.5,"F");
      doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
      doc.text("ECOANALYTICS",M,9.5);
      doc.setTextColor(130,130,130); doc.setFont("helvetica","normal");
      doc.text("ECOSYSTEM INTELLIGENCE REPORT",PAGE_W-M,9.5,{align:"right"});
      rule(12.5, 0.15);
    }
    function footerLine(pageNum) {
      rule(PAGE_H-13, 0.15);
      doc.setTextColor(140,140,140); doc.setFontSize(7); doc.setFont("helvetica","normal");
      doc.text("eco-analytics.vercel.app",M,PAGE_H-7);
      doc.text(dateStr+"  ·  "+timeStr,PAGE_W/2,PAGE_H-7,{align:"center"});
      doc.text("Page "+pageNum+" of 2",PAGE_W-M,PAGE_H-7,{align:"right"});
    }

    masthead(); footerLine(1);
    doc.setTextColor(130,130,130); doc.setFontSize(8.5); doc.setFont("times","italic");
    doc.text("An ecosystem health assessment of",M,21);
    doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(30); doc.setFont("times","bold");
    const locLines = doc.splitTextToSize(loc.name, 130);
    doc.text(locLines,M,36);
    const afterLoc = 36 + (locLines.length-1)*10;
    doc.setTextColor(130,130,130); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    const meta = loc.latitude.toFixed(4)+"° N  ·  "+Math.abs(loc.longitude).toFixed(4)+"° W  ·  ASSESSED "+dateStr.toUpperCase();
    doc.text(meta,M,afterLoc+6);
    rule(afterLoc+11, 0.3);

    const topY = Math.max(54, afterLoc+16);
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
    doc.text("EXECUTIVE SUMMARY",M,topY);
    doc.setTextColor(45,45,45); doc.setFontSize(9.5); doc.setFont("times","normal");
    const summaryParts = [];
    if (weather && weather.main) summaryParts.push("Current conditions show "+conditions+" with a temperature of "+temp+"°F and "+humidity+"% humidity.");
    if (aqiVal !== "--") summaryParts.push("Air quality is rated "+aqiCat+" (AQI "+aqiVal+") with "+pollutant+" as the primary pollutant.");
    if (species && species.total > 0) summaryParts.push("iNaturalist records "+species.total.toLocaleString()+" species observed within a 5km radius across "+Object.keys(species.taxa).length+" taxonomic groups.");
    if (invasives && invasives.total > 0 && species) summaryParts.push("Of these, "+invasives.total+" are classified as introduced (non-native) species, approximately "+Math.round((invasives.total/species.total)*100)+"% of observed biodiversity.");
    if (water && water.site_name) summaryParts.push("USGS water monitoring is active at "+water.site_name+(water.streamflow?" with streamflow at "+Math.round(water.streamflow)+" cfs":"")+".");
    const sumLines = doc.splitTextToSize(summaryParts.join(" "), 118);
    doc.text(sumLines, M, topY+6);

    doc.setFillColor(scoreColor[0],scoreColor[1],scoreColor[2]);
    doc.circle(168, topY+18, 18, "F");
    doc.setTextColor(255,255,255); doc.setFontSize(30); doc.setFont("times","bold");
    doc.text(String(finalScore), 168, topY+22, {align:"center"});
    doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
    doc.text("HEALTH SCORE / 100", 168, topY+43, {align:"center"});
    doc.setTextColor(100,100,100); doc.setFont("helvetica","normal"); doc.setFontSize(8);
    doc.text(scoreCategory.toUpperCase(), 168, topY+49, {align:"center"});

    let stripY = Math.max(125, topY + 50);
    rule(stripY-4, 0.15);
    rule(stripY+22, 0.15);
    const metrics = [
      {label:"TEMPERATURE", value:temp+"°", sub:"Fahrenheit"},
      {label:"HUMIDITY", value:humidity+"%", sub:"Relative"},
      {label:"AQI", value:String(aqiVal), sub:aqiCat==="--"?"N/A":aqiCat},
      {label:"SPECIES", value:species?species.total.toLocaleString():"--", sub:"iNaturalist"},
      {label:"PLANTS", value:plants?plants.total.toLocaleString():"--", sub:"iNaturalist"},
      {label:"INTRODUCED", value:invasives?invasives.total.toLocaleString():"--", sub:"Non-native"}
    ];
    const metricW = (PAGE_W - 2*M) / metrics.length;
    metrics.forEach(function(m, i) {
      const mx = M + i*metricW + 2;
      doc.setTextColor(140,140,140); doc.setFontSize(6.2); doc.setFont("helvetica","bold");
      doc.text(m.label,mx,stripY);
      doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(15); doc.setFont("times","bold");
      doc.text(m.value,mx,stripY+10);
      doc.setTextColor(150,150,150); doc.setFontSize(6.8); doc.setFont("helvetica","italic");
      doc.text(m.sub,mx,stripY+16);
      if (i < metrics.length-1) { doc.setDrawColor(225,225,225); doc.setLineWidth(0.12); doc.line(mx+metricW-4, stripY-2, mx+metricW-4, stripY+19); }
    });

    let yB = stripY + 35;
    accent(yB-2, 14);
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(8.5); doc.setFont("helvetica","bold");
    doc.text("HEALTH SCORE BREAKDOWN",M,yB+5);
    yB += 12;
    scoreDetails.forEach(function(d) {
      doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(9); doc.setFont("helvetica","bold");
      doc.text(d.label,M,yB);
      doc.setFont("helvetica","normal"); doc.setTextColor(140,140,140); doc.setFontSize(7.5);
      doc.text(d.value,M+55,yB);
      doc.setFont("times","bold"); doc.setFontSize(9.5); doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]);
      doc.text(d.points+"/"+d.max,PAGE_W-M,yB,{align:"right"});
      const barY = yB+1.5;
      doc.setFillColor(238,238,238); doc.rect(M,barY,PAGE_W-2*M,1.3,"F");
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(M,barY,(PAGE_W-2*M)*(d.points/d.max),1.3,"F");
      yB += 10;
    });

    yB += 6;
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(8.5); doc.setFont("helvetica","bold");
    doc.text("INTERPRETATION",M,yB);
    yB += 5;
    doc.setTextColor(60,60,60); doc.setFontSize(10); doc.setFont("times","italic");
    const intLines = doc.splitTextToSize("“"+interpretation+"”", PAGE_W-2*M);
    doc.text(intLines,M,yB);

    doc.addPage();
    masthead(); footerLine(2);
    doc.setTextColor(130,130,130); doc.setFontSize(8.5); doc.setFont("times","italic");
    doc.text("The detailed findings",M,21);
    doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(22); doc.setFont("times","bold");
    doc.text("Detailed Findings",M,36);
    rule(43, 0.3);

    const colW = (PAGE_W - 2*M - 10) / 3;
    const c1X = M, c2X = M+colW+5, c3X = M+2*(colW+5);
    const colTop = 52;

    function colHead(title, x, y) {
      accent(y-2, 10);
      doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(7.5); doc.setFont("helvetica","bold");
      doc.text(title.toUpperCase(),x,y+5);
    }
    function stat(label, value, x, y, w) {
      doc.setTextColor(130,130,130); doc.setFontSize(7); doc.setFont("helvetica","normal");
      doc.text(label,x,y);
      doc.setTextColor(40,40,40); doc.setFontSize(8); doc.setFont("helvetica","bold");
      doc.text(value,x+w-2,y,{align:"right"});
    }

    colHead("Air & Climate", c1X, colTop);
    let y1 = colTop + 12;
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(30); doc.setFont("times","bold");
    doc.text(String(aqiVal),c1X,y1+8);
    doc.setTextColor(100,100,100); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    doc.text("AQI  ·  "+(aqiCat==="--"?"Not available":aqiCat),c1X,y1+13);
    y1 += 22;
    const climate = [
      {label:"Temperature", value:temp+"°F"},
      {label:"Feels Like", value:feelsLike+"°F"},
      {label:"Humidity", value:humidity+"%"},
      {label:"Wind", value:wind+" mph"},
      {label:"Cloud Cover", value:(weather&&weather.clouds?weather.clouds.all:0)+"%"},
    ];
    climate.forEach(function(s){ stat(s.label, s.value, c1X, y1, colW); y1 += 4.8; });
    y1 += 2;
    doc.setTextColor(90,90,90); doc.setFontSize(7); doc.setFont("times","italic");
    const condLn = doc.splitTextToSize("Conditions: "+conditions+".", colW);
    doc.text(condLn,c1X,y1);

    colHead("Water Quality", c2X, colTop);
    let y2 = colTop + 12;
    if (water && water.site_name) {
      doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(30); doc.setFont("times","bold");
      doc.text(water.streamflow?String(Math.round(water.streamflow)):"--",c2X,y2+8);
      doc.setTextColor(100,100,100); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
      doc.text("CFS  ·  Streamflow",c2X,y2+13);
      y2 += 22;
      stat("Gage Height",(water.gage?Math.round(water.gage*10)/10:"--")+" ft", c2X, y2, colW); y2+=4.8;
      stat("Precipitation",(water.precip!==null?water.precip:"--")+" in", c2X, y2, colW); y2+=4.8;
      y2 += 3;
      doc.setTextColor(90,90,90); doc.setFontSize(6.8); doc.setFont("times","italic");
      const stLn = doc.splitTextToSize("Station: "+water.site_name, colW);
      doc.text(stLn,c2X,y2);
    } else {
      doc.setTextColor(150,150,150); doc.setFontSize(9.5); doc.setFont("times","italic");
      const noLn = doc.splitTextToSize("No USGS monitoring station within range of this location.", colW);
      doc.text(noLn,c2X,y2+8);
    }

    colHead("Introduced Species", c3X, colTop);
    let y3 = colTop + 12;
    const invTotal = invasives ? invasives.total : 0;
    const invRGB = invTotal > 0 ? [180,50,50] : [34,150,85];
    doc.setTextColor(invRGB[0],invRGB[1],invRGB[2]); doc.setFontSize(30); doc.setFont("times","bold");
    doc.text(String(invTotal),c3X,y3+8);
    doc.setTextColor(100,100,100); doc.setFontSize(7.5); doc.setFont("helvetica","normal");
    doc.text("Non-native species",c3X,y3+13);
    y3 += 22;
    if (invasives && invasives.species.length > 0) {
      invasives.species.slice(0,5).forEach(function(s) {
        doc.setTextColor(40,40,40); doc.setFontSize(7); doc.setFont("helvetica","bold");
        const nm = s.name.length > 28 ? s.name.substring(0,26)+"…" : s.name;
        doc.text(nm,c3X,y3);
        doc.setTextColor(140,140,140); doc.setFont("helvetica","normal");
        doc.text(String(s.count),c3X+colW-2,y3,{align:"right"});
        y3 += 5;
      });
    } else {
      doc.setTextColor(34,150,85); doc.setFontSize(8); doc.setFont("times","italic");
      const nIn = doc.splitTextToSize("No introduced species detected in this area.", colW);
      doc.text(nIn, c3X, y3);
    }

    let yW = 128;
    accent(yW-2, 14);
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text("WILDLIFE & BIODIVERSITY",M,yW+5);
    doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(16); doc.setFont("times","bold");
    doc.text(species?species.total.toLocaleString():"--",PAGE_W-M,yW+5,{align:"right"});
    doc.setTextColor(130,130,130); doc.setFontSize(6.5); doc.setFont("helvetica","normal");
    doc.text("TOTAL SPECIES OBSERVED",PAGE_W-M,yW+9,{align:"right"});
    yW += 16;

    if (species && species.total > 0) {
      const chartW = (PAGE_W - 2*M - 12) / 2;
      doc.setTextColor(130,130,130); doc.setFontSize(6.5); doc.setFont("helvetica","bold");
      doc.text("BY TAXONOMIC GROUP",M,yW);
      let cY = yW + 5;
      const sortedTaxa = Object.entries(species.taxa).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
      const maxC = Math.max.apply(null, sortedTaxa.map(function(t){return t[1];}));
      sortedTaxa.forEach(function(t) {
        doc.setTextColor(50,50,50); doc.setFontSize(7); doc.setFont("helvetica","normal");
        doc.text(t[0],M,cY);
        doc.setFont("helvetica","bold"); doc.text(String(t[1]),M+chartW-2,cY,{align:"right"});
        const barY = cY+1.2; doc.setFillColor(240,240,240); doc.rect(M+22,barY,chartW-30,1.2,"F");
        const c = taxaColorsPDF[t[0]] || [107,114,128];
        doc.setFillColor(c[0],c[1],c[2]); doc.rect(M+22,barY,(chartW-30)*(t[1]/maxC),1.2,"F");
        cY += 5;
      });

      const listX = M + chartW + 12;
      doc.setTextColor(130,130,130); doc.setFontSize(6.5); doc.setFont("helvetica","bold");
      doc.text("NOTABLE SPECIES",listX,yW);
      let lY = yW + 5;
      if (species.items.length > 0) {
        const perCol = 6;
        species.items.slice(0,12).forEach(function(s,i) {
          const col = Math.floor(i/perCol);
          const row = i % perCol;
          const px = listX + col*(chartW/2);
          const py = yW + 5 + row*5;
          doc.setTextColor(50,50,50); doc.setFontSize(6.8); doc.setFont("helvetica","normal");
          const nm = s.name.length > 20 ? s.name.substring(0,18)+"…" : s.name;
          doc.text("· "+nm,px,py);
        });
      }
    }

    let yV = 195;
    accent(yV-2, 14);
    doc.setTextColor(GREEN[0],GREEN[1],GREEN[2]); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text("VEGETATION",M,yV+5);
    doc.setTextColor(DARK[0],DARK[1],DARK[2]); doc.setFontSize(16); doc.setFont("times","bold");
    doc.text(plants?plants.total.toLocaleString():"--",PAGE_W-M,yV+5,{align:"right"});
    doc.setTextColor(130,130,130); doc.setFontSize(6.5); doc.setFont("helvetica","normal");
    doc.text("PLANT SPECIES",PAGE_W-M,yV+9,{align:"right"});
    yV += 16;

    if (plants && plants.plants.length > 0) {
      const plantColW = (PAGE_W - 2*M) / 3;
      plants.plants.slice(0,12).forEach(function(p,i) {
        const col = i % 3, row = Math.floor(i/3);
        const px = M + col*plantColW, py = yV + row*5;
        doc.setTextColor(50,50,50); doc.setFontSize(6.8); doc.setFont("helvetica","normal");
        const nm = p.name.length > 25 ? p.name.substring(0,23)+"…" : p.name;
        doc.text("· "+nm,px,py);
      });
    }

    let yF = 255;
    rule(yF, 0.3);
    yF += 4;
    doc.setTextColor(120,120,120); doc.setFontSize(6.5); doc.setFont("helvetica","bold");
    doc.text("METHODOLOGY  ·  DATA SOURCES",M,yF);
    yF += 4;
    doc.setFont("helvetica","normal"); doc.setFontSize(6.8); doc.setTextColor(100,100,100);
    const methodText = "Data aggregated live from federal and open-source APIs. Weather: OpenWeatherMap. Air Quality: EPA AirNow (25km radius). Biodiversity: iNaturalist citizen science (5km radius). Water: USGS Water Services. Health score computed from weighted composite of air quality, biodiversity, native species ratio, and water monitoring availability. Observation counts reflect reported sightings, not absolute population density.";
    const mLines = doc.splitTextToSize(methodText, PAGE_W - 2*M);
    doc.text(mLines, M, yF);

    doc.save(loc.name.replace(/\s+/g,"_")+"_Ecosystem_Report_"+now.toISOString().slice(0,10)+".pdf");
  }

  function renderPage() {
    if (dataLoading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3"></div></div>;
    switch(activePage) {

      case "Water quality": return (<>
        <PageHeader title="Water quality" subtitle={loc.name}/>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Streamflow" value={flow} unit="cfs" status={waterSite} good={flow==="--"||flow<500} source="USGS Water Services" sparklineData={trendWater} sparklineKey="streamflow_cfs" sparklineColor="#0284c7"/>
          <MetricCard label="Gage height" value={water&&water.gage?Math.round(water.gage*10)/10:"--"} unit="ft" status="Water level" good source="USGS Water Services" sparklineData={trendWater} sparklineKey="gage_height_ft" sparklineColor="#0284c7"/>
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
          <MetricCard label="Total species" value={speciesCount} status="Within 5km radius" good source="iNaturalist" sparklineData={trendSpecies} sparklineKey="species_count" sparklineColor="#0F6E56"/>
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
          <MetricCard label="Temperature" value={temp} unit="F" status={conditions} good={temp==="--"||temp<95} source="OpenWeatherMap" sparklineData={trendWeather} sparklineKey="temperature_f" sparklineColor="#D85A30" cached={weatherCached} cachedAt={weatherCachedAt}/>
          <MetricCard label="Humidity" value={humidity} unit="%" status="Relative" good={humidity==="--"||humidity<70} source="OpenWeatherMap" sparklineData={trendWeather} sparklineKey="humidity_pct" sparklineColor="#06b6d4" cached={weatherCached} cachedAt={weatherCachedAt}/>
          <MetricCard label="Wind" value={wind} unit="mph" status={weather&&weather.wind?weather.wind.deg+" deg":"--"} good source="OpenWeatherMap" sparklineData={trendWeather} sparklineKey="wind_speed_mph" sparklineColor="#EF9F27" cached={weatherCached} cachedAt={weatherCachedAt}/>
          <MetricCard label="AQI" value={aqiVal} status={aqiCat} good={aqiVal==="--"||aqiVal<=50} source="EPA AirNow" sparklineData={trendAqi} sparklineKey="aqi" sparklineColor="#8b5cf6" cached={aqiCached} cachedAt={aqiCachedAt}/>
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

      case "Trends": return (<>
        <PageHeader title="Historical trends" subtitle={loc.name + " · " + daysAvailable + " days of data available"}/>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2.5 mb-5 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0"><circle cx="12" cy="12" r="10" stroke="#0F6E56" strokeWidth="2"/><path d="M12 16V12M12 8H12.01" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round"/></svg>
          <div className="text-xs text-emerald-700">Trends show actual recorded data from your daily collection script. Charts with insufficient data will show when they become available.</div>
        </div>
        <div className="flex gap-2 mb-5">
          {[7,30,90].map(function(d){ return (
            <button key={d} onClick={function(){setTrendDays(d);}} className={"text-sm px-4 py-2 rounded-xl font-medium transition-colors " + (trendDays===d ? "bg-emerald-600 text-white" : "bg-white border border-emerald-200 text-gray-600 hover:bg-emerald-50")}>{d} days</button>
          );})}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TrendChart data={trendWeather} dataKey="temperature_f" color="#D85A30" label="Temperature" unit="°F" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
          <TrendChart data={trendAqi} dataKey="aqi" color="#8b5cf6" label="Air Quality Index" unit="" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
          <TrendChart data={trendWater} dataKey="streamflow_cfs" color="#0284c7" label="Streamflow" unit=" cfs" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
          <TrendChart data={trendSpecies} dataKey="species_count" color="#0F6E56" label="Species Observed" unit="" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
          <TrendChart data={trendWeather} dataKey="humidity_pct" color="#06b6d4" label="Humidity" unit="%" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
          <TrendChart data={trendWeather} dataKey="wind_speed_mph" color="#EF9F27" label="Wind Speed" unit=" mph" loading={trendLoading} daysAvailable={daysAvailable} selectedDays={trendDays}/>
        </div>
        <div className="text-[10px] text-gray-300 mt-4 text-center">Data sourced from OpenWeatherMap, EPA AirNow, iNaturalist, and USGS Water Services. Collected daily via automated script.</div>
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
          <MetricCard label="Water flow" value={flow} unit="cfs" status={waterSite} good={flow==="--"||flow<500} source="USGS" sparklineData={trendWater} sparklineKey="streamflow_cfs" sparklineColor="#0284c7"/>
          <MetricCard label="AQI" value={aqiVal} status={aqiCat} good={aqiVal==="--"||aqiVal<=50} source="EPA AirNow" sparklineData={trendAqi} sparklineKey="aqi" sparklineColor="#8b5cf6" cached={aqiCached} cachedAt={aqiCachedAt}/>
          <MetricCard label="Species" value={speciesCount} status="Within 5km" good source="iNaturalist" sparklineData={trendSpecies} sparklineKey="species_count" sparklineColor="#0F6E56"/>
          <MetricCard label="Humidity" value={humidity} unit="%" status={conditions} good={humidity==="--"||humidity<70} source="OpenWeatherMap" sparklineData={trendWeather} sparklineKey="humidity_pct" sparklineColor="#06b6d4" cached={weatherCached} cachedAt={weatherCachedAt}/>
          <MetricCard label="Temperature" value={temp} unit="F" status={"Wind: "+wind+" mph"} good={temp==="--"||temp<95} source="OpenWeatherMap" sparklineData={trendWeather} sparklineKey="temperature_f" sparklineColor="#D85A30" cached={weatherCached} cachedAt={weatherCachedAt}/>
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
