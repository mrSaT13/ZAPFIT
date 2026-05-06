export const api = {
    getRides: () => window.electronAPI.getRides(),
    importGpx: () => window.electronAPI.importGpx(),
    deleteRide: (id) => window.electronAPI.deleteRide(id),
    getStats: () => window.electronAPI.getStats()
};