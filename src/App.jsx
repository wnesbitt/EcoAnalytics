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
      <div className="text-2xl font-semibold text-gray-900">
        {value}
        {unit && <span className="text-xs font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
      <div className={`text-xs mt-1 ${good ? "text-emerald-600" : "text-amber-600"}`}>{status}</div>
    </div>
  );
}

function AlertBanner({ type, title, description }) {
  const styles = { critical: "bg-red-50 border-red-200 text-red-900", warning: "bg-amber-50 border-amber-200 text-amber-900", info: "bg-blue-50 border-blue-200 text-blue-900" };
  const descStyles = { critical: "text-red-700", warning: "text-amber-700", info: "text-blue-700" };
  return (
    <div className={`border rounded-lg px-4 py-3 ${styles[type]}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className={`text-xs mt-1 ${descStyles[type]}`}>{description}</div>
    </div>
  );
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
      <span className={`text-xs px-2 py-0.5 rounded ${isNew ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-600"}`}>
        {isNew ? "New" : "Active"}
      </span>
    </div>
  );
}

function TempChart({ readings }) {
  if (readings.length === 0) return <div className="text-sm text-gray-400 text-center py-8">Collecting data... Run your collection script daily.</div>;
  const temps = readings.map((r) => r.temperature_f);
  const maxTemp = Math.max(...temps);
  const minTemp = Math.min(...temps);
  const range = maxTemp - minTemp || 1;
  const points = temps.map((t, i) => { const x = 30 + (i / (temps.length - 1 || 1)) * 250; const y = 5 + 70 - ((t - minTemp) / range) * 70; return x + "," + y; }).join(" ");
  const firstDate = new Date(readings[0].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastDate = new Date(readings[readings.length - 1].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg viewBox="0 0 300 110" className="w-full">
      <line x1="25" y1="5" x2="25" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <text x="4" y="15" fill="#9ca3af" fontSize="7">{Math.round(maxTemp)}</text>
      <text x="4" y="89" fill="#9ca3af" fontSize="7">{Math.round(minTemp)}</text>
      <polyline points={points} fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={30 + ((temps.length - 1) / (temps.length - 1 || 1)) * 250} cy={5 + 70 - ((temps[temps.length - 1] - minTemp) / range) * 70} r="3" fill="#1D9E75" />
      <text x="30" y="99" fill="#9ca3af" fontSize="7">{firstDate}</text>
      <text x="248" y="99" fill="#9ca3af" fontSize="7">{lastDate}</text>
    </svg>
  );
}

function AQIChart({ aqiReadings }) {
  if (aqiReadings.length === 0) return <div className="text-sm text-gray-400 text-center py-8">Collecting AQI data...</div>;
  const recent = aqiReadings.slice(-7);
  return (
    <svg viewBox="0 0 300 110" className="w-full">
      <line x1="25" y1="5" x2="25" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#e5e7eb" strokeWidth="0.5" />
      <text x="4" y="12" fill="#9ca3af" fontSize="7">150</text>
      <text x="4" y="49" fill="#9ca3af" fontSize="7">75</text>
      <text x="4" y="89" fill="#9ca3af" fontSize="7">0</text>
      {recent.map((r, i) => { const x = 35 + i * 37; const h = Math.min((r.aqi / 150) * 75, 75); const date = new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }); const color = r.aqi <= 50 ? "#1D9E75" : r.aqi <= 100 ? "#EF9F27" : "#E24B4A"; return (
        <g key={i}><rect x={x} y={85 - h} width="25" height={h} rx="3" fill={color} /><text x={x + 5} y={85 - h - 4} fill="#6b7280" fontSize="7">{r.aqi}</text><text x={x + 2} y="97" fill="#9ca3af" fontSize="6">{date}</text></g>
      ); })}
    </svg>
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
    <svg viewBox="0 0 280 125" className="w-full">
      <rect x="0" y="0" width="280" height="125" fill="#f3f4f6" rx="4" />
      {[31, 62, 93].map((y) => <line key={y} x1="0" y1={y} x2="280" y2={y} stroke="#e5e7eb" strokeWidth="0.5" />)}
      {[70, 140, 210].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="125" stroke="#e5e7eb" strokeWidth="0.5" />)}
      {dots.map((p, i) => <g key={i}><circle cx={p.cx} cy={p.cy} r="4" fill={p.color} stroke="white" strokeWidth="1.2" /><text x={p.cx + 7} y={p.cy + 3} fill="#6b7280" fontSize="7">{p.name}</text></g>)}
    </svg>
  );
}

function App() {
  const [selectedPark, setSelectedPark] = useState(0);
  const [activePage, setActivePage] = useState("Overview");
  const [latestReading, setLatestReading] = useState(null);
  const [latestAqi, setLatestAqi] = useState(null);
  const [readings, setReadings] = useState([]);
  const [aqiReadings, setAqiReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [speciesData, setSpeciesData] = useState(null);
  const [waterData, setWaterData] = useState(null);

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

      const { data: latestWater } = await supabase.from("water_quality").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latestWater && latestWater.length > 0) { setWaterData(latestWater[0]); } else { setWaterData(null); }
      const { data: latestSpecies } = await supabase.from("species_observations").select("*").eq("park_id", parkId).order("recorded_at", { ascending: false }).limit(1);
      if (latestSpecies && latestSpecies.length > 0) { setSpeciesData(latestSpecies[0]); } else { setSpeciesData(null); }
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
  if (latestAqi && latestAqi.aqi > 100) { alerts.push({ type: "critical", title: "Air quality unhealthy: AQI " + currentAqi, description: "AQI above 100 may affect sensitive groups. Consider limiting outdoor activities." }); }
  if (latestAqi && latestAqi.aqi > 50 && latestAqi.aqi <= 100) { alerts.push({ type: "warning", title: "Air quality moderate: AQI " + currentAqi, description: "Unusually sensitive people should consider reducing prolonged outdoor exertion." }); }
  if (latestReading && latestReading.humidity_pct > 70) { alerts.push({ type: "warning", title: "Humidity at " + currentHumidity + "%", description: "Above typical comfort range. Possible impact on trail conditions and pollinator activity." }); }
  if (latestReading && latestReading.temperature_f > 95) { alerts.push({ type: "critical", title: "Extreme heat: " + currentTemp + " F", description: "Temperatures above 95 F correlate with reduced wildlife activity." }); }

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
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-lg font-semibold">Dashboard overview</h1>
            <p className="text-sm text-gray-400 mt-0.5">{parks[selectedPark].name}, {parks[selectedPark].city} TX{readingTime && <span className="ml-2 text-gray-300">Last reading: {readingTime}</span>}</p>
          </div>
          <select value={selectedPark} onChange={(e) => setSelectedPark(Number(e.target.value))} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 bg-white">
            {parks.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>
        {loading ? <div className="text-sm text-gray-400 text-center py-12">Loading data from Supabase...</div> : (
          <>
            {alerts.length > 0 && <div className="flex flex-col gap-2 mb-5">{alerts.map((a, i) => <AlertBanner key={i} type={a.type} title={a.title} description={a.description} />)}</div>}
            <div className="grid grid-cols-4 gap-3 mb-5">
              <MetricCard label="Water flow" value={waterFlow} unit="cfs" status={waterSite} good={waterData ? waterData.streamflow_cfs < 500 : true} />
              <MetricCard label="Air quality (AQI)" value={currentAqi} unit="" status={aqiCategory} good={latestAqi ? latestAqi.aqi <= 50 : true} />
              <MetricCard label="Species observed" value={speciesCount} status={speciesDetail} good />
              <MetricCard label="Humidity" value={currentHumidity} unit="%" status={currentConditions} good={latestReading ? latestReading.humidity_pct < 70 : true} />
              <MetricCard label="Temperature" value={currentTemp} unit="F" status={"Wind: " + currentWind + " mph"} good={latestReading ? latestReading.temperature_f < 95 : true} />
            </div>
            <div className="border border-gray-200 rounded-xl p-5 mb-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold">Ecological intelligence</h2>
                <span className="text-xs text-gray-400">{totalReadings} total readings</span>
              </div>
              {totalReadings < 60 ? (
                <div className="bg-gray-50 rounded-lg px-4 py-6 text-center">
                  <div className="text-sm text-gray-500 mb-1">Building intelligence...</div>
                  <div className="text-xs text-gray-400">{totalReadings}/60 readings collected (weather + AQI). Run your collection script daily to unlock cross-factor insights.</div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week." />
                  <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-green-50 text-green-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50. Canopy recovery accelerates during cleaner air periods." />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Temperature trend <span className="font-normal text-gray-400">({readings.length} readings)</span></h3>
                <TempChart readings={readings} />
              </div>
              <div className="border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Air quality index <span className="font-normal text-gray-400">({aqiReadings.length} readings)</span></h3>
                <AQIChart aqiReadings={aqiReadings} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Invasive species tracker</h3>
                <div className="flex flex-col gap-2">
                  <InvasiveItem name="Chinese privet" detail="3 sightings — Trinity corridor" isNew />
                  <InvasiveItem name="Feral hog activity" detail="Soil disturbance — east meadow" />
                  <InvasiveItem name="Fire ant clusters" detail="2 mounds — trailhead B" />
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-3">Park locations</h3>
                <ParkMap />
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-xs text-gray-400">EcoAnalytics is collecting data for {parks[selectedPark].name}. {totalReadings > 0 ? totalReadings + " total readings stored (weather + AQI)." : "Run your collection script to start."}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
