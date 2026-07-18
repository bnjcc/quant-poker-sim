const nextConfig = {
  // Keep Turbopack scoped to this app when a parent directory also has a lockfile.
  turbopack: {
    root: process.cwd(),
  },
};
module.exports = nextConfig;
