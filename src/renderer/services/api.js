export const api = {
    getRides: () => {
        const a = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        return a && a.getRides ? a.getRides() : Promise.resolve([]);
    },
    importGpx: () => {
        const a = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        return a && a.importGpx ? a.importGpx() : Promise.resolve(null);
    },
    deleteRide: (id) => {
        const a = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        return a && a.deleteRide ? a.deleteRide(id) : Promise.resolve(null);
    },
    getStats: () => {
        const a = (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;
        return a && a.getStats ? a.getStats() : Promise.resolve(null);
    }
};