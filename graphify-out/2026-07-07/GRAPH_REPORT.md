# Graph Report - .  (2026-07-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 444 nodes · 689 edges · 50 communities (18 shown, 32 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend API & Solver|Backend API & Solver]]
- [[_COMMUNITY_Scale Calibration & Hit Testing|Scale Calibration & Hit Testing]]
- [[_COMMUNITY_DXF Sheet Drawing|DXF Sheet Drawing]]
- [[_COMMUNITY_CAD Title Block Export|CAD Title Block Export]]
- [[_COMMUNITY_FEM Result Types & State|FEM Result Types & State]]
- [[_COMMUNITY_Svelte UI Components|Svelte UI Components]]
- [[_COMMUNITY_FEM Results Store|FEM Results Store]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_DXF Writer Core|DXF Writer Core]]
- [[_COMMUNITY_DXF Writer Library|DXF Writer Library]]
- [[_COMMUNITY_Mesh Generator & Hit Test|Mesh Generator & Hit Test]]
- [[_COMMUNITY_Graph Model & Headroom|Graph Model & Headroom]]
- [[_COMMUNITY_Sheet Drawing Module|Sheet Drawing Module]]
- [[_COMMUNITY_Mesh Generator Library|Mesh Generator Library]]
- [[_COMMUNITY_App Root & Integration|App Root & Integration]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]

## God Nodes (most connected - your core abstractions)
1. `StructuralModel` - 43 edges
2. `../engine/types` - 35 edges
3. `analyze_slab()` - 22 edges
4. `./lib/components/PropertiesPanel.svelte` - 21 edges
5. `compilerOptions` - 15 edges
6. `analyzeSlab()` - 15 edges
7. `UIState` - 15 edges
8. `generate_mesh()` - 12 edges
9. `Point2D` - 12 edges
10. `compilerOptions` - 9 edges

## Surprising Connections (you probably didn't know these)
- `mesh_endpoint()` --calls--> `generate_mesh()`  [INFERRED]
  backend/main.py → backend/mesher.py
- `mesh_endpoint()` --calls--> `MeshResponse`  [INFERRED]
  backend/main.py → backend/models.py
- `analyze_endpoint()` --calls--> `AnalysisResponse`  [INFERRED]
  backend/main.py → backend/models.py
- `analyze_endpoint()` --calls--> `analyze_slab()`  [INFERRED]
  backend/main.py → backend/solver.py
- `generate_mesh()` --calls--> `test_simply_supported_square_plate()`  [INFERRED]
  backend/mesher.py → backend/test_solver_units.py

## Import Cycles
- None detected.

## Communities (50 total, 32 thin omitted)

### Community 0 - "Backend API & Solver"
Cohesion: 0.06
Nodes (21): HitResult, computeScaleLabel, ScaleCalibrator, BeamElement, BoundaryCondition, ColumnElement, Dimension, DropPanelElement (+13 more)

### Community 1 - "Scale Calibration & Hit Testing"
Cohesion: 0.06
Nodes (42): ../canvas/hitTester, ../canvas/renderer, ./lib/components/ColumnPlacementPanel.svelte, ./lib/components/ContextMenu.svelte, ./lib/components/ExportDialog.svelte, ./lib/components/FEMControlPanel.svelte, ./lib/components/GraphViewer.svelte, ./lib/components/ImageUploader.svelte (+34 more)

### Community 2 - "DXF Sheet Drawing"
Cohesion: 0.06
Nodes (27): bilerp(), clamp(), COLORS, COLORS_DARK, COLORS_LIGHT, drawBeam(), drawBeamSelected(), drawColorLegend() (+19 more)

### Community 3 - "CAD Title Block Export"
Cohesion: 0.13
Nodes (33): analyze_endpoint(), mesh_endpoint(), _compute_mesh_quality(), _ensure_gmsh(), generate_mesh(), _point_on_segment(), Check if point (px,py) lies on segment AB (excluding endpoints)., AnalysisRequest (+25 more)

### Community 4 - "FEM Result Types & State"
Cohesion: 0.09
Nodes (28): computeBoundingBox(), computeGlobalMetrics(), computeSlabContribution(), distance(), pointInPolygon(), pointOnEdge(), pointToSegmentDistance(), polygonCentroid() (+20 more)

### Community 5 - "Svelte UI Components"
Cohesion: 0.11
Nodes (24): _bending_dofs(), _build_T(), compute_cst_stiffness(), compute_dkt_stiffness(), compute_element_load(), compute_element_membrane_force(), compute_element_moments(), compute_element_shears() (+16 more)

### Community 6 - "FEM Results Store"
Cohesion: 0.15
Nodes (24): analyzeAllSlabs(), analyzeSlab(), computeQ4ElementLoad(), computeQ4PlateStiffness(), computeQ8ElementLoad(), computeQ8PlateStiffness(), computeT3ElementLoad(), computeT3PlateStiffness() (+16 more)

### Community 7 - "Package Dependencies"
Cohesion: 0.08
Nodes (25): dependencies, jspdf, p5, pdfjs-dist, tailwindcss, @tailwindcss/vite, devDependencies, svelte (+17 more)

### Community 8 - "DXF Writer Core"
Cohesion: 0.16
Nodes (4): CanvasMode, ElementType, ToolType, UIState

### Community 9 - "DXF Writer Library"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 10 - "Mesh Generator & Hit Test"
Cohesion: 0.32
Nodes (11): cellSlabIntersection(), dedupPoints(), elementCenterInHole(), generateSlabMesh(), lineSegmentIntersection(), pointInAnyHole(), pointInPolygon(), pointInTriangle() (+3 more)

### Community 11 - "Graph Model & Headroom"
Cohesion: 0.20
Nodes (3): floorLayers, FloorLayersStore, PlanLayer

### Community 12 - "Sheet Drawing Module"
Cohesion: 0.17
Nodes (11): compilerOptions, allowJs, checkJs, module, moduleDetection, noEmit, target, tsBuildInfoFile (+3 more)

### Community 13 - "Mesh Generator Library"
Cohesion: 0.20
Nodes (9): build, builder, nixpacksConfig, deploy, healthcheckPath, restartPolicyType, startCommand, aptPackages (+1 more)

### Community 14 - "App Root & Integration"
Cohesion: 0.47
Nodes (4): loadImageFile(), loadPDFPage(), loadPlanFile(), UploadedPlan

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (5): CompressionLevel, StructuralGraph, Headroom, HeadroomConfig, HeadroomReport

## Knowledge Gaps
- **124 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `../engine/types` connect `FEM Result Types & State` to `Backend API & Solver`, `Scale Calibration & Hit Testing`, `DXF Sheet Drawing`, `DXF Writer Core`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Why does `../engine/types` connect `Scale Calibration & Hit Testing` to `Mesh Generator & Hit Test`, `FEM Results Store`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `analyze_slab()` (e.g. with `analyze_endpoint()` and `ElementMembraneForce`) actually correct?**
  _`analyze_slab()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Check if point (px,py) lies on segment AB (excluding endpoints).`, `Saint-Venant torsional constant (J) for a rectangular section.     b = width (sh`, `Second derivatives of 6-node quadratic shape functions wrt area coords (L1,L2).` to the rest of the system?**
  _137 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API & Solver` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Scale Calibration & Hit Testing` be split into smaller, more focused modules?**
  _Cohesion score 0.05519480519480519 - nodes in this community are weakly interconnected._
- **Should `DXF Sheet Drawing` be split into smaller, more focused modules?**
  _Cohesion score 0.05920444033302498 - nodes in this community are weakly interconnected._