/* Copyright 2023 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { subclass, property } from "@arcgis/core/core/accessorSupport/decorators";
import Widget from "@arcgis/core/widgets/Widget";
import { tsx } from "@arcgis/core/widgets/support/widget";
import Camera from "@arcgis/core/Camera";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import AppState from "./AppState";
import { marsNamesLayer } from "../utilities/layers";
import styles from "./HudLayer.module.scss";
import cx from "classnames";
import locationInfoData from "../data/locationInfo.json";
import habitabilityData from "../data/habitabilityData.json";

const locationsData = {
  olympus_mons: {
    name: "Olympus Mons",
    sub: "Volcanic Caldera",
    position: { x: -133.8, y: 18.65, z: 200000, spatialReference: { wkid: 104971 } },
    heading: 0, tilt: 45,
  },
  jezero_crater: {
    name: "Jezero Crater",
    sub: "Impact Crater",
    position: { x: 77.58, y: 18.38, z: 100000, spatialReference: { wkid: 104971 } },
    heading: 0, tilt: 45,
  },
  valles_marineris: {
    name: "Valles Marineris",
    sub: "Canyon System",
    position: { x: -70.0, y: -10.0, z: 500000, spatialReference: { wkid: 104971 } },
    heading: 0, tilt: 45,
  },
};

const explorationData = {
  perseverance: {
    name: "Perseverance Rover",
    sub: "Jezero Crater",
    position: { x: 77.31831, y: 17.9882, z: 7292.077, spatialReference: { wkid: 104971 } },
    heading: 15.53, tilt: 67.5,
  },
  curiosity: {
    name: "Curiosity Rover",
    sub: "Gale Crater",
    position: { x: 136.90526, y: -7.16597, z: 62217.981, spatialReference: { wkid: 104971 } },
    heading: 13.78, tilt: 65.46,
  },
  opportunity: {
    name: "Opportunity Rover",
    sub: "Meridiani Planum",
    position: { x: -5.7945, y: 0.66213, z: 77385.93, spatialReference: { wkid: 104971 } },
    heading: 173.58, tilt: 61.54,
  },
};

@subclass("ExploreMars.HudLayer")
export class HudLayer extends Widget {
  @property()
  hidden: boolean = false;

  @property()
  sidebarCollapsed: boolean = false;

  @property()
  searchQuery: string = "";

  @property()
  activePanel: "none" | "locations" | "exploration" | "sources" | "info" | "habitability" = "none";

  @property()
  activeLocationKey: string | null = null;

  @property()
  dynamicLocations: Record<string, any> = {};

  get mergedLocations() {
    return { ...locationsData, ...this.dynamicLocations };
  }

  get allLocations() {
    return { ...this.mergedLocations, ...explorationData };
  }

  private goToLocation(key: string) {
    const loc = this.allLocations[key as keyof typeof this.allLocations];
    if (!loc) return;
    const camera = new Camera({
      position: loc.position,
      heading: loc.heading,
      tilt: loc.tilt
    });
    void AppState.view.goTo(camera);
    this.activeLocationKey = key; // Set active location
    this.activePanel = "none"; // close sidebar panels
  }

  postInitialize() {
    this.addPins(); // add initial hardcoded pins first

    // Wait for view and layers to be ready, then fetch dynamic locations
    reactiveUtils.whenOnce(() => AppState.view && AppState.view.ready).then(() => {
      this.fetchMapLocations();
    });

    // Add click listener for the pins
    AppState.view.on("click", (event) => {
      AppState.view.hitTest(event).then((response) => {
        if (response.results.length > 0) {
          const graphicResult = response.results.find((r: any) => r.graphic && r.graphic.attributes && r.graphic.attributes.locationKey);
          if (graphicResult && graphicResult.type === "graphic") {
            const key = graphicResult.graphic.attributes.locationKey;
            this.goToLocation(key);
          }
        }
      });
    });
  }

  private async fetchMapLocations() {
    try {
      await marsNamesLayer.load();
      const newLocs: Record<string, any> = {};

      const queryParams = {
        where: "1=1",
        outFields: ["name", "type", "latitude", "longitude", "clean_name"],
        returnGeometry: false
      };

      for (const layer of marsNamesLayer.layers.toArray()) {
        const featureLayer = layer as any;
        await featureLayer.load();
        const featureSet = await featureLayer.queryFeatures(queryParams);

        featureSet.features.forEach((f: any) => {
          const attrs = f.attributes;
          if (attrs.clean_name && attrs.name) {
            const key = attrs.clean_name.replace(/\s+/g, '_').toLowerCase();
            if (!(key in locationsData)) {
              newLocs[key] = {
                name: attrs.name,
                sub: attrs.type || "Geographic Feature",
                position: { x: attrs.longitude, y: attrs.latitude, z: 150000, spatialReference: { wkid: 104971 } },
                heading: 0, tilt: 35
              };
            }
          }
        });
      }

      this.dynamicLocations = newLocs;
      this.addPins();
    } catch (err) {
      console.error("Failed to fetch map locations", err);
      this.addPins(); // fallback to hardcoded
    }
  }

  private zoom(delta: number) {
    const view = AppState.view;
    if (view) {
      view.goTo({ zoom: view.zoom + delta });
    }
  }

  private resetCompass() {
    const view = AppState.view;
    if (view && view.camera) {
      const camera = view.camera.clone();
      camera.heading = 0;
      camera.tilt = 0;
      view.goTo(camera);
    }
  }

  private getHabitabilityInfo(key: string) {
    const data = (habitabilityData as any)[key] || (habitabilityData as any)["default"];

    // Mathematical formula with reference to Earth
    // Temperature: Earth ideal ~15°C. Normalize Mars (-120 to +20) to 0-100 scale.
    const tempScore = Math.max(0, Math.min(100, ((data.temperature + 120) / 140) * 100));

    // Calculate final score out of 100
    const score = Math.round(
      (tempScore * 0.20) +
      (data.radiationShielding * 0.30) +
      (data.waterIceProximity * 0.25) +
      (data.structuralStability * 0.25)
    );

    let assessment = "";
    if (score >= 70) {
      assessment = `High potential for human habitation. The ${data.radiationShielding}% radiation shielding and ${data.waterIceProximity}% water-ice proximity provide a strong foundation for astronaut settlement with standard pressurized habitats.`;
    } else if (score >= 45) {
      assessment = `Challenging environment. Atmospheric surface pressure remains thin (~${data.atmosphericPressure} kPa) with extreme average temperatures (${data.temperature}°C). Requires active habitat pressurization and sub-regolith thermal regulation arrays for astronaut survival.`;
    } else {
      assessment = `Extreme hazard zone for astronauts. Severe lack of radiation shielding (${data.radiationShielding}%) and extreme cold (${data.temperature}°C) make human habitation impossible without massive, deep subterranean engineering.`;
    }

    return { score, assessment, data };
  }

  private addPins() {
    AppState.view.graphics.removeAll();
    const graphics = Object.entries(this.allLocations).map(([key, loc]: [string, any]) => {
      const isRover = key in explorationData;
      return new Graphic({
        geometry: new Point({
          x: loc.position.x,
          y: loc.position.y,
          spatialReference: loc.position.spatialReference,
        }),
        symbol: {
          type: "point-3d",
          symbolLayers: [{
            type: "icon",
            size: 24,
            resource: { primitive: "circle" },
            material: { color: isRover ? "#22c55e" : "#ff6b4a" }, // Green for rovers, orange for landmarks
            outline: { color: "white", size: 2 }
          }],
          verticalOffset: {
            screenLength: 40,
            maxWorldLength: 500000,
            minWorldLength: 20
          },
          callout: {
            type: "line",
            size: 1.5,
            color: [255, 255, 255, 0.8],
            border: { color: [0, 0, 0, 0] }
          }
        } as any,
        attributes: {
          locationKey: key,
          name: loc.name
        }
      });
    });

    AppState.view.graphics.addMany(graphics);
  }

  render() {
    return (
      <div class={cx(styles.hudLayer, { [styles.hidden]: this.hidden })}>
        {/* Top Search Bar */}
        <div class={styles.topBar}>
          <div class={styles.searchBox}>
            <i class="fa-solid fa-magnifying-glass" style="color:var(--text-muted);"></i>
            <input
              type="text"
              placeholder="Search Locations & Rovers..."
              value={this.searchQuery}
              oninput={(e: any) => { this.searchQuery = e.target.value; }}
            />
          </div>
          {/* Search Dropdown Results */}
          {this.searchQuery.trim().length > 0 && (
            <div class={styles.searchResults}>
              {Object.entries(this.allLocations)
                .filter(([_, loc]: [string, any]) => loc.name.toLowerCase().includes(this.searchQuery.toLowerCase()) || loc.sub.toLowerCase().includes(this.searchQuery.toLowerCase()))
                .map(([key, loc]: [string, any]) => (
                  <div
                    class={styles.searchResultItem}
                    onclick={() => {
                      this.searchQuery = "";
                      this.goToLocation(key);
                    }}
                  >
                    <div class={styles.resultName}>{loc.name}</div>
                    <div class={styles.resultSub}>{loc.sub}</div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* Expand button when sidebar is collapsed */}
        <button
          class={cx(styles.expandTrigger, { [styles.hidden]: !this.sidebarCollapsed })}
          onclick={() => { this.sidebarCollapsed = false; }}
        >
          <i class="fa-solid fa-compass"></i> Expand Dashboard
        </button>

        {/* Sidebar */}
        <aside class={cx(styles.sidebar, { [styles.sidebarCollapsedStyle]: this.sidebarCollapsed })}>
          <div class={styles.sidebarHeader}>
            <span>MARS GLOBE HUD</span>
            <button
              class={styles.toggleBtn}
              onclick={() => { this.sidebarCollapsed = true; }}
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <nav class={styles.menu}>
            <a
              href="#"
              class={cx(styles.menuLink, { [styles.activeLink]: this.activePanel === "locations" })}
              onclick={(e: Event) => { e.preventDefault(); this.activePanel = this.activePanel === "locations" ? "none" : "locations"; }}
            >
              <i class="fa-solid fa-table-list"></i> Location Table
            </a>
            <a
              href="#"
              class={cx(styles.menuLink, { [styles.activeLink]: this.activePanel === "exploration" })}
              onclick={(e: Event) => { e.preventDefault(); this.activePanel = this.activePanel === "exploration" ? "none" : "exploration"; }}
            >
              <i class="fa-solid fa-rocket"></i> Past Exploration
            </a>
            <div style="flex:1;"></div>
            <a
              href="#"
              class={cx(styles.menuLink, { [styles.activeLink]: this.activePanel === "sources" })}
              onclick={(e: Event) => { e.preventDefault(); this.activePanel = this.activePanel === "sources" ? "none" : "sources"; }}
            >
              <i class="fa-solid fa-book-bookmark"></i> Sources
            </a>
          </nav>
        </aside>

        {/* Panels */}
        {this.activePanel === "locations" && (
          <div class={styles.dataPanelContainer}>
            <div class={styles.panelHeader}>
              <div class={styles.panelTitle}>Geographic Locations</div>
              <button class={styles.closeBtn} onclick={() => { this.activePanel = "none"; }}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class={styles.locationsList}>
              {Object.entries(this.mergedLocations).map(([key, loc]: [string, any]) => (
                <div class={styles.locationCard} onclick={() => this.goToLocation(key)}>
                  <div class={styles.locCardIcon}><i class="fa-solid fa-mountain"></i></div>
                  <div>
                    <div class={styles.locCardName}>{loc.name}</div>
                    <div class={styles.locCardSub}>{loc.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {this.activePanel === "exploration" && (
          <div class={styles.dataPanelContainer}>
            <div class={styles.panelHeader}>
              <div class={styles.panelTitle}>Past Exploration</div>
              <div class={styles.panelBadge} style="border-color:#22c55e; color:#22c55e;">Robotic Missions</div>
              <button class={styles.closeBtn} onclick={() => { this.activePanel = "none"; }}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class={styles.locationsList}>
              {Object.entries(explorationData).map(([key, loc]: [string, any]) => (
                <div class={styles.locationCard} onclick={() => this.goToLocation(key)}>
                  <div class={styles.locCardIcon} style="color:#22c55e;"><i class="fa-solid fa-robot"></i></div>
                  <div>
                    <div class={styles.locCardName}>{loc.name}</div>
                    <div class={styles.locCardSub}>{loc.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {this.activePanel === "sources" && (
          <div class={styles.dataPanelContainer}>
            <div class={styles.panelHeader}>
              <div class={styles.panelTitle}>Sources of the Map</div>
              <div class={styles.panelBadge} style="border-color:#ff6b4a; color:#ff6b4a; background:rgba(255,107,74,0.15)">Archive</div>
              <button class={styles.closeBtn} onclick={() => { this.activePanel = "none"; }}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class={styles.sourceList}>
              <div class={styles.sourceItem}>
                <i class="fa-solid fa-satellite"></i>
                <div>
                  <div class={styles.srcName}>NASA Planetary Data System (PDS)</div>
                  <div class={styles.srcDesc}>MOLA (Mars Orbiter Laser Altimeter) topographic global elevation rasters.</div>
                </div>
              </div>
              <div class={styles.sourceItem}>
                <i class="fa-solid fa-camera"></i>
                <div>
                  <div class={styles.srcName}>ESA Mars Express HRSC</div>
                  <div class={styles.srcDesc}>Multi-spectral stereoscopic digital terrain models providing 3D surface rendering.</div>
                </div>
              </div>
              <div class={styles.sourceItem}>
                <i class="fa-solid fa-telescope"></i>
                <div>
                  <div class={styles.srcName}>USGS Astrogeology Science Center</div>
                  <div class={styles.srcDesc}>Unified Martian geographic nomenclature registry and crater coordinate boundary classification catalog.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {this.activePanel === "info" && this.activeLocationKey && (
          <div class={styles.dataPanelContainer}>
            <div class={styles.panelHeader}>
              <div class={styles.panelTitle}>{(this.allLocations as any)[this.activeLocationKey]?.name || "Location Info"}</div>
              <div class={styles.panelBadge} style="border-color:#3b82f6; color:#3b82f6; background:rgba(59,130,246,0.15)">Data Feed</div>
              <button class={styles.closeBtn} onclick={() => { this.activePanel = "none"; }}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class={styles.infoFieldsList}>
              {(() => {
                const info = (locationInfoData as any)[this.activeLocationKey] || {
                  "Status": "Data unavailable for this specific sector.",
                  "Coordinates": `Long: ${(this.allLocations as any)[this.activeLocationKey]?.position.x.toFixed(2)}, Lat: ${(this.allLocations as any)[this.activeLocationKey]?.position.y.toFixed(2)}`
                };
                return Object.entries(info).map(([field, value]) => (
                  <div class={styles.infoField}>
                    <div class={styles.infoFieldLabel}>{field}</div>
                    <div class={styles.infoFieldValue}>{value as string}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {this.activePanel === "habitability" && this.activeLocationKey && (
          <div class={styles.dataPanelContainer}>
            <div class={styles.panelHeader}>
              <div class={styles.panelTitle}>Habitability Analysis</div>
              <div class={styles.panelBadge} style="border-color:#22c55e; color:#22c55e; background:rgba(34,197,94,0.15)">Habitability Score</div>
              <button class={styles.closeBtn} onclick={() => { this.activePanel = "none"; }}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            {(() => {
              const hab = this.getHabitabilityInfo(this.activeLocationKey);
              return (
                <div>
                  <div class={styles.aiBanner}>
                    <div class={styles.scoreRow}>
                      <div>
                        <div class={styles.scoreTitle}>Detailed Habitability Score</div>
                        <div class={styles.scoreSub}>Evaluation generated via planetary bio-compatibility formula</div>
                      </div>
                      <div class={styles.scoreCircle}>{hab.score}%</div>
                    </div>
                    <p class={styles.aiText}>[ANALYSIS]: {hab.assessment}</p>
                  </div>

                  <div class={styles.progressBlock}>
                    <div class={styles.progressLabel}><span>Subsurface Radiation Shielding</span> <span>{hab.data.radiationShielding}%</span></div>
                    <div class={styles.progressBar}><div class={styles.progressFill} style={`width: ${hab.data.radiationShielding}%`}></div></div>
                  </div>

                  <div class={styles.progressBlock}>
                    <div class={styles.progressLabel}><span>Water-Ice Regolith Proximity</span> <span>{hab.data.waterIceProximity}%</span></div>
                    <div class={styles.progressBar}><div class={styles.progressFill} style={`width: ${hab.data.waterIceProximity}%`}></div></div>
                  </div>

                  <div class={styles.progressBlock}>
                    <div class={styles.progressLabel}><span>Structural Settlement Stability</span> <span>{hab.data.structuralStability}%</span></div>
                    <div class={styles.progressBar}><div class={styles.progressFill} style={`width: ${hab.data.structuralStability}%`}></div></div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Bottom Bar */}
        <footer class={styles.bottomBar}>
          {this.activeLocationKey && (this.allLocations as any)[this.activeLocationKey] ? (
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 20px;">
              <div style="text-align: left;">
                <div class={styles.hudTitle}>{(this.allLocations as any)[this.activeLocationKey].name}</div>
                <div class={styles.hudSub}>{(this.allLocations as any)[this.activeLocationKey].sub}</div>
              </div>
              <div style="display:flex; gap: 10px;">
                <button class={styles.viewInfoBtn} onclick={() => this.activePanel = "info"}>
                  <i class="fa-solid fa-circle-info"></i> View Info
                </button>
                <button class={styles.viewHabitabilityBtn} onclick={() => this.activePanel = "habitability"}>
                  <i class="fa-solid fa-heart-pulse"></i> Habitability
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div class={styles.hudTitle}>Planet Mars (Sol IV)</div>
              <div class={styles.hudSub}>Click a pinpoint on the globe or use the dashboard</div>
            </div>
          )}
        </footer>

        {/* Zoom Controls Capsule */}
        <div class={styles.zoomControls}>
          <button class={styles.zoomBtn} onclick={() => this.zoom(1)} title="Zoom In"><i class="fa-solid fa-plus"></i></button>
          <div class={styles.zoomDivider}></div>
          <button class={styles.zoomBtn} onclick={() => this.zoom(-1)} title="Zoom Out"><i class="fa-solid fa-minus"></i></button>
          <div class={styles.zoomDivider}></div>
          <button class={styles.zoomBtn} onclick={() => this.resetCompass()} title="Reset View"><i class="fa-solid fa-compass"></i></button>
        </div>
      </div>
    );
  }
}
