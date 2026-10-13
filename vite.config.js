import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// VITE_CLINIC picks the brand (src/brand.js). A typo would quietly build the
// wrong clinic's look, so the build stops instead.
const CLINICS = ['kidzlounge', 'pedsdesk']

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const clinic = loadEnv(mode, process.cwd()).VITE_CLINIC
  if (!CLINICS.includes(clinic)) throw new Error(`VITE_CLINIC must be one of ${CLINICS.join(', ')} (got "${clinic}").`)
  return { plugins: [react()] }
})
