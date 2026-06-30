# Walkthrough - ShareSync Platform with Single Directory Setup

We have successfully consolidated the frontend and backend folders into a single root folder structure.

## Core Structural Improvements

1. **Merged Workspace Folders**:
   - Transferred all source files (`src/`, `public/`, config files, assets) from `frontend/` to the root folder.
   - Moved `backend/server.js` to the root folder as `./server.js`.
   - Cleared empty `frontend` and `backend` directories.

2. **Combined Dependencies**:
   - Merged the scripts and dependencies of `frontend/package.json` and `backend/package.json` into a single root `package.json`.
   - Re-installed node modules via a single `npm install` inside the root workspace folder.

3. **Combined Dev Server**:
   - Run both backend and frontend development servers concurrently using:
     ```bash
     npm run dev
     ```
   - Node Express & Socket.io server running at `localhost:5000`
   - Vite React frontend running at `localhost:5173`

4. **Git Repository Status**:
   - Committed all layout changes and successfully pushed the single-directory structure to GitHub.

## Verification Results

The unified monorepo compiles and builds successfully for production:
```bash
vite v5.4.21 building for production...
✓ 1949 modules transformed.
dist/index.html                   0.98 kB
dist/assets/index-DWiEHr4r.css   33.58 kB
dist/assets/index-D2b018GU.js   394.26 kB
✓ built in 6.38s
```
