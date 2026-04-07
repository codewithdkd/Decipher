// Magazine View Tracker (localStorage only)
class MagazineViewTracker {
    constructor() {
        this.viewData = null;
        this.dataFile = 'magazine-views.json';
    }

    async init() {
        this.loadFromLocalStorage();
        await this.loadViewData();
    }

    async loadViewData() {
        try {
            const response = await fetch(this.dataFile);
            if (response.ok) {
                const fileData = await response.json();
                if (this.viewData && this.viewData.views) {
                    const merged = { views: {}, lastUpdated: new Date().toISOString() };
                    const allKeys = new Set([
                        ...Object.keys(fileData.views || {}),
                        ...Object.keys(this.viewData.views || {})
                    ]);
                    allKeys.forEach((k) => {
                        const fileCount = (fileData.views || {})[k] || 0;
                        const localCount = (this.viewData.views || {})[k] || 0;
                        merged.views[k] = Math.max(fileCount, localCount);
                    });
                    this.viewData = merged;
                } else {
                    this.viewData = fileData;
                }
            } else {
                this.viewData = {
                    views: {
                        "Jan-March 2025": 0,
                        "April-June 2025": 0,
                        "Jan-June 2024": 0,
                        "July-Sept 2024": 0,
                        "Oct-Dec 2024": 0
                    },
                    lastUpdated: new Date().toISOString()
                };
            }
        } catch (error) {
            this.viewData = {
                views: {
                    "Jan-March 2025": 0,
                    "April-June 2025": 0,
                    "Jan-June 2024": 0,
                    "July-Sept 2024": 0,
                    "Oct-Dec 2024": 0
                },
                lastUpdated: new Date().toISOString()
            };
        }
    }

    async incrementView(magazineName) {
        if (!this.viewData) {
            await this.loadViewData();
        }

        if (this.viewData.views[magazineName] !== undefined) {
            this.viewData.views[magazineName]++;
        } else {
            this.viewData.views[magazineName] = 1;
        }

        this.viewData.lastUpdated = new Date().toISOString();
        localStorage.setItem('magazineViews', JSON.stringify(this.viewData));
    }

    getTopMagazines(count = 4) {
        if (!this.viewData) {
            return [];
        }

        return Object.entries(this.viewData.views)
            .map(([name, views]) => ({ name, views }))
            .sort((a, b) => b.views - a.views)
            .slice(0, count);
    }

    getViewCount(magazineName) {
        return this.viewData ? this.viewData.views[magazineName] || 0 : 0;
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('magazineViews');
            if (stored) {
                this.viewData = JSON.parse(stored);
            }
        } catch (error) {
            /* silently fail */
        }
    }
}

// Global instance
window.magazineTracker = new MagazineViewTracker();
