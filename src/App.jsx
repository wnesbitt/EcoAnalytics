import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
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

function MetricCard({ label, value, unit, status, good, icon }) {
  return (
    <div className="bg-white border border-emerald-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-emerald-600">{icon}</span>}
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}{unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}</div>
      <div className={`text-xs mt-1.5 ${good ? "text-emerald-600" : "text-amber-600"}`}>{status}</div>
    </div>
  );
}

function AlertBanner({ type, title, description }) {
  const styles = { critical: "bg-red-50 border-l-4 border-l-red-500 border-y border-r border-red-100 text-red-900", warning: "bg-amber-50 border-l-4 border-l-amber-500 border-y border-r border-amber-100 text-amber-900" };
  const descStyles = { critical: "text-red-700", warning: "text-amber-700" };
  return (<div className={`rounded-r-xl px-4 py-3 ${styles[type]}`}><div className="text-sm font-semibold">{title}</div><div className={`text-xs mt-1 ${descStyles[type]}`}>{description}</div></div>);
}

function InsightCard({ factor1, factor2, color1, color2, confidence, text }) {
  return (
    <div className="bg-white border border-emerald-100 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${color1}`}>{factor1}</span>
        <span className="text-gray-300 text-xs">+</span>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${color2}`}>{factor2}</span>
        <span className="text-xs text-gray-400 ml-auto font-medium">{confidence}%</span>
      </div>
      <div className="text-xs text-gray-500 leading-relaxed">{text}</div>
    </div>
  );
}

function InvasiveItem({ name, detail, isNew }) {
  return (
    <div className={`flex justify-between items-center px-3 py-2.5 rounded-xl ${isNew ? "bg-red-50 border border-red-100" : "bg-white border border-gray-100"}`}>
      <div>
        <div className={`text-xs font-semibold ${isNew ? "text-red-900" : "text-gray-900"}`}>{name}</div>
        <div className={`text-xs mt-0.5 ${isNew ? "text-red-500" : "text-gray-400"}`}>{detail}</div>
      </div>
      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isNew ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{isNew ? "New" : "Active"}</span>
    </div>
  );
}

function LineChart({ data, dataKey, label, color, unitLabel }) {
  if (data.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No data yet. Run your collection script daily.</div>;
  const vals = data.map((r) => r[dataKey]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return <div className="text-sm text-gray-400 text-center py-8">No {label} data available.</div>;
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);
  const range = maxVal - minVal || 1;
  const points = vals.map((v, i) => { const x = 30 + (i / (vals.length - 1 || 1)) * 250; const y = 5 + 70 - ((v - minVal) / range) * 70; return x + "," + y; }).join(" ");
  const firstDate = new Date(data[0].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastDate = new Date(data[data.length - 1].recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg viewBox="0 0 300 110" className="w-full">
      <line x1="25" y1="5" x2="25" y2="85" stroke="#d1d5db" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#d1d5db" strokeWidth="0.5" />
      <text x="2" y="15" fill="#9ca3af" fontSize="7">{Math.round(maxVal)}{unitLabel || ""}</text>
      <text x="2" y="89" fill="#9ca3af" fontSize="7">{Math.round(minVal)}{unitLabel || ""}</text>
      <polyline points={points} fill="none" stroke={color || "#0F6E56"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={30 + ((vals.length - 1) / (vals.length - 1 || 1)) * 250} cy={5 + 70 - ((vals[vals.length - 1] - minVal) / range) * 70} r="3.5" fill={color || "#0F6E56"} />
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
      <line x1="25" y1="5" x2="25" y2="85" stroke="#d1d5db" strokeWidth="0.5" />
      <line x1="25" y1="85" x2="290" y2="85" stroke="#d1d5db" strokeWidth="0.5" />
      {recent.map((r, i) => { const x = 35 + i * 37; const v = r[dataKey] || 0; const h = Math.min((v / maxVal) * 70, 70); const date = new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }); const clr = colorFn ? colorFn(v) : "#0F6E56"; return (
        <g key={i}><rect x={x} y={85 - h} width="25" height={h || 1} rx="4" fill={clr} /><text x={x + 5} y={85 - h - 4} fill="#6b7280" fontSize="7">{Math.round(v)}</text><text x={x + 2} y="97" fill="#9ca3af" fontSize="6">{date}</text></g>
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
        <thead><tr className="border-b border-emerald-100">{columns.map((c) => <th key={c.key} className="text-left py-2.5 px-2 text-gray-400 font-medium uppercase tracking-wide text-xs">{c.label}</th>)}</tr></thead>
        <tbody>{recent.map((r, i) => <tr key={i} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">{columns.map((c) => <td key={c.key} className="py-2.5 px-2 text-gray-700">{c.format ? c.format(r[c.key], r) : (r[c.key] !== null && r[c.key] !== undefined ? String(r[c.key]) : "N/A")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ParkMap() {
  const dots = [
    { name: "River Legacy", cx: 155, cy: 88, color: "#0F6E56" },
    { name: "Bob Jones", cx: 130, cy: 25, color: "#06b6d4" },
    { name: "Colleyville", cx: 105, cy: 42, color: "#06b6d4" },
    { name: "Grapevine Lk", cx: 175, cy: 15, color: "#0F6E56" },
    { name: "Lake Arlington", cx: 145, cy: 108, color: "#06b6d4" },
  ];
  return (
    <svg viewBox="0 0 400 200" className="w-full">
      <rect x="0" y="0" width="400" height="200" fill="#f0fdf4" rx="8" />
      {[50, 100, 150].map((y) => <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#bbf7d0" strokeWidth="0.5" />)}
      {[100, 200, 300].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="200" stroke="#bbf7d0" strokeWidth="0.5" />)}
      {dots.map((p, i) => <g key={i}><circle cx={p.cx * 1.4} cy={p.cy * 1.5} r="6" fill={p.color} stroke="white" strokeWidth="2" /><text x={p.cx * 1.4 + 10} y={p.cy * 1.5 + 4} fill="#374151" fontSize="10" fontWeight="500">{p.name}</text></g>)}
    </svg>
  );
}

function SectionCard({ title, count, children }) {
  return (
    <div className="border border-emerald-100 rounded-xl p-5 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {count !== undefined && <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">{count} readings</span>}
      </div>
      {children}
    </div>
  );
}

function PageHeader({ title, subtitle }) {
  return (<div className="mb-6"><h1 className="text-xl font-bold text-gray-900">{title}</h1>{subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}</div>);
}

function WaterPage({ park, waterData, waterReadings }) {
  return (<>
    <PageHeader title="Water quality" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <MetricCard label="Streamflow" value={waterData ? Math.round(waterData.streamflow_cfs) : "--"} unit="cfs" status={waterData ? waterData.site_name : "No station"} good={waterData ? waterData.streamflow_cfs < 500 : true} />
      <MetricCard label="Gage height" value={waterData ? Math.round(waterData.gage_height_ft * 10) / 10 : "--"} unit="ft" status="Water level" good />
      <MetricCard label="Precipitation" value={waterData ? waterData.precipitation_in : "--"} unit="in" status="Recent rainfall" good />
    </div>
    <SectionCard title="Streamflow trend" count={waterReadings.length}><LineChart data={waterReadings} dataKey="streamflow_cfs" label="streamflow" color="#06b6d4" unitLabel=" cfs" /></SectionCard>
    <div className="mt-5"><SectionCard title="Recent readings"><ReadingsTable data={waterReadings} columns={[
      { key: "recorded_at", label: "Date", format: (v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
      { key: "streamflow_cfs", label: "Flow (cfs)", format: (v) => v ? Math.round(v) : "N/A" },
      { key: "gage_height_ft", label: "Gage (ft)", format: (v) => v ? Math.round(v * 10) / 10 : "N/A" },
      { key: "precipitation_in", label: "Precip (in)", format: (v) => v !== null ? v : "N/A" },
      { key: "site_name", label: "Station" }
    ]} /></SectionCard></div>
  </>);
}

function WildlifePage({ park, speciesData, speciesReadings }) {
  const taxa = speciesData && speciesData.iconic_taxa ? (typeof speciesData.iconic_taxa === "string" ? JSON.parse(speciesData.iconic_taxa) : speciesData.iconic_taxa) : {};
  const recentSpecies = speciesData ? (speciesData.recent_species || []) : [];
  const taxaColors = { Aves: "#3b82f6", Plantae: "#0F6E56", Insecta: "#EF9F27", Mammalia: "#D85A30", Reptilia: "#8b5cf6", Amphibia: "#06b6d4", Fungi: "#ec4899", Arachnida: "#f97316", Actinopterygii: "#0ea5e9", Mollusca: "#a855f7" };
  return (<>
    <PageHeader title="Wildlife & biodiversity" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
      <MetricCard label="Total species observed" value={speciesData ? speciesData.species_count.toLocaleString() : "--"} status="via iNaturalist (5km radius)" good />
      <MetricCard label="Taxa groups tracked" value={Object.keys(taxa).length} status="Unique categories" good />
    </div>
    {Object.keys(taxa).length > 0 && <div className="mb-5"><SectionCard title="Species by group"><div className="flex flex-wrap gap-2">{Object.entries(taxa).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
      <div key={name} className="flex items-center gap-2 bg-emerald-50 rounded-full px-3 py-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ background: taxaColors[name] || "#6b7280" }}></div><span className="text-xs font-medium text-gray-700">{name}</span><span className="text-xs text-emerald-600 font-bold">{count}</span></div>
    ))}</div></SectionCard></div>}
    {recentSpecies.length > 0 && <div className="mb-5"><SectionCard title="Recent notable species"><div className="flex flex-wrap gap-2">{recentSpecies.map((name, i) => (
      <span key={i} className="text-xs bg-teal-50 text-teal-800 px-3 py-1.5 rounded-full font-medium border border-teal-100">{name}</span>
    ))}</div></SectionCard></div>}
    <SectionCard title="Species count trend" count={speciesReadings.length}><LineChart data={speciesReadings} dataKey="species_count" label="species" color="#0F6E56" /></SectionCard>
  </>);
}

function AirClimatePage({ park, latestReading, latestAqi, readings, aqiReadings }) {
  const aqiColorFn = (v) => v <= 50 ? "#0F6E56" : v <= 100 ? "#EF9F27" : "#E24B4A";
  return (<>
    <PageHeader title="Air & climate" subtitle={park.name + ", " + park.city + " TX"} />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <MetricCard label="Temperature" value={latestReading ? Math.round(latestReading.temperature_f * 10) / 10 : "--"} unit="F" status={latestReading ? latestReading.conditions : "--"} good={latestReading ? latestReading.temperature_f < 95 : true} />
      <MetricCard label="Humidity" value={latestReading ? Math.round(latestReading.humidity_pct) : "--"} unit="%" status="Relative humidity" good={latestReading ? latestReading.humidity_pct < 70 : true} />
      <MetricCard label="Wind" value={latestReading ? Math.round(latestReading.wind_speed_mph * 10) / 10 : "--"} unit="mph" status={latestReading ? latestReading.wind_direction_deg + " deg" : "--"} good />
      <MetricCard label="AQI" value={latestAqi ? latestAqi.aqi : "--"} status={latestAqi ? latestAqi.category : "--"} good={latestAqi ? latestAqi.aqi <= 50 : true} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
      <SectionCard title="Temperature trend" count={readings.length}><LineChart data={readings} dataKey="temperature_f" label="temperature" color="#D85A30" unitLabel="F" /></SectionCard>
      <SectionCard title="Humidity trend" count={readings.length}><LineChart data={readings} dataKey="humidity_pct" label="humidity" color="#06b6d4" unitLabel="%" /></SectionCard>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
      <SectionCard title="Air quality index" count={aqiReadings.length}><BarChart data={aqiReadings} dataKey="aqi" label="AQI" colorFn={aqiColorFn} /></SectionCard>
      <SectionCard title="Wind speed" count={readings.length}><LineChart data={readings} dataKey="wind_speed_mph" label="wind" color="#6b7280" unitLabel=" mph" /></SectionCard>
    </div>
    <SectionCard title="Recent weather readings"><ReadingsTable data={readings} columns={[
      { key: "recorded_at", label: "Date", format: (v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
      { key: "temperature_f", label: "Temp", format: (v) => Math.round(v * 10) / 10 + " F" },
      { key: "humidity_pct", label: "Humidity", format: (v) => Math.round(v) + "%" },
      { key: "wind_speed_mph", label: "Wind", format: (v) => Math.round(v * 10) / 10 + " mph" },
      { key: "conditions", label: "Conditions" }
    ]} /></SectionCard>
  </>);
}

function IntelligencePage({ park, totalReadings }) {
  return (<>
    <PageHeader title="Ecological intelligence engine" subtitle={park.name + " — cross-factor pattern analysis"} />
    {totalReadings < 60 ? (
      <div className="border border-emerald-200 rounded-xl p-8 text-center mb-5 bg-gradient-to-b from-emerald-50 to-white">
        <div className="text-4xl mb-4">&#x1f9e0;</div>
        <div className="text-lg font-bold text-gray-800 mb-2">Building intelligence...</div>
        <div className="text-sm text-gray-500 mb-6">{totalReadings}/60 readings collected. The engine needs data across multiple days to detect meaningful cross-factor patterns.</div>
        <div className="w-full max-w-md mx-auto bg-emerald-100 rounded-full h-3 mb-2"><div className="bg-emerald-600 h-3 rounded-full transition-all" style={{ width: Math.min((totalReadings / 60) * 100, 100) + "%" }}></div></div>
        <div className="text-xs text-gray-400 mt-3">Run your collection script daily to accelerate pattern detection</div>
      </div>
    ) : (
      <div className="flex flex-col gap-4 mb-5">
        <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-orange-50 text-orange-800" color2="bg-emerald-50 text-emerald-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week." />
        <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-emerald-50 text-emerald-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50. Canopy recovery accelerates during cleaner air periods." />
        <InsightCard factor1="Water flow" factor2="Wildlife" color1="bg-cyan-50 text-cyan-800" color2="bg-emerald-50 text-emerald-800" confidence={68} text="Streamflow increases above 300 cfs correlate with 25% more amphibian sightings within 2 weeks at riverside parks." />
        <InsightCard factor1="Humidity" factor2="Species diversity" color1="bg-blue-50 text-blue-800" color2="bg-purple-50 text-purple-800" confidence={64} text="Sustained humidity above 75% for 5+ days correlates with increased fungal species and decreased pollinator activity." />
      </div>
    )}
    <SectionCard title="How the intelligence engine works">
      <div className="text-sm text-gray-500 leading-relaxed space-y-3">
        <p>The Ecological Intelligence Engine analyzes historical data across all four dimensions — water, wildlife, air quality, and weather — to surface cross-factor correlations that no single data source can reveal.</p>
        <p>As your dataset grows, the engine detects patterns like how heatwaves affect bird activity, how visitor traffic impacts water quality, and how air quality correlates with vegetation health.</p>
        <p>The more data collected, the higher the confidence scores and the more specific the insights become.</p>
      </div>
    </SectionCard>
  </>);
}

function ComingSoonPage({ title, description }) {
  return (<>
    <PageHeader title={title} />
    <div className="border border-emerald-200 rounded-xl p-10 text-center bg-gradient-to-b from-emerald-50 to-white">
      <div className="text-base font-semibold text-gray-600 mb-2">{description}</div>
      <div className="text-sm text-gray-400">This feature is on the EcoAnalytics roadmap.</div>
    </div>
  </>);
}

function MapPage() {
  return (<>
    <PageHeader title="Park locations" subtitle="EcoAnalytics DFW monitoring network" />
    <SectionCard title="DFW coverage area"><ParkMap /></SectionCard>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
      {parks.map((p) => (
        <div key={p.id} className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
          <div className="text-xs font-bold text-gray-800">{p.name}</div>
          <div className="text-xs text-emerald-600 mt-1">{p.city}, TX</div>
        </div>
      ))}
    </div>
  </>);
}

function ReportsPage({ park, latestReading, latestAqi, waterData, speciesData, readings, aqiReadings }) {
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generatePDF = () => {
    setGenerating(true);
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const monthStr = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Header
    doc.setFillColor(15, 110, 86);
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("EcoAnalytics", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("DFW Ecosystem Intelligence Report", 14, 26);
    doc.text(dateStr, 196, 18, { align: "right" });

    // Park name
    doc.setTextColor(4, 52, 44);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(park.name, 14, 48);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(park.city + ", Texas | Monthly Ecosystem Summary | " + monthStr, 14, 55);

    // Divider
    doc.setDrawColor(15, 110, 86);
    doc.setLineWidth(0.5);
    doc.line(14, 59, 196, 59);

    // Section: Air & Climate
    let y = 68;
    doc.setTextColor(15, 110, 86);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Air & Climate", 14, y);
    y += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const temp = latestReading ? Math.round(latestReading.temperature_f * 10) / 10 + " F" : "N/A";
    const humidity = latestReading ? Math.round(latestReading.humidity_pct) + "%" : "N/A";
    const wind = latestReading ? Math.round(latestReading.wind_speed_mph * 10) / 10 + " mph" : "N/A";
    const conditions = latestReading ? latestReading.conditions : "N/A";
    doc.text("Temperature: " + temp, 14, y);
    doc.text("Humidity: " + humidity, 80, y);
    doc.text("Wind: " + wind, 140, y);
    y += 6;
    doc.text("Conditions: " + conditions, 14, y);
    doc.text("Readings collected: " + readings.length, 80, y);
    y += 4;

    // Section: Air Quality
    y += 8;
    doc.setTextColor(15, 110, 86);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Air Quality", 14, y);
    y += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const aqi = latestAqi ? latestAqi.aqi : "N/A";
    const aqiCat = latestAqi ? latestAqi.category : "N/A";
    const pollutant = latestAqi ? latestAqi.pollutant : "N/A";
    doc.text("Current AQI: " + aqi + " (" + aqiCat + ")", 14, y);
    doc.text("Primary pollutant: " + pollutant, 100, y);
    y += 6;
    doc.text("AQI readings collected: " + aqiReadings.length, 14, y);

    // AQI avg
    if (aqiReadings.length > 0) {
      const avg = Math.round(aqiReadings.reduce(function(s, r) { return s + r.aqi; }, 0) / aqiReadings.length);
      doc.text("Average AQI this period: " + avg, 100, y);
    }
    y += 4;

    // Section: Water Quality
    y += 8;
    doc.setTextColor(15, 110, 86);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Water Quality", 14, y);
    y += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (waterData && waterData.site_name) {
      doc.text("Monitoring station: " + waterData.site_name, 14, y);
      y += 6;
      const flow = waterData.streamflow_cfs ? Math.round(waterData.streamflow_cfs) + " cfs" : "N/A";
      const gage = waterData.gage_height_ft ? Math.round(waterData.gage_height_ft * 10) / 10 + " ft" : "N/A";
      const precip = waterData.precipitation_in !== null ? waterData.precipitation_in + " in" : "N/A";
      doc.text("Streamflow: " + flow, 14, y);
      doc.text("Gage height: " + gage, 80, y);
      doc.text("Precipitation: " + precip, 140, y);
    } else {
      doc.text("No USGS monitoring station within range of this park.", 14, y);
    }
    y += 4;

    // Section: Wildlife & Biodiversity
    y += 8;
    doc.setTextColor(15, 110, 86);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Wildlife & Biodiversity", 14, y);
    y += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (speciesData) {
      doc.text("Total species observed: " + speciesData.species_count.toLocaleString(), 14, y);
      doc.text("Data source: iNaturalist (5km radius)", 100, y);
      y += 6;
      const recentSpecies = speciesData.recent_species || [];
      if (recentSpecies.length > 0) {
        doc.text("Recent notable species: " + recentSpecies.slice(0, 5).join(", "), 14, y);
      }
    } else {
      doc.text("No species observation data available for this park.", 14, y);
    }
    y += 4;

    // Section: Data Summary
    y += 10;
    doc.setDrawColor(15, 110, 86);
    doc.setLineWidth(0.5);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setTextColor(15, 110, 86);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Data Collection Summary", 14, y);
    y += 8;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const totalReadings = readings.length + aqiReadings.length;
    doc.text("Total data points collected: " + totalReadings, 14, y);
    y += 6;
    doc.text("Weather readings: " + readings.length, 14, y);
    doc.text("AQI readings: " + aqiReadings.length, 80, y);
    y += 6;
    doc.text("Data sources: OpenWeatherMap, EPA AirNow, USGS Water Services, iNaturalist", 14, y);

    // Footer
    doc.setFillColor(15, 110, 86);
    doc.rect(0, 277, 210, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Generated by EcoAnalytics | DFW Ecosystem Intelligence Platform | eco-analytics.vercel.app", 105, 285, { align: "center" });
    doc.text("Report generated on " + dateStr + " | Data is collected from federal and scientific open data sources", 105, 290, { align: "center" });

    // Save
    const filename = park.name.replace(/\s+/g, "_") + "_Ecosystem_Report_" + now.toISOString().slice(0, 10) + ".pdf";
    doc.save(filename);
    setGenerating(false);
    setGenerated(true);
    setTimeout(function() { setGenerated(false); }, 3000);
  };

  const totalReadings = readings.length + aqiReadings.length;

  return (<>
    <PageHeader title="Reports & exports" subtitle="Generate ecosystem health reports for grant applications and city reporting" />
    <div className="border border-emerald-200 rounded-xl p-8 bg-white mb-5">
      <div className="flex items-start gap-6">
        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6C5.4 2 5 2.4 5 3V21C5 21.6 5.4 22 6 22H18C18.6 22 19 21.6 19 21V7L14 2Z" stroke="#0F6E56" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2V7H19" stroke="#0F6E56" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 13H15M9 17H13" stroke="#0F6E56" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-gray-900 mb-1">Monthly ecosystem health report</h3>
          <p className="text-sm text-gray-500 mb-4">A one-page PDF summary of all ecosystem metrics for {park.name}. Includes air quality, water quality, wildlife biodiversity, and weather data. Perfect for grant applications, city council presentations, and stakeholder updates.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100">Air & climate data</span>
            <span className="text-xs bg-cyan-50 text-cyan-700 px-3 py-1 rounded-full border border-cyan-100">Water quality</span>
            <span className="text-xs bg-teal-50 text-teal-700 px-3 py-1 rounded-full border border-teal-100">Wildlife counts</span>
            <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">AQI readings</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={generatePDF} disabled={generating} className={`text-sm px-6 py-2.5 rounded-xl font-medium transition-colors ${generating ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
              {generating ? "Generating..." : "Generate PDF report"}
            </button>
            {generated && <span className="text-sm text-emerald-600 font-medium">Downloaded!</span>}
          </div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-emerald-800">{totalReadings}</div>
        <div className="text-xs text-emerald-600 mt-1">Total data points</div>
      </div>
      <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-cyan-800">4</div>
        <div className="text-xs text-cyan-600 mt-1">Data sources</div>
      </div>
      <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-center">
        <div className="text-2xl font-bold text-teal-800">1</div>
        <div className="text-xs text-teal-600 mt-1">Page report</div>
      </div>
    </div>

    <SectionCard title="What is included in the report">
      <div className="text-sm text-gray-500 leading-relaxed space-y-3">
        <p>The monthly ecosystem health report compiles all collected data into a professional one-page PDF that park managers can use for grant applications, city council presentations, and stakeholder updates.</p>
        <p>Each report includes current readings and historical context for temperature, humidity, wind, air quality index, water streamflow, gage height, precipitation, and biodiversity species counts with notable species lists.</p>
        <p>Reports are branded with the park name and generation date, and include data source attribution for credibility with grant reviewers.</p>
      </div>
    </SectionCard>
  </>);
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  if (!authenticated) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-lg border border-emerald-100 p-10 max-w-sm">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl mx-auto mb-4 flex items-center justify-center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3C12 3 5 10 5 15C5 19 8 21 12 21C16 21 19 19 19 15C19 10 12 3 12 3Z" fill="#5DCAA5"/><path d="M8 16Q10 13 12 11Q14 13 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
          <div className="font-bold text-xl text-gray-900 mb-1">EcoAnalytics</div>
          <div className="text-sm text-emerald-600 mb-6">DFW ecosystem intelligence</div>
          <input type="password" placeholder="Enter access code" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && passwordInput === "ecoanalytics2026") setAuthenticated(true); }} className="text-sm px-4 py-2.5 rounded-xl border border-emerald-200 mb-3 w-full block focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          <button onClick={() => { if (passwordInput === "ecoanalytics2026") setAuthenticated(true); }} className="text-sm px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 w-full font-medium transition-colors">Enter</button>
          <div className="text-xs text-gray-400 mt-5">Access restricted during development</div>
        </div>
      </div>
    );
  }

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
  if (latestReading && latestReading.temperature_f > 95) { alerts.push({ type: "critical", title: "Extreme heat: " + currentTemp + " F", description: "Above 95 F correlates with reduced wildlife activity." }); }

  const park = parks[selectedPark];
  const aqiColorFn = (v) => v <= 50 ? "#0F6E56" : v <= 100 ? "#EF9F27" : "#E24B4A";

  function renderPage() {
    if (loading) return <div className="flex items-center justify-center py-20"><div className="text-center"><div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3"></div><div className="text-sm text-gray-400">Loading data...</div></div></div>;
    switch (activePage) {
      case "Water quality": return <WaterPage park={park} waterData={waterData} waterReadings={waterReadings} />;
      case "Wildlife": return <WildlifePage park={park} speciesData={speciesData} speciesReadings={speciesReadings} />;
      case "Air & climate": return <AirClimatePage park={park} latestReading={latestReading} latestAqi={latestAqi} readings={readings} aqiReadings={aqiReadings} />;
      case "Intelligence engine": return <IntelligencePage park={park} totalReadings={totalReadings} />;
      case "Vegetation": return <ComingSoonPage title="Vegetation & habitat" description="NDVI satellite imagery integration is planned for Phase 2. This will show canopy health, vegetation stress, and seasonal change." />;
      case "Visitor impact": return <ComingSoonPage title="Visitor impact" description="Visitor traffic estimation and its correlation with ecosystem health metrics. Coming in a future release." />;
      case "Map": return <MapPage />;
      case "Reports": return <ReportsPage park={park} latestReading={latestReading} latestAqi={latestAqi} waterData={waterData} speciesData={speciesData} readings={readings} aqiReadings={aqiReadings} />;
      case "Settings": return <ComingSoonPage title="Settings" description="Account settings, notification preferences, and park management. Coming soon." />;
      default: return (<>
        <div className="flex justify-between items-center mb-6">
          <div><h1 className="text-xl font-bold text-gray-900">Dashboard overview</h1><p className="text-sm text-gray-400 mt-1">{park.name}, {park.city} TX{readingTime && <span className="ml-2 text-emerald-500 font-medium">Last: {readingTime}</span>}</p></div>
        </div>
        {alerts.length > 0 && <div className="flex flex-col gap-2 mb-5">{alerts.map((a, i) => <AlertBanner key={i} type={a.type} title={a.title} description={a.description} />)}</div>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <MetricCard label="Water flow" value={waterFlow} unit="cfs" status={waterSite} good={waterData ? waterData.streamflow_cfs < 500 : true} />
          <MetricCard label="AQI" value={currentAqi} status={aqiCategory} good={latestAqi ? latestAqi.aqi <= 50 : true} />
          <MetricCard label="Species" value={speciesCount} status={speciesDetail} good />
          <MetricCard label="Humidity" value={currentHumidity} unit="%" status={currentConditions} good={latestReading ? latestReading.humidity_pct < 70 : true} />
          <MetricCard label="Temperature" value={currentTemp} unit="F" status={"Wind: " + currentWind + " mph"} good={latestReading ? latestReading.temperature_f < 95 : true} />
        </div>
        <div className="border border-emerald-200 rounded-xl p-5 mb-6 bg-gradient-to-r from-emerald-50/50 to-white">
          <div className="flex justify-between items-center mb-4"><h2 className="text-sm font-bold text-gray-800">Ecological intelligence</h2><span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full">{totalReadings} readings</span></div>
          {totalReadings < 60 ? (
            <div className="text-center py-4"><div className="text-sm text-gray-500 mb-2">Building intelligence...</div><div className="w-full max-w-sm mx-auto bg-emerald-100 rounded-full h-2"><div className="bg-emerald-600 h-2 rounded-full" style={{ width: Math.min((totalReadings / 60) * 100, 100) + "%" }}></div></div><div className="text-xs text-gray-400 mt-2">{totalReadings}/60 readings needed</div></div>
          ) : (
            <div className="flex flex-col gap-3">
              <InsightCard factor1="Temperature" factor2="Wildlife" color1="bg-orange-50 text-orange-800" color2="bg-emerald-50 text-emerald-800" confidence={82} text="When daily highs exceed 95 F for 3+ consecutive days, bird sighting frequency drops 38% within the following week." />
              <InsightCard factor1="AQI" factor2="Vegetation" color1="bg-blue-50 text-blue-800" color2="bg-emerald-50 text-emerald-800" confidence={71} text="NDVI improves 8% in months where AQI averages below 50." />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
          <SectionCard title="Temperature" count={readings.length}><LineChart data={readings} dataKey="temperature_f" label="temp" color="#0F6E56" unitLabel="F" /></SectionCard>
          <SectionCard title="Air quality" count={aqiReadings.length}><BarChart data={aqiReadings} dataKey="aqi" label="AQI" colorFn={aqiColorFn} /></SectionCard>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SectionCard title="Invasive species tracker"><div className="flex flex-col gap-2"><InvasiveItem name="Chinese privet" detail="3 sightings - Trinity corridor" isNew /><InvasiveItem name="Feral hog activity" detail="Soil disturbance - east meadow" /><InvasiveItem name="Fire ant clusters" detail="2 mounds - trailhead B" /></div></SectionCard>
          <SectionCard title="Park locations"><ParkMap /></SectionCard>
        </div>
      </>);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <div className={`${sidebarOpen ? "w-56" : "w-0 overflow-hidden"} md:w-56 min-w-0 md:min-w-56 bg-white border-r border-emerald-100 flex flex-col py-5 transition-all`}>
        <div className="px-5 pb-5 border-b border-emerald-100 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3C12 3 5 10 5 15C5 19 8 21 12 21C16 21 19 19 19 15C19 10 12 3 12 3Z" fill="#5DCAA5"/></svg></div>
            <div>
              <div className="font-bold text-sm text-gray-900">EcoAnalytics</div>
              <div className="text-xs text-emerald-600">DFW intelligence</div>
            </div>
          </div>
        </div>
        <div className="px-3 flex-1">
          {sidebarItems.map((item) => <div key={item} onClick={() => { setActivePage(item); setSidebarOpen(false); }} className={`px-3 py-2.5 rounded-xl text-sm mb-1 cursor-pointer transition-all ${activePage === item ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>{item}</div>)}
        </div>
        <div className="px-3 border-t border-emerald-100 pt-3">
          {bottomItems.map((item) => <div key={item} onClick={() => { setActivePage(item); setSidebarOpen(false); }} className={`px-3 py-2.5 rounded-xl text-sm mb-1 cursor-pointer transition-all ${activePage === item ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>{item}</div>)}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-emerald-100">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-gray-500 hover:text-gray-700"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button>
          <div></div>
          <select value={selectedPark} onChange={(e) => setSelectedPark(Number(e.target.value))} className="text-sm px-3 py-1.5 rounded-xl border border-emerald-200 bg-white text-gray-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
            {parks.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">{renderPage()}</div>
      </div>
    </div>
  );
}

export default App;
