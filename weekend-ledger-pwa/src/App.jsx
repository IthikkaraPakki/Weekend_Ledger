import WeekendTimeLedger from "./WeekendTimeLedger.jsx";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#12161A" }} className="flex justify-center">
      <div className="w-full" style={{ maxWidth: 880 }}>
        <WeekendTimeLedger />
      </div>
    </div>
  );
}
