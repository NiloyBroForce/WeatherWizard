import dynamic from 'next/dynamic';

// Dynamically import the MapComponent with SSR disabled
// This is essential because Leaflet relies on the 'window' object,
// which is not available during server-side rendering.
const DynamicMap = dynamic(
  () => import('../components/MapComponent'),
  { ssr: false } // Crucial: Disable server-side rendering
);

// This is the main page component that renders the application
export default function Home() {
  return (
    <main className="h-screen w-screen">
      {/* The Map component handles the entire application UI and logic */}
      <DynamicMap />
    </main>
  );
}
