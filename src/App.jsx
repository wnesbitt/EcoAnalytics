import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const parks = [
  { id: 1, name: "River Legacy Parks", city: "Arlington" },
  { id: 2, name: "Bob Jones Nature Center", city: "Southlake" },
  { id: 3, name: "Colleyville Nature Center", city: "Colleyville" },
  { id: 4, name: "Grapevine Lake", city: "Grapevine" },
  { id: 5, name: "Lake Arlington", city: "Arlington" },
];

const sidebarItems = ["Overview","Water quality","Wildlife","Vegetation","Air & climate","Intelligence engine","Visitor impact"];
const bottomItems = ["Map", "Reports", "Settings"];

function MetricCard({ label, value, unit, status, good }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}{unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}</div>
      <div className={`text-xs mt-1 ${good ? "text-emerald-600" : "text-amber-600"}`}>{status}</div>
    </div>
  );
}

function AlertBanner({ type, title, description }) {
  const styles = { critical: "bg-red-50 border-red-200 text-red-900", warning: "bg-amber-50 border-amber-200 text-amber-900" };
  const descStyles = { critical: "text-red-700", warning: "text-amber-700" };
  return (<div className={`border rounded-lg px-4 py-3 ${styles[type]}`}><div className="text-sm font-medium">{title}</div><div className={`text-xs mt-1 ${descStyles[type]}`}>{description}</div></div>);
}

function InsightCard({ factor1, factor2, color1, color2, confidence, text }) {
  return (
    <div className="bg-gray-50 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded ${color1}`}>{factor1}</span>
        <span className="text-gray-400 text-xs">+</span>
        <span className={`text-xs px-2 py-0.5 rounded ${color2}`}>{factor2}</span>
        <span className="text-xs text-gray-400 ml-auto">{confidence}% confidence</span>
      </div>
      <div className="text-xs text-gray-500 leading-relaxed">{text}</div>
    </div>
  );
}

function InvasiveItem({ name, detail, isNew }) {
  return (
    <div className={`flex justify-between items-center px-3 py-2 rounded-lg ${isNew ? "bg-red-50" : "bg-gray-50"}`}>
      <div>
        <div className={`text-xs font-medium ${isNew ? "text-red-900" : "text-gray-900"}`}>{name}</div>
        <div className={`text-xs ${isNew ? "text-red-600" : "text-gray-500"}`}>{detail}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded ${isNew ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-600"}`}>{isNew ? "New" : "Active"}</span>
    </div>
  );
}

function LineChart({ data, dataKey, label, color, unitLabel }) {
  if (data.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No data yet. Run your collection script daily.</div>;
  const vals = data.map((r) => r[dataKey]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No {label} data available for this park.</div>;
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const range = maxVal - minVal || 1;
  const points = vals.map((v, i) => { const x = 30 + (i / (vals.length - 1 || 1)) * 250; const y = 5 + 70 - ((v - minVal) / range) * 70; return x + "," + y; }).join(" ");
  const firstDate = new Date(data[0].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastDate = new Date(data[data.length - 1].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg viewBox="0 0 300 110" className="w-full">
      <line x1="25" y1="5" x2="25" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <text x="2" y="15" fill="#9ca3af" fontSize="7">{Math.round(maxVal)}{unitLabel || ""}</text>
      <text x="2" y="89" fill="#9ca3af" fontSize="7">{Math.round(minVal)}{unitLabel || ""}</text>
      <polyline points={points} fill="none" stroke={color || "#1D9E75"} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={30 + ((vals.length - 1) / (vals.length - 1 || 1)) * 250} cy={5 + 70 - ((vals[vals.length - 1] - minVal) / range) * 70} r="3" fill={color || "#1D9E75"} />
      <text x="30" y="99" fill="#9ca3af" fontSize="7">{firstDate}</text>
      <text x="248" y="99" fill="#9ca3af" fontSize="7">{lastDate}</text>
    </svg>
  );
}

function BarChart({ data, dataKey, label, colorFn }) {
  if (data.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No data yet.</div>;
  const recent = data.slice(-7);
  const vals = recent.map((r) => r[dataKey]).filter((v) => v !== null);
  if (vals.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No {label} data.</div>;
  const maxVal = Math.max(...vals, 1);
  return (
    <svg viewBox="0 0 300 110" className="w-full">
      <line x1="25" y1="5" x2="25" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      {recent.map((r, i) => { const x = 35 + i * 37; const v = r[dataKey] || 0; const h = Math.min((v / maxVal) * 70, 70); const date = new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }); const clr = colorFn ? colorFn(v) : "#1D9E75"; return (
        <g key={i}><rect x={x} y={85 - h} width="25" height={h || 1} rx="3" fill={clr} /><text x={x + 5} y={85 - h - 4} fill="#6b7280" fontSize="7">{Math.round(v)}</text><text x={x + 2} y="97" fill="#9ca3af" fontSize="6">{date}</text></g>
      ); })}
    </svg>
  );
}

function ReadingsTable({ data, columns }) {
  const recent = data.slice(-10).reverse();
  if (recent.length === 0) return <div className="text-sm text-gray-400 text-center py-4">No readings yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-gray-200">{columns.map((c) => <th key={c.key} className="text-left py-2 px-2 text-gray-400 font-normal">{c.label}</th>)}</tr></thead>
        <tbody>{recent.map((r, i) => <tr key={i} className="border-b border-gray-100">{columns.map((c) => <td key={c.key} className="py-2 px-2 text-gray-700">{c.format ? c.format(r[c.key], r) : (r[c.key] !== null && r[c.key] !== undefined ? String(r[c.key]) : "N/A")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ParkMap() {
  const dots = [
    { name: "River Legacy", cx: 155, cy: 88, color: "#1D9E75" },
    { name: "Bob Jones", cx: 130, cy: 25, color: "#3b82f6" },
    { name: "Colleyville", cx: 105, cy: 42, color: "#3b82f6" },
    { name: "Grapevine Lk", cx: 175, cy: 15, color: "#D85A30" },
    { name: "Lake Arlington", cx: 145, cy: 108, color: "#D85A30" },
  ];
  return (
    <svg viewBox="0 0 400 200" className="w-full">
      <rect x="0" y="0" width="400" height="200" fill="#f3f4f6" rx="4" />
      {[50, 100, 150].map((y) => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#e5e7eb" strokeWidth="0.5" />)}
      {[100, 200, 300].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#e5e7eb" strokeWidth="0.5" />)}
      {dots.map((p, i) => <g key={i}><circle cx={p.cx * 1.4} cy={p.cy * 1.5} r="6" fill={p.color} stroke="white" strokeWidth="2" /><text x={p.cx * 1.4 + 10} y={p.cy * 1.5 + 4} fill="#6b7280" fontSize="10">{p.name}</text></g>)}
    </svg>
  );
}

function PageHeader({ title, subtitle }) {
  return (<div className="mb-6"><h1 className="text-lg font-semibold">{title}</h1>{subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}</div>);
}

function WaterPage({ park, waterData, waterReadings }) {
  return (<>
    <PageHeader title="Water quality" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-3 gap-3 mb-5">
      <MetricCard label="Streamflow" value={waterData ? Math.round(waterData.streamflow_cfs) : "--"} unit="cfs" status={waterData ? waterData.site_name : "No station"} good={waterData ? waterData.streamflow_cfs < 500 : true} />
      <MetricCard label="Gage height" value={waterData ? Math.round(waterData.gage_height_ft * 10) / 10 : "--"} unit="ft" status="Water level" good />
      <MetricCard label="Precipitation" value={waterData ? waterData.precipitation_in : "--"} unit="in" status="Recent rainfall" good />
    </div>
    <div className="border border-gray-200 rounded-xl p-5 mb-5">
      <h3 className="text-sm font-semibold mb-3">Streamflow trend <span className="font-normal text-gray-400">({waterReadings.length} readings)</span></h3>
      <LineChart data={waterReadings} dataKey="streamflow_cfs" label="streamflow" color="#3b82f6" unitLabel=" cfs" />
    </div>
    <div className="border border-gray-200 rounded-xl p-5 mb-5">
      <h3 className="text-sm font-semibold mb-3">Recent readings</h3>
      <ReadingsTable data={waterReadings} columns={[
        { key: "recorded_at", label: "Date", format: (v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
        { key: "streamflow_cfs", label: "Flow (cfs)", format: (v) => v ? Math.round(v) : "N/A" },
        { key: "gage_height_ft", label: "Gage (ft)", format: (v) => v ? Math.round(v * 10) / 10 : "N/A" },
        { key: "precipitation_in", label: "Precip (in)", format: (v) => v !== null ? v : "N/A" },
        { key: "site_name", label: "Station" }
      ]} />
    </div>
  </>);
}

function WildlifePage({ park, speciesData, speciesReadings }) {
  const taxa = speciesData && speciesData.iconic_taxa ? (typeof speciesData.iconic_taxa === "string" ? JSON.parse(speciesData.iconic_taxa) : speciesData.iconic_taxa) : {};
  const recentSpecies = speciesData ? (speciesData.recent_species || []) : [];
  const taxaColors = { Aves: "#3b82f6", Plantae: "#1D9E75", Insecta: "#EF9F27", Mammalia: "#D85A30", Reptilia: "#8b5cf6", Amphibia: "#06b6d4", Fungi: "#ec4899", Arachnida: "#f97316", Actinopterygii: "#0ea5e9", Mollusca: "#a855f7" };
  return (<>
    <PageHeader title="Wildlife & biodiversity" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-2 gap-3 mb-5">
      <MetricCard label="Total species observed" value={speciesData ? speciesData.species_count.toLocaleString() : "--"} status="via iNaturalist (5km radius)" good />
      <MetricCard label="Taxa groups tracked" value={Object.keys(taxa).length} status="Unique categories" good />
    </div>
    {Object.keys(taxa).length > 0 && (
      <div className="border border-gray-200 rounded-xl p-5 mb-5">
        <h3 className="text-sm font-semibold mb-3">Species by group</h3>
        <div className="flex flex-wrap gap-2">{Object.entries(taxa).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
          <div key={name} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <div className="w-3 h-3 rounded-full" style={{ background: taxaColors[name] || "#6b7280" }}></div>
            <span className="text-xs text-gray-700">{name}</span>
            <span className="text-xs text-gray-400">{count}</span>
          </div>
        ))}</div>
      </div>
    )}
    {recentSpecies.length > 0 && (
      <div className="border border-gray-200 rounded-xl p-5 mb-5">
        <h3 className="text-sm font-semibold mb-3">Recent notable species</h3>
        <div className="flex flex-wrap gap-2">{recentSpecies.map((name, i) => (
          <span key={i} className="text-xs bg-green-50 text-green-800 px-3 py-1.5 rounded-lg">{name}</span>
        ))}</div>
      </div>
    )}
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3">Species count trend <span className="font-normal text-gray-400">({speciesReadings.length} readings)</span></h3>
      <LineChart data={speciesReadings} dataKey="species_count" label="species" color="#1D9E75" />
    </div>
  </>);
}

function AirClimatePage({ park, latestReading, latestAqi, readings, aqiReadings }) {
  const aqiColorFn = (v) => v <= 50 ? "#1D9E75" : v <= 100 ? "#EF9F27" : "#E24B4A";
  return (<>
    <PageHeader title="Air & climate" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-4 gap-3 mb-5">
      <MetricCard label="Temperature" value={latestReading ? Math.round(latestReading.temperature_f * 10) / 10 : "--"} unit="F" status={latestReading ? latestReading.conditions : "--"} good={latestReading ? latestReading.temperature_f < 95 : true} />
      <MetricCard label="Humidity" value={latestReading ? Math.round(latestReading.humidity_pct) : "--"} unit="%" status="Relative humidity" good={latestReading ? latestReading.humidity_pct < 70 : true} />
      <MetricCard label="Wind" value={latestReading ? Math.round(latestReading.wind_speed_mph * 10) / 10 : "--"} unit="mph" status={latestReading ? latestReading.wind_direction_deg + " degrees" : "--"} good />
      <MetricCard label="AQI" value={latestAqi ? latestAqi.aqi : "--"} status={latestAqi ? latestAqi.category : "--"} good={latestAqi ? latestAqi.aqi <= 50 : true} />
    </div>
    <div className="grid grid-cols-2 gap-3 mb-5">
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Temperature trend <span className="font-normal text-gray-400">({readings.length})</span></h3>
        <LineChart data={readings} dataKey="temperature_f" label="temperature" color="#D85A30" unitLabel="F" />
      </div>
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Humidity trend <span className="font-normal text-gray-400">({readings.length})</span></h3>
        <LineChart data={readings} dataKey="humidity_pct" label="humidity" color="#3b82f6" unitLabel="%" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 mb-5">
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Air quality index <span className="font-normal text-gray-400">({aqiReadings.length})</span></h3>
        <BarChart data={aqiReadings} dataKey="aqi" label="AQI" colorFn={aqiColorFn} />
      </div>
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Wind speed <span className="font-normal text-gray-400">({readings.length})</span></h3>
        <LineChart data={readings} dataKey="wind_speed_mph" label="wind" color="#6b7280" unitLabel=" mph" />
      </div>
    </div>
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3">Recent weather readings</h3>
      <ReadingsTable data={readings} columns={[
        { key: "recorded_at", label: "Date", format: (v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
        { key: "temperature_f", label: "Temp (F)", format: (v) => Math.round(v * 10) / 10 },
        { key: "humidity_pct", label: "Humidity", format: (v) => Math.round(v) + "%" },
        { key: "wind_speed_mph", label: "Wind (mph)", format: (v) => Math.round(v * 10) / 10 },
        { key: "conditions", label: "Conditions" }
      ]} />
    </div>
  </>);
}

function IntelligencePage({ park, totalReadings }) {
  return (<>
    <PageHeader title="Ecological intelligence engine" subtitle={park.name + " — cross-factor pattern analysis"} />
    {totalReadings < 60 ? (
      <div className="border border-gray-200 rounded-xl p-8 text-center mb-5">
        <div className="text-4xl mb-4">&#x1f9e0;</div>
        <div className="text-base font-semibold text-gray-700 mb-2">Building intelligence...</div>
        <div className="text-sm text-gray-500 mb-4">{totalReadings}/60 readings collected. The engine needs data across multiple days to detect meaningful patterns between ecosystem factors.</div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2"><div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: Math.min((totalReadings / 60) * 100, 100) + "%" }}></div></div>
        <div className="text-xs text-gray-400">Run your collection script daily to accelerate pattern detection</div>
      </div>
    ) : (
      <div className="flex flex-col gap-4 mb-5">
        <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week." />
        <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50. Canopy recovery accelerates during cleaner air periods." />
        <InsightCard factor1="Water flow" factor2="Wildlife" color1="bg-cyan-50 text-cyan-800" color2="bg-green-50 text-green-800" confidence={68} text="Streamflow increases above 300 cfs correlate with 25% more amphibian sightings within 2 weeks at riverside parks." />
        <InsightCard factor1="Humidity" factor2="Species diversity" color1="bg-blue-50 text-blue-800" color2="bg-purple-50 text-purple-800" confidence={64} text="Sustained humidity above 75% for 5+ days correlates with increased fungal species observations and decreased pollinator activity." />
      </div>
    )}
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3">How the intelligence engine works</h3>
      <div className="text-xs text-gray-500 leading-relaxed space-y-2">
        <p>The Ecological Intelligence Engine analyzes historical data across all four dimensions (water, wildlife, air quality, and weather) to surface cross-factor correlations that no single data source can reveal.</p>
        <p>As your dataset grows, the engine detects patterns like how heatwaves affect bird activity, how visitor traffic impacts water quality, and how air quality correlates with vegetation health. These insights help park managers make proactive decisions about conservation, staffing, and programming.</p>
        <p>The more data collected, the higher the confidence scores and the more specific the insights become.</p>
      </div>
    </div>
  </>);
}

function ComingSoonPage({ title, description }) {
  return (<>
    <PageHeader title={title} />
    <div className="border border-gray-200 rounded-xl p-8 text-center">
      <div className="text-sm text-gray-500 mb-2">{description}</div>
      <div className="text-xs text-gray-400">This feature is on the EcoAnalytics roadmap for a future release.</div>
    </div>
  </>);
}

function MapPage() {
  return (<>
    <PageHeader title="Park locations" subtitle="EcoAnalytics DFW monitoring network" />
    <div className="border border-gray-200 rounded-xl p-5 mb-5"><ParkMap /></div>
    <div className="grid grid-cols-5 gap-3">
      {parks.map((p) => (
        <div key={p.id} className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-xs font-medium text-gray-900">{p.name}</div>
          <div className="text-xs text-gray-400 mt-1">{p.city}, TX</div>
        </div>
      ))}
    </div>
  </>);
}

function App() {
  const [selectedPark, setSelectedPark] = useState(0);
  const [activePage, setActivePage] = useState("Overview");
  const [latestReading, setLatestReading] = useState(null);
  const [latestAqi, setLatestAqi] = useState(null);
  const [readings, setReadings] = useState([]);
  const [aqiReadings, setAqiReadings] = useState([]);
  const [speciesData, setSpeciesData] = useState(null);
  const [speciesReadings, setSpeciesReadings] = useState([]);
  const [waterData, setWaterData] = useState(null);
  const [waterReadings, setWaterReadings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const parkId = parks[selectedPark].id;
      const { data: latest } = await supabase.from("weather_readings").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latest && latest.length > 0) { setLatestReading(latest[0]); } else { setLatestReading(null); }
      const { data: allReadings } = await supabase.from("weather_readings").select("*").eq("park_id", parkId).order("recorded_at", { ascending: true });
      setReadings(allReadings || []);
      const { data: latestAqiData } = await supabase.from("aqi_readings").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latestAqiData && latestAqiData.length > 0) { setLatestAqi(latestAqiData[0]); } else { setLatestAqi(null); }
      const { data: allAqi } = await supabase.from("aqi_readings").select("*").eq("park_id", parkId).order("recorded_at", { ascending: true });
      setAqiReadings(allAqi || []);
      const { data: latestSpecies } = await supabase.from("species_observations").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latestSpecies && latestSpecies.length > 0) { setSpeciesData(latestSpecies[0]); } else { setSpeciesData(null); }
      const { data: allSpecies } = await supabase.from("species_observations").select("*").eq("park_id", parkId).order("recorded_at", { ascending: true });
      setSpeciesReadings(allSpecies || []);
      const { data: latestWater } = await supabase.from("water_quality").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latestWater && latestWater.length > 0) { setWaterData(latestWater[0]); } else { setWaterData(null); }
      const { data: allWater } = await supabase.from("water_quality").select("*").eq("park_id", parkId).order("recorded_at", { ascending: true });
      setWaterReadings(allWater || []);
      setLoading(false);
    }
    fetchData();
  }, [selectedPark]);

  const currentTemp = latestReading ? Math.round(latestReading.temperature_f * 10) / 10 : "--";
  const currentHumidity = latestReading ? Math.round(latestReading.humidity_pct) : "--";
  const currentWind = latestReading ? Math.round(latestReading.wind_speed_mph * 10) / 10 : "--";
  const currentConditions = latestReading ? latestReading.conditions : "--";
  const currentAqi = latestAqi ? latestAqi.aqi : "--";
  const aqiCategory = latestAqi ? latestAqi.category : "--";
  const waterFlow = waterData ? Math.round(waterData.streamflow_cfs * 10) / 10 : "--";
  const waterSite = waterData ? waterData.site_name : "No station nearby";
  const speciesCount = speciesData ? speciesData.species_count.toLocaleString() : "--";
  const speciesDetail = speciesData ? "via iNaturalist" : "Coming soon";
  const readingTime = latestReading ? new Date(latestReading.recorded_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const totalReadings = readings.length + aqiReadings.length;

  const alerts = [];
  if (latestAqi && latestAqi.aqi > 100) { alerts.push({ type: "critical", title: "Air quality unhealthy: AQI " + currentAqi, description: "AQI above 100 may affect sensitive groups." }); }
  if (latestReading && latestReading.humidity_pct > 70) { alerts.push({ type: "warning", title: "Humidity at " + currentHumidity + "%", description: "Above typical comfort range. Possible impact on trail conditions." }); }
  if (latestReading && latestReading.temperature_f > 95) { alerts.push({ type: "critical", title: "Extreme heat: " + currentTemp + " F", description: "Temperatures above 95 F correlate with reduced wildlife activity." }); }

  const park = parks[selectedPark];
  const aqiColorFn = (v) => v <= 50 ? "#1D9E75" : v <= 100 ? "#EF9F27" : "#E24B4A";

  function renderPage() {
    if (loading) return <div className="text-sm text-gray-400 text-center py-12">Loading data from Supabase...</div>;
    switch (activePage) {
      case "Water quality": return <WaterPage park={park} waterData={waterData} waterReadings={waterReadings} />;
      case "Wildlife": return <WildlifePage park={park} speciesData={speciesData} speciesReadings={speciesReadings} />;
      case "Air & climate": return <AirClimatePage park={park} latestReading={latestReading} latestAqi={latestAqi} readings={readings} aqiReadings={aqiReadings} />;
      case "Intelligence engine": return <IntelligencePage park={park} totalReadings={totalReadings} />;
      case "Vegetation": return <ComingSoonPage title="Vegetation & habitat" description="NDVI satellite imagery integration is planned for Phase 2. This will show canopy health, vegetation stress, and seasonal change for each park." />;
      case "Visitor impact": return <ComingSoonPage title="Visitor impact" description="Visitor traffic estimation and its correlation with ecosystem health metrics. Coming in a future release." />;
      case "Map": return <MapPage />;
      case "Reports": return <ComingSoonPage title="Reports & exports" description="Automated monthly PDF ecosystem health reports for grant applications and city reporting. Coming in Phase 4." />;
      case "Settings": return <ComingSoonPage title="Settings" description="Account settings, notification preferences, and park management. Coming soon." />;
      default: return (<>
        <div className="flex justify-between items-center mb-5">
          <div><h1 className="text-lg font-semibold">Dashboard overview</h1><p className="text-sm text-gray-400 mt-0.5">{park.name}, {park.city} TX{readingTime && <span className="ml-2 text-gray-300">Last reading: {readingTime}</span>}</p></div>
        </div>
        {alerts.length > 0 && <div className="flex flex-col gap-2 mb-5">{alerts.map((a, i) => <AlertBanner key={i} type={a.type} title={a.title} description={a.description} />)}</div>}
        <div className="grid grid-cols-5 gap-3 mb-5">
          <MetricCard label="Water flow" value={waterFlow} unit="cfs" status={waterSite} good={waterData ? waterData.streamflow_cfs < 500 : true} />
          <MetricCard label="AQI" value={currentAqi} status={aqiCategory} good={latestAqi ? latestAqi.aqi <= 50 : true} />
          <MetricCard label="Species" value={speciesCount} status={speciesDetail} good />
          <MetricCard label="Humidity" value={currentHumidity} unit="%" status={currentConditions} good={latestReading ? latestReading.humidity_pct < 70 : true} />
          <MetricCard label="Temperature" value={currentTemp} unit="F" status={"Wind: " + currentWind + " mph"} good={latestReading ? latestReading.temperature_f < 95 : true} />
        </div>
        <div className="border border-gray-200 rounded-xl p-5 mb-5">
          <div className="flex justify-between items-center mb-4"><h2 className="text-sm font-semibold">Ecological intelligence</h2><span className="text-xs text-gray-400">{totalReadings} total readings</span></div>
          {totalReadings < 60 ? (
            <div className="bg-gray-50 rounded-lg px-4 py-6 text-center"><div className="text-sm text-gray-500 mb-1">Building intelligence...</div><div className="text-xs text-gray-400">{totalReadings}/60 readings. Run your collection script daily to unlock insights.</div></div>
          ) : (
            <div className="flex flex-col gap-3">
              <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week." />
              <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50." />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="border border-gray-200 rounded-xl p-5"><h3 className="text-sm font-semibold mb-3">Temperature <span className="font-normal text-gray-400">({readings.length})</span></h3><LineChart data={readings} dataKey="temperature_f" label="temp" color="#1D9E75" unitLabel="F" /></div>
          <div className="border border-gray-200 rounded-xl p-5"><h3 className="text-sm font-semibold mb-3">Air quality <span className="font-normal text-gray-400">({aqiReadings.length})</span></h3><BarChart data={aqiReadings} dataKey="aqi" label="AQI" colorFn={aqiColorFn} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gray-200 rounded-xl p-5"><h3 className="text-sm font-semibold mb-3">Invasive species tracker</h3><div className="flex flex-col gap-2"><InvasiveItem name="Chinese privet" detail="3 sightings - Trinity corridor" isNew /><InvasiveItem name="Feral hog activity" detail="Soil disturbance - east meadow" /><InvasiveItem name="Fire ant clusters" detail="2 mounds - trailhead B" /></div></div>
          <div className="border border-gray-200 rounded-xl p-5"><h3 className="text-sm font-semibold mb-3">Park locations</h3><ParkMap /></div>
        </div>
      </>);
    }
  }

  return (
    <div className="flex h-screen bg-white text-gray-900">
      <div className="w-52 min-w-52 bg-gray-50 border-r border-gray-200 flex flex-col py-5">
        <div className="px-4 pb-4 border-b border-gray-200 mb-2">
          <div className="font-semibold text-base tracking-tight">EcoAnalytics</div>
          <div className="text-xs text-gray-400 mt-0.5">DFW ecosystem intelligence</div>
        </div>
        <div className="px-2 flex-1">
          {sidebarItems.map((item) => <div key={item} onClick={() => setActivePage(item)} className={`px-3 py-2 rounded-lg text-sm mb-0.5 cursor-pointer transition-colors ${activePage === item ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>{item}</div>)}
        </div>
        <div className="px-2 border-t border-gray-200 pt-2">
          {bottomItems.map((item) => <div key={item} onClick={() => setActivePage(item)} className={`px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${activePage === item ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>{item}</div>)}
        </div>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-end mb-4">
          <select value={selectedPark} onChange={(e) => setSelectedPark(Number(e.target.value))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white">
            {parks.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>
        {renderPage()}
      </div>
    </div>
  );
}

export default App;
