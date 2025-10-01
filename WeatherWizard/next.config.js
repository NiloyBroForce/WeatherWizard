/** @type {import('next').NextConfig} */
const nextConfig = {
	// We explicitly disable React Strict Mode here to ensure that useEffects
	// which are intended to run once on mount (like map initialization or initial data fetch)
	// do not run twice during development, which is common in a single-page environment.
	reactStrictMode: false,

	// You might add configuration here for:
	// 1. Image optimization domain (if using <Image /> component)
	// 2. Environment variables (if not using .env files)
	// 3. Rewrites/Redirects (to proxy external calls, though the API route is better for this)

	// Since all external dependencies were removed from the React code and
	// Leaflet/React-Leaflet are not supported in this environment,
	// no special external configuration is needed.
};

module.exports = nextConfig;
