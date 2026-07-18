<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { model } from '../stores/structuralModel.svelte';
  import { uiState } from '../stores/uiState.svelte';
  import { femState } from '../stores/femResults.svelte';

  let container: HTMLDivElement;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let animId: number;
  let group: THREE.Group;
  let mounted = false;

  // ─── Shared scratch objects (reused every frame to avoid GC) ───
  const _m4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _color = new THREE.Color();

  const COLORS = {
    dark: { bg: 0x0a0a0a, ambient: 0x404040, dir: 0xffffff },
    light: { bg: 0xf0f0f0, ambient: 0x888888, dir: 0xffffff },
  };
  function themeColors() { return uiState.theme === 'light' ? COLORS.light : COLORS.dark; }

  function px(v: number) { return v; }
  function pz(v: number) { return v; }

  // ─── Instance caps (pre-allocate, hide unused via scale 0) ───
  const MAX_INST = 500;

  // ─── Shared materials (1 per shape type = 4 draw calls for all columns/beams/walls) ───
  const colRectMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff });
  const colCircMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff });
  const beamMat = new THREE.MeshPhongMaterial({ color: 0x22d3ee });
  const wallMat = new THREE.MeshPhongMaterial({ color: 0xff4d79 });

  // ─── Shared unit geometries (scaled per-instance via matrix) ───
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);

  // ─── Instanced meshes (created once in initThree) ───
  let instRectCols: THREE.InstancedMesh;
  let instCircCols: THREE.InstancedMesh;
  let instBeams: THREE.InstancedMesh;
  let instWalls: THREE.InstancedMesh;

  // ─── FEM deflection mesh (single merged BufferGeometry) ───
  let femMesh: THREE.Mesh | null = null;
  let gridHelper: THREE.GridHelper | null = null;

  // ─── Compute model bounding box for dynamic grid sizing ───
  function computeModelBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    function extend(x: number, y: number) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    for (const c of model.columns) { extend(c.position.x, c.position.y); }
    for (const w of model.walls) { extend(w.startPoint.x, w.startPoint.y); extend(w.endPoint.x, w.endPoint.y); }
    for (const pw of model.polylineWalls) { for (const v of pw.vertices) extend(v.x, v.y); }
    for (const b of model.beams) { extend(b.startPoint.x, b.startPoint.y); extend(b.endPoint.x, b.endPoint.y); }
    for (const s of model.slabs) { for (const v of s.vertices) extend(v.x, v.y); }
    if (minX === Infinity) { minX = -25; maxX = 25; minY = -25; maxY = 25; }
    return { minX, maxX, minY, maxY };
  }

  function rebuildGrid(): void {
    if (!group) return;
    if (gridHelper) { group.remove(gridHelper); gridHelper.geometry.dispose(); }
    const bounds = computeModelBounds();
    const sizeX = Math.max(bounds.maxX - bounds.minX, 50);
    const sizeY = Math.max(bounds.maxY - bounds.minY, 50);
    const maxExtent = Math.max(sizeX, sizeY);
    // Grid is 5x the model extent so user can pan far beyond the elements
    const gridSize = Math.max(maxExtent * 5, 200);
    // 1 division per meter, clamped to 40..1000
    const divisions = Math.max(40, Math.min(1000, Math.round(gridSize)));
    gridHelper = new THREE.GridHelper(gridSize, divisions, 0x333333, 0x222222);
    // Center the grid on the model centroid
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    gridHelper.position.set(cx, -0.01, cy);
    group.add(gridHelper);
  }

  // ─── Compute floor height H from model ───
  function computeH(): number {
    let H = 3.0;
    const heights: number[] = [];
    for (const c of model.columns) heights.push(c.height);
    for (const w of model.walls) heights.push(w.height);
    for (const pw of model.polylineWalls) heights.push(pw.height);
    for (const b of model.beams) heights.push(b.height);
    if (heights.length > 0) H = Math.max(...heights);
    return H;
  }

  function pointInPolygon(px: number, py: number, verts: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].x, yi = verts[i].y;
      const xj = verts[j].x, yj = verts[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ─── Update instanced mesh transforms from current model ───
  function updateInstances() {
    const H = computeH();

    // Rectangular columns
    let ri = 0;
    for (const col of model.columns) {
      if (col.shape === 'circular') continue;
      if (ri >= MAX_INST) break;
      _pos.set(px(col.position.x), col.height / 2, pz(col.position.y));
      _euler.set(0, col.rotation ? -col.rotation : 0, 0);
      _quat.setFromEuler(_euler);
      _scale.set(col.width, col.height, col.depth);
      _m4.compose(_pos, _quat, _scale);
      instRectCols.setMatrixAt(ri, _m4);
      if (col.color) { _color.set(col.color); instRectCols.setColorAt(ri, _color); }
      ri++;
    }
    // Hide remaining
    for (; ri < MAX_INST; ri++) {
      _m4.makeScale(0, 0, 0);
      instRectCols.setMatrixAt(ri, _m4);
    }
    instRectCols.count = Math.min(model.columns.filter(c => c.shape !== 'circular').length, MAX_INST);
    instRectCols.instanceMatrix.needsUpdate = true;
    if (instRectCols.instanceColor) instRectCols.instanceColor.needsUpdate = true;

    // Circular columns
    let ci = 0;
    for (const col of model.columns) {
      if (col.shape !== 'circular') continue;
      if (ci >= MAX_INST) break;
      const r = (col.diameter || col.width) / 2;
      _pos.set(px(col.position.x), col.height / 2, pz(col.position.y));
      _quat.identity();
      _scale.set(r * 2, col.height, r * 2);
      _m4.compose(_pos, _quat, _scale);
      instCircCols.setMatrixAt(ci, _m4);
      if (col.color) { _color.set(col.color); instCircCols.setColorAt(ci, _color); }
      ci++;
    }
    for (; ci < MAX_INST; ci++) {
      _m4.makeScale(0, 0, 0);
      instCircCols.setMatrixAt(ci, _m4);
    }
    instCircCols.count = Math.min(model.columns.filter(c => c.shape === 'circular').length, MAX_INST);
    instCircCols.instanceMatrix.needsUpdate = true;
    if (instCircCols.instanceColor) instCircCols.instanceColor.needsUpdate = true;

    // Beams (each segment is a separate instance because of varying depth/width)
    let bi = 0;
    for (const beam of model.beams) {
      if (bi >= MAX_INST) break;
      const sx = px(beam.startPoint.x), sz = pz(beam.startPoint.y);
      const ex = px(beam.endPoint.x), ez = pz(beam.endPoint.y);
      const dx = ex - sx, dz = ez - sz;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      _pos.set((sx + ex) / 2, beam.height - beam.depth / 2, (sz + ez) / 2);
      _euler.set(0, -Math.atan2(dz, dx), 0);
      _quat.setFromEuler(_euler);
      _scale.set(len, beam.depth, beam.width);
      _m4.compose(_pos, _quat, _scale);
      instBeams.setMatrixAt(bi, _m4);
      bi++;
    }
    for (; bi < MAX_INST; bi++) {
      _m4.makeScale(0, 0, 0);
      instBeams.setMatrixAt(bi, _m4);
    }
    instBeams.count = Math.min(model.beams.length, MAX_INST);
    instBeams.instanceMatrix.needsUpdate = true;

    // Walls (shear walls + polyline wall segments share the same instanced mesh)
    let wi = 0;
    for (const wall of model.walls) {
      if (wi >= MAX_INST) break;
      const sx = px(wall.startPoint.x), sz = pz(wall.startPoint.y);
      const ex = px(wall.endPoint.x), ez = pz(wall.endPoint.y);
      const dx = ex - sx, dz = ez - sz;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len < 0.001) continue;
      _pos.set((sx + ex) / 2, wall.height / 2, (sz + ez) / 2);
      _euler.set(0, -Math.atan2(dz, dx), 0);
      _quat.setFromEuler(_euler);
      _scale.set(len, wall.height, wall.thickness);
      _m4.compose(_pos, _quat, _scale);
      instWalls.setMatrixAt(wi, _m4);
      if (wall.color) { _color.set(wall.color); instWalls.setColorAt(wi, _color); }
      wi++;
    }
    for (const pw of model.polylineWalls) {
      for (let i = 0; i < pw.vertices.length - 1; i++) {
        if (wi >= MAX_INST) break;
        const a = pw.vertices[i], b = pw.vertices[i + 1];
        const sx = px(a.x), sz = pz(a.y);
        const ex = px(b.x), ez = pz(b.y);
        const dx = ex - sx, dz = ez - sz;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) continue;
        _pos.set((sx + ex) / 2, pw.height / 2, (sz + ez) / 2);
        _euler.set(0, -Math.atan2(dz, dx), 0);
        _quat.setFromEuler(_euler);
        _scale.set(len, pw.height, pw.thickness);
        _m4.compose(_pos, _quat, _scale);
        instWalls.setMatrixAt(wi, _m4);
        if (pw.color) { _color.set(pw.color); instWalls.setColorAt(wi, _color); }
        wi++;
      }
    }
    for (; wi < MAX_INST; wi++) {
      _m4.makeScale(0, 0, 0);
      instWalls.setMatrixAt(wi, _m4);
    }
    instWalls.count = Math.min(
      model.walls.length + model.polylineWalls.reduce((s, pw) => s + Math.max(0, pw.vertices.length - 1), 0),
      MAX_INST
    );
    instWalls.instanceMatrix.needsUpdate = true;
    if (instWalls.instanceColor) instWalls.instanceColor.needsUpdate = true;
  }

  // ─── Rebuild slab/drop-panel meshes + labels (individual because of polygon geometry) ───
  let slabGroup: THREE.Group;
  let femGroup: THREE.Group;

  function rebuildSlabsAndLabels() {
    if (slabGroup) { group.remove(slabGroup); slabGroup.traverse(c => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) { const mat = m.material; Array.isArray(mat) ? mat.forEach(mm => mm.dispose()) : mat.dispose(); } }); }
    slabGroup = new THREE.Group();
    group.add(slabGroup);

    const H = computeH();

    // ─── Slabs (merged geometry per slab — one draw call each, but no instancing needed for polygons) ───
    const slabWireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    for (const slab of model.slabs) {
      if (slab.vertices.length < 3) continue;
      const t = slab.thickness;
      const n = slab.vertices.length;
      const topY = H + t;
      const botY = H;

      const verts: number[] = [];
      const idx: number[] = [];
      for (const v of slab.vertices) verts.push(px(v.x), topY, pz(v.y));
      for (const v of slab.vertices) verts.push(px(v.x), botY, pz(v.y));
      for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
      for (let i = 1; i < n - 1; i++) idx.push(n, n + i + 1, n + i);
      const sideBase = 2 * n;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const sb = sideBase + i * 4;
        verts.push(
          px(slab.vertices[i].x), topY, pz(slab.vertices[i].y),
          px(slab.vertices[j].x), topY, pz(slab.vertices[j].y),
          px(slab.vertices[j].x), botY, pz(slab.vertices[j].y),
          px(slab.vertices[i].x), botY, pz(slab.vertices[i].y),
        );
        idx.push(sb, sb + 1, sb + 2, sb, sb + 2, sb + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const color = slab.color ? parseInt(slab.color.replace('#', ''), 16) : 0x64748b;
      const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
      slabGroup.add(new THREE.Mesh(geo, mat));

      const pts = slab.vertices.map(v => new THREE.Vector3(px(v.x), topY + 0.03, pz(v.y)));
      pts.push(pts[0].clone());
      slabGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), slabWireMat));
    }

    // ─── Drop panels ───
    for (const dp of model.dropPanels) {
      if (dp.vertices.length < 3) continue;
      let slabT = 0.2;
      for (const s of model.slabs) {
        if (s.vertices.length >= 3 && pointInPolygon(dp.center.x, dp.center.y, s.vertices)) { slabT = s.thickness; break; }
      }
      const extraT = dp.drop - slabT;
      if (extraT <= 0) continue;
      const n = dp.vertices.length;
      const topY = H;
      const botY = H - extraT;
      const verts: number[] = [];
      const idx: number[] = [];
      for (const v of dp.vertices) verts.push(px(v.x), topY, pz(v.y));
      for (const v of dp.vertices) verts.push(px(v.x), botY, pz(v.y));
      for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
      for (let i = 1; i < n - 1; i++) idx.push(n, n + i + 1, n + i);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const color = dp.color ? parseInt(dp.color.replace('#', ''), 16) : 0x475569;
      const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      slabGroup.add(new THREE.Mesh(geo, mat));
    }

    // ─── Element labels ───
    if (uiState.showLabels) {
      function makeLabelSprite(text: string): THREE.Sprite {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6; ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, 128, 64);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.8, 0.4, 1);
        return sprite;
      }
      for (const c of model.columns) {
        if (model.isHidden(c.id)) continue;
        const s = makeLabelSprite(c.label);
        s.position.set(px(c.position.x), H + 0.2, pz(c.position.y));
        slabGroup.add(s);
      }
      for (const w of model.walls) {
        if (model.isHidden(w.id)) continue;
        const mx = (w.startPoint.x + w.endPoint.x) / 2;
        const mz = (w.startPoint.y + w.endPoint.y) / 2;
        const s = makeLabelSprite(w.label);
        s.position.set(px(mx), H + 0.2, pz(mz));
        slabGroup.add(s);
      }
      for (const pw of model.polylineWalls) {
        if (model.isHidden(pw.id)) continue;
        let sx2 = 0, sy2 = 0;
        for (const v of pw.vertices) { sx2 += v.x; sy2 += v.y; }
        const s = makeLabelSprite(pw.label);
        s.position.set(px(sx2 / pw.vertices.length), H + 0.2, pz(sy2 / pw.vertices.length));
        slabGroup.add(s);
      }
      for (const b of model.beams) {
        if (model.isHidden(b.id)) continue;
        const mx = (b.startPoint.x + b.endPoint.x) / 2;
        const mz = (b.startPoint.y + b.endPoint.y) / 2;
        const s = makeLabelSprite(b.label);
        s.position.set(px(mx), H + 0.2, pz(mz));
        slabGroup.add(s);
      }
      for (const sLab of model.slabs) {
        if (model.isHidden(sLab.id)) continue;
        if (sLab.vertices.length < 3) continue;
        let sx2 = 0, sy2 = 0;
        for (const v of sLab.vertices) { sx2 += v.x; sy2 += v.y; }
        const s = makeLabelSprite(sLab.label);
        s.position.set(px(sx2 / sLab.vertices.length), H + sLab.thickness + 0.2, pz(sy2 / sLab.vertices.length));
        slabGroup.add(s);
      }
      for (const dp of model.dropPanels) {
        if (model.isHidden(dp.id)) continue;
        const s = makeLabelSprite(dp.label);
        s.position.set(px(dp.center.x), H + 0.2, pz(dp.center.y));
        slabGroup.add(s);
      }
    }

    // ─── Plan Image Overlay ───
    if (uiState.show3DPlanOverlay && model.planImage) {
      const ppm = model.pixelsPerMeter || 100;
      if (ppm > 0) {
        const w_meters = model.imageNaturalWidth / ppm;
        const h_meters = model.imageNaturalHeight / ppm;
        const overlayY = 0.02;
        const overlayGeo = new THREE.BufferGeometry();
        const verts = new Float32Array([0,overlayY,0, 0,overlayY,-h_meters, w_meters,overlayY,-h_meters, w_meters,overlayY,0]);
        const uvs = new Float32Array([0,0, 0,1, 1,1, 1,0]);
        overlayGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        overlayGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        overlayGeo.setIndex([0,2,1, 0,3,2]);
        overlayGeo.computeVertexNormals();
        const tex = new THREE.CanvasTexture(model.planImage);
        tex.colorSpace = THREE.SRGBColorSpace;
        const overlayMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
        slabGroup.add(new THREE.Mesh(overlayGeo, overlayMat));
      }
    }
  }

  // ─── Build FEM deflection mesh (merged BufferGeometry with vertex colors) ───
  function rebuildFEMMesh() {
    if (femGroup) { group.remove(femGroup); femGroup.traverse(c => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) { const mat = m.material; Array.isArray(mat) ? mat.forEach(mm => mm.dispose()) : mat.dispose(); } }); }
    femGroup = new THREE.Group();
    femGroup.visible = femState.showFEMContour && femState.resultType === 'deflection' && femState.hasResults;
    group.add(femGroup);
    femMesh = null;

    if (!femGroup.visible) return;

    const results = [...femState.slabResults.values()];
    if (results.length === 0) return;

    const allVerts: number[] = [];
    const allColors: number[] = [];

    // Global min/max deflection for color mapping
    let globalMin = Infinity, globalMax = -Infinity;
    for (const r of results) {
      for (const d of r.nodeDeflections) {
        const absWz = Math.abs(d.wz * 1000);
        if (absWz < globalMin) globalMin = absWz;
        if (absWz > globalMax) globalMax = absWz;
      }
    }
    if (globalMax - globalMin < 1e-12) { globalMax = globalMin + 1; }

    for (const result of results) {
      const slab = model.slabs.find(s => s.id === result.slabId);
      if (!slab || model.isHidden(result.slabId)) continue;

      const nodes = result.mesh.nodes;
      const deflMap = new Map(result.nodeDeflections.map(d => [d.nodeId, d.wz]));
      const maxWz = Math.max(...result.nodeDeflections.map(d => Math.abs(d.wz)), 1e-6);

      for (const elem of result.mesh.elements) {
        const nids = elem.nodeIds;
        if (nids.length < 3) continue;
        const coords = nids.map(nid => {
          const n = nodes.find(nn => nn.id === nid);
          const wz = deflMap.get(nid) || 0;
          return { x: n!.x, y: n!.y, z: wz };
        });

        for (let k = 0; k < nids.length - 2; k++) {
          const tri = [coords[0], coords[k + 1], coords[k + 2]];
          for (const c of tri) {
            allVerts.push(c.x, c.z * 150, c.y);
            const normWz = c.z / maxWz;
            allColors.push(0.1 + 0.9 * normWz, 0.2 + 0.6 * (1 - Math.abs(normWz)), 0.4 + 0.6 * (1 - normWz));
          }
        }
      }
    }

    if (allVerts.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    femMesh = new THREE.Mesh(geo, mat);
    femGroup.add(femMesh);
  }

  // ─── Scene construction (grid + axes only — structural elements handled by instances + slabGroup) ───
  function buildBase() {
    if (!scene) return;
    scene.background = new THREE.Color(themeColors().bg);
    group = new THREE.Group();
    scene.add(group);

    const axLen = 4;
    group.add(new THREE.AxesHelper(axLen));

    rebuildGrid();

    const axLine = (a: THREE.Vector3, b: THREE.Vector3, c: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }));
    };
    function makeTextSprite(text: string, color: string, fontSize = 48): THREE.Sprite {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.font = `bold ${fontSize}px Arial`; ctx.fillStyle = color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.6, 0.3, 1);
      return sprite;
    }
    group.add(axLine(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(axLen, 0.02, 0), 0xff4444));
    const xLabel = makeTextSprite('X', '#ff4444');
    xLabel.position.set(axLen + 0.3, 0.02, 0);
    group.add(xLabel);
    group.add(axLine(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.02, axLen), 0x44ff44));
    const yLabel = makeTextSprite('Y', '#44ff44');
    yLabel.position.set(0, 0.02, axLen + 0.3);
    group.add(yLabel);
    group.add(axLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axLen, 0), 0x4444ff));
    const zLabel = makeTextSprite('Z', '#4444ff');
    zLabel.position.set(0, axLen + 0.3, 0);
    group.add(zLabel);

    // Instanced meshes for columns/beams/walls (created once)
    instRectCols = new THREE.InstancedMesh(boxGeo, colRectMat, MAX_INST);
    instRectCols.count = 0;
    instRectCols.frustumCulled = false;
    group.add(instRectCols);

    instCircCols = new THREE.InstancedMesh(cylGeo, colCircMat, MAX_INST);
    instCircCols.count = 0;
    instCircCols.frustumCulled = false;
    group.add(instCircCols);

    instBeams = new THREE.InstancedMesh(boxGeo, beamMat, MAX_INST);
    instBeams.count = 0;
    instBeams.frustumCulled = false;
    group.add(instBeams);

    instWalls = new THREE.InstancedMesh(boxGeo, wallMat, MAX_INST);
    instWalls.count = 0;
    instWalls.frustumCulled = false;
    group.add(instWalls);

    // Slab/drop-panel group + FEM group
    slabGroup = new THREE.Group();
    group.add(slabGroup);
    femGroup = new THREE.Group();
    femGroup.visible = false;
    group.add(femGroup);

    updateInstances();
    rebuildSlabsAndLabels();
  }

  function onResize() {
    if (!container || !renderer || !camera) return;
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  $effect(() => {
    uiState.theme;
    if (scene) scene.background = new THREE.Color(themeColors().bg);
  });

  onMount(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => initThree()));
  });

  /** Auto-fit camera and controls to current model bounds */
  function fitCameraToModel() {
    if (!camera || !controls) return;
    const bounds = computeModelBounds();
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const maxDim = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 20);
    const dist = maxDim * 1.5;
    camera.position.set(cx + dist * 0.7, maxDim * 0.8, cy + dist * 0.7);
    camera.far = Math.max(50000, maxDim * 20);
    camera.updateProjectionMatrix();
    controls.target.set(cx, 0, cy);
    controls.maxDistance = Math.max(maxDim * 10, 500);
    controls.update();
  }

  function initThree() {
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(themeColors().bg);

    const bounds = computeModelBounds();
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const maxDim = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 20);
    const dist = maxDim * 1.5;

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, Math.max(50000, maxDim * 20));
    camera.position.set(cx + dist * 0.7, maxDim * 0.8, cy + dist * 0.7);
    camera.lookAt(cx, 0, cy);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(maxDim, maxDim * 2, maxDim * 0.8);
    scene.add(dir);
    scene.add(new THREE.HemisphereLight(0x88aaff, 0x444444, 0.4));

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.target.set(cx, 0, cy);
    controls.minDistance = 0.5;
    controls.maxDistance = Math.max(maxDim * 10, 500);

    buildBase();
    mounted = true;
    animate();
    window.addEventListener('resize', onResize);
  }

  onDestroy(() => {
    window.removeEventListener('resize', onResize);
    cancelAnimationFrame(animId);
    renderer?.dispose();
  });

  // Model change → update instance matrices + rebuild slabs/labels
  $effect(() => {
    model.slabs; model.columns; model.walls; model.polylineWalls;
    model.beams; model.dropPanels;
    model.planImage; model.isCalibrated; model.pixelsPerMeter;
    uiState.show3DPlanOverlay; uiState.showLabels;
    if (mounted && group && scene) {
      updateInstances();
      rebuildSlabsAndLabels();
      rebuildGrid();
    }
  });

  // FEM results change → rebuild deflection mesh only
  $effect(() => {
    const r = [...femState.slabResults.values()];
    femState.showFEMContour; femState.resultType;
    if (mounted && group && femGroup) {
      rebuildFEMMesh();
    }
  });
</script>

<div bind:this={container} class="w-full h-full"></div>
